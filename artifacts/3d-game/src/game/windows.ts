import { WORLD_SOLIDS, type WorldSolid } from './world';

/**
 * Daycare windows.
 *
 * The old windows were light-blue boxes pinned to the inside face of a
 * wall: opaque, one-sided, and invisible from the playground. A real
 * window needs a hole, so each opening listed here is cut out of the wall
 * mesh and filled with a transparent double-sided pane.
 *
 * Collision is untouched. The wall's collider in WORLD_SOLIDS is still one
 * unbroken box, so the player cannot walk through the glass — you can see
 * out of a window without being able to step through it.
 */
export interface WindowOpening {
  /** The wall solid this window is cut into. */
  solidId: string;
  /** Centre of the opening along the wall's long axis, in world units. */
  along: number;
  width: number;
  /** Bottom of the glass, measured from the floor. */
  sill: number;
  height: number;
}

export const WINDOW_OPENINGS: readonly WindowOpening[] = [
  // Classroom north wall, looking out over the front grass.
  { solidId: 'main-north-wall', along: -4.4, width: 1.9, sill: 1.15, height: 1.25 },
  { solidId: 'main-north-wall', along: -1.5, width: 1.9, sill: 1.15, height: 1.25 },
  { solidId: 'main-north-wall', along: 1.5, width: 1.9, sill: 1.15, height: 1.25 },
  { solidId: 'main-north-wall', along: 4.4, width: 1.9, sill: 1.15, height: 1.25 },
  // Hallway outer wall. The hallway had no daylight at all, which is why a
  // flat blue panel there read as a floating decoration rather than a window.
  //
  // These two sit in the gaps BETWEEN the three pieces of art already hung on
  // this wall. Cut at +/-3.2 they punched a hole out from behind the
  // attendance chart and the props board, which left those frames hanging
  // over open air - the "artwork floating in thin air near the hallway".
  { solidId: 'west-boundary', along: -2.3, width: 1.35, sill: 1.15, height: 1.25 },
  { solidId: 'west-boundary', along: 2.25, width: 1.35, sill: 1.15, height: 1.25 },
  // Playground side, so the room reads as lit from both ends. Pushed clear of
  // the playground-equipment board, which it used to miss by 8 cm.
  { solidId: 'east-boundary', along: -7, width: 1.6, sill: 1.15, height: 1.25 },
  { solidId: 'east-boundary', along: 6.5, width: 1.9, sill: 1.15, height: 1.25 },
];

export interface WallSegment {
  /** Centre of the segment in world space. */
  position: [number, number, number];
  size: [number, number, number];
}

export interface WindowPane {
  position: [number, number, number];
  /** Pane size in the wall plane, [width, height]. */
  size: [number, number];
  /** True when the wall runs along X, so the pane faces Z. */
  facesZ: boolean;
  thickness: number;
}

export interface WallBuild {
  segments: WallSegment[];
  panes: WindowPane[];
}

/**
 * Splits one wall into the solid pieces around its openings, plus the panes
 * that fill them. A wall with no openings comes back as a single segment,
 * so the common case costs nothing.
 */
export function buildWall(solid: WorldSolid, height = 3): WallBuild {
  const spanX = solid.maxX - solid.minX;
  const spanZ = solid.maxZ - solid.minZ;
  const alongX = spanX >= spanZ;
  const length = alongX ? spanX : spanZ;
  const thickness = alongX ? spanZ : spanX;
  const centreAlong = alongX ? (solid.minX + solid.maxX) / 2 : (solid.minZ + solid.maxZ) / 2;
  const centreAcross = alongX ? (solid.minZ + solid.maxZ) / 2 : (solid.minX + solid.maxX) / 2;

  const openings = WINDOW_OPENINGS
    .filter((opening) => opening.solidId === solid.id)
    .map((opening) => ({
      ...opening,
      min: opening.along - opening.width / 2,
      max: opening.along + opening.width / 2,
    }))
    .sort((a, b) => a.min - b.min);

  const at = (along: number, y: number, len: number, tall: number): WallSegment => ({
    position: alongX ? [along, y, centreAcross] : [centreAcross, y, along],
    size: alongX ? [len, tall, thickness] : [thickness, tall, len],
  });

  if (!openings.length) {
    return { segments: [at(centreAlong, height / 2, length, height)], panes: [] };
  }

  const segments: WallSegment[] = [];
  const panes: WindowPane[] = [];
  let cursor = centreAlong - length / 2;

  for (const opening of openings) {
    const min = Math.max(cursor, opening.min);
    const max = Math.min(centreAlong + length / 2, opening.max);
    if (max <= min) continue;
    // Solid wall up to the opening.
    if (min > cursor) segments.push(at((cursor + min) / 2, height / 2, min - cursor, height));
    // Sill below and lintel above the hole.
    const top = Math.min(height, opening.sill + opening.height);
    if (opening.sill > 0) segments.push(at((min + max) / 2, opening.sill / 2, max - min, opening.sill));
    if (top < height) segments.push(at((min + max) / 2, (top + height) / 2, max - min, height - top));
    panes.push({
      position: alongX
        ? [(min + max) / 2, (opening.sill + top) / 2, centreAcross]
        : [centreAcross, (opening.sill + top) / 2, (min + max) / 2],
      size: [max - min, top - opening.sill],
      facesZ: alongX,
      thickness,
    });
    cursor = max;
  }

  const end = centreAlong + length / 2;
  if (cursor < end) segments.push(at((cursor + end) / 2, height / 2, end - cursor, height));
  return { segments, panes };
}

/**
 * How much clear wall an opening must leave around anything mounted on the
 * same wall. Below this the frame overhangs the hole and reads as floating.
 */
export const WINDOW_ART_CLEARANCE = 0.25;

/** Every wall an opening claims must actually exist, or it cuts nothing. */
export function windowOpeningsResolve() {
  return WINDOW_OPENINGS.every((opening) =>
    WORLD_SOLIDS.some((solid) => solid.id === opening.solidId));
}
