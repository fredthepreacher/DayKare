import type { ScheduleBlockId } from './gameClock';
import type { GameZone } from './world';

export interface SchedulePolicy {
  zone: GameZone;
  anchor: [number, number, number];
  radius: number;
  teacher: 'Ms. Harper' | 'Mr. Davis';
  instruction: string;
}

export const SCHEDULE_DETECTION_GRACE_SECONDS = 12;
export const SCHEDULE_RECAPTURE_GRACE_SECONDS = 30;
export const MANDATORY_SCHEDULES = new Set<ScheduleBlockId>(['breakfast', 'show-and-tell', 'art-time', 'lunch', 'nap']);
export const FREE_SCHEDULES = new Set<ScheduleBlockId>(['morning-play', 'juice-club', 'recess', 'outdoor-play', 'pickup', 'storybook-lane']);

const POLICIES: Partial<Record<ScheduleBlockId, SchedulePolicy>> = {
  breakfast: {
    zone: 'hub',
    anchor: [0, 0, 9.8],
    radius: 4.6,
    teacher: 'Mr. Davis',
    instruction: 'Breakfast is together in the Cafeteria.',
  },
  'morning-play': {
    zone: 'hub',
    anchor: [-1.5, 0, 1.5],
    radius: 8,
    teacher: 'Ms. Harper',
    instruction: 'Morning play stays in the main classroom.',
  },
  'show-and-tell': {
    zone: 'hub',
    anchor: [0, 0, 2.3],
    radius: 4.5,
    teacher: 'Ms. Harper',
    instruction: 'Show & Tell is starting at the circle-time mat.',
  },
  'art-time': {
    zone: 'hub',
    anchor: [-12.1, 0, -9.25],
    radius: 4.2,
    teacher: 'Ms. Harper',
    instruction: 'Art Time is in the art room.',
  },
  lunch: {
    zone: 'hub',
    anchor: [0, 0, 9.8],
    radius: 4.6,
    teacher: 'Mr. Davis',
    instruction: 'Lunch is together in the Cafeteria.',
  },
  'juice-club': {
    zone: 'hub',
    anchor: [1.5, 0, -1.5],
    radius: 7,
    teacher: 'Mr. Davis',
    instruction: 'Juice Club is open in the classroom.',
  },
  nap: {
    zone: 'hub',
    anchor: [5.2, 0, 6.1],
    radius: 6.2,
    teacher: 'Ms. Harper',
    instruction: 'Nap Time is on the quiet mats.',
  },
  recess: {
    zone: 'garden',
    anchor: [0, 0, 2],
    radius: 16,
    teacher: 'Ms. Harper',
    instruction: 'Recess is in the Garden. Everyone goes together.',
  },
  'outdoor-play': {
    zone: 'hub',
    anchor: [12, 0, 0],
    radius: 7.5,
    teacher: 'Mr. Davis',
    instruction: 'Afternoon play is in the playground.',
  },
};

export function schedulePolicy(id: ScheduleBlockId): SchedulePolicy | null {
  return POLICIES[id] ?? null;
}

export function isMandatorySchedule(id: ScheduleBlockId) {
  return MANDATORY_SCHEDULES.has(id);
}

export function isFreeSchedule(id: ScheduleBlockId) {
  return FREE_SCHEDULES.has(id) || !MANDATORY_SCHEDULES.has(id);
}

export function playerFollowsSchedule(id: ScheduleBlockId, zone: GameZone, position: readonly number[]) {
  const policy = schedulePolicy(id);
  if (!policy || zone !== policy.zone) return policy ? false : true;
  const dx = (position[0] ?? 0) - policy.anchor[0];
  const dz = (position[2] ?? 0) - policy.anchor[2];
  return dx * dx + dz * dz <= policy.radius * policy.radius;
}

/** Attendance is enforced by a physical teacher catch, never an invisible tug. */
export function softActivityGuidance(id: ScheduleBlockId, zone: GameZone, position: readonly number[]): [number, number] {
  void id; void zone; void position;
  return [0, 0];
}
