import { type NpcTier, type TierCandidate, assignTiers, summarizeTiers } from './npcTiers';

/**
 * Who is Tier A right now, decided once for the whole cast.
 *
 * Each NPC could classify itself from its own distance, and that would be
 * simpler and wrong: the budget is a property of the CAST, not of any one
 * child. A player standing in the middle of Morning Circle is within animation
 * range of everybody, and twenty-five NPCs each independently concluding "I am
 * near, so I am Tier A" is exactly the moment a phone drops frames.
 *
 * So NPCs report where they are, cheaply, every frame; one coordinator ranks
 * them on an interval and writes back a tier. The ranking is the tested pure
 * function in npcTiers.ts - this module is only the plumbing that lets it see
 * everyone at once.
 */

const candidates = new Map<string, TierCandidate>();
const tiers = new Map<string, NpcTier>();
let lastAssignedAt = 0;
let counts: Record<NpcTier, number> = { A: 0, B: 0, C: 0 };

/** How often the whole cast is re-ranked. Cheap, but not free. */
const REASSIGN_INTERVAL_MS = 200;

export function reportNpc(candidate: TierCandidate): void {
  candidates.set(candidate.id, candidate);
}

export function unregisterNpc(id: string): void {
  candidates.delete(id);
  tiers.delete(id);
}

/**
 * An NPC that has never been ranked is Tier A, not Tier C.
 *
 * The first frame of a newly spawned child must not be a frozen one, and an
 * unknown NPC being expensive for 200ms is a far smaller problem than an
 * unknown NPC standing still in front of the player.
 */
export const tierFor = (id: string): NpcTier => tiers.get(id) ?? 'A';

export function updateNpcTiers(nowMs: number, settings: {
  animationDistance: number;
  simulationDistance: number;
  maxFullySimulatedNpcs: number;
}): void {
  if (nowMs - lastAssignedAt < REASSIGN_INTERVAL_MS) return;
  lastAssignedAt = nowMs;
  const assigned = assignTiers([...candidates.values()], settings);
  for (const npc of assigned) tiers.set(npc.id, npc.tier);
  counts = summarizeTiers(assigned);
}

/** For the performance overlay. */
export const tierCounts = (): Record<NpcTier, number> => ({ ...counts });

/** Test seam, and used when a zone unmounts its whole cast. */
export function resetNpcTiers(): void {
  candidates.clear();
  tiers.clear();
  counts = { A: 0, B: 0, C: 0 };
  lastAssignedAt = 0;
}
