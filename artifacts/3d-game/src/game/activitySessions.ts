import * as THREE from 'three';

export type SharedActivityKind = 'blocks' | 'drawing' | 'coloring' | 'toy-play' | 'conversation' | 'teacher-help' | 'teacher-praise' | 'teacher-observation';
export type ActivitySessionRole = 'leader' | 'partner' | 'observer' | 'helper';

export interface SharedActivityParticipant {
  name: string;
  role: ActivitySessionRole;
  slot: [number, number, number];
  focus: [number, number, number];
  activity: SharedActivityKind;
  reaction: 'smile' | 'wave' | 'cheer' | 'listen';
}

export interface SharedActivitySession {
  id: string;
  phase: 'gathering' | 'active';
  startsAt: number | null;
  endsAt: number | null;
  participants: SharedActivityParticipant[];
}

const HUB_SESSIONS: Record<string, { anchor: [number, number, number]; kinds: SharedActivityKind[]; groups: string[][] }> = {
  // Center the pair on the authored block station so the shared animation reads
  // as building together rather than a generic conversation elsewhere on the rug.
  'morning-play': { anchor: [-2.8, 0, 1.4], kinds: ['blocks', 'toy-play'], groups: [['Leo', 'Mia'], ['Finn', 'Ruby']] },
  // The art table occupies -13.7..-10.3 on both axes, so this is its west
  // side rather than an apparently seated pair inside its collider.
  'art-time': { anchor: [-14.7, 0, -11.4], kinds: ['drawing', 'coloring'], groups: [['Leo', 'Mia'], ['Ruby', 'Max']] },
  // This is south-west of the slide/ramp (x 11.3..12.7, z -6.2..-2.3).
  'outdoor-play': { anchor: [10, 0, -10.7], kinds: ['toy-play', 'conversation'], groups: [['Sam', 'Zoe'], ['Lily', 'Finn']] },
};

const GARDEN_SESSIONS = {
  anchor: [0, 0, 6.2] as [number, number, number],
  groups: [['Lily', 'Finn'], ['Zoe', 'Ms. Harper']],
  kinds: ['conversation', 'teacher-help', 'teacher-observation'] as SharedActivityKind[],
};

export function activitySessionIsInterrupted(input: {
  activeDialogue: unknown;
  journalOpen: boolean;
  zoneTransitioning: boolean;
  questPriority?: boolean;
}) {
  return Boolean(input.activeDialogue) || input.journalOpen || input.zoneTransitioning || Boolean(input.questPriority);
}

type SessionProgress = {
  index: number;
  arrivals: Set<string>;
  gatheringStartedAt: number;
  startsAt: number | null;
  endsAt: number | null;
};
const progressBySchedule = new Map<string, SessionProgress>();
const GATHERING_TIMEOUT_SECONDS = 10;

function sessionKey(zone: 'hub' | 'garden', schedule: string) {
  return `${zone}:${schedule}`;
}

function sourceFor(zone: 'hub' | 'garden', schedule: string) {
  return zone === 'garden' ? GARDEN_SESSIONS : HUB_SESSIONS[schedule];
}

function assignment(
  zone: 'hub' | 'garden',
  schedule: string,
  elapsedTime: number,
  progress: SessionProgress,
): SharedActivitySession | null {
  const source = sourceFor(zone, schedule);
  if (!source) return null;
  const group = source.groups[progress.index % source.groups.length];
  const kind = source.kinds[progress.index % source.kinds.length];
  const [ax, ay, az] = source.anchor;
  const offsets: [number, number, number][] = [[-0.45, 0, 0], [0.45, 0, 0]];
  const active = progress.endsAt !== null && elapsedTime < progress.endsAt;
  return {
    id: `${zone}:${schedule}:${progress.index}`,
    phase: active ? 'active' : 'gathering',
    startsAt: active ? progress.startsAt : null,
    endsAt: active ? progress.endsAt : null,
    participants: group.map((name, index) => ({
      name,
      role: index === 0 ? 'leader' : name.includes('Harper') ? 'helper' : 'partner',
      slot: [ax + offsets[index][0], ay, az + offsets[index][2]],
      focus: [ax + offsets[1 - index][0], ay, az + offsets[1 - index][2]],
      activity: kind,
      reaction: (['smile', 'wave', 'cheer', 'listen'] as const)[(progress.index + index) % 4],
    })),
  };
}

export function getSharedActivitySession(
  zone: 'hub' | 'garden',
  schedule: string,
  elapsedTime: number,
  interrupted = false,
): SharedActivitySession | null {
  if (interrupted) return null;
  const source = sourceFor(zone, schedule);
  if (!source) return null;
  const key = sessionKey(zone, schedule);
  const progress = progressBySchedule.get(key) ?? {
    index: 0,
    arrivals: new Set<string>(),
    gatheringStartedAt: elapsedTime,
    startsAt: null,
    endsAt: null,
  };
  const gatheringExpired = progress.endsAt === null
    && elapsedTime - progress.gatheringStartedAt >= GATHERING_TIMEOUT_SECONDS;
  if ((progress.endsAt !== null && elapsedTime >= progress.endsAt) || gatheringExpired) {
    progress.index += 1;
    progress.arrivals.clear();
    progress.gatheringStartedAt = elapsedTime;
    progress.startsAt = null;
    progress.endsAt = null;
  }
  progressBySchedule.set(key, progress);
  return assignment(zone, schedule, elapsedTime, progress);
}

/** Records a physical slot arrival; only the final participant starts activity. */
export function reportSessionArrival(
  zone: 'hub' | 'garden',
  schedule: string,
  sessionId: string,
  name: string,
  elapsedTime: number,
) {
  const current = getSharedActivitySession(zone, schedule, elapsedTime);
  if (!current || current.id !== sessionId || current.phase !== 'gathering' || !current.participants.some((participant) => participant.name === name)) return current;
  const progress = progressBySchedule.get(sessionKey(zone, schedule));
  if (!progress) return current;
  progress.arrivals.add(name);
  if (current.participants.every((participant) => progress.arrivals.has(participant.name))) {
    progress.startsAt = elapsedTime;
    progress.endsAt = elapsedTime + 12;
  }
  return assignment(zone, schedule, elapsedTime, progress);
}

export function resetActivitySessions() {
  progressBySchedule.clear();
}

export function sessionParticipant(session: SharedActivitySession | null, name: string) {
  return session?.participants.find((participant) => participant.name === name) ?? null;
}

export function shouldUseSessionSlot(
  session: SharedActivitySession | null,
  participant: SharedActivityParticipant | null,
  fallbackSessionId: string | null,
) {
  if (!session || !participant) return false;
  return session.phase === 'active' || fallbackSessionId !== session.id;
}

export function sessionSlotVector(participant: SharedActivityParticipant) {
  return new THREE.Vector3(...participant.slot);
}