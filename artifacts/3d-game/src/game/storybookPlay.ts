import { KID_CAST } from './NPCs';

/**
 * After-hours free play in Stony Brook.
 *
 * The lane used to hold two children standing still. Between 5:30 and 7:45
 * the whole cast is out here, spread across the neighbourhood on their own
 * loops, some of them on wheels.
 *
 * The layout is authored rather than random: every child gets their own loop
 * of two or three spots, no two loops share a spot, and none of them sit on
 * a doorway, the ice cream counter, the manor's path or a realtor's patrol.
 * That is what keeps them from stacking without needing avoidance logic.
 */

export type PlayStyle = 'wander' | 'trike' | 'ride-on' | 'chat' | 'sit';

export interface StorybookPlayLoop {
  name: string;
  style: PlayStyle;
  /** Two or three spots, walked in order and repeated. */
  spots: readonly (readonly [number, number, number])[];
  /** Seconds spent travelling between spots. */
  legSeconds: number;
}

/**
 * Spots avoid: the ice cream stand (x -2.1..2.1, z -9.1..-6.9), the manor lot
 * and its path (x -18..-8, z -17..-6), the realtor patrols (x -6.4..-2.6 and
 * x 2.4..5.6, z -4.6..2.2) and the exit arch at z 22.
 */
export const STORYBOOK_PLAY_LOOPS: readonly StorybookPlayLoop[] = [
  { name: 'Leo', style: 'trike', legSeconds: 7.5, spots: [[8.5, 0, -4], [13.5, 0, -2], [11, 0, 3.5]] },
  { name: 'Mia', style: 'wander', legSeconds: 8.2, spots: [[-6.5, 0, 8.5], [-2.5, 0, 10.5], [-7.5, 0, 12]] },
  { name: 'Sam', style: 'ride-on', legSeconds: 6.8, spots: [[6, 0, 14], [11.5, 0, 12.5], [8.5, 0, 17.5]] },
  { name: 'Zoe', style: 'chat', legSeconds: 9.4, spots: [[3.5, 0, 8.5], [6.5, 0, 7]] },
  { name: 'Eli', style: 'chat', legSeconds: 9.4, spots: [[5.2, 0, 9.6], [7.8, 0, 8.4]] },
  { name: 'Noah', style: 'wander', legSeconds: 7.9, spots: [[-11, 0, 3.5], [-14.5, 0, 6.5], [-9.5, 0, 8]] },
  { name: 'Lily', style: 'sit', legSeconds: 11, spots: [[-4.5, 0, 15.5], [-1, 0, 17]] },
  { name: 'Finn', style: 'trike', legSeconds: 7.1, spots: [[15, 0, 6.5], [17.5, 0, 11], [13, 0, 9]] },
  { name: 'Ruby', style: 'wander', legSeconds: 8.6, spots: [[-16, 0, -2], [-18.5, 0, 3], [-14, 0, 0.5]] },
  { name: 'Max', style: 'ride-on', legSeconds: 6.4, spots: [[2, 0, 19], [-3, 0, 19.5], [0.5, 0, 15.5]] },
  { name: 'Mae', style: 'chat', legSeconds: 10.2, spots: [[-9, 0, 17], [-12.5, 0, 15]] },
];

/** Where a child should be heading at a given moment on their loop. */
export function storybookPlayTarget(loop: StorybookPlayLoop, seconds: number) {
  const index = Math.floor(Math.max(0, seconds) / loop.legSeconds) % loop.spots.length;
  return loop.spots[index];
}

/** Children on wheels, for the rides parked beside them. */
export const STORYBOOK_RIDERS = STORYBOOK_PLAY_LOOPS.filter(
  (loop) => loop.style === 'trike' || loop.style === 'ride-on',
);

/** Every loop names a child who actually exists in the daycare cast. */
export function storybookPlayCastResolves() {
  const cast = new Set(KID_CAST.map((kid) => kid.name));
  return STORYBOOK_PLAY_LOOPS.every((loop) => cast.has(loop.name));
}
