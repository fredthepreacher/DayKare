import * as THREE from 'three';
import { isSweptSphereClear, sweptSphereClearance } from './cameraRig';

export type SolidKind =
  | 'boundary'
  | 'wall'
  | 'furniture'
  | 'counter'
  | 'cubby'
  | 'table'
  | 'box'
  | 'playground'
  | 'route-gate'
  | 'activity-station'
  | 'camera-blocker';

export type GameZone = 'hub' | 'garden';

export interface WorldSolid {
  id: string;
  kind: SolidKind;
  zone: GameZone;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  shape?: 'box' | 'circle';
  radius?: number;
  collision?: boolean;
  cameraRole?: 'structural' | 'substantial' | 'none';
  minY?: number;
  maxY?: number;
}

export interface WorldPortal {
  id: string;
  axis: 'x' | 'z';
  position: [number, number, number];
  width: number;
  connects: [string, string];
}

export interface WorldAnchor {
  id: string;
  position: [number, number, number];
  room: string;
  activity: string;
}

export interface WalkableRegion {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WorldSolidTransform {
  position: [number, number, number];
  size: [number, number, number];
}

export type WorldSolidFace = 'north' | 'south' | 'west' | 'east';

export interface WorldSurfaceTransform {
  position: [number, number, number];
  rotation: [number, number, number];
}

const defaultCameraRole = (kind: SolidKind): WorldSolid['cameraRole'] => (
  kind === 'wall' || kind === 'boundary' || kind === 'route-gate' ? 'structural' : 'none'
);

const box = (
  id: string,
  kind: SolidKind,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  options: Partial<WorldSolid> = {},
): WorldSolid => ({
  id, kind, zone: 'hub', minX, maxX, minZ, maxZ,
  shape: 'box',
  collision: true,
  cameraRole: defaultCameraRole(kind),
  minY: 0,
  maxY: kind === 'boundary' || kind === 'wall' || kind === 'route-gate' ? 3 : 1.5,
  ...options,
});

const gardenBox = (
  id: string,
  kind: SolidKind,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  options: Partial<WorldSolid> = {},
): WorldSolid => box(id, kind, minX, maxX, minZ, maxZ, { zone: 'garden', ...options });

const gardenCircle = (
  id: string,
  kind: SolidKind,
  x: number,
  z: number,
  radius: number,
  options: Partial<WorldSolid> = {},
): WorldSolid => gardenBox(
  id,
  kind,
  x - radius,
  x + radius,
  z - radius,
  z + radius,
  { shape: 'circle', radius, ...options },
);

export const PLAY_SLIDE_RAMP = {
  position: [12, 0.5, -3.5] as [number, number, number],
  size: [1, 3, 0.2] as [number, number, number],
  rotation: [-Math.PI / 4, 0, 0] as [number, number, number],
  solid: box('play-slide-ramp', 'playground', 11.4, 12.6, -4.7, -2.3, {
    cameraRole: 'substantial',
    maxY: 1.7,
  }),
};

export const WORLD_SOLIDS: WorldSolid[] = [
  box('north-boundary', 'boundary', -16, 16, -16.3, -15.7),
  box('south-boundary', 'boundary', -16, 16, 15.7, 16.3),
  box('west-boundary', 'boundary', -16.3, -15.7, -16, 16),
  box('east-boundary', 'boundary', 15.7, 16.3, -16, 16),
  box('main-north-wall', 'wall', -8, 8, -8.3, -7.7),
  box('main-south-wall', 'wall', -8, 8, 7.7, 8.3),
  box('playground-divider-north', 'wall', 7.7, 8.3, -8, -2.15),
  box('playground-divider-south', 'wall', 7.7, 8.3, 2.15, 8),
  box('hall-divider-north', 'wall', -8.3, -7.7, -8, -2.15),
  box('hall-divider-south', 'wall', -8.3, -7.7, 2.15, 8),
  box('juice-stand', 'counter', 2, 4, -3.6, -2.4, { cameraRole: 'substantial' }),
  box('art-table', 'table', -13.7, -10.3, -13.7, -10.3, { cameraRole: 'substantial' }),
  box('art-easel', 'furniture', -13.1, -11.9, -13.2, -12.8, { cameraRole: 'substantial' }),
  box('cubbies', 'cubby', -7.6, -3.8, -7.1, -6.3, { cameraRole: 'substantial', maxY: 2.2 }),
  box('reading-nook', 'furniture', 4.6, 6.6, -7.4, -5.8, { cameraRole: 'substantial', maxY: 2.1 }),
  box('storage-box-a', 'box', -14.7, -13.3, 9.3, 10.7, { cameraRole: 'substantial' }),
  box('storage-box-upper', 'box', -14.4, -13.6, 9.6, 10.4, {
    collision: false,
    cameraRole: 'none',
    minY: 1,
    maxY: 1.8,
  }),
  box('storage-box-b', 'box', -11.8, -10.2, 13.1, 14.9, { cameraRole: 'substantial' }),
  box('play-slide', 'playground', 11.3, 12.7, -6.2, -4.8, {
    cameraRole: 'substantial',
    maxY: 2,
  }),
  PLAY_SLIDE_RAMP.solid,
  box('sandbox', 'playground', 10, 14, 3, 7, { cameraRole: 'substantial' }),
  box('route-garden-district', 'route-gate', 13, 15.4, -14.3, -12.3),
  box('route-storybook-lane', 'route-gate', -15.4, -13, -14.3, -12.3),
  box('route-maker-market', 'route-gate', 13, 15.4, 12.2, 14.3),
  box('rainbow-tidy-up', 'activity-station', -0.65, 0.65, -4.65, -3.35),
  gardenBox('garden-north-boundary', 'boundary', -18.3, 18.3, -18.3, -17.7),
  gardenBox('garden-south-boundary', 'boundary', -18.3, 18.3, 17.7, 18.3),
  gardenBox('garden-west-boundary', 'boundary', -18.3, -17.7, -18, 18),
  gardenBox('garden-east-boundary', 'boundary', 17.7, 18.3, -18, 18),
  gardenBox('garden-greenhouse-west', 'wall', -14.8, -8.8, -11.8, -11.2),
  gardenBox('garden-greenhouse-east', 'wall', -14.8, -8.8, -5.8, -5.2),
  gardenBox('garden-greenhouse-north', 'wall', -14.8, -14.2, -11.8, -5.2),
  gardenCircle('garden-pond', 'playground', 10, -0.2, 2.72, { maxY: 0.12 }),
  gardenCircle('garden-gazebo-nw-post', 'furniture', -2.7, 3.4, 0.16, { cameraRole: 'substantial', maxY: 2.5 }),
  gardenCircle('garden-gazebo-ne-post', 'furniture', 2.7, 3.4, 0.16, { cameraRole: 'substantial', maxY: 2.5 }),
  gardenCircle('garden-gazebo-sw-post', 'furniture', -2.7, 8.8, 0.16, { cameraRole: 'substantial', maxY: 2.5 }),
  gardenCircle('garden-gazebo-se-post', 'furniture', 2.7, 8.8, 0.16, { cameraRole: 'substantial', maxY: 2.5 }),
  gardenBox('garden-bed-west', 'activity-station', -12.8, -8.8, 1.2, 4.4, { cameraRole: 'substantial' }),
  gardenBox('garden-bed-east', 'activity-station', 8.8, 12.8, 8.2, 11.4, { cameraRole: 'substantial' }),
  gardenCircle('garden-tree-a', 'furniture', -14.5, -1, 0.3, { cameraRole: 'substantial', maxY: 2.5 }),
  gardenCircle('garden-tree-b', 'furniture', -7, 11.8, 0.3, { cameraRole: 'substantial', maxY: 2.5 }),
  gardenCircle('garden-tree-c', 'furniture', 6.4, 11.5, 0.3, { cameraRole: 'substantial', maxY: 2.5 }),
  gardenCircle('garden-tree-d', 'furniture', 14.2, -8.5, 0.3, { cameraRole: 'substantial', maxY: 2.5 }),
  gardenCircle('garden-tree-e', 'furniture', 2, -13.8, 0.3, { cameraRole: 'substantial', maxY: 2.5 }),
  gardenBox('garden-sign', 'furniture', -2.15, 2.15, -15.82, -15.58, { cameraRole: 'substantial', maxY: 1.9 }),
];

export function getWorldSolidTransform(id: string, height: number, centerY = height / 2): WorldSolidTransform {
  const solid = WORLD_SOLIDS.find((candidate) => candidate.id === id);
  if (!solid) throw new Error(`Unknown world solid: ${id}`);
  return {
    position: [(solid.minX + solid.maxX) / 2, centerY, (solid.minZ + solid.maxZ) / 2],
    size: [solid.maxX - solid.minX, height, solid.maxZ - solid.minZ],
  };
}

export function getWorldSolidSurfaceTransform(
  id: string,
  face: WorldSolidFace,
  height: number,
  along?: number,
  offset = 0.04,
): WorldSurfaceTransform {
  const solid = WORLD_SOLIDS.find((candidate) => candidate.id === id);
  if (!solid) throw new Error(`Unknown world solid: ${id}`);
  if (solid.shape === 'circle') throw new Error(`Circular world solid has no flat artwork surface: ${id}`);
  const centerX = (solid.minX + solid.maxX) / 2;
  const centerZ = (solid.minZ + solid.maxZ) / 2;
  if (face === 'north') {
    return {
      position: [along ?? centerX, height, solid.minZ - offset],
      rotation: [0, Math.PI, 0],
    };
  }
  if (face === 'south') {
    return {
      position: [along ?? centerX, height, solid.maxZ + offset],
      rotation: [0, 0, 0],
    };
  }
  if (face === 'west') {
    return {
      position: [solid.minX - offset, height, along ?? centerZ],
      rotation: [0, -Math.PI / 2, 0],
    };
  }
  return {
    position: [solid.maxX + offset, height, along ?? centerZ],
    rotation: [0, Math.PI / 2, 0],
  };
}

export const WORLD_PORTALS: WorldPortal[] = [
  { id: 'main-hall-west', axis: 'x', position: [-8, 0, 0], width: 4.3, connects: ['classroom', 'hallway'] },
  { id: 'main-play-east', axis: 'x', position: [8, 0, 0], width: 4.3, connects: ['classroom', 'playground'] },
  { id: 'hall-art-north', axis: 'z', position: [-12, 0, -8], width: 4, connects: ['hallway', 'art-room'] },
  { id: 'hall-storage-south', axis: 'z', position: [-12, 0, 8], width: 4, connects: ['hallway', 'storage'] },
];

export const WORLD_WALKABLE_REGIONS: WalkableRegion[] = [
  { id: 'classroom', minX: -7.7, maxX: 7.7, minZ: -7.7, maxZ: 7.7 },
  { id: 'hallway', minX: -15.7, maxX: -8.3, minZ: -7.7, maxZ: 7.7 },
  { id: 'art-room', minX: -15.7, maxX: -8.3, minZ: -15.7, maxZ: -8.3 },
  { id: 'storage', minX: -15.7, maxX: -8.3, minZ: 8.3, maxZ: 15.7 },
  { id: 'playground', minX: 8.3, maxX: 15.7, minZ: -15.7, maxZ: 15.7 },
  { id: 'garden', minX: -17.7, maxX: 17.7, minZ: -17.7, maxZ: 17.7 },
];

export const GARDEN_SPAWN: [number, number, number] = [0, 0, 14];
export const GARDEN_RETURN_SPAWN: [number, number, number] = [12, 0, -10.4];
export const GARDEN_BOUNDS = { minX: -17.7, maxX: 17.7, minZ: -17.7, maxZ: 17.7 };

export const WORLD_ANCHORS: WorldAnchor[] = [
  { id: 'classroom-circle', position: [0, 0, 0], room: 'classroom', activity: 'morning-play' },
  { id: 'art-table', position: [-12, 0, -12], room: 'art-room', activity: 'art-time' },
  { id: 'storage-shelves', position: [-13, 0, 12], room: 'storage', activity: 'storage' },
  { id: 'juice-counter', position: [3, 0, -3], room: 'classroom', activity: 'juice-club' },
  { id: 'playground-loop', position: [12, 0, 0], room: 'playground', activity: 'outdoor-play' },
  { id: 'pickup-line', position: [-6, 0, 0], room: 'hallway', activity: 'pickup' },
  { id: 'tidy-station', position: [0, 0, -4], room: 'classroom', activity: 'rainbow-tidy-up' },
];

export const WORLD_INTERACTION_TARGETS = [
  { id: 'juice-stand', position: [3, 0, -3] as [number, number, number], approach: [3, 0, -1.7] as [number, number, number] },
  { id: 'tricycle', position: [12, 0, 2] as [number, number, number], approach: [10.7, 0, 2] as [number, number, number] },
  { id: 'binky-storage', position: [-14, 0, 14] as [number, number, number], approach: [-12.8, 0, 13.2] as [number, number, number] },
  { id: 'rainbow-tidy-up', position: [0, 0, -4] as [number, number, number], approach: [0, 0, -2.8] as [number, number, number] },
];

export const CAMERA_BLOCKERS = WORLD_SOLIDS.filter((solid) => (
  solid.cameraRole === 'structural' || solid.cameraRole === 'substantial'
));

export const PLAYER_RADIUS = 0.42;
export const TRICYCLE_RADIUS = 0.7;
export const MIN_CAMERA_DISTANCE = 1.65;
const EMERGENCY_CAMERA_DISTANCE = MIN_CAMERA_DISTANCE;
const trackedPlayerPosition: [number, number, number] = [0, 0, 0];

export function trackPlayerPosition(position: THREE.Vector3) {
  trackedPlayerPosition[0] = position.x;
  trackedPlayerPosition[1] = position.y;
  trackedPlayerPosition[2] = position.z;
}

export function getTrackedPlayerPosition(): [number, number, number] {
  return [...trackedPlayerPosition];
}

function distanceToSolid(point: THREE.Vector3, solid: WorldSolid) {
  if (solid.shape === 'circle' && solid.radius !== undefined) {
    const centerX = (solid.minX + solid.maxX) / 2;
    const centerZ = (solid.minZ + solid.maxZ) / 2;
    return Math.max(0, Math.hypot(point.x - centerX, point.z - centerZ) - solid.radius);
  }
  const dx = Math.max(solid.minX - point.x, 0, point.x - solid.maxX);
  const dz = Math.max(solid.minZ - point.z, 0, point.z - solid.maxZ);
  return Math.hypot(dx, dz);
}

function overlapsCircle(point: THREE.Vector3, radius: number, solid: WorldSolid) {
  return distanceToSolid(point, solid) < radius;
}

function blocksCameraAt(point: THREE.Vector3, radius: number, solid: WorldSolid) {
  const minY = solid.minY ?? 0;
  const maxY = solid.maxY ?? 3;
  return point.y + radius >= minY
    && point.y - radius <= maxY
    && overlapsCircle(point, radius, solid);
}

export function isCameraPositionClear(
  point: THREE.Vector3,
  radius = 0.2,
  zone: GameZone = 'hub',
) {
  return !CAMERA_BLOCKERS.some((solid) => (
    solid.zone === zone && blocksCameraAt(point, radius, solid)
  ));
}

export function cameraSweepClearance(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius = 0.2,
  zone: GameZone = 'hub',
) {
  return sweptSphereClearance(from, to, radius, CAMERA_BLOCKERS.filter((solid) => solid.zone === zone));
}

export function isCameraTransitionClear(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius = 0.2,
  zone: GameZone = 'hub',
) {
  return isSweptSphereClear(from, to, radius, CAMERA_BLOCKERS.filter((solid) => solid.zone === zone));
}

export function isWithinWalkableBounds(position: THREE.Vector3, radius = PLAYER_RADIUS, zone: GameZone = 'hub') {
  const contains = (region: WalkableRegion) => (
    position.x >= region.minX + radius
    && position.x <= region.maxX - radius
    && position.z >= region.minZ + radius
    && position.z <= region.maxZ - radius
  );
  if (zone === 'garden') {
    const garden = WORLD_WALKABLE_REGIONS.find((region) => region.id === 'garden');
    return garden ? contains(garden) : false;
  }
  if (WORLD_WALKABLE_REGIONS.filter((region) => region.id !== 'garden').some(contains)) return true;

  // Door openings occupy the thin divider strips between authored floor regions.
  return WORLD_PORTALS.some((portal) => {
    const halfWidth = portal.width / 2 - radius;
    if (portal.axis === 'x') {
      return Math.abs(position.x - portal.position[0]) <= 0.3 + radius
        && Math.abs(position.z - portal.position[2]) <= halfWidth;
    }
    return Math.abs(position.z - portal.position[2]) <= 0.3 + radius
      && Math.abs(position.x - portal.position[0]) <= halfWidth;
  });
}

function pushOut(point: THREE.Vector3, radius: number, solid: WorldSolid, axis: 'x' | 'z') {
  if (!overlapsCircle(point, radius, solid)) return;
  const clearance = radius + 0.0001;
  if (solid.shape === 'circle' && solid.radius !== undefined) {
    const centerX = (solid.minX + solid.maxX) / 2;
    const centerZ = (solid.minZ + solid.maxZ) / 2;
    const offsetX = point.x - centerX;
    const offsetZ = point.z - centerZ;
    const distance = Math.hypot(offsetX, offsetZ);
    const requiredDistance = solid.radius + clearance;
    if (distance < 0.0001) {
      if (axis === 'x') point.x = centerX + requiredDistance;
      else point.z = centerZ + requiredDistance;
      return;
    }
    point.x = centerX + (offsetX / distance) * requiredDistance;
    point.z = centerZ + (offsetZ / distance) * requiredDistance;
    return;
  }
  if (axis === 'x') {
    const left = Math.abs(point.x - (solid.minX - clearance));
    const right = Math.abs(point.x - (solid.maxX + clearance));
    point.x = left < right ? solid.minX - clearance : solid.maxX + clearance;
  } else {
    const top = Math.abs(point.z - (solid.minZ - clearance));
    const bottom = Math.abs(point.z - (solid.maxZ + clearance));
    point.z = top < bottom ? solid.minZ - clearance : solid.maxZ + clearance;
  }
}

export function isWalkable(
  position: THREE.Vector3,
  radius = PLAYER_RADIUS,
  ignoredKinds: SolidKind[] = [],
  zone: GameZone = 'hub',
) {
  return isWithinWalkableBounds(position, radius, zone) && !WORLD_SOLIDS.some((solid) => (
    solid.zone === zone
    && solid.collision !== false
    && !ignoredKinds.includes(solid.kind)
    && overlapsCircle(position, radius, solid)
  ));
}

export function resolveMovement(
  current: THREE.Vector3,
  desired: THREE.Vector3,
  radius = PLAYER_RADIUS,
  maxStep = 0.38,
  zone: GameZone = 'hub',
) {
  const next = current.clone();
  const distance = Math.hypot(desired.x - current.x, desired.z - current.z);
  const steps = Math.max(1, Math.ceil(distance / maxStep));
  const stepX = (desired.x - current.x) / steps;
  const stepZ = (desired.z - current.z) / steps;

  for (let step = 0; step < steps; step += 1) {
    const before = next.clone();
    next.x += stepX;
    for (const solid of WORLD_SOLIDS) {
      if (solid.zone === zone && solid.collision !== false) pushOut(next, radius, solid, 'x');
    }
    if (!isWithinWalkableBounds(next, radius, zone)) next.x = before.x;
    next.z += stepZ;
    for (const solid of WORLD_SOLIDS) {
      if (solid.zone === zone && solid.collision !== false) pushOut(next, radius, solid, 'z');
    }
    if (!isWithinWalkableBounds(next, radius, zone)) next.z = before.z;
  }
  return next;
}

export function resolveCameraPosition(
  target: THREE.Vector3,
  desired: THREE.Vector3,
  radius = 0.2,
  zone: GameZone = 'hub',
) {
  const desiredOffset = desired.clone().sub(target);
  const distance = desiredOffset.length();
  if (distance < 0.001) return desired.clone();
  const horizontal = new THREE.Vector2(desiredOffset.x, desiredOffset.z);
  const vertical = desiredOffset.y;
  const blockers = CAMERA_BLOCKERS.filter((solid) => solid.zone === zone);

  const trace = (direction: THREE.Vector3) => sweptSphereClearance(
    target,
    target.clone().addScaledVector(direction, distance),
    radius,
    blockers,
  );

  const yawOffsets = [0, Math.PI / 8, -Math.PI / 8, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI];
  const candidates = yawOffsets.map((yaw) => {
    const rotated = horizontal.clone().rotateAround(new THREE.Vector2(), yaw);
    const direction = new THREE.Vector3(rotated.x, vertical, rotated.y).normalize();
    const safeDistance = trace(direction);
    const retainedDistance = safeDistance >= distance - 1e-5
      ? distance
      : Math.max(0, safeDistance - 0.035);
    const anglePenalty = Math.abs(yaw) / Math.PI;
    const framingScore = retainedDistance / distance;
    return {
      direction,
      safeDistance,
      retainedDistance,
      score: framingScore * 4 - anglePenalty * 0.72,
    };
  });
  const validCandidates = candidates
    .filter((candidate) => candidate.safeDistance >= MIN_CAMERA_DISTANCE)
    .sort((a, b) => b.score - a.score);
  if (validCandidates.length > 0) {
    const best = validCandidates[0];
    return target.clone().addScaledVector(best.direction, best.retainedDistance);
  }

  const bestConstrained = candidates.sort((a, b) => (
    b.safeDistance - a.safeDistance || b.score - a.score
  ))[0];
  // In a fully constrained pocket, never invent clearance that the trace did
  // not prove. Remaining close to the target is preferable to crossing a wall.
  const constrainedDistance = Math.max(0, Math.min(
    bestConstrained.safeDistance - radius * 0.5,
    EMERGENCY_CAMERA_DISTANCE,
    distance,
  ));
  return target.clone().addScaledVector(bestConstrained.direction, constrainedDistance);
}

export function findApproachPoint(
  target: THREE.Vector3,
  preferred: THREE.Vector3,
  radius = PLAYER_RADIUS,
  zone: GameZone = 'hub',
) {
  const towardTarget = preferred.clone().sub(target).setY(0);
  if (towardTarget.lengthSq() < 0.01) towardTarget.set(0, 0, 1);
  towardTarget.normalize();
  const approach = target.clone().addScaledVector(towardTarget, radius + 0.7);
  return isWalkable(approach, radius, [], zone) ? approach : target.clone();
}