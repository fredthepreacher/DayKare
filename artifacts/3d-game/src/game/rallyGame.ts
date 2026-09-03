/** Shared deterministic character-Pong model for tennis and ping-pong. */
export type RallyId = "ping-pong" | "tennis";
export interface RallyConfig {
  id: RallyId;
  label: string;
  paddleHalfWidth: number;
  npcPaddleHalfWidth: number;
  baseCrossSeconds: number;
  speedUpPerRally: number;
  minCrossSeconds: number;
  targetRally: number;
  pointsToWin: number;
  rbReward: number;
}
export const RALLY_WIN_RB = 250;
export const RALLY_POINTS_TO_WIN = 5;
export const RALLY_CONFIGS: Record<RallyId, RallyConfig> = {
  "ping-pong": {
    id: "ping-pong",
    label: "Basement Ping-Pong",
    paddleHalfWidth: 0.25,
    npcPaddleHalfWidth: 0.23,
    baseCrossSeconds: 1.08,
    speedUpPerRally: 0.96,
    minCrossSeconds: 0.43,
    targetRally: 8,
    pointsToWin: 5,
    rbReward: 250,
  },
  tennis: {
    id: "tennis",
    label: "Stony Brook Tennis",
    paddleHalfWidth: 0.29,
    npcPaddleHalfWidth: 0.27,
    baseCrossSeconds: 1.4,
    speedUpPerRally: 0.95,
    minCrossSeconds: 0.55,
    targetRally: 6,
    pointsToWin: 5,
    rbReward: 250,
  },
};
export interface RallyState {
  ballX: number;
  ballY: number;
  direction: 1 | -1;
  paddleX: number;
  npcPaddleX: number;
  npcReactionTimer: number;
  npcReturnCount: number;
  rally: number;
  bestRally: number;
  playerScore: number;
  npcScore: number;
  returnedThisStep: boolean;
  missedThisStep: boolean;
  npcMissedThisStep: boolean;
  over: boolean;
  winner: "player" | "npc" | null;
}
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
export const createRally = (): RallyState => ({
  ballX: 0,
  ballY: 1,
  direction: -1,
  paddleX: 0,
  npcPaddleX: 0,
  npcReactionTimer: 0.14,
  npcReturnCount: 0,
  rally: 0,
  bestRally: 0,
  playerScore: 0,
  npcScore: 0,
  returnedThisStep: false,
  missedThisStep: false,
  npcMissedThisStep: false,
  over: false,
  winner: null,
});
export const createRallyMatchId = (
  id: RallyId,
  now = Date.now(),
  random = Math.random,
) => `${id}-${Math.floor(now)}-${Math.floor(random() * 1e9)}`;
export function moveRallyPaddle(
  s: RallyState,
  axis: number,
  dt: number,
): RallyState {
  if (s.over) return s;
  const step =
    Number.isFinite(axis) && Number.isFinite(dt) ? axis * dt * 1.9 : 0;
  return { ...s, paddleX: clamp(s.paddleX + step, -1, 1) };
}
function nextAim(r: number) {
  const w = ((r + 1) * 0.618) % 2;
  return w > 1 ? 1 - (w - 1) : w - 0.5;
}
function point(
  s: RallyState,
  c: RallyConfig,
  who: "player" | "npc",
): RallyState {
  const playerScore = s.playerScore + (who === "player" ? 1 : 0),
    npcScore = s.npcScore + (who === "npc" ? 1 : 0);
  const winner =
    playerScore >= c.pointsToWin
      ? "player"
      : npcScore >= c.pointsToWin
        ? "npc"
        : null;
  return {
    ...s,
    ballX: who === "player" ? 0.72 : -0.72,
    ballY: who === "player" ? 1 : 0,
    direction: who === "player" ? -1 : 1,
    npcReactionTimer: 0.14,
    rally: 0,
    playerScore,
    npcScore,
    missedThisStep: who === "npc",
    npcMissedThisStep: who === "player",
    over: winner !== null,
    winner,
  };
}
export function stepRally(
  s: RallyState,
  c: RallyConfig,
  delta: number,
): RallyState {
  if (s.over || !Number.isFinite(delta) || delta <= 0)
    return s.returnedThisStep || s.missedThisStep || s.npcMissedThisStep
      ? {
          ...s,
          returnedThisStep: false,
          missedThisStep: false,
          npcMissedThisStep: false,
        }
      : s;
  const dt = Math.min(delta, 0.25),
    cross = Math.max(
      c.minCrossSeconds,
      c.baseCrossSeconds * c.speedUpPerRally ** s.rally,
    );
  let n = {
    ...s,
    ballY: s.ballY + (s.direction * dt) / cross,
    returnedThisStep: false,
    missedThisStep: false,
    npcMissedThisStep: false,
    npcReactionTimer: Math.max(0, s.npcReactionTimer - dt),
  };
  if (n.direction === 1 && n.npcReactionTimer <= 0) {
    const d = n.ballX - n.npcPaddleX;
    n.npcPaddleX = clamp(
      n.npcPaddleX + Math.sign(d) * Math.min(Math.abs(d), dt * 1.45),
      -1,
      1,
    );
  }
  if (n.direction === 1 && n.ballY >= 1) {
    const miss = (n.npcReturnCount + 1) % 3 === 0,
      hit = Math.abs(n.npcPaddleX - n.ballX) <= c.npcPaddleHalfWidth;
    if (!hit || miss)
      return point({ ...n, npcReturnCount: n.npcReturnCount + 1 }, c, "player");
    const r = n.rally + 1;
    n = {
      ...n,
      ballY: 1,
      direction: -1,
      ballX: clamp(nextAim(r), -0.95, 0.95),
      npcReturnCount: n.npcReturnCount + 1,
      npcReactionTimer: 0.14,
      rally: r,
      bestRally: Math.max(n.bestRally, r),
      returnedThisStep: true,
    };
  } else if (n.direction === -1 && n.ballY <= 0) {
    if (Math.abs(n.paddleX - n.ballX) > c.paddleHalfWidth)
      return point(n, c, "npc");
    const r = n.rally + 1;
    n = {
      ...n,
      ballY: 0,
      direction: 1,
      ballX: clamp(n.ballX + (n.paddleX - n.ballX) * 0.55, -0.95, 0.95),
      npcReactionTimer: 0.14,
      rally: r,
      bestRally: Math.max(n.bestRally, r),
      returnedThisStep: true,
    };
  }
  return { ...n, ballY: clamp(n.ballY, 0, 1) };
}
export const rallyCleared = (s: RallyState, _c: RallyConfig) =>
  s.winner === "player";
