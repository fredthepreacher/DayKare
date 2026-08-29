import * as THREE from 'three';
import { WORLD_PORTALS, isWalkable, resolveMovement } from './world';

const npcPositions = new Map<string, THREE.Vector3>();
const npcPaths = new Map<string, { destinationKey: string; waypoints: THREE.Vector3[]; index: number }>();

export function registerNpcPosition(id: string, position: THREE.Vector3) {
  npcPositions.set(id, position);
  return () => {
    npcPositions.delete(id);
  };
}

export function getPortalWaypoints(start: THREE.Vector3, target: THREE.Vector3) {
  const waypoints: THREE.Vector3[] = [];
  const crossesWest = (start.x >= -8 && target.x < -8) || (start.x < -8 && target.x >= -8);
  const crossesEast = (start.x <= 8 && target.x > 8) || (start.x > 8 && target.x <= 8);
  if (crossesWest) waypoints.push(new THREE.Vector3(-7.1, 0, 0));
  if (crossesEast) waypoints.push(new THREE.Vector3(7.1, 0, 0));
  const fromHall = start.x < -8 || waypoints.some((waypoint) => waypoint.x < -8);
  const targetHall = target.x < -8;
  if (fromHall && targetHall) {
    if ((start.z >= -8 && target.z < -8) || (start.z < -8 && target.z >= -8)) {
      waypoints.push(new THREE.Vector3(-12, 0, -7.1));
    }
    if ((start.z <= 8 && target.z > 8) || (start.z > 8 && target.z <= 8)) {
      waypoints.push(new THREE.Vector3(-12, 0, 7.1));
    }
  }
  waypoints.push(target.clone().setY(0));
  return waypoints;
}

export function getNavigationTarget(id: string, current: THREE.Vector3, destination: THREE.Vector3) {
  const destinationKey = `${destination.x.toFixed(2)}:${destination.z.toFixed(2)}`;
  let path = npcPaths.get(id);
  if (!path || path.destinationKey !== destinationKey) {
    const waypoints = getPortalWaypoints(current, destination)
      .map((waypoint) => waypoint.clone().setY(0))
      .filter((waypoint) => isWalkable(waypoint, 0.34));
    path = { destinationKey, waypoints: waypoints.length > 0 ? waypoints : [destination.clone().setY(0)], index: 0 };
    npcPaths.set(id, path);
  }

  while (path.index < path.waypoints.length - 1 && current.distanceTo(path.waypoints[path.index]) < 0.55) {
    path.index += 1;
  }
  const waypoint = (path.waypoints[path.index] ?? destination).clone();
  const separation = new THREE.Vector3();
  npcPositions.forEach((position, otherId) => {
    if (otherId === id) return;
    const distance = current.distanceTo(position);
    if (distance > 1.45 || distance < 0.001) return;
    separation.add(current.clone().sub(position).multiplyScalar((1.4 - distance) / 1.4));
  });
  if (separation.lengthSq() > 0) waypoint.add(separation.normalize().multiplyScalar(0.65));
  if (!isWalkable(waypoint, 0.34)) {
    return resolveMovement(current, current.clone().add(new THREE.Vector3(
      waypoint.z - current.z,
      0,
      -(waypoint.x - current.x),
    ).normalize().multiplyScalar(0.4)), 0.34);
  }
  return waypoint;
}