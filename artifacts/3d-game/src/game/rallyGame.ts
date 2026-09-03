/**
 * A rally: the shared model behind ping pong and tennis.
 *
 * Both are the same game — a ball crosses a court, the player slides their
 * paddle to line up with it, and a rally builds — so they share one pure
 * model with two configurations rather than two near-identical
 * implementations. No physics engine: the ball is a position and a velocity,
 * which is all the feel needs and all a test can assert.
 */

export type RallyId = 'ping-pong' | 'tennis';

export interface RallyConfig {
  id: RallyId;
  label: string;
  /** Half-width of the court in model units; the ball moves in -1..1. */
  paddleHalfWidth: number;
  /** Seconds for the ball to cross from one end to the other at rally 0. */
  baseCrossSeconds: number;
  /** How much faster each successful return makes the next one, as a factor. */
  speedUpPerRally: number;
  /** The fastest a crossing may get, in seconds. */
  minCrossSeconds: number;
  /** Rally length that banks the reward. */
  targetRally: number;
  /** XP for reaching the target, paid once per session. */
  xpReward: number;
}

export const RALLY_CONFIGS: Record<RallyId, RallyConfig> = {
  'ping-pong': {
    id: 'ping-pong',
    label: 'Basement Ping Pong',
    paddleHalfWidth: 0.26,
    baseCrossSeconds: 1.15,
    speedUpPerRally: 0.955,
    minCrossSeconds: 0.42,
    targetRally: 8,
    xpReward: 30,
  },
  tennis: {
    id: 'tennis',
    label: 'Stony Brook Tennis',
    paddleHalfWidth: 0.3,
    baseCrossSeconds: 1.45,
    speedUpPerRally: 0.94,
    minCrossSeconds: 0.55,
    targetRally: 6,
    xpReward: 40,
  },
};

export interface RallyState {
  /** Ball position across the court, -1 (player's left) to 1. */
  ballX: number;
  /** Ball position along the court: 0 at the player's end, 1 at the far end. */
  ballY: number;
  /** +1 travelling away from the player, -1 travelling towards them. */
  direction: 1 | -1;
  /** Where the player's paddle sits, -1 to 1. */
  paddleX: number;
  rally: number;
  bestRally: number;
  misses: number;
  /** Set on the single step where a return happened, for a sound cue. */
  returnedThisStep: boolean;
  /** Set on the single step where the ball got past the player. */
  missedThisStep: boolean;
  over: boolean;
}

export const RALLY_MAX_MISSES = 3;

export function createRally(): RallyState {
  return {
    ballX: 0,
    ballY: 1,
    direction: -1,
    paddleX: 0,
    rally: 0,
    bestRally: 0,
    misses: 0,
    returnedThisStep: false,
    missedThisStep: false,
    over: false,
  };
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Moves the paddle. Input is a -1..1 axis, so a key and a stick feel the same. */
export function moveRallyPaddle(state: RallyState, axis: number, delta: number): RallyState {
  if (state.over) return state;
  const step = Number.isFinite(axis) && Number.isFinite(delta) ? axis * delta * 1.9 : 0;
  return { ...state, paddleX: clamp(state.paddleX + step, -1, 1) };
}

/**
 * Where the ball will cross the player's baseline. Authored rather than
 * random so a rally is reproducible in a test: the target walks across the
 * court by an irrational-ish step, which reads as unpredictable without
 * being unfair.
 */
function nextAim(rally: number) {
  const walk = ((rally + 1) * 0.618) % 2;
  return walk > 1 ? 2 - walk - 1 : walk - 0.5;
}

export function stepRally(state: RallyState, config: RallyConfig, delta: number): RallyState {
  if (state.over || !Number.isFinite(delta) || delta <= 0) {
    return state.returnedThisStep || state.missedThisStep
      ? { ...state, returnedThisStep: false, missedThisStep: false }
      : state;
  }
  const cross = Math.max(
    config.minCrossSeconds,
    config.baseCrossSeconds * config.speedUpPerRally ** state.rally,
  );
  let ballY = state.ballY + (state.direction * Math.min(delta, 0.25)) / cross;
  let { direction, rally, misses, ballX } = state;
  let returnedThisStep = false;
  let missedThisStep = false;

  if (direction === 1 && ballY >= 1) {
    // The far side always returns it, aiming somewhere new.
    ballY = 1;
    direction = -1;
    ballX = clamp(nextAim(rally), -0.95, 0.95);
  } else if (direction === -1 && ballY <= 0) {
    ballY = 0;
    if (Math.abs(state.paddleX - ballX) <= config.paddleHalfWidth) {
      direction = 1;
      rally += 1;
      returnedThisStep = true;
    } else {
      misses += 1;
      missedThisStep = true;
      rally = 0;
      ballY = 1;
      direction = -1;
      ballX = 0;
    }
  }

  return {
    ...state,
    ballX,
    ballY: clamp(ballY, 0, 1),
    direction,
    rally,
    bestRally: Math.max(state.bestRally, rally),
    misses,
    returnedThisStep,
    missedThisStep,
    over: misses >= RALLY_MAX_MISSES,
  };
}

export function rallyCleared(state: RallyState, config: RallyConfig) {
  return state.bestRally >= config.targetRally;
}
