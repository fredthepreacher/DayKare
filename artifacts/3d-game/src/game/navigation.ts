import * as THREE from 'three';
import { WORLD_PORTALS, WORLD_SOLIDS, isWalkable, resolveMovement } from './world';

const npcPositions = new Map<string, THREE.Vector3>();
const npcPaths = new Map<string, { destinationKey: string; waypoints: THREE.Vector3[]; index: number }>();

export function registerNpcPosition(id: string, position: THREE.Vector3) {
  npcPositions.set(id, position);
  return () => {
    if (npcPositions.get(id) === position) {
      npcPositions.delete(id);
      npcPaths.delete(id);
    }
  };
}

export function clearNpcNavigation(id?: string) {
  if (id) {
    npcPositions.delete(id);
    npcPaths.delete(id);
    return;
  }
  npcPositions.clear();
  npcPaths.clear();
}

export function getNpcNavigationSnapshot() {
  return {
    positionCount: npcPositions.size,
    pathCount: npcPaths.size,
  };
}

export function getPortalWaypoints(start: THREE.Vector3, target: THREE.Vector3) {
  type HubRoom = 'classroom' | 'hallway' | 'playground' | 'art-room' | 'storage' | 'cafeteria';
  const roomFor = (point: THREE.Vector3): HubRoom => {
    if (point.x > 8) return 'playground';
    if (point.x < -8) {
      if (point.z < -8) return 'art-room';
      if (point.z > 8) return 'storage';
      return 'hallway';
    }
    if (point.z > 8) return 'cafeteria';
    return 'classroom';
  };
  const roomCenters: Record<HubRoom, THREE.Vector3> = {
    classroom: new THREE.Vector3(0, 0, 0),
    hallway: new THREE.Vector3(-12, 0, 0),
    playground: new THREE.Vector3(12, 0, 0),
    'art-room': new THREE.Vector3(-12, 0, -12),
    storage: new THREE.Vector3(-12, 0, 12),
    cafeteria: new THREE.Vector3(0, 0, 10),
  };
  const edges = WORLD_PORTALS.map((portal) => ({
    portal,
    rooms: portal.connects as [HubRoom, HubRoom],
  }));
  const startRoom = roomFor(start);
  const targetRoom = roomFor(target);
  const queue: { room: HubRoom; route: typeof edges }[] = [{ room: startRoom, route: [] }];
  const visited = new Set<HubRoom>([startRoom]);
  let route: typeof edges = [];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (current.room === targetRoom) {
      route = current.route;
      break;
    }
    for (const edge of edges) {
      if (!edge.rooms.includes(current.room)) continue;
      const nextRoom = edge.rooms[0] === current.room ? edge.rooms[1] : edge.rooms[0];
      if (visited.has(nextRoom)) continue;
      visited.add(nextRoom);
      queue.push({ room: nextRoom, route: [...current.route, edge] });
    }
  }

  const waypoints: THREE.Vector3[] = [];
  let room = startRoom;
  for (const edge of route) {
    const nextRoom = edge.rooms[0] === room ? edge.rooms[1] : edge.rooms[0];
    const axis = edge.portal.axis;
    const coordinate = axis === 'x' ? 0 : 2;
    const portalCoordinate = edge.portal.position[coordinate];
    const fromSide = Math.sign(roomCenters[room].getComponent(coordinate) - portalCoordinate);
    const toSide = Math.sign(roomCenters[nextRoom].getComponent(coordinate) - portalCoordinate);
    const fromWaypoint = new THREE.Vector3(...edge.portal.position);
    const toWaypoint = new THREE.Vector3(...edge.portal.position);
    fromWaypoint.setComponent(coordinate, portalCoordinate + fromSide * 0.9);
    toWaypoint.setComponent(coordinate, portalCoordinate + toSide * 0.9);
    waypoints.push(fromWaypoint, toWaypoint);
    room = nextRoom;
  }
  waypoints.push(target.clone().setY(0));
  return waypoints;
}

function segmentIsWalkable(
  start: THREE.Vector3,
  target: THREE.Vector3,
  zone: 'hub' | 'garden',
  radius = 0.34,
) {
  const distance = start.distanceTo(target);
  const steps = Math.max(1, Math.ceil(distance / 0.24));
  for (let index = 1; index <= steps; index += 1) {
    const point = start.clone().lerp(target, index / steps).setY(0);
    if (!isWalkable(point, radius, [], zone)) return false;
  }
  return true;
}

function getObstacleWaypoints(
  start: THREE.Vector3,
  target: THREE.Vector3,
  zone: 'hub' | 'garden',
) {
  if (segmentIsWalkable(start, target, zone)) return [target.clone().setY(0)];

  const detours: THREE.Vector3[] = [];
  for (const solid of WORLD_SOLIDS) {
    if (solid.zone !== zone || solid.collision === false) continue;
    if (solid.shape === 'circle' && solid.radius !== undefined) {
      const centerX = (solid.minX + solid.maxX) / 2;
      const centerZ = (solid.minZ + solid.maxZ) / 2;
      const detourRadius = solid.radius + 0.52;
      for (let index = 0; index < 12; index += 1) {
        const angle = index * Math.PI / 6;
        detours.push(new THREE.Vector3(
          centerX + Math.cos(angle) * detourRadius,
          0,
          centerZ + Math.sin(angle) * detourRadius,
        ));
      }
    } else {
      const margin = 0.42;
      detours.push(
        new THREE.Vector3(solid.minX - margin, 0, solid.minZ - margin),
        new THREE.Vector3(solid.minX - margin, 0, solid.maxZ + margin),
        new THREE.Vector3(solid.maxX + margin, 0, solid.minZ - margin),
        new THREE.Vector3(solid.maxX + margin, 0, solid.maxZ + margin),
      );
    }
  }

  const usableDetours = detours.filter((detour) => isWalkable(detour, 0.34, [], zone));
  const oneCornerRoutes = usableDetours
    .filter((detour) => segmentIsWalkable(start, detour, zone) && segmentIsWalkable(detour, target, zone))
    .sort((a, b) => (
      start.distanceTo(a) + a.distanceTo(target) - start.distanceTo(b) - b.distanceTo(target)
    ));
  if (oneCornerRoutes[0]) return [oneCornerRoutes[0], target.clone().setY(0)];

  for (const first of usableDetours) {
    for (const second of usableDetours) {
      if (first === second || !segmentIsWalkable(start, first, zone)) continue;
      if (segmentIsWalkable(first, second, zone) && segmentIsWalkable(second, target, zone)) {
        return [first, second, target.clone().setY(0)];
      }
    }
  }
  return [target.clone().setY(0)];
}

function portalLaneOffset(id: string) {
  let hash = 2166136261;
  for (const character of id) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 999 * 0.9 - 0.45;
}

function applyPortalLane(id: string, waypoints: THREE.Vector3[]) {
  const laneOffset = portalLaneOffset(id);
  return waypoints.map((waypoint, index) => {
    if (index === waypoints.length - 1) return waypoint;
    const portal = WORLD_PORTALS.find((candidate) => {
      const axisIndex = candidate.axis === 'x' ? 0 : 2;
      const alongIndex = candidate.axis === 'x' ? 2 : 0;
      return Math.abs(Math.abs(waypoint.getComponent(axisIndex) - candidate.position[axisIndex]) - 0.9) < 0.01
        && Math.abs(waypoint.getComponent(alongIndex) - candidate.position[alongIndex]) < 0.01;
    });
    if (!portal) return waypoint;
    const alongIndex = portal.axis === 'x' ? 2 : 0;
    return waypoint.clone().setComponent(
      alongIndex,
      waypoint.getComponent(alongIndex) + laneOffset,
    );
  });
}

export function getNavigationTarget(
  id: string,
  current: THREE.Vector3,
  destination: THREE.Vector3,
  zone: 'hub' | 'garden' = 'hub',
) {
  const destinationKey = `${zone}:${destination.x.toFixed(2)}:${destination.z.toFixed(2)}`;
  let path = npcPaths.get(id);
  if (!path || path.destinationKey !== destinationKey) {
    const routeBackbone = zone === 'hub'
      ? applyPortalLane(id, getPortalWaypoints(current, destination))
      : [destination.clone().setY(0)];
    const candidateWaypoints: THREE.Vector3[] = [];
    let segmentStart = current.clone().setY(0);
    for (const routePoint of routeBackbone) {
      candidateWaypoints.push(...getObstacleWaypoints(segmentStart, routePoint, zone));
      segmentStart = routePoint;
    }
    const waypoints = candidateWaypoints
      .map((waypoint) => waypoint.clone().setY(0))
      .filter((waypoint) => isWalkable(waypoint, 0.34, [], zone));
    path = {
      destinationKey,
      waypoints: waypoints.length > 0 ? waypoints : [destination.clone().setY(0)],
      index: 0,
    };
    npcPaths.set(id, path);
  }

  while (path.index < path.waypoints.length - 1 && current.distanceTo(path.waypoints[path.index]) < 0.55) {
    path.index += 1;
  }
  let waypoint = (path.waypoints[path.index] ?? destination).clone();
  const isFinalWaypoint = path.index >= path.waypoints.length - 1;
  if (isFinalWaypoint) {
    const separation = new THREE.Vector3();
    npcPositions.forEach((position, otherId) => {
      if (otherId === id) return;
      const distance = current.distanceTo(position);
      if (distance > 1.45) return;
      if (distance < 0.001) {
        const pairKey = [id, otherId].sort().join(':');
        const phase = [...pairKey].reduce((total, character) => total + character.charCodeAt(0), 0);
        const sign = id < otherId ? 1 : -1;
        separation.add(new THREE.Vector3(
          Math.cos(phase) * sign,
          0,
          Math.sin(phase) * sign,
        ));
        return;
      }
      separation.add(current.clone().sub(position).multiplyScalar((1.4 - distance) / 1.4));
    });
    if (separation.lengthSq() > 0) {
      const separatedWaypoint = waypoint.clone().add(separation.normalize().multiplyScalar(0.42));
      if (isWalkable(separatedWaypoint, 0.34, [], zone)) waypoint = separatedWaypoint;
    }
  }
  if (!isWalkable(waypoint, 0.34, [], zone)) {
    const detour = new THREE.Vector3(
      waypoint.z - current.z,
      0,
      -(waypoint.x - current.x),
    );
    if (detour.lengthSq() < 0.001) return current.clone();
    return resolveMovement(
      current,
      current.clone().add(detour.normalize().multiplyScalar(0.4)),
      0.34,
      0.38,
      zone,
    );
  }
  return waypoint;
}
