/**
 * Three small things to do in Stony Brook, so the evening is not only
 * shopping and going home.
 *
 * All three share one shape - a set of spots, some of which you have visited -
 * so they cost one model between them rather than three systems. Progress is
 * a list of ids, which persists and merges without any migration.
 */

export type NeighborhoodActivityId = 'mail-run' | 'chalk-art' | 'scavenger-hunt';

export interface NeighborhoodSpot {
  id: string;
  label: string;
  position: readonly [number, number, number];
  /** Shown on the walk-up prompt. */
  hint: string;
}

export interface NeighborhoodActivity {
  id: NeighborhoodActivityId;
  label: string;
  blurb: string;
  spots: readonly NeighborhoodSpot[];
  /** Paid once, the first time every spot is done. */
  xpReward: number;
  repReward: number;
}

/**
 * Spots are placed clear of the manor path, the driveway, the ice cream
 * stand, the realtor patrols and the after-hours play loops, so nothing here
 * blocks a doorway or stands inside a child.
 */
export const NEIGHBORHOOD_ACTIVITIES: readonly NeighborhoodActivity[] = [
  {
    id: 'mail-run',
    label: 'Neighbourhood Mail Run',
    blurb: 'Three notes to deliver along the lane.',
    xpReward: 40,
    repReward: 3,
    spots: [
      { id: 'mail-bluebell', label: 'Bluebell mailbox', position: [10.6, 0, -13.2], hint: 'Leave the note in the box' },
      { id: 'mail-sunny', label: 'Sunny mailbox', position: [-18.4, 0, 3.4], hint: 'Leave the note in the box' },
      { id: 'mail-cloud', label: 'Cloud mailbox', position: [10.6, 0, 12.6], hint: 'Leave the note in the box' },
    ],
  },
  {
    id: 'chalk-art',
    label: 'Driveway Chalk Art',
    blurb: 'Three squares of pavement worth decorating.',
    xpReward: 25,
    repReward: 2,
    spots: [
      { id: 'chalk-drive', label: 'Your driveway', position: [-16.5, 0, -7.4], hint: 'Draw a square' },
      { id: 'chalk-path', label: 'The front path', position: [-13, 0, -7.2], hint: 'Draw a sun' },
      { id: 'chalk-corner', label: 'The lane corner', position: [-6.8, 0, -8.2], hint: 'Draw a rainbow' },
    ],
  },
  {
    id: 'scavenger-hunt',
    label: 'Keepsake Hunt',
    blurb: 'Four small things somebody lost in the neighbourhood.',
    xpReward: 55,
    repReward: 4,
    spots: [
      { id: 'keepsake-hedge', label: 'Behind the hedge', position: [-8.4, 0, -9.6], hint: 'Something shiny' },
      { id: 'keepsake-bench', label: 'Under the bench', position: [4.2, 0, -10.3], hint: 'Something small' },
      { id: 'keepsake-lamp', label: 'By the lamp post', position: [-4.6, 0, 12.4], hint: 'Something lost' },
      { id: 'keepsake-court', label: 'By the court fence', position: [16.6, 0, -12.6], hint: 'Something forgotten' },
    ],
  },
];

export function neighborhoodActivity(id: NeighborhoodActivityId) {
  return NEIGHBORHOOD_ACTIVITIES.find((activity) => activity.id === id);
}

export function activitySpots() {
  return NEIGHBORHOOD_ACTIVITIES.flatMap((activity) =>
    activity.spots.map((spot) => ({ activity, spot })));
}

/** How far through an activity the player is. */
export function activityProgress(activity: NeighborhoodActivity, done: readonly string[]) {
  const found = activity.spots.filter((spot) => done.includes(spot.id)).length;
  return { found, total: activity.spots.length, complete: found >= activity.spots.length };
}

/** True when this spot completes the last activity that was outstanding. */
export function activityCompletedBy(spotId: string, done: readonly string[]) {
  const owner = NEIGHBORHOOD_ACTIVITIES.find((activity) =>
    activity.spots.some((spot) => spot.id === spotId));
  if (!owner) return null;
  const after = done.includes(spotId) ? done : [...done, spotId];
  return activityProgress(owner, after).complete ? owner : null;
}

/** Every spot id, for normalising a save. */
export const NEIGHBORHOOD_SPOT_IDS = activitySpots().map(({ spot }) => spot.id);
