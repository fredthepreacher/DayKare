import * as THREE from 'three';

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

export interface WorldSolid {
  id: string;
  kind: SolidKind;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
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

const box = (id: string, kind: SolidKind, minX: number, maxX: number, minZ: number, maxZ: number): WorldSolid => ({
  id, kind, minX, maxX, minZ, maxZ,
});

export const WORLD_SOLIDS: WorldSolid[] = [
  box('north-boundary', 'boundary', -16, 16, -16.3, -15.7),
  box('south-boundary', 'boundary', -16, 16, 15.7, 16.3),
  box('west-boundary', 'boundary', -16.3, -15.7, -16, 16),
  box('east-boundary', 'boundary', 15.7, 16.3, -16, 16),
  box('main-north-wall', 'wall', -8, 8, -8.3, -7.7),
  box('main-south-wall', 'wall', -8, 8, 7.7, 8.3),
  box('playground-divider-north', 'wall', 7.7, 8.3, -8, -2),
  box('playground-divider-south', 'wall', 7.7, 8.3, 2, 8),
  box('hall-divider-north', 'wall', -8.3, -7.7, -8, -2),
  box('hall-divider-south', 'wall', -8.3, -7.7, 2, 8),
  box('art-north-wall', 'wall', -16, -8, -16.3, -15.7),
  box('storage-south-wall', 'wall', -16, -8, 15.7, 16.3),
  box('playground-north-wall', 'wall', 8, 16, -16.3, -15.7),
  box('playground-south-wall', 'wall', 8, 16, 15.7, 16.3),
  box('juice-stand', 'counter', 2, 4, -3.6, -2.4),
  box('art-table', 'table', -13.7, -10.3, -13.7, -10.3),
  box('art-easel', 'furniture', -13.1, -11.9, -13.2, -12.8),
  box('cubbies', 'cubby', -7.6, -3.8, -7.1, -6.3),
  box('reading-nook', 'furniture', 4.6, 6.6, -7.4, -5.8),
  box('storage-box-a', 'box', -14.7, -13.3, 9.3, 10.7),
  box('storage-box-b', 'box', -11.8, -10.2, 13.1, 14.9),
  box('play-slide', 'playground', 11.3, 12.7, -6.2, -4.8),
  box('sandbox', 'playground', 10, 14, 3, 7),
  box('route-garden-district', 'route-gate', 13, 15.4, -14.3, -12.3),
  box('route-storybook-lane', 'route-gate', -15.4, -13, -14.3, -12.3),
  box('route-maker-market', 'route-gate', 13, 15.4, 12.2, 14.3),
  box('rainbow-tidy-up', 'activity-station', -0.65, 0.65, -4.65, -3.35),
];

export const WORLD_PORTALS: WorldPortal[] = [
  { id: 'main-hall-west', axis: 'x', position: [-8, 0, 0], width: 4, connects: ['classroom', 'hallway'] },
  { id: 'main-play-east', axis: 'x', position: [8, 0, 0], width: 4, connects: ['classroom', 'playground'] },
  { id: 'hall-art-north', axis: 'z', position: [-12, 0, -8], width: 4, connects: ['hallway', 'art-room'] },
  { id: 'hall-storage-south', axis: 'z', position: [-12, 0, 8], width: 4, connects: ['hallway', 'storage'] },
];

export const WORLD_WALKABLE_REGIONS: WalkableRegion[] = [
  { id: 'classroom', minX: -7.7, maxX: 7.7, minZ: -7.7, maxZ: 7.7 },
  { id: 'hallway', minX: -15.7, maxX: -8.3, minZ: -7.7, maxZ: 7.7 },
  { id: 'art-room', minX: -15.7, maxX: -8.3, minZ: -15.7, maxZ: -8.3 },
  { id: 'storage', minX: -15.7, maxX: -8.3, minZ: 8.3, maxZ: 15.7 },
  { id: 'playground', minX: 8.3, maxX: 15.7, minZ: -15.7, maxZ: 15.7 },
];

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
  solid.kind === 'wall'
  || solid.kind === 'boundary'
  || solid.kind === 'furniture'
  || solid.kind === 'counter'
  || solid.kind === 'cubby'
  || solid.kind === 'table'
  || solid.kind === 'box'
  || solid.kind === 'playground'
  || solid.kind === 'activity-station'
));

export const PLAYER_RADIUS = 0.42;
export const TRICYCLE_RADIUS = 0.7;
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
  const dx = Math.max(solid.minX - point.x, 0, point.x - solid.maxX);
  const dz = Math.max(solid.minZ - point.z, 0, point.z - solid.maxZ);
  return Math.hypot(dx, dz);
}

function overlapsCircle(point: THREE.Vector3, radius: number, solid: WorldSolid) {
  return distanceToSolid(point, solid) < radius;
}

function pushOut(point: THREE.Vector3, radius: number, solid: WorldSolid, axis: 'x' | 'z') {
  if (!overlapsCircle(point, radius, solid)) return;
  const clearance = radius + 0.0001;
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

export function isWalkable(position: THREE.Vector3, radius = PLAYER_RADIUS, ignoredKinds: SolidKind[] = []) {
  return !WORLD_SOLIDS.some((solid) => !ignoredKinds.includes(solid.kind) && overlapsCircle(position, radius, solid));
}

export function resolveMovement(
  current: THREE.Vector3,
  desired: THREE.Vector3,
  radius = PLAYER_RADIUS,
  maxStep = 0.38,
) {
  const next = current.clone();
  const distance = Math.hypot(desired.x - current.x, desired.z - current.z);
  const steps = Math.max(1, Math.ceil(distance / maxStep));
  const stepX = (desired.x - current.x) / steps;
  const stepZ = (desired.z - current.z) / steps;

  for (let step = 0; step < steps; step += 1) {
    next.x += stepX;
    for (const solid of WORLD_SOLIDS) pushOut(next, radius, solid, 'x');
    next.z += stepZ;
    for (const solid of WORLD_SOLIDS) pushOut(next, radius, solid, 'z');
  }
  return next;
}

export function resolveCameraPosition(target: THREE.Vector3, desired: THREE.Vector3, radius = 0.2) {
  const direction = desired.clone().sub(target);
  const distance = direction.length();
  if (distance < 0.001) return desired.clone();
  direction.normalize();
  let safeDistance = distance;
  const steps = Math.ceil(distance / 0.2);
  for (let index = 1; index <= steps; index += 1) {
    const sample = target.clone().addScaledVector(direction, distance * (index / steps));
    if (CAMERA_BLOCKERS.some((solid) => overlapsCircle(sample, radius, solid))) {
      safeDistance = Math.max(1.8, distance * ((index - 1) / steps));
      break;
    }
  }
  return target.clone().addScaledVector(direction, safeDistance);
}

export function findApproachPoint(target: THREE.Vector3, preferred: THREE.Vector3, radius = PLAYER_RADIUS) {
  const towardTarget = preferred.clone().sub(target).setY(0);
  if (towardTarget.lengthSq() < 0.01) towardTarget.set(0, 0, 1);
  towardTarget.normalize();
  const approach = target.clone().addScaledVector(towardTarget, radius + 0.7);
  return isWalkable(approach, radius) ? approach : target.clone();
}