import * as THREE from 'three';
import type { ScheduleBlockId } from './gameClock';
import type { GameZone } from './world';
import { isMandatorySchedule, playerFollowsSchedule, schedulePolicy, SCHEDULE_DETECTION_GRACE_SECONDS, SCHEDULE_RECAPTURE_GRACE_SECONDS } from './schedulePolicy';

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
  reason: 'boundary' | 'schedule' | null;
  scheduleId: ScheduleBlockId | null;
  returnTarget: [number, number, number];
}

let retrieval: EscapeRetrievalSnapshot = {
  phase: 'idle', assignedTeacher: null, phaseStartedAt: 0,
  graceUntil: 0, strikes: 0, sequence: 0,
  reason: null, scheduleId: null, returnTarget: ESCAPE_SAFE_POINT.toArray() as [number, number, number],
};

let observedSchedule: ScheduleBlockId | null = null;
let scheduleObservedAt = 0;

export function isDaycareEscape(position: readonly number[], zone: GameZone, storageAuthorized: boolean) {
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
  retrieval = { ...retrieval, phase: 'chasing', assignedTeacher: teacher, phaseStartedAt: now, sequence: retrieval.sequence + 1, reason: 'boundary', scheduleId: null, returnTarget: ESCAPE_SAFE_POINT.toArray() as [number, number, number] };
  return getEscapeRetrievalSnapshot();
}

export interface ScheduleRetrievalExemptions {
  storyMission?: boolean;
  tutorial?: boolean;
  transitioning?: boolean;
  authorizedQuest?: boolean;
}

export function evaluateScheduleRetrieval(
  now: number,
  scheduleId: ScheduleBlockId,
  zone: GameZone,
  playerPosition: readonly number[],
  exemptions: ScheduleRetrievalExemptions = {},
) {
  updateEscapeGrace(now);
  const exempt = Object.values(exemptions).some(Boolean);
  if (observedSchedule !== scheduleId) {
    observedSchedule = scheduleId;
    scheduleObservedAt = now;
    if (retrieval.reason === 'schedule') resetActiveRetrieval(now);
  }
  if (!isMandatorySchedule(scheduleId) || exempt) {
    if (retrieval.reason === 'schedule' && retrieval.phase !== 'grace') resetActiveRetrieval(now);
    return getEscapeRetrievalSnapshot();
  }
  if (playerFollowsSchedule(scheduleId, zone, playerPosition)) {
    if (retrieval.reason === 'schedule' && retrieval.phase === 'chasing') resetActiveRetrieval(now);
    return getEscapeRetrievalSnapshot();
  }
  if (retrieval.phase !== 'idle' || now - scheduleObservedAt < SCHEDULE_DETECTION_GRACE_SECONDS) return getEscapeRetrievalSnapshot();
  const policy = schedulePolicy(scheduleId);
  if (!policy) return getEscapeRetrievalSnapshot();
  retrieval = {
    ...retrieval,
    phase: 'chasing',
    assignedTeacher: policy.teacher,
    phaseStartedAt: now,
    sequence: retrieval.sequence + 1,
    reason: 'schedule',
    scheduleId,
    returnTarget: [...policy.anchor],
  };
  return getEscapeRetrievalSnapshot();
}

function resetActiveRetrieval(now: number) {
  retrieval = { ...retrieval, phase: 'idle', assignedTeacher: null, phaseStartedAt: now, graceUntil: 0, reason: null, scheduleId: null };
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
  if (retrieval.phase === 'carrying') return new THREE.Vector3(...retrieval.returnTarget);
  return null;
}

export function advanceCarriedPlayer(now: number, position: THREE.Vector3, delta: number) {
  if (retrieval.phase !== 'carrying') return { position, released: false, penalty: false, strikes: retrieval.strikes };
  const returnTarget = new THREE.Vector3(...retrieval.returnTarget);
  const remaining = position.distanceTo(returnTarget);
  const next = remaining <= 0.35
    ? returnTarget.clone()
    : position.clone().add(returnTarget.clone().sub(position).setY(0).normalize().multiplyScalar(Math.min(6.2 * delta, remaining)));
  if (next.distanceTo(returnTarget) > 0.35) return { position: next, released: false, penalty: false, strikes: retrieval.strikes };
  const strikes = retrieval.strikes + 1;
  const penalty = strikes % ESCAPE_PENALTY_STRIKE === 0;
  const graceSeconds = retrieval.reason === 'schedule' ? SCHEDULE_RECAPTURE_GRACE_SECONDS : ESCAPE_GRACE_SECONDS;
  retrieval = {
    ...retrieval, phase: 'grace', assignedTeacher: null, phaseStartedAt: now,
    graceUntil: now + graceSeconds, strikes,
  };
  return { position: returnTarget, released: true, penalty, strikes };
}

export function resetEscapeRetrieval(resetStrikes = false) {
  retrieval = {
    phase: 'idle', assignedTeacher: null, phaseStartedAt: 0, graceUntil: 0,
    strikes: resetStrikes ? 0 : retrieval.strikes, sequence: 0,
    reason: null, scheduleId: null, returnTarget: ESCAPE_SAFE_POINT.toArray() as [number, number, number],
  };
  observedSchedule = null;
  scheduleObservedAt = 0;
}
