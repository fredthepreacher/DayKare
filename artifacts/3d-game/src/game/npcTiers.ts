/**
 * NPC simulation tiers.
 *
 * The daycare is about to ask twenty-odd children to change activity at the
 * same moment, several times a day. Today every NPC runs full pathfinding,
 * collision and animation every frame regardless of whether the player can see
 * them or is anywhere near them, which is affordable at eleven children and is
 * not affordable at twenty-five on a phone.
 *
 *   Tier A - near, or relevant: everything. Movement, animation, social
 *            reactions, teacher awareness, interaction.
 *   Tier B - near but not visible: the same behaviour on a reduced cadence.
 *            The player can turn around at any moment, so B must never look
 *            like it was asleep when they do.
 *   Tier C - distant: logical simulation only. The NPC still has a schedule, an
 *            activity and a destination, and still reports arrival - it just
 *            stops paying for per-frame pathfinding and animation.
 *
 * The thing that makes this safe rather than clever: a Tier C NPC is still
 * SIMULATED. It is not paused and it is not despawned. When the player walks
 * over, it is already where it should be and doing what it should be doing,
 * because its logical state kept advancing the whole time.
 */

export type NpcTier = 'A' | 'B' | 'C';

export interface TierInput {
  /** World-space distance from the camera or player. */
  distance: number;
  /** Roughly within the view frustum. */
  visible: boolean;
  /**
   * The NPC is doing something the player is part of - a conversation, a Juice
   * Club order, a quest step, a teacher actively reacting to them.
   *
   * This ALWAYS wins. An NPC mid-interaction is Tier A at any distance, because
   * downgrading the character you are talking to is indistinguishable from a
   * bug and there is never more than a handful of them.
   */
  engaged: boolean;
  animationDistance: number;
  simulationDistance: number;
}

export function resolveNpcTier(input: TierInput): NpcTier {
  if (input.engaged) return 'A';
  if (input.distance > input.simulationDistance) return 'C';
  if (input.visible && input.distance <= input.animationDistance) return 'A';
  if (input.distance <= input.animationDistance) return 'B';
  return input.visible ? 'B' : 'C';
}

export interface TieredNpc {
  id: string;
  tier: NpcTier;
  distance: number;
  engaged: boolean;
}

export interface TierCandidate {
  id: string;
  distance: number;
  visible: boolean;
  engaged: boolean;
}

/**
 * Assigns tiers across the whole cast at once, then enforces the budget.
 *
 * Distance alone is not a budget: a player standing in the middle of Morning
 * Circle is within animation range of everybody, and on a phone that is exactly
 * the moment the frame rate collapses. So the nearest N keep Tier A and the
 * rest step down to B - still updating, just less often.
 *
 * Engaged NPCs are exempt and are not counted against the budget. There are
 * only ever a few, and demoting one produces a visible bug rather than a saving.
 */
export function assignTiers(candidates: readonly TierCandidate[], settings: {
  animationDistance: number;
  simulationDistance: number;
  maxFullySimulatedNpcs: number;
}): TieredNpc[] {
  const tiered = candidates.map((candidate) => ({
    id: candidate.id,
    distance: candidate.distance,
    engaged: candidate.engaged,
    tier: resolveNpcTier({
      distance: candidate.distance,
      visible: candidate.visible,
      engaged: candidate.engaged,
      animationDistance: settings.animationDistance,
      simulationDistance: settings.simulationDistance,
    }),
  }));

  const budgeted = tiered
    .filter((npc) => npc.tier === 'A' && !npc.engaged)
    .sort((a, b) => a.distance - b.distance);

  for (let index = settings.maxFullySimulatedNpcs; index < budgeted.length; index += 1) {
    budgeted[index].tier = 'B';
  }

  return tiered;
}

/** How often a tier is allowed to do its expensive work. */
export function tierIntervalMs(tier: NpcTier, distantIntervalMs: number): number {
  if (tier === 'A') return 0;                       // every frame
  if (tier === 'B') return Math.max(50, Math.round(distantIntervalMs / 2));
  return Math.max(100, distantIntervalMs * 2);
}

/**
 * Per-tier capability. Read as: what does this NPC still do?
 *
 * Note what is true at EVERY tier - `simulatesSchedule` and `reportsArrival`.
 * Shared activity sessions only advance when their participants report having
 * arrived, so an NPC culled out of reporting would stall a session for everyone
 * including the player standing right next to it. Tier C stops rendering work,
 * never bookkeeping the world depends on.
 */
export interface TierCapabilities {
  perFrameMovement: boolean;
  animation: boolean;
  pathfinding: boolean;
  socialReactions: boolean;
  simulatesSchedule: boolean;
  reportsArrival: boolean;
}

const CAPABILITIES: Record<NpcTier, TierCapabilities> = {
  A: { perFrameMovement: true, animation: true, pathfinding: true, socialReactions: true, simulatesSchedule: true, reportsArrival: true },
  B: { perFrameMovement: true, animation: true, pathfinding: true, socialReactions: false, simulatesSchedule: true, reportsArrival: true },
  C: { perFrameMovement: false, animation: false, pathfinding: false, socialReactions: false, simulatesSchedule: true, reportsArrival: true },
};

export const capabilitiesForTier = (tier: NpcTier): TierCapabilities => CAPABILITIES[tier];

/**
 * Where a Tier C NPC should be, without pathfinding it there.
 *
 * A distant NPC is moved along the straight line to its destination at its own
 * speed. It is not teleported and it is not frozen: teleporting produces an NPC
 * that snaps across the room the instant the player looks, and freezing
 * produces one standing in a doorway an hour after story time ended. Both are
 * things players notice; a slightly optimistic walking path across a room they
 * cannot see is not.
 */
export function advanceLogicalPosition(
  current: readonly [number, number, number],
  target: readonly [number, number, number],
  speed: number,
  deltaSeconds: number,
): [number, number, number] {
  const dx = target[0] - current[0];
  const dz = target[2] - current[2];
  const distance = Math.hypot(dx, dz);
  const step = Math.max(0, speed) * Math.max(0, deltaSeconds);
  if (distance <= 1e-4 || step >= distance) return [target[0], current[1], target[2]];
  const ratio = step / distance;
  return [current[0] + dx * ratio, current[1], current[2] + dz * ratio];
}

/** Diagnostic counts, for the perf overlay. */
export function summarizeTiers(tiered: readonly TieredNpc[]): Record<NpcTier, number> {
  const counts: Record<NpcTier, number> = { A: 0, B: 0, C: 0 };
  for (const npc of tiered) counts[npc.tier] += 1;
  return counts;
}
