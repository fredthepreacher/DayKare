import * as THREE from 'three';
import { isWalkable } from './world';

export type TeacherInterventionPhase =
  | 'observing'
  | 'approaching'
  | 'warning'
  | 'redirecting'
  | 'separating'
  | 'calling-player'
  | 'consequence'
  | 'praise';

export type TeacherInterventionReaction = 'listen' | 'wave' | 'sad' | 'cheer';

export interface ChildBehaviorSnapshot {
  name: string;
  position: THREE.Vector3;
  activity: string;
  disruptive: boolean;
  questPriority: boolean;
  updatedAt: number;
}

export interface TeacherInterventionState {
  id: string;
  phase: TeacherInterventionPhase;
  targetName: string | null;
  targetPosition: THREE.Vector3 | null;
  startedAt: number | null;
  warningCount: number;
  sequence: number;
  escalated: boolean;
  nextEligibleAt: number;
  redirectPosition: THREE.Vector3 | null;
  separationPosition: THREE.Vector3 | null;
  consequencePosition: THREE.Vector3 | null;
  lastUpdatedAt: number;
}

const PHASE_DURATIONS: Partial<Record<TeacherInterventionPhase, number>> = {
  approaching: 2.2,
  warning: 1.8,
  redirecting: 2,
  separating: 1.6,
  'calling-player': 2.4,
  consequence: 2,
  praise: 2.2,
};

const childBehaviors = new Map<string, ChildBehaviorSnapshot>();
const interventions = new Map<string, TeacherInterventionState>();

function initialState(id: string): TeacherInterventionState {
  return {
    id,
    phase: 'observing',
    targetName: null,
    targetPosition: null,
    startedAt: null,
    warningCount: 0,
    sequence: 0,
    escalated: false,
    nextEligibleAt: 5,
    redirectPosition: null,
    separationPosition: null,
    consequencePosition: null,
    lastUpdatedAt: 0,
  };
}

function stateCopy(state: TeacherInterventionState): TeacherInterventionState {
  return {
    ...state,
    targetPosition: state.targetPosition?.clone() ?? null,
    redirectPosition: state.redirectPosition?.clone() ?? null,
    separationPosition: state.separationPosition?.clone() ?? null,
    consequencePosition: state.consequencePosition?.clone() ?? null,
  };
}

function hash(value: string) {
  return [...value].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 7);
}

function walkableRingPosition(origin: THREE.Vector3, seed: number, radius: number) {
  for (let index = 0; index < 12; index += 1) {
    const angle = ((seed + index * 5) % 12) / 12 * Math.PI * 2;
    const candidate = origin.clone().add(new THREE.Vector3(
      Math.cos(angle) * radius,
      0,
      Math.sin(angle) * radius,
    ));
    if (isWalkable(candidate, 0.34, [], 'hub')) return candidate;
  }
  return origin.clone();
}

function releaseIntervention(state: TeacherInterventionState, now: number, cooldown = 5) {
  state.phase = 'observing';
  state.targetName = null;
  state.targetPosition = null;
  state.redirectPosition = null;
  state.separationPosition = null;
  state.consequencePosition = null;
  state.startedAt = null;
  state.escalated = false;
  state.nextEligibleAt = now + cooldown;
}

function chooseTarget(id: string, now: number) {
  const available = [...childBehaviors.values()]
    .filter((child) => (
      child.disruptive
      && !child.questPriority
      && now - child.updatedAt < 1
      && ![...interventions.values()].some((intervention) => (
        intervention.phase !== 'observing' && intervention.targetName === child.name
      ))
    ))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (available.length === 0) return null;
  return available[hash(`${id}:${Math.floor(now / 5)}`) % available.length];
}

function phaseAfter(phase: TeacherInterventionPhase): TeacherInterventionPhase {
  if (phase === 'approaching') return 'warning';
  if (phase === 'warning') return 'redirecting';
  if (phase === 'redirecting') return 'separating';
  if (phase === 'separating') return 'calling-player';
  if (phase === 'calling-player') return 'consequence';
  if (phase === 'consequence') return 'praise';
  return 'observing';
}

function phaseReaction(phase: TeacherInterventionPhase): TeacherInterventionReaction | null {
  if (phase === 'approaching' || phase === 'warning' || phase === 'calling-player') return 'listen';
  if (phase === 'redirecting') return 'wave';
  if (phase === 'separating' || phase === 'consequence') return 'sad';
  if (phase === 'praise') return 'cheer';
  return null;
}

export function updateChildBehavior(snapshot: Omit<ChildBehaviorSnapshot, 'position'> & { position: THREE.Vector3 }) {
  const current = childBehaviors.get(snapshot.name);
  if (current) {
    current.position.copy(snapshot.position);
    current.activity = snapshot.activity;
    current.disruptive = snapshot.disruptive;
    current.questPriority = snapshot.questPriority;
    current.updatedAt = snapshot.updatedAt;
    return;
  }
  childBehaviors.set(snapshot.name, {
    ...snapshot,
    position: snapshot.position.clone(),
  });
}

export function getTeacherIntervention(
  id: string,
  now: number,
  canInterrupt = true,
): TeacherInterventionState {
  const state = interventions.get(id) ?? initialState(id);
  state.lastUpdatedAt = now;
  if (state.phase !== 'observing' && state.targetName) {
    const activeTarget = childBehaviors.get(state.targetName);
    if (!activeTarget || activeTarget.questPriority || now - activeTarget.updatedAt >= 1.5) {
      releaseIntervention(state, now);
      interventions.set(id, state);
      return stateCopy(state);
    }
  }
  if (!canInterrupt) {
    interventions.set(id, state);
    return stateCopy(state);
  }

  if (state.phase === 'observing') {
    const target = now >= state.nextEligibleAt ? chooseTarget(id, now) : null;
    if (target) {
      state.phase = 'approaching';
      state.targetName = target.name;
      state.targetPosition = target.position.clone();
      state.startedAt = now;
      state.sequence += 1;
      state.escalated = state.warningCount >= 2;
      const destinationSeed = hash(`${id}:${target.name}:${state.sequence}`);
      state.redirectPosition = walkableRingPosition(target.position, destinationSeed, 1.7);
      state.separationPosition = walkableRingPosition(target.position, destinationSeed + 4, 2.5);
      state.consequencePosition = walkableRingPosition(target.position, destinationSeed + 8, 3.1);
    }
  } else if (state.startedAt !== null) {
    const duration = PHASE_DURATIONS[state.phase];
    if (duration !== undefined && now - state.startedAt >= duration) {
      const nextPhase = phaseAfter(state.phase);
      state.startedAt = nextPhase === 'observing' ? null : now;
      state.phase = nextPhase;
      if (nextPhase === 'observing') {
        releaseIntervention(state, now, 8);
      } else if (nextPhase === 'warning') {
        state.warningCount += 1;
      }
    }
  }

  if (state.targetName) {
    const target = childBehaviors.get(state.targetName);
    if (target) state.targetPosition = target.position.clone();
  }
  interventions.set(id, state);
  return stateCopy(state);
}

export function getChildIntervention(
  childName: string,
  _now: number,
): {
  phase: TeacherInterventionPhase;
  reaction: TeacherInterventionReaction;
  destination: THREE.Vector3 | null;
} | null {
  for (const state of interventions.values()) {
    if (state.targetName !== childName || state.phase === 'observing' || state.startedAt === null) continue;
    const reaction = phaseReaction(state.phase);
    const destination = state.phase === 'approaching' || state.phase === 'warning'
      ? state.targetPosition
      : state.phase === 'redirecting'
        ? state.redirectPosition
        : state.phase === 'separating' || state.phase === 'calling-player'
          ? state.separationPosition
          : state.phase === 'consequence' || state.phase === 'praise'
            ? state.consequencePosition
            : null;
    if (reaction) return {
      phase: state.phase,
      reaction,
      destination: destination?.clone() ?? null,
    };
  }
  return null;
}

export function teacherInterventionDestination(
  state: TeacherInterventionState,
  teacherPosition: THREE.Vector3,
) {
  if (!state.targetPosition || state.phase === 'observing') return null;
  const towardTeacher = teacherPosition.clone().sub(state.targetPosition).setY(0);
  const startingAngle = towardTeacher.lengthSq() < 0.001
    ? 0
    : Math.atan2(towardTeacher.z, towardTeacher.x);
  for (let index = 0; index < 10; index += 1) {
    const offset = index === 0
      ? 0
      : Math.ceil(index / 2) * (index % 2 === 0 ? -1 : 1) * Math.PI / 5;
    const angle = startingAngle + offset;
    const candidate = state.targetPosition.clone().add(new THREE.Vector3(
      Math.cos(angle) * 0.95,
      0,
      Math.sin(angle) * 0.95,
    ));
    if (isWalkable(candidate, 0.34, [], 'hub')) return candidate;
  }
  return null;
}

export function getTeacherInterventionSnapshot(id: string) {
  const state = interventions.get(id);
  return state ? stateCopy(state) : null;
}

export function acknowledgeTeacherCall(id: string) {
  const state = interventions.get(id);
  if (!state || state.phase !== 'calling-player') return null;
  state.phase = 'consequence';
  state.startedAt = state.lastUpdatedAt;
  interventions.set(id, state);
  return stateCopy(state);
}

export function interventionIsActive(state: TeacherInterventionState) {
  return state.phase !== 'observing';
}

export function resetTeacherInterventions() {
  childBehaviors.clear();
  interventions.clear();
}