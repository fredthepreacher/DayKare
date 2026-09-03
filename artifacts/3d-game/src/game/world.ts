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

export type GameZone = 'hub' | 'garden' | 'storybook' | 'home';

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
  /**
   * Block the player even though the solid is flat enough to step over.
   *
   * Player collision is height-aware (see STEP_OVER_HEIGHT): a solid whose top
   * is ankle height is walkable, because a 6 cm sand pad or a rug is not a wall.
   * A few flat things should still stop you for reasons that are not height -
   * the pond is the whole example - and they say so here rather than by
   * pretending to be 1.5 m tall.
   */
  blocksWhenFlat?: boolean;
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
  zone?: GameZone;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WorldSolidTransform {
  position: [number, number, number];
  size: [number, number, number];
}

export type WorldSolidFace = 'north' | 'south' | 'west' | 'east' | 'top';

export interface WorldSurfaceTransform {
  position: [number, number, number];
  rotation: [number, number, number];
}

export interface WorldSurfaceValidation {
  valid: boolean;
  issues: string[];
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

const storybookBox = (
  id: string,
  kind: SolidKind,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  options: Partial<WorldSolid> = {},
): WorldSolid => box(id, kind, minX, maxX, minZ, maxZ, { zone: 'storybook', ...options });

/* ------------------------------------------------------------------ *
 * The owned Stony Brook home.
 *
 * Collision in DayKare is a 2D footprint test, so three storeys cannot
 * be stacked on the same X/Z ground. They are laid out end to end
 * instead and rendered at their own heights, joined by two real stair
 * corridors. The player walks every step of it; nothing teleports.
 *
 *   basement            stairs        ground floor      stairs    upper
 *   x -26 .. -14    x -14 .. -10     x -10 .. 2      x 2 .. 6   x 6 .. 18
 *   y = -2.8         -2.8 -> 0          y = 0          0 -> 3.2   y = 3.2
 * ------------------------------------------------------------------ */

export const HOME_BASEMENT_Y = -2.8;
export const HOME_UPPER_Y = 3.2;
export const HOME_BASEMENT_MAX_X = -14;
export const HOME_GROUND_MIN_X = -10;
export const HOME_GROUND_MAX_X = 2;
export const HOME_UPPER_MIN_X = 6;

/** Where the player lands when they step through their own front door. */
export const HOME_SPAWN: [number, number, number] = [-1, 0, 6.4];
/** The inside face of the front door, and the way back to Stony Brook. */
export const HOME_EXIT_POINT: [number, number, number] = [-1, 0, 7.4];
/** Where the player stands on the front path after leaving the house. */
export const STONY_BROOK_DOOR_RETURN: [number, number, number] = [-13, 0, -8.6];
export const HOME_UPPER_LANDING: [number, number, number] = [7.4, HOME_UPPER_Y, 0];
export const HOME_BASEMENT_LANDING: [number, number, number] = [-15.4, HOME_BASEMENT_Y, 0];

const homeBox = (
  id: string,
  kind: SolidKind,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  options: Omit<Partial<WorldSolid>, 'id' | 'kind' | 'minX' | 'maxX' | 'minZ' | 'maxZ'> = {},
): WorldSolid => box(id, kind, minX, maxX, minZ, maxZ, { zone: 'home', ...options });

/**
 * The floor a rider stands on at a given X inside the home. Every other
 * zone is flat, so this returns 0 for them and costs one comparison.
 */
export function groundHeightAt(x: number, zone: GameZone = 'hub') {
  if (zone !== 'home') return 0;
  if (x <= HOME_BASEMENT_MAX_X) return HOME_BASEMENT_Y;
  if (x < HOME_GROUND_MIN_X) {
    const t = (x - HOME_BASEMENT_MAX_X) / (HOME_GROUND_MIN_X - HOME_BASEMENT_MAX_X);
    return HOME_BASEMENT_Y * (1 - t);
  }
  if (x <= HOME_GROUND_MAX_X) return 0;
  if (x < HOME_UPPER_MIN_X) {
    const t = (x - HOME_GROUND_MAX_X) / (HOME_UPPER_MIN_X - HOME_GROUND_MAX_X);
    return HOME_UPPER_Y * t;
  }
  return HOME_UPPER_Y;
}

export const PLAY_SLIDE_RAMP = {
  position: [12, 0.5, -3.5] as [number, number, number],
  size: [1, 3, 0.2] as [number, number, number],
  rotation: [-Math.PI / 4, 0, 0] as [number, number, number],
  // The rotated ramp mesh sinks below the floor at z = -3.0; the collider ran
  // to -2.3, leaving 0.28 m where the player was stopped by bare grass.
  solid: box('play-slide-ramp', 'playground', 11.4, 12.6, -4.7, -3, {
    cameraRole: 'substantial',
    maxY: 1.7,
  }),
};

export const SHINY_ROCK_SPAWN = [10.2, 0.18, -0.4] as [number, number, number];

export const WORLD_SOLIDS: WorldSolid[] = [
  box('north-boundary', 'boundary', -16, 16, -16.3, -15.7),
  box('south-boundary', 'boundary', -16, 16, 15.7, 16.3),
  box('west-boundary', 'boundary', -16.3, -15.7, -16, 16),
  box('east-boundary', 'boundary', 15.7, 16.3, -16, 16),
  box('main-north-wall', 'wall', -8, 8, -8.3, -7.7),
  // A real doorway connects the classroom to the cafeteria wing.
  box('main-south-wall-west', 'wall', -8, -2.2, 7.7, 8.3),
  box('main-south-wall-east', 'wall', 2.2, 8, 7.7, 8.3),
  box('playground-divider-north', 'wall', 7.7, 8.3, -8, -2.15),
  box('playground-divider-south', 'wall', 7.7, 8.3, 2.15, 8),
  box('hall-divider-north', 'wall', -8.3, -7.7, -8, -2.15),
  box('hall-divider-south', 'wall', -8.3, -7.7, 2.15, 8),
  // The hallway/art-room and hallway/storage seams had a 4 m doorway cut into
  // an 8 m span of continuously rendered floor, and NO wall either side of it -
  // so 4.85 m of each seam was a hard stop with no geometry to explain it. These
  // four panels are the walls that were always implied, following the same
  // pattern as the dividers above.
  box('art-divider-west', 'wall', -15.7, -14, -8.3, -7.7),
  box('art-divider-east', 'wall', -10, -8.3, -8.3, -7.7),
  box('storage-divider-west', 'wall', -15.7, -14, 7.7, 8.3),
  box('storage-divider-east', 'wall', -10, -8.3, 7.7, 8.3),
  box('juice-stand', 'counter', 2, 4, -3.6, -2.4, { cameraRole: 'substantial' }),
  box('juice-signboard', 'furniture', 2, 4, -3.06, -2.94, {
    collision: false,
    cameraRole: 'none',
    minY: 0.78,
    maxY: 2.22,
  }),
  box('art-table', 'table', -11.7, -8.3, -13.7, -10.3, { cameraRole: 'substantial', maxY: 1 }),
  // Entirely inside art-table's footprint, so it only ever added a second
  // push-out inside a single-pass resolver. The table already blocks here.
  box('art-easel', 'furniture', -13.1, -11.9, -13.2, -12.8, { collision: false, cameraRole: 'substantial' }),
  // Extended back to the wall face. The 0.6 m gap behind it needed 0.84 m to
  // enter, so it read as a space you could slip into and never could.
  box('cubbies', 'cubby', -7.6, -3.8, -7.7, -6.3, { cameraRole: 'substantial', maxY: 2.2 }),
  // Trimmed to the beanbag and shelf the player can actually see.
  box('reading-nook', 'furniture', 4.7, 6.5, -7.24, -5.96, { cameraRole: 'substantial', maxY: 1.1 }),
  box('storage-box-a', 'box', -14.7, -13.3, 13.7, 15.1, { cameraRole: 'substantial' }),
  box('storage-box-upper', 'box', -14.4, -13.6, 14, 14.8, {
    collision: false,
    cameraRole: 'none',
    minY: 1,
    maxY: 1.8,
  }),
  box('storage-box-b', 'box', -11.1, -9.5, 13.7, 15.3, { cameraRole: 'substantial' }),
  // Cafeteria: its own central wing, physically separate from restricted storage.
  box('cafeteria-west-wall', 'wall', -8.3, -7.7, 8, 13.3),
  box('cafeteria-east-wall', 'wall', 7.7, 8.3, 8, 13.3),
  box('cafeteria-future-divider', 'wall', -8, 8, 13.0, 13.3),
  box('cafeteria-counter-west', 'counter', -6, -3.5, 11.82, 12.54, { cameraRole: 'substantial', maxY: 1.25 }),
  box('cafeteria-counter-east', 'counter', 3.5, 6, 11.82, 12.54, { cameraRole: 'substantial', maxY: 1.25 }),
  box('cafeteria-table-a', 'table', -3.38, -1.82, 9.22, 10.78, { shape: 'circle', radius: 0.78, maxY: 0.6 }),
  box('cafeteria-table-b', 'table', 1.82, 3.38, 9.22, 10.78, { shape: 'circle', radius: 0.78, maxY: 0.6 }),
  // The heist hub's back wall, shortened at its western end.
  //
  // At its full span (x 8.52 -> 12.78) it met the Maker Market gate (x 13 ->
  // 15.4) with a 0.22 m gap between them - narrower than a child, let alone the
  // player - which sealed the entire northern third of the playground. That is
  // roughly 14 x 3 m of open grass the player could see and walk toward but
  // never enter: exactly the "inviting open-looking route with invisible
  // collision" the polish pass is meant to remove.
  //
  // Ending it at x 9.9 leaves a 1.26 m walkway up the hub's west side, so the
  // north playground is reachable while the planning desk stays enclosed.
  box('heist-hub-back', 'furniture', 9.9, 12.78, 11.79, 11.97, { cameraRole: 'substantial', maxY: 2.4 }),
  box('heist-hub-east', 'furniture', 12.62, 12.78, 9.3, 11.8, { cameraRole: 'substantial', maxY: 1.8 }),
  box('heist-planning-desk', 'table', 9.38, 11.03, 10.24, 11.06, { cameraRole: 'substantial', maxY: 1.06 }),
  box('play-slide', 'playground', 11.3, 12.7, -6.2, -4.8, {
    cameraRole: 'substantial',
    maxY: 2,
  }),
  PLAY_SLIDE_RAMP.solid,
  // 4 x 4 m of sand, 6 cm tall. It declared maxY 1.5 - twenty-five times its own
  // mesh - and with height ignored it cut the playground's 6.56 m corridor down
  // to two 0.86 m lanes, or 0.30 m on the tricycle. Now it reads as the floor
  // decoration it looks like.
  box('sandbox', 'playground', 10, 14, 3, 7, { cameraRole: 'substantial', maxY: 0.07 }),
  /* ---- The owned Stony Brook home interior ---- */
  homeBox('home-ground-north', 'wall', -10.3, 2.3, -8.3, -8.0),
  homeBox('home-ground-south-west', 'wall', -10.3, -1.9, 8.0, 8.3),
  homeBox('home-ground-south-east', 'wall', -0.1, 2.3, 8.0, 8.3),
  // The front door itself. Without it the doorway gap is a hole in the
  // shell and the player can simply walk out of the house.
  homeBox('home-front-door', 'wall', -1.9, -0.1, 8.0, 8.3),
  homeBox('home-ground-east-north', 'wall', 2.0, 2.3, -8.3, -2.0),
  homeBox('home-ground-east-south', 'wall', 2.0, 2.3, 2.0, 8.3),
  homeBox('home-ground-spine-a', 'wall', -3.15, -2.85, -8.3, -2.0),
  homeBox('home-ground-spine-b', 'wall', -3.15, -2.85, -0.6, 2.0),
  homeBox('home-ground-spine-c', 'wall', -3.15, -2.85, 3.6, 8.3),
  homeBox('home-ground-kitchen-wall-a', 'wall', -10.3, -8.0, -0.15, 0.15),
  homeBox('home-ground-kitchen-wall-b', 'wall', -6.4, -2.85, -0.15, 0.15),
  homeBox('home-ground-entry-wall-a', 'wall', -3.15, -1.6, 3.85, 4.15),
  homeBox('home-ground-entry-wall-b', 'wall', 0.0, 2.3, 3.85, 4.15),
  homeBox('home-ground-bath-wall-a', 'wall', -1.2, 2.3, -3.15, -2.85),
  homeBox('home-upstairs-north', 'wall', 1.7, 6.3, -2.3, -2.0),
  homeBox('home-upstairs-south', 'wall', 1.7, 6.3, 2.0, 2.3),
  homeBox('home-upper-north', 'wall', 5.7, 18.3, -8.3, -8.0),
  homeBox('home-upper-south', 'wall', 5.7, 18.3, 8.0, 8.3),
  homeBox('home-upper-east', 'wall', 18.0, 18.3, -8.3, 8.3),
  homeBox('home-upper-west-north', 'wall', 5.7, 6.0, -8.3, -2.0),
  homeBox('home-upper-west-south', 'wall', 5.7, 6.0, 2.0, 8.3),
  homeBox('home-upper-spine-a', 'wall', 8.85, 9.15, -8.3, -5.6),
  homeBox('home-upper-spine-b', 'wall', 8.85, 9.15, -4.0, -1.0),
  homeBox('home-upper-spine-c', 'wall', 8.85, 9.15, 0.6, 3.0),
  homeBox('home-upper-spine-d', 'wall', 8.85, 9.15, 4.6, 8.3),
  homeBox('home-upper-room-wall-a', 'wall', 9.15, 18.3, 1.85, 2.15),
  homeBox('home-upper-room-wall-b', 'wall', 9.15, 18.3, -3.15, -2.85),
  homeBox('home-downstairs-north', 'wall', -14.3, -9.7, -2.3, -2.0),
  homeBox('home-downstairs-south', 'wall', -14.3, -9.7, 2.0, 2.3),
  homeBox('home-ground-west-north', 'wall', -10.3, -10.0, -8.3, -2.0),
  homeBox('home-ground-west-south', 'wall', -10.3, -10.0, 2.0, 8.3),
  homeBox('home-basement-north', 'wall', -26.3, -13.7, -7.3, -7.0),
  homeBox('home-basement-south', 'wall', -26.3, -13.7, 7.0, 7.3),
  homeBox('home-basement-west', 'wall', -26.3, -26.0, -7.3, 7.3),
  homeBox('home-basement-east-north', 'wall', -14.0, -13.7, -7.3, -2.0),
  homeBox('home-basement-east-south', 'wall', -14.0, -13.7, 2.0, 7.3),
  homeBox('home-basement-divider-a', 'wall', -22.15, -21.85, -7.3, -1.0),
  homeBox('home-basement-divider-b', 'wall', -22.15, -21.85, 1.0, 7.3),
  homeBox('home-sofa', 'furniture', -9.6, -6.4, 5.9, 7.0, { cameraRole: 'substantial', maxY: 0.85 }),
  homeBox('home-tv-stand', 'furniture', -9.6, -6.4, 1.0, 1.8, { cameraRole: 'substantial', maxY: 0.62 }),
  homeBox('home-bookshelf', 'furniture', -4.6, -3.3, 5.6, 6.5, { cameraRole: 'substantial', maxY: 1.9 }),
  homeBox('home-kitchen-counter-north', 'counter', -9.7, -3.3, -7.7, -6.8, { cameraRole: 'substantial', maxY: 0.95 }),
  homeBox('home-kitchen-counter-west', 'counter', -9.7, -8.8, -6.8, -3.4, { cameraRole: 'substantial', maxY: 0.95 }),
  homeBox('home-kitchen-island', 'counter', -7.0, -5.0, -4.4, -3.2, { cameraRole: 'substantial', maxY: 0.95 }),
  homeBox('home-fridge', 'furniture', -4.4, -3.4, -7.7, -6.6, { cameraRole: 'substantial', maxY: 1.9 }),
  homeBox('home-dining-table', 'table', -2.4, -0.4, 0.4, 2.4, { cameraRole: 'substantial', maxY: 0.74 }),
  homeBox('home-bath1-tub', 'furniture', -2.7, -0.8, -7.7, -6.4, { cameraRole: 'substantial', maxY: 0.6 }),
  homeBox('home-bath1-vanity', 'counter', 0.6, 1.9, -7.7, -6.9, { cameraRole: 'substantial', maxY: 0.85 }),
  homeBox('home-primary-bed', 'furniture', 10.2, 12.6, 4.6, 7.5, { cameraRole: 'substantial', maxY: 0.72 }),
  homeBox('home-primary-dresser', 'furniture', 16.4, 17.8, 4.4, 6.4, { cameraRole: 'substantial', maxY: 1.15 }),
  homeBox('home-primary-closet', 'furniture', 16.2, 17.8, 2.4, 4.0, { cameraRole: 'substantial', maxY: 2.2 }),
  homeBox('home-flex-bed', 'furniture', 10.2, 12.4, -2.5, 0.1, { cameraRole: 'substantial', maxY: 0.72 }),
  homeBox('home-flex-desk', 'table', 16.2, 17.8, -1.4, 0.8, { cameraRole: 'substantial', maxY: 0.76 }),
  homeBox('home-bath2-tub', 'furniture', 15.9, 17.8, -7.7, -6.2, { cameraRole: 'substantial', maxY: 0.6 }),
  homeBox('home-bath2-vanity', 'counter', 9.6, 11.2, -7.7, -6.9, { cameraRole: 'substantial', maxY: 0.85 }),
  homeBox('home-rec-sofa', 'furniture', -20.6, -17.6, 5.4, 6.6, { cameraRole: 'substantial', maxY: 0.85 }),
  homeBox('home-rec-arcade', 'furniture', -15.6, -14.4, -6.6, -5.0, { cameraRole: 'substantial', maxY: 1.85 }),
  homeBox('home-rec-shelf', 'furniture', -21.8, -20.8, -6.6, -3.6, { cameraRole: 'substantial', maxY: 1.6 }),
  homeBox('home-storage-crates', 'furniture', -25.7, -24.2, -6.6, -3.4, { cameraRole: 'substantial', maxY: 1.1 }),
  homeBox('home-storage-shelf', 'furniture', -25.7, -24.6, 2.0, 6.6, { cameraRole: 'substantial', maxY: 1.7 }),
  box('route-garden-district', 'route-gate', 13, 15.4, -14.3, -12.3),
  box('route-storybook-lane', 'route-gate', -15.4, -13, -14.3, -12.3),
  box('route-maker-market', 'route-gate', 13, 15.4, 12.2, 14.3),
  // A circle matching the visible bin. The square left 0.89 m of invisible wall
  // on each diagonal, right on the edge of the classroom rug - which is exactly
  // where a player would report being blocked by a rug.
  box('rainbow-tidy-up', 'activity-station', -0.64, 0.64, -4.64, -3.36, {
    shape: 'circle',
    radius: 0.64,
    maxY: 0.52,
    blocksWhenFlat: true,
  }),
  gardenBox('garden-north-boundary', 'boundary', -18.3, 18.3, -18.3, -17.7),
  gardenBox('garden-south-boundary', 'boundary', -18.3, 18.3, 17.7, 18.3),
  gardenBox('garden-west-boundary', 'boundary', -18.3, -17.7, -18, 18),
  gardenBox('garden-east-boundary', 'boundary', 17.7, 18.3, -18, 18),
  gardenBox('garden-greenhouse-west', 'wall', -14.8, -8.8, -11.8, -11.2),
  gardenBox('garden-greenhouse-east', 'wall', -14.8, -8.8, -5.8, -5.2),
  gardenBox('garden-greenhouse-north', 'wall', -14.8, -14.2, -11.8, -5.2),
  // Flat, and still not somewhere you walk. Water is the one case the
  // step-over rule should not decide.
  gardenCircle('garden-pond', 'playground', 10, -0.2, 2.72, { maxY: 0.12, blocksWhenFlat: true }),
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
  // The arch is a real threshold: its footprint matches the visible return
  // gate and keeps the southern edge from reading as open terrain.
  gardenBox('garden-return-threshold', 'route-gate', -1.2, 1.2, 15.75, 16.25, { maxY: 2.5 }),
  storybookBox('storybook-north-boundary', 'boundary', -24.3, 24.3, -24.3, -23.7),
  storybookBox('storybook-south-boundary-west', 'boundary', -24.3, -2.8, 23.7, 24.3),
  storybookBox('storybook-south-boundary-east', 'boundary', 2.8, 24.3, 23.7, 24.3),
  storybookBox('storybook-west-boundary', 'boundary', -24.3, -23.7, -24, 24),
  storybookBox('storybook-east-boundary', 'boundary', 23.7, 24.3, -24, 24),
  storybookBox('storybook-ice-cream-stand', 'counter', -2.1, 2.1, -9.1, -6.9, { cameraRole: 'substantial', maxY: 2.6 }),
  /* ---- Wavy Manor: the owned Stony Brook property ----
     The shell is one solid because the player never walks through the
     exterior; the front door is an interaction that loads the interior
     zone. The driveway and walkway are surfaces, not obstacles. */
  storybookBox('sb-manor-shell', 'wall', -18, -8, -17, -11, { cameraRole: 'structural', maxY: 6.2 }),
  storybookBox('sb-manor-porch-post-west', 'furniture', -15.15, -14.85, -10.9, -10.6, { maxY: 2.6 }),
  storybookBox('sb-manor-porch-post-east', 'furniture', -11.15, -10.85, -10.9, -10.6, { maxY: 2.6 }),
  storybookBox('sb-manor-mailbox', 'furniture', -11.62, -11.18, -6.42, -5.98, { maxY: 1.2 }),
  storybookBox('sb-manor-hedge-west', 'furniture', -18, -15.6, -10.95, -10.35, { maxY: 0.85 }),
  storybookBox('sb-manor-hedge-east', 'furniture', -10.4, -8, -10.95, -10.35, { maxY: 0.85 }),
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
  if (face === 'top') {
    return {
      position: [along ?? centerX, height, centerZ],
      rotation: [-Math.PI / 2, 0, 0],
    };
  }
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

export function validateWorldSurfaceAnchor(
  id: string,
  face: WorldSolidFace,
  height: number,
  size: [number, number],
  along?: number,
): WorldSurfaceValidation {
  const solid = WORLD_SOLIDS.find((candidate) => candidate.id === id);
  if (!solid) return { valid: false, issues: [`Unknown world solid: ${id}`] };
  if (solid.shape === 'circle') {
    return { valid: false, issues: [`Circular world solid has no flat artwork surface: ${id}`] };
  }
  const issues: string[] = [];
  const halfWidth = size[0] / 2;
  const halfHeight = size[1] / 2;
  const centerX = (solid.minX + solid.maxX) / 2;
  const centerZ = (solid.minZ + solid.maxZ) / 2;
  const anchorAlong = along ?? (face === 'west' || face === 'east' ? centerZ : centerX);

  if (face === 'top') {
    if (anchorAlong - halfWidth < solid.minX - 0.001 || anchorAlong + halfWidth > solid.maxX + 0.001) {
      issues.push(`top artwork exceeds ${id} x bounds`);
    }
    if (centerZ - halfHeight < solid.minZ - 0.001 || centerZ + halfHeight > solid.maxZ + 0.001) {
      issues.push(`top artwork exceeds ${id} z bounds`);
    }
    if (solid.maxY !== undefined && Math.abs(height - solid.maxY) > 0.15) {
      issues.push(`top artwork does not rest on ${id}`);
    }
  } else {
    const alongMin = face === 'west' || face === 'east' ? solid.minZ : solid.minX;
    const alongMax = face === 'west' || face === 'east' ? solid.maxZ : solid.maxX;
    if (anchorAlong - halfWidth < alongMin - 0.001 || anchorAlong + halfWidth > alongMax + 0.001) {
      issues.push(`${face} artwork exceeds ${id} bounds`);
    }
  }

  if (face !== 'top') {
    const minY = height - halfHeight;
    const maxY = height + halfHeight;
    const supportMaxY = solid.kind === 'wall' || solid.kind === 'boundary'
      ? solid.maxY ?? 3
      : solid.maxY;
    if (minY < (solid.minY ?? 0) - 0.001) issues.push(`artwork sinks below ${id}`);
    if (supportMaxY !== undefined && maxY > supportMaxY + 0.001) issues.push(`artwork exceeds ${id} height`);
  }
  return { valid: issues.length === 0, issues };
}

export const WORLD_PORTALS: WorldPortal[] = [
  { id: 'main-hall-west', axis: 'x', position: [-8, 0, 0], width: 4.3, connects: ['classroom', 'hallway'] },
  { id: 'main-play-east', axis: 'x', position: [8, 0, 0], width: 4.3, connects: ['classroom', 'playground'] },
  { id: 'hall-art-north', axis: 'z', position: [-12, 0, -8], width: 4, connects: ['hallway', 'art-room'] },
  { id: 'hall-storage-south', axis: 'z', position: [-12, 0, 8], width: 4, connects: ['hallway', 'storage'] },
  { id: 'main-cafeteria-south', axis: 'z', position: [0, 0, 8], width: 4.4, connects: ['classroom', 'cafeteria'] },
];

export const WORLD_WALKABLE_REGIONS: WalkableRegion[] = [
  { id: 'classroom', zone: 'hub', minX: -7.7, maxX: 7.7, minZ: -7.7, maxZ: 7.7 },
  { id: 'hallway', zone: 'hub', minX: -15.7, maxX: -8.3, minZ: -7.7, maxZ: 7.7 },
  { id: 'art-room', zone: 'hub', minX: -15.7, maxX: -8.3, minZ: -15.7, maxZ: -8.3 },
  { id: 'storage', zone: 'hub', minX: -15.7, maxX: -8.3, minZ: 8.3, maxZ: 15.7 },
  { id: 'cafeteria', zone: 'hub', minX: -7.7, maxX: 7.7, minZ: 8.3, maxZ: 12.9 },
  { id: 'playground', zone: 'hub', minX: 8.3, maxX: 15.7, minZ: -15.7, maxZ: 15.7 },
  { id: 'garden', zone: 'garden', minX: -17.7, maxX: 17.7, minZ: -17.7, maxZ: 17.7 },
  { id: 'storybook-neighborhood', zone: 'storybook', minX: -23.7, maxX: 23.7, minZ: -23.7, maxZ: 23.7 },
  // One region, not five. Walkable regions are inset by the player's
  // radius, so two abutting regions leave an 0.84 m seam the player
  // cannot cross - which is exactly what sealed the staircases. The
  // home is fully enclosed by its own walls, so the walls can do all
  // the containing and the region only has to be large enough.
  { id: 'home-interior', zone: 'home', minX: -26.5, maxX: 18.5, minZ: -8.5, maxZ: 8.5 },
];

export const GARDEN_SPAWN: [number, number, number] = [0, 0, 14];
export const GARDEN_RETURN_SPAWN: [number, number, number] = [12, 0, -10.4];
export const GARDEN_BOUNDS = { minX: -17.7, maxX: 17.7, minZ: -17.7, maxZ: 17.7 };
export const STORYBOOK_SPAWN: [number, number, number] = [0, 0, 19.5];

export const WORLD_ANCHORS: WorldAnchor[] = [
  { id: 'classroom-circle', position: [0, 0, 0], room: 'classroom', activity: 'morning-play' },
  { id: 'art-table', position: [-10, 0, -12], room: 'art-room', activity: 'art-time' },
  { id: 'storage-shelves', position: [-13, 0, 12], room: 'storage', activity: 'storage' },
  { id: 'cafeteria', position: [0, 0, 9.4], room: 'cafeteria', activity: 'breakfast' },
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
  if (WORLD_WALKABLE_REGIONS.filter((region) => (region.zone ?? 'hub') === zone).some(contains)) return true;

  if (zone !== 'hub') return false;

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

/**
 * How tall something can be and still be walked over.
 *
 * Player collision used to be purely 2D in XZ: minY and maxY were read only by
 * the camera, so every solid was an infinitely tall wall to the player. That is
 * why a 6 cm sandbox pad blocked a 4 x 4 m square of the playground, and why the
 * authors' evident intent - `garden-pond: maxY 0.12`, and the `collision: false`
 * escape hatches on the juice signboard and the upper storage box - had no
 * effect on walking at all.
 *
 * 0.15 m is ankle height: below a step, above the thickest floor decal.
 */
export const STEP_OVER_HEIGHT = 0.15;

/**
 * Does this solid stop the player? Flat things do not, unless they say they do.
 * The camera keeps using the full solid list, because a shape too low to block a
 * foot can still be worth not clipping through.
 */
export function blocksPlayer(solid: WorldSolid): boolean {
  if (solid.collision === false) return false;
  if (solid.blocksWhenFlat) return true;
  const top = solid.maxY ?? 1.5;
  return top > STEP_OVER_HEIGHT;
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
    && blocksPlayer(solid)
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
      if (solid.zone === zone && blocksPlayer(solid)) pushOut(next, radius, solid, 'x');
    }
    if (!isWithinWalkableBounds(next, radius, zone)) next.x = before.x;
    next.z += stepZ;
    for (const solid of WORLD_SOLIDS) {
      if (solid.zone === zone && blocksPlayer(solid)) pushOut(next, radius, solid, 'z');
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
/**
 * Player-facing district names.
 *
 * A map rather than a ternary because Storybook Lane and Maker Market are
 * planned, and a ternary silently renders every future district as "DayKare
 * Hub" instead of failing to compile.
 */
export const ZONE_LABELS: Record<GameZone, string> = {
  home: 'Your Stony Brook Home',
  hub: 'DayKare Hub',
  garden: 'Garden District',
  storybook: 'Storybook Lane',
};

export const zoneLabel = (zone: GameZone): string => ZONE_LABELS[zone] ?? ZONE_LABELS.hub;
