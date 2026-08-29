import * as THREE from 'three';

export interface InteractionCandidate {
  id: string;
  position: THREE.Vector3;
  range: number;
  priority: number;
  valid: boolean;
  approach?: THREE.Vector3;
}

const candidates = new Map<string, InteractionCandidate>();
let lastResolvedId: string | null = null;

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

export function resolveInteractionCandidate(
  playerPosition: THREE.Vector3,
  playerForward: THREE.Vector3,
  cameraForward?: THREE.Vector3,
  now = performance.now(),
) {
  const forward = playerForward.clone().setY(0).normalize();
  const cameraIntent = (cameraForward ?? playerForward).clone().setY(0).normalize();
  let best: { candidate: InteractionCandidate; score: number } | null = null;
  for (const candidate of candidates.values()) {
    if (!candidate.valid) continue;
    const offset = candidate.position.clone().sub(playerPosition).setY(0);
    const distance = offset.length();
    if (distance > candidate.range) continue;
    const direction = distance > 0.001 ? offset.clone().normalize() : forward;
    const facing = Math.max(-1, Math.min(1, forward.dot(direction)));
    const cameraFacing = Math.max(-1, Math.min(1, cameraIntent.dot(direction)));
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