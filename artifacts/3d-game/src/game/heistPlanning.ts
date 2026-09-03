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
