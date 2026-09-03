export type RoutePlannerNodeId = 'start' | 'cubbies' | 'rug' | 'art-door' | 'patrol' | 'hall' | 'target';

export const ROUTE_PLANNER_MAX_MOVES = 5;

export const ROUTE_PLANNER_NODES = [
  { id: 'start', label: 'Heist Hub', x: 12, y: 82 },
  { id: 'cubbies', label: 'Cubbies', x: 31, y: 55 },
  { id: 'rug', label: 'Busy Rug', x: 34, y: 22 },
  { id: 'art-door', label: 'Art Door', x: 54, y: 68 },
  { id: 'patrol', label: 'Teacher', x: 58, y: 30 },
  { id: 'hall', label: 'Hall Corner', x: 76, y: 54 },
  { id: 'target', label: 'Sticker Cart', x: 91, y: 18 },
] as const;

const ROUTES: Record<RoutePlannerNodeId, RoutePlannerNodeId[]> = {
  start: ['cubbies', 'rug'],
  cubbies: ['art-door'],
  rug: ['patrol'],
  'art-door': ['hall'],
  patrol: ['hall'],
  hall: ['target'],
  target: [],
};

export interface RoutePlannerState {
  path: RoutePlannerNodeId[];
  risk: number;
  moves: number;
  complete: boolean;
  failed: boolean;
}

export function createRoutePlannerState(): RoutePlannerState {
  return { path: ['start'], risk: 0, moves: 0, complete: false, failed: false };
}

export function routePlannerOptions(state: RoutePlannerState) {
  return ROUTES[state.path.at(-1) ?? 'start'];
}

export function advanceRoutePlanner(state: RoutePlannerState, next: RoutePlannerNodeId): RoutePlannerState {
  if (state.complete || state.failed || !routePlannerOptions(state).includes(next)) return state;
  const moves = state.moves + 1;
  const risk = state.risk + (next === 'rug' ? 1 : next === 'patrol' ? 2 : 0);
  const complete = next === 'target';
  return {
    path: [...state.path, next],
    risk,
    moves,
    complete,
    failed: !complete && moves >= ROUTE_PLANNER_MAX_MOVES,
  };
}

export function leoHeistApproachAllowed(schedule: string) {
  return schedule === 'morning-play'
    || schedule === 'recess'
    || schedule === 'pickup'
    || schedule === 'juice-club'
    || schedule === 'outdoor-play';
}

/* ------------------------------------------------------------------ *
 * Timing Grid — the second practice minigame.
 *
 * The player watches a marker sweep a track and commits at what they
 * judge to be the safe moment. The windows are authored, not random,
 * so a round is reproducible in a test and a player can actually learn
 * the rhythm instead of guessing at noise.
 *
 * This is practice only. It pays a token amount of XP through the
 * store and never touches Rascal Bucks, so no amount of replaying it
 * can substitute for running an actual heist.
 * ------------------------------------------------------------------ */

export interface TimingGridRound {
  id: string;
  label: string;
  /** Seconds for the marker to cross the track once. */
  sweepSeconds: number;
  /** Safe window as a fraction of the track, inclusive. */
  safeFrom: number;
  safeTo: number;
}

export const TIMING_GRID_ROUNDS: readonly TimingGridRound[] = [
  { id: 'hallway', label: 'Hallway sweep', sweepSeconds: 2.6, safeFrom: 0.34, safeTo: 0.62 },
  { id: 'doorway', label: 'Doorway gap', sweepSeconds: 2.1, safeFrom: 0.55, safeTo: 0.78 },
  { id: 'cart', label: 'Cart rattle', sweepSeconds: 1.7, safeFrom: 0.18, safeTo: 0.38 },
  { id: 'handoff', label: 'Sticker handoff', sweepSeconds: 1.4, safeFrom: 0.44, safeTo: 0.6 },
];

/** Hits needed to bank the practice reward. */
export const TIMING_GRID_PASS_SCORE = 3;

export interface TimingGridState {
  round: number;
  score: number;
  results: ('hit' | 'miss')[];
  complete: boolean;
}

export function createTimingGridState(): TimingGridState {
  return { round: 0, score: 0, results: [], complete: false };
}

export function timingGridRound(state: TimingGridState): TimingGridRound | null {
  return TIMING_GRID_ROUNDS[state.round] ?? null;
}

/**
 * `position` is where the marker sat when the player committed, as a
 * fraction of the track. A finished run refuses further input, so the
 * last round cannot be re-judged into a better score.
 */
export function commitTimingGrid(state: TimingGridState, position: number): TimingGridState {
  const round = timingGridRound(state);
  if (state.complete || !round) return state;
  const clamped = Number.isFinite(position) ? Math.max(0, Math.min(1, position)) : -1;
  const hit = clamped >= round.safeFrom && clamped <= round.safeTo;
  const nextRound = state.round + 1;
  return {
    round: nextRound,
    score: state.score + (hit ? 1 : 0),
    results: [...state.results, hit ? 'hit' : 'miss'],
    complete: nextRound >= TIMING_GRID_ROUNDS.length,
  };
}

export function timingGridPassed(state: TimingGridState) {
  return state.complete && state.score >= TIMING_GRID_PASS_SCORE;
}
