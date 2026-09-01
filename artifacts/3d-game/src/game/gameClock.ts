/**
 * The canonical DayKare clock.
 *
 * Everything here is pure. No React, no store, no timers - given a state and a
 * number of real seconds it returns the next state and the schedule boundaries
 * that were crossed getting there. That makes the properties we actually care
 * about testable without a browser: that the rate is exact, that frame rate
 * cannot change it, that pausing loses no time and invents none, and that a
 * boundary fires once no matter how it was reached.
 *
 * Pace: ONE GAME HOUR EVERY TWO REAL MINUTES.
 *
 *   60 game minutes / 120 real seconds = 0.5 game minutes per real second,
 *   which is 30x real time. A 9:00-17:30 daycare day is 8.5 game hours, so
 *   17 real minutes at 1x.
 *
 * Time is stored as MINUTES SINCE MIDNIGHT, a number - never a formatted
 * string. Formatting is a display concern and lives at the edge.
 */

/** Bumped only when the meaning of a stored clock field changes. */
export const CLOCK_VERSION = 1;

/** Game minutes that pass per real second at 1x. 0.5 => 30x real time. */
export const GAME_MINUTES_PER_REAL_SECOND = 0.5;

/**
 * The daycare day, as data rather than scattered literals.
 *
 * These are deliberately the CURRENT bounds (9:00 to 17:30), not the earlier
 * 7:30 start that breakfast will need. Moving the start of the day is schedule
 * content: it shifts every existing block, the teacher patrol tables and the
 * Juice Club window. That belongs with the phase that builds those blocks, not
 * with the phase that builds the clock. The bounds are one edit away when it is.
 */
export const DAY_START_MINUTE = 9 * 60;      // 09:00
export const DAY_END_MINUTE = 18 * 60 + 30;  // 18:30, after Storybook Lane

export type ScheduleBlockId =
  | 'breakfast'
  | 'morning-play'
  | 'show-and-tell'
  | 'art-time'
  | 'lunch'
  | 'juice-club'
  | 'nap'
  | 'recess'
  | 'outdoor-play'
  | 'pickup'
  | 'storybook-lane';

/**
 * A schedule block. Phase 4A defines the SHAPE and the transition machinery;
 * the fields the later phases need are declared here and left optional so
 * adding breakfast or Show & Tell is authoring data, not reopening this file.
 *
 * ---------------------------------------------------------------------------
 * RESERVED METADATA - DECLARED AND POPULATED, DELIBERATELY NOT READ
 * ---------------------------------------------------------------------------
 *
 * `musicContext` and `lightingProfile` carry real values on every block below,
 * and NOTHING CONSUMES THEM. That is intentional, not an oversight and not a
 * half-finished feature.
 *
 * They exist so the block table is already the single place a block is
 * described, rather than something a later phase has to retrofit onto five
 * definitions that have since drifted. Naming the musical intent of Juice Club
 * while writing the schedule is cheap; reverse-engineering it from a music cue
 * six weeks later is not.
 *
 * What they are NOT: they are not a soundtrack, and they are not a day/night
 * cycle. No audio is loaded, no cue is selected, no light responds to them.
 * There is no code path from these strings to anything the player sees or
 * hears, and grepping either name finds this file and the tests only.
 *
 *   musicContext    -> reserved for 4E (Adaptive Soundtrack)
 *   lightingProfile -> reserved for 4E, alongside the time-of-day hook below
 *   npcProfile      -> reserved for 4C (Living Daycare + Attendance)
 *   teacherProfile  -> reserved for 4C
 *   questHooks      -> reserved for 4C/4D
 *   districtModifiers -> reserved for later district work
 *
 * If a future change makes anything read these, that is the phase where the
 * behaviour is designed and tested - it is not a small follow-up to this one.
 */
export interface ScheduleBlock {
  id: ScheduleBlockId;
  /** Minutes since midnight, inclusive. */
  startMinute: number;
  /** Minutes since midnight, exclusive. */
  endMinute: number;
  label: string;
  activityType: 'meal' | 'free-play' | 'group' | 'craft' | 'business' | 'rest' | 'outdoor' | 'departure' | 'social';
  /** Reserved for 4C. Absent means "unchanged from the previous block". */
  npcProfile?: string;
  /** Reserved for 4C. */
  teacherProfile?: string;
  /** Reserved for 4E. Inert metadata - no audio reads this. */
  musicContext?: string;
  /** Reserved for 4E. Inert metadata - no light reads this. */
  lightingProfile?: string;
  /** Reserved for 4C/4D. */
  questHooks?: string[];
  /** Reserved for later district work. */
  districtModifiers?: Record<string, number>;
}

/**
 * The existing five blocks, with the SAME boundaries the old
 * getScheduleForTime used (10.5, 12.0, 13.5, 15.5 hours). Written once, here,
 * so the clock and the schedule can never disagree about when Juice Club is.
 *
 * The `musicContext` and `lightingProfile` values below are reserved metadata
 * for 4E and are read by nothing. See the note on ScheduleBlock above.
 */
export const SCHEDULE_BLOCKS: readonly ScheduleBlock[] = [
  { id: 'breakfast', startMinute: DAY_START_MINUTE, endMinute: 9 * 60 + 15, label: 'Breakfast', activityType: 'meal', lightingProfile: 'morning', musicContext: 'morning' },
  { id: 'morning-play', startMinute: 9 * 60 + 15, endMinute: 10 * 60 + 15, label: 'Morning Play', activityType: 'free-play', lightingProfile: 'morning', musicContext: 'morning' },
  { id: 'show-and-tell', startMinute: 10 * 60 + 15, endMinute: 10 * 60 + 30, label: 'Show & Tell', activityType: 'group', lightingProfile: 'morning', musicContext: 'circle' },
  { id: 'art-time', startMinute: 10 * 60 + 30, endMinute: 11 * 60 + 45, label: 'Art Time', activityType: 'craft', lightingProfile: 'midday', musicContext: 'craft' },
  { id: 'lunch', startMinute: 11 * 60 + 45, endMinute: 12 * 60, label: 'Lunch', activityType: 'meal', lightingProfile: 'midday', musicContext: 'meal' },
  { id: 'juice-club', startMinute: 12 * 60, endMinute: 13 * 60, label: 'Juice Club', activityType: 'business', lightingProfile: 'midday', musicContext: 'business' },
  { id: 'nap', startMinute: 13 * 60, endMinute: 13 * 60 + 30, label: 'Nap Time', activityType: 'rest', lightingProfile: 'midday', musicContext: 'quiet' },
  { id: 'recess', startMinute: 13 * 60 + 30, endMinute: 14 * 60, label: 'Garden Recess', activityType: 'outdoor', lightingProfile: 'afternoon', musicContext: 'outdoor' },
  { id: 'outdoor-play', startMinute: 14 * 60, endMinute: 15 * 60 + 30, label: 'Afternoon Play', activityType: 'outdoor', lightingProfile: 'afternoon', musicContext: 'outdoor' },
  { id: 'pickup', startMinute: 15 * 60 + 30, endMinute: 17 * 60 + 30, label: 'Pickup', activityType: 'departure', lightingProfile: 'late-afternoon', musicContext: 'pickup' },
  { id: 'storybook-lane', startMinute: 17 * 60 + 30, endMinute: DAY_END_MINUTE, label: 'Storybook Lane', activityType: 'social', lightingProfile: 'evening', musicContext: 'storybook' },
];

/** The minute each block begins, excluding the first (the day's own start). */
const BOUNDARY_MINUTES: readonly number[] = SCHEDULE_BLOCKS
  .map((block) => block.startMinute)
  .filter((minute) => minute > DAY_START_MINUTE);

export type PauseReason =
  | 'dialogue'
  | 'menu'
  | 'journal'
  | 'zone-transition'
  | 'account'
  | 'hidden'
  | 'front-end';

export interface ClockState {
  version: number;
  /** 1-based day, mirroring the existing dayNumber. */
  dayIndex: number;
  /** Minutes since midnight. Fractional; never a formatted string. */
  minute: number;
  /** Player-facing speed: 1x, 2x or 4x. Multiplies the base 30x rate. */
  timeScale: 1 | 2 | 4;
  paused: boolean;
  pauseReason: PauseReason | null;
  /**
   * The highest boundary already announced for this day. Reloading mid-day
   * must not replay a transition the player already lived through, and this is
   * what makes a boundary fire exactly once across a reload.
   */
  lastBoundaryMinute: number;
}

export const createClockState = (dayIndex = 1, minute = DAY_START_MINUTE): ClockState => ({
  version: CLOCK_VERSION,
  dayIndex: Math.max(1, Math.trunc(dayIndex)),
  minute: clampToDay(minute),
  timeScale: 1,
  paused: false,
  pauseReason: null,
  lastBoundaryMinute: DAY_START_MINUTE,
});

export function clampToDay(minute: number): number {
  if (!Number.isFinite(minute)) return DAY_START_MINUTE;
  return Math.min(DAY_END_MINUTE, Math.max(DAY_START_MINUTE, minute));
}

const VALID_SCALES: readonly number[] = [1, 2, 4];

export const isValidTimeScale = (value: unknown): value is 1 | 2 | 4 =>
  typeof value === 'number' && VALID_SCALES.includes(value);

/** The block covering a minute. The last block owns the end of the day. */
export function blockForMinute(minute: number): ScheduleBlock {
  const clamped = clampToDay(minute);
  for (const block of SCHEDULE_BLOCKS) {
    if (clamped < block.endMinute) return block;
  }
  return SCHEDULE_BLOCKS[SCHEDULE_BLOCKS.length - 1];
}

export const scheduleIdForMinute = (minute: number): ScheduleBlockId => blockForMinute(minute).id;

/** Minutes since midnight -> the legacy fractional-hours `timeOfDay`. */
export const minuteToTimeOfDay = (minute: number): number => clampToDay(minute) / 60;

/** The legacy fractional-hours `timeOfDay` -> minutes since midnight. */
export const timeOfDayToMinute = (timeOfDay: number): number =>
  clampToDay((Number.isFinite(timeOfDay) ? timeOfDay : DAY_START_MINUTE / 60) * 60);

export interface ClockTick {
  clock: ClockState;
  /** Boundaries crossed by this tick, in order, each at most once. */
  crossed: ScheduleBlock[];
  /** True when this tick reached the end of the day. */
  reachedDayEnd: boolean;
  /** Game minutes actually added. Zero while paused. */
  advancedMinutes: number;
}

/**
 * Advances the clock by real elapsed seconds.
 *
 * REAL SECONDS, never frames. A 30 FPS device and a 144 FPS device passing the
 * same wall-clock interval must land on the same game minute, because the game
 * day is a promise to the player and not a property of their hardware.
 *
 * `realSeconds` is clamped: a negative delta (clock skew) advances nothing, and
 * an enormous one (a backgrounded tab, a sleeping laptop) is capped rather than
 * fast-forwarding the whole day in a single frame. Catch-up is deliberately NOT
 * a feature - see pauseClock.
 */
export function advanceClock(clock: ClockState, realSeconds: number, maxRealSeconds = 1): ClockTick {
  const idle: ClockTick = { clock, crossed: [], reachedDayEnd: false, advancedMinutes: 0 };
  if (clock.paused) return idle;
  if (!Number.isFinite(realSeconds) || realSeconds <= 0) return idle;

  const seconds = Math.min(realSeconds, maxRealSeconds);
  const advancedMinutes = seconds * GAME_MINUTES_PER_REAL_SECOND * clock.timeScale;
  if (advancedMinutes <= 0) return idle;

  const previous = clock.minute;
  const next = clampToDay(previous + advancedMinutes);
  if (next === previous) return { ...idle, reachedDayEnd: previous >= DAY_END_MINUTE };

  // Every boundary strictly after where we were and at or before where we
  // landed, in order. One tick that skips a whole block - which fast-forward
  // makes ordinary - still reports both boundaries, and reports each once.
  const crossed = SCHEDULE_BLOCKS.filter((block) =>
    BOUNDARY_MINUTES.includes(block.startMinute)
    && block.startMinute > Math.max(previous, clock.lastBoundaryMinute)
    && block.startMinute <= next);

  const lastBoundaryMinute = crossed.length > 0
    ? crossed[crossed.length - 1].startMinute
    : clock.lastBoundaryMinute;

  return {
    clock: { ...clock, minute: next, lastBoundaryMinute },
    crossed,
    reachedDayEnd: next >= DAY_END_MINUTE,
    advancedMinutes: next - previous,
  };
}

/**
 * Pausing records WHY. A pause with no reason is a pause nobody can clear, and
 * a clock stuck at 10:30 with no explanation is the kind of bug that reaches a
 * player as "the day stopped happening".
 */
export const pauseClock = (clock: ClockState, reason: PauseReason): ClockState =>
  clock.paused && clock.pauseReason === reason
    ? clock
    : { ...clock, paused: true, pauseReason: reason };

/**
 * Resuming never repays the debt. Time that did not pass while paused did not
 * happen: no catch-up, no burst of skipped boundaries, no waking up three
 * blocks later because a dialogue was left open.
 */
export const resumeClock = (clock: ClockState): ClockState =>
  clock.paused ? { ...clock, paused: false, pauseReason: null } : clock;

export const setTimeScale = (clock: ClockState, scale: number): ClockState =>
  isValidTimeScale(scale) && scale !== clock.timeScale ? { ...clock, timeScale: scale } : clock;

/**
 * Starts a new day. Called by the existing day-rollover path rather than
 * happening on its own: reaching 17:30 holds there and reports it, and the
 * game decides what a new day means.
 */
export const startNextDay = (clock: ClockState): ClockState => ({
  ...clock,
  dayIndex: clock.dayIndex + 1,
  minute: DAY_START_MINUTE,
  lastBoundaryMinute: DAY_START_MINUTE,
});

export type TimeOfDayPhase = 'morning' | 'midday' | 'afternoon' | 'late-afternoon' | 'evening';

/**
 * Normalised time-of-day, for lighting and music to read later.
 *
 * Deliberately a cheap lookup rather than a simulated sun: a physically modelled
 * sky that costs frames on a phone would be paid for by the players least able
 * to afford it, for something the art style does not ask for.
 */
export function timeOfDayPhase(minute: number): TimeOfDayPhase {
  const m = clampToDay(minute);
  if (m < 11 * 60) return 'morning';
  if (m < 13 * 60) return 'midday';
  if (m < 15 * 60) return 'afternoon';
  if (m < 16 * 60 + 30) return 'late-afternoon';
  return 'evening';
}

/** 0 at the start of the daycare day, 1 at the end. For interpolation. */
export const dayProgress = (minute: number): number =>
  (clampToDay(minute) - DAY_START_MINUTE) / (DAY_END_MINUTE - DAY_START_MINUTE);

/** Display only. The stored value stays numeric. */
export function formatClock(minute: number): string {
  const m = Math.round(clampToDay(minute));
  const hours24 = Math.floor(m / 60);
  const minutes = m % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/**
 * Rebuilds a clock from whatever a save happens to hold.
 *
 * A save written before the clock existed has no clock at all - it has
 * `timeOfDay` and `dayNumber`, and those are enough. Such a save is migrated,
 * never discarded: losing a player's day because we added a feature would be
 * the worst possible trade.
 */
export function normalizeClockState(value: unknown, fallbackTimeOfDay: number, fallbackDay: number): ClockState {
  const base = createClockState(fallbackDay, timeOfDayToMinute(fallbackTimeOfDay));
  if (!value || typeof value !== 'object') return base;
  const raw = value as Record<string, unknown>;

  const minute = typeof raw.minute === 'number' && Number.isFinite(raw.minute)
    ? clampToDay(raw.minute)
    : base.minute;
  const dayIndex = typeof raw.dayIndex === 'number' && Number.isFinite(raw.dayIndex)
    ? Math.max(1, Math.trunc(raw.dayIndex))
    : base.dayIndex;

  return {
    version: CLOCK_VERSION,
    dayIndex,
    minute,
    // A save is never restored still running at 4x. Speed is a thing the player
    // is doing right now, not a property of their progress.
    timeScale: 1,
    // Nor is it restored paused: the reason for the pause is long gone, and a
    // save that loads frozen looks exactly like a broken game.
    paused: false,
    pauseReason: null,
    lastBoundaryMinute: typeof raw.lastBoundaryMinute === 'number' && Number.isFinite(raw.lastBoundaryMinute)
      ? clampToDay(raw.lastBoundaryMinute)
      // An older save has lived through every boundary up to where it stopped,
      // so resuming must not replay them.
      : blockForMinute(minute).startMinute,
  };
}

/** What gets written to the save. Small, numeric, and stable. */
export const serializeClockState = (clock: ClockState) => ({
  version: CLOCK_VERSION,
  dayIndex: clock.dayIndex,
  minute: clock.minute,
  lastBoundaryMinute: clock.lastBoundaryMinute,
});
