import * as THREE from 'three';

export const ESCAPE_GRACE_SECONDS = 12;
export const ESCAPE_PENALTY_STRIKE = 7;
export const ESCAPE_SAFE_POINT = new THREE.Vector3(0, 0, 6);
export const TEACHER_PERSONAL_SPACE = 2.2;
export const RETRIEVER_RUN_SPEED = 5.4;

export type EscapeTeacher = 'Ms. Harper' | 'Mr. Davis';
export type EscapeRetrievalPhase = 'idle' | 'chasing' | 'carrying' | 'grace';

export interface EscapeRetrievalSnapshot {
  phase: EscapeRetrievalPhase;
  assignedTeacher: EscapeTeacher | null;
  phaseStartedAt: number;
  graceUntil: number;
  strikes: number;
  sequence: number;
}

let retrieval: EscapeRetrievalSnapshot = {
  phase: 'idle', assignedTeacher: null, phaseStartedAt: 0,
  graceUntil: 0, strikes: 0, sequence: 0,
};

export function isDaycareEscape(position: readonly number[], zone: 'hub' | 'garden' | 'storybook', storageAuthorized: boolean) {
  const x = position[0] ?? 0;
  const z = position[2] ?? 0;
  if (zone !== 'hub') return false;
  return Math.abs(x) > 16.8 || Math.abs(z) > 16.8 || (!storageAuthorized && x < -10 && z > 10);
}

export function getEscapeRetrievalSnapshot(): EscapeRetrievalSnapshot {
  return { ...retrieval };
}

export function beginEscapeRetrieval(now: number, playerPosition: readonly number[]) {
  updateEscapeGrace(now);
  if (retrieval.phase !== 'idle') return getEscapeRetrievalSnapshot();
  const teacher: EscapeTeacher = (playerPosition[0] ?? 0) < 0 ? 'Ms. Harper' : 'Mr. Davis';
  retrieval = { ...retrieval, phase: 'chasing', assignedTeacher: teacher, phaseStartedAt: now, sequence: retrieval.sequence + 1 };
  return getEscapeRetrievalSnapshot();
}

export function updateEscapeGrace(now: number) {
  if (retrieval.phase === 'grace' && now >= retrieval.graceUntil) {
    retrieval = { ...retrieval, phase: 'idle', assignedTeacher: null, phaseStartedAt: now };
  }
  return getEscapeRetrievalSnapshot();
}

export function markEscapePlayerCaught(teacher: EscapeTeacher, now: number) {
  if (retrieval.phase !== 'chasing' || retrieval.assignedTeacher !== teacher) return false;
  retrieval = { ...retrieval, phase: 'carrying', phaseStartedAt: now };
  return true;
}

export function retrieverDestination(teacher: EscapeTeacher, playerPosition: THREE.Vector3) {
  if (retrieval.assignedTeacher !== teacher) return null;
  if (retrieval.phase === 'chasing') return playerPosition.clone();
  if (retrieval.phase === 'carrying') return ESCAPE_SAFE_POINT.clone();
  return null;
}

export function advanceCarriedPlayer(now: number, position: THREE.Vector3, delta: number) {
  if (retrieval.phase !== 'carrying') return { position, released: false, penalty: false, strikes: retrieval.strikes };
  const remaining = position.distanceTo(ESCAPE_SAFE_POINT);
  const next = remaining <= 0.35
    ? ESCAPE_SAFE_POINT.clone()
    : position.clone().add(ESCAPE_SAFE_POINT.clone().sub(position).setY(0).normalize().multiplyScalar(Math.min(6.2 * delta, remaining)));
  if (next.distanceTo(ESCAPE_SAFE_POINT) > 0.35) return { position: next, released: false, penalty: false, strikes: retrieval.strikes };
  const strikes = retrieval.strikes + 1;
  const penalty = strikes % ESCAPE_PENALTY_STRIKE === 0;
  retrieval = {
    ...retrieval, phase: 'grace', assignedTeacher: null, phaseStartedAt: now,
    graceUntil: now + ESCAPE_GRACE_SECONDS, strikes,
  };
  return { position: ESCAPE_SAFE_POINT.clone(), released: true, penalty, strikes };
}

export function resetEscapeRetrieval(resetStrikes = false) {
  retrieval = {
    phase: 'idle', assignedTeacher: null, phaseStartedAt: 0, graceUntil: 0,
    strikes: resetStrikes ? 0 : retrieval.strikes, sequence: 0,
  };
}
