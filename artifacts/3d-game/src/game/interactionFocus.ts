import * as THREE from 'three';

export interface InteractionCandidate {
  id: string;
  position: THREE.Vector3;
  range: number;
  priority: number;
  valid: boolean;
  approach?: THREE.Vector3;
  questPriority?: boolean;
  /**
   * A quest action that must remain available once the player is in range,
   * even when the player/camera is aimed elsewhere. This is intentionally
   * narrower than questPriority so ordinary quest targets retain focus scoring.
   */
  forcePriority?: boolean;
  urgentPriority?: boolean;
}

const candidates = new Map<string, InteractionCandidate>();
let lastResolvedId: string | null = null;
const forwardScratch = new THREE.Vector3();
const cameraIntentScratch = new THREE.Vector3();
const offsetScratch = new THREE.Vector3();
const directionScratch = new THREE.Vector3();

export function registerInteractionCandidate(candidate: InteractionCandidate) {
  candidates.set(candidate.id, candidate);
  return () => {
    if (candidates.get(candidate.id) === candidate) candidates.delete(candidate.id);
  };
}

export function updateInteractionCandidate(id: string, update: Partial<InteractionCandidate>) {
  const current = candidates.get(id);
  if (current) Object.assign(current, update);
}

function interactionPoint(candidate: InteractionCandidate) {
  return candidate.approach ?? candidate.position;
}

export function resolveInteractionCandidate(
  playerPosition: THREE.Vector3,
  playerForward: THREE.Vector3,
  cameraForward?: THREE.Vector3,
  now = performance.now(),
) {
  forwardScratch.copy(playerForward).setY(0).normalize();
  cameraIntentScratch.copy(cameraForward ?? playerForward).setY(0).normalize();
  let best: { candidate: InteractionCandidate; score: number } | null = null;
  let forcedQuestCandidate: InteractionCandidate | null = null;
  let forcedQuestDistance = Number.POSITIVE_INFINITY;
  let hasQuestCandidate = false;
  let hasUrgentCandidate = false;
  for (const candidate of candidates.values()) {
    if (
      candidate.valid
      && candidate.forcePriority
      && candidate.questPriority
      && playerPosition.distanceTo(interactionPoint(candidate)) <= candidate.range
    ) {
      const distance = playerPosition.distanceTo(interactionPoint(candidate));
      if (
        forcedQuestCandidate === null
        || distance < forcedQuestDistance
        || (distance === forcedQuestDistance && candidate.id < forcedQuestCandidate.id)
      ) {
        forcedQuestCandidate = candidate;
        forcedQuestDistance = distance;
      }
    }
  }
  if (forcedQuestCandidate) {
    lastResolvedId = forcedQuestCandidate.id;
    return forcedQuestCandidate;
  }
  for (const candidate of candidates.values()) {
    if (
      candidate.valid
      && candidate.questPriority
      && playerPosition.distanceTo(interactionPoint(candidate)) <= candidate.range
    ) {
      hasQuestCandidate = true;
      break;
    }
  }
  if (!hasQuestCandidate) {
    for (const candidate of candidates.values()) {
      if (
        candidate.valid
        && candidate.urgentPriority
        && playerPosition.distanceTo(interactionPoint(candidate)) <= candidate.range
      ) {
        hasUrgentCandidate = true;
        break;
      }
    }
  }
  for (const candidate of candidates.values()) {
    if (
      !candidate.valid
      || (hasQuestCandidate && !candidate.questPriority)
      || (!hasQuestCandidate && hasUrgentCandidate && !candidate.urgentPriority)
    ) continue;
    const target = interactionPoint(candidate);
    const distance = playerPosition.distanceTo(target);
    if (distance > candidate.range) continue;
    offsetScratch.copy(target).sub(playerPosition).setY(0);
    directionScratch.copy(offsetScratch);
    if (distance > 0.001) directionScratch.normalize();
    else directionScratch.copy(forwardScratch);
    const facing = Math.max(-1, Math.min(1, forwardScratch.dot(directionScratch)));
    const cameraFacing = Math.max(-1, Math.min(1, cameraIntentScratch.dot(directionScratch)));
    // Priority is a nudge, not a trump card. A nearby, intended target should
    // win over a quest target that happens to be farther away.
    const score =
      (1 - distance / candidate.range) * 58
      + Math.max(0, facing) * 22
      + Math.max(0, cameraFacing) * 12
      + Math.min(candidate.priority, 100) * 0.08;
    if (!best || score > best.score) best = { candidate, score };
  }
  const nextId = best?.candidate.id ?? null;
  // Keep the function deterministic and avoid focus churn when equal targets overlap.
  if (nextId === lastResolvedId || now < 0) return best?.candidate ?? null;
  lastResolvedId = nextId;
  return best?.candidate ?? null;
}

export function getInteractionCandidate(id: string) {
  return candidates.get(id);
}

export function clearInteractionCandidates() {
  candidates.clear();
  lastResolvedId = null;
}