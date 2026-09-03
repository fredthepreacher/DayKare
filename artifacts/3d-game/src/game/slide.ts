/**
 * The Wavy slide.
 *
 * One shared ride model drives both the player and the NPC children, so
 * a child on the slide moves through exactly the sequence the player
 * does. The module is pure — no THREE, no store, no audio — which is
 * what lets the whole ride be stepped and asserted in a test.
 */

export type SlidePhase = 'align' | 'climb' | 'hop' | 'descend' | 'skid' | 'recover' | 'done';

/** Where a rider queues before starting, at the foot of the slide. */
export const SLIDE_QUEUE_POINT: [number, number, number] = [12, 0, -1.9];
/** The step-up spot beside the tower. */
export const SLIDE_CLIMB_POINT: [number, number, number] = [12, 0, -4.2];
/** The top of the tower, where the two hops happen. */
export const SLIDE_TOP_POINT: [number, number, number] = [12, 1.85, -5.5];
/** The foot of the ramp, where the descent ends. */
export const SLIDE_BOTTOM_POINT: [number, number, number] = [12, 0, -2.85];
/** Where the silly skid carries the rider before they stand back up. */
export const SLIDE_SKID_POINT: [number, number, number] = [12, 0, -1.55];

/** Phase durations in seconds, in ride order. */
export const SLIDE_PHASE_SECONDS: Record<Exclude<SlidePhase, 'done'>, number> = {
  align: 0.45,
  climb: 1.15,
  hop: 0.9,
  descend: 1,
  skid: 0.75,
  recover: 0.55,
};

const SLIDE_ORDER: Exclude<SlidePhase, 'done'>[] = ['align', 'climb', 'hop', 'descend', 'skid', 'recover'];

export const SLIDE_TOTAL_SECONDS = SLIDE_ORDER.reduce((total, phase) => total + SLIDE_PHASE_SECONDS[phase], 0);

/** The number of hops taken at the top, per the authored sequence. */
export const SLIDE_HOP_COUNT = 2;

export interface SlideRide {
  phase: SlidePhase;
  /** Seconds spent in the current phase. */
  elapsed: number;
  /** True on the single step that crosses into `descend`. */
  shoutedThisStep: boolean;
  /** True once the "Wavy!" cue has fired, so it can never fire twice. */
  shouted: boolean;
}

export function createSlideRide(): SlideRide {
  return { phase: 'align', elapsed: 0, shoutedThisStep: false, shouted: false };
}

/**
 * Steps the ride forward. Long frames are handled by consuming whole
 * phases in a loop rather than by clamping, so a hitch cannot leave a
 * rider stuck halfway up the ladder — and cannot skip the "Wavy!" cue.
 */
export function advanceSlideRide(ride: SlideRide, delta: number): SlideRide {
  if (ride.phase === 'done') return ride.shoutedThisStep ? { ...ride, shoutedThisStep: false } : ride;
  const step = Number.isFinite(delta) && delta > 0 ? Math.min(delta, 1) : 0;
  let index = SLIDE_ORDER.indexOf(ride.phase);
  let elapsed = ride.elapsed + step;
  let shouted = ride.shouted;
  let shoutedThisStep = false;
  while (index < SLIDE_ORDER.length && elapsed >= SLIDE_PHASE_SECONDS[SLIDE_ORDER[index]]) {
    elapsed -= SLIDE_PHASE_SECONDS[SLIDE_ORDER[index]];
    index += 1;
    if (SLIDE_ORDER[index] === 'descend' && !shouted) {
      shouted = true;
      shoutedThisStep = true;
    }
  }
  const phase: SlidePhase = SLIDE_ORDER[index] ?? 'done';
  return { phase, elapsed: index < SLIDE_ORDER.length ? elapsed : 0, shoutedThisStep, shouted };
}

/** 0..1 progress through the current phase, for easing positions. */
export function slidePhaseProgress(ride: SlideRide) {
  if (ride.phase === 'done') return 1;
  return Math.max(0, Math.min(1, ride.elapsed / SLIDE_PHASE_SECONDS[ride.phase]));
}

const lerp3 = (
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  t: number,
): [number, number, number] => [
  from[0] + (to[0] - from[0]) * t,
  from[1] + (to[1] - from[1]) * t,
  from[2] + (to[2] - from[2]) * t,
];

/**
 * The rider's world position for the current phase. The `align` phase
 * eases from wherever the rider actually stood, so the ride does not
 * snap them to the queue point on the first frame.
 */
export function slideRidePosition(ride: SlideRide, from: readonly [number, number, number]): [number, number, number] {
  const t = slidePhaseProgress(ride);
  switch (ride.phase) {
    case 'align': return lerp3(from, SLIDE_QUEUE_POINT, t);
    case 'climb': return lerp3(SLIDE_CLIMB_POINT, SLIDE_TOP_POINT, t);
    case 'hop': {
      const hop = Math.abs(Math.sin(t * Math.PI * SLIDE_HOP_COUNT)) * 0.22;
      return [SLIDE_TOP_POINT[0], SLIDE_TOP_POINT[1] + hop, SLIDE_TOP_POINT[2]];
    }
    case 'descend': return lerp3(SLIDE_TOP_POINT, SLIDE_BOTTOM_POINT, t * t);
    case 'skid': return lerp3(SLIDE_BOTTOM_POINT, SLIDE_SKID_POINT, 1 - (1 - t) * (1 - t));
    case 'recover': return SLIDE_SKID_POINT;
    default: return SLIDE_SKID_POINT;
  }
}

/** Extra body roll for the tumble, in radians. Zero outside the skid. */
export function slideRideTumble(ride: SlideRide) {
  if (ride.phase === 'skid') return Math.sin(slidePhaseProgress(ride) * Math.PI) * 0.9;
  if (ride.phase === 'recover') return Math.sin((1 - slidePhaseProgress(ride)) * Math.PI * 0.5) * 0.3;
  return 0;
}

/* ---------------------------- NPC cadence ---------------------------- */

export const NPC_SLIDE_MIN_GAP_SECONDS = 25;
export const NPC_SLIDE_MAX_GAP_SECONDS = 40;

/**
 * Schedules which child rides next.
 *
 * Only one child is ever on the slide, and the picker prefers a child
 * who did not ride last so the same kid does not monopolise it. The gap
 * is derived from a seed rather than Math.random so a run is
 * reproducible in a test.
 */
export interface NpcSlideSchedule {
  /** Seconds until the next attempt. */
  nextInSeconds: number;
  /** The child currently riding, if any. */
  rider: string | null;
  lastRider: string | null;
}

export function createNpcSlideSchedule(seed = 0): NpcSlideSchedule {
  return { nextInSeconds: npcSlideGap(seed), rider: null, lastRider: null };
}

export function npcSlideGap(seed: number) {
  // FNV-style mix so an integer seed spreads across the window.
  const mixed = Math.abs(Math.imul(Math.floor(seed) ^ 0x9e3779b9, 0x85ebca6b)) % 1000 / 1000;
  return NPC_SLIDE_MIN_GAP_SECONDS + mixed * (NPC_SLIDE_MAX_GAP_SECONDS - NPC_SLIDE_MIN_GAP_SECONDS);
}

/**
 * `eligible` is the set of children who may ride right now — the caller
 * has already excluded anyone napping, in a mandatory class block, on
 * heist companion duty, or inside a story cutscene.
 */
export function pickNpcSlideRider(eligible: readonly string[], lastRider: string | null): string | null {
  if (!eligible.length) return null;
  const others = eligible.filter((name) => name !== lastRider);
  return (others.length ? others : eligible)[0];
}

export function stepNpcSlideSchedule(
  schedule: NpcSlideSchedule,
  delta: number,
  eligible: readonly string[],
  seed: number,
): NpcSlideSchedule {
  if (schedule.rider) return schedule;
  const nextInSeconds = schedule.nextInSeconds - (Number.isFinite(delta) ? Math.max(0, delta) : 0);
  if (nextInSeconds > 0) return { ...schedule, nextInSeconds };
  const rider = pickNpcSlideRider(eligible, schedule.lastRider);
  // With nobody eligible the timer resets rather than firing repeatedly
  // for the rest of the block.
  if (!rider) return { ...schedule, nextInSeconds: npcSlideGap(seed) };
  return { nextInSeconds: npcSlideGap(seed), rider, lastRider: schedule.lastRider };
}

export function releaseNpcSlideRider(schedule: NpcSlideSchedule, seed: number): NpcSlideSchedule {
  return { nextInSeconds: npcSlideGap(seed), rider: null, lastRider: schedule.rider ?? schedule.lastRider };
}

/** Schedule blocks during which no child leaves what they are doing to slide. */
const SLIDE_BLOCKED_SCHEDULES = new Set(['nap', 'art-time', 'show-and-tell', 'circle-time', 'lunch', 'breakfast', 'pickup']);

export function npcSlideAllowed(schedule: string, heistActive: boolean, cutsceneActive: boolean) {
  return !heistActive && !cutsceneActive && !SLIDE_BLOCKED_SCHEDULES.has(schedule);
}
