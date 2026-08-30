export type RivalChoice = 'kind' | 'bold' | 'curious' | 'team-up';
export type RivalStoryBeat =
  | 'meet-mae'
  | 'rainbow-challenge'
  | 'garden-reversal'
  | 'make-peace'
  | 'complete';

export interface RivalChoiceRecord {
  beat: RivalStoryBeat;
  choice: RivalChoice;
}

export interface RivalStoryState {
  version: 1;
  chapter: 1 | 2 | 3 | 4;
  beat: RivalStoryBeat;
  trust: number;
  completedChapters: string[];
  choices: RivalChoiceRecord[];
  unlocks: string[];
}

export interface RewardEvent {
  id: string;
  title: string;
  detail: string;
  tokens: number;
  reputation: number;
  sticker?: string;
}

export type CaperStep =
  | 'idle'
  | 'plan'
  | 'scout'
  | 'teacher-check'
  | 'patrol-timing'
  | 'safe-distraction'
  | 'retrieve'
  | 'escape'
  | 'interrupted'
  | 'celebrate'
  | 'complete';
export type CaperRole = 'none' | 'route-leader' | 'lookout' | 'supply-helper';

export interface CaperState {
  version: 2;
  step: CaperStep;
  attempts: number;
  consequence: 'none' | 'teacher-guided' | 'friends-helped';
  role: CaperRole;
  helper: 'none' | 'Mae' | 'Sam' | 'Zoe';
  route: 'none' | 'reading-corner' | 'garden-gate' | 'art-hall';
  retrieval: 'none' | 'parade-banner';
  interruptions: number;
  scouted: boolean;
  teacherApproved: boolean;
  patrolStartedAt: number;
  patrolObserved: boolean;
  setupReady: boolean;
  retrieved: boolean;
}

export interface DistrictProgress {
  version: 1;
  makerMarket: number;
  storybookLane: number;
}

export const createInitialCaper = (): CaperState => ({
  version: 2,
  step: 'idle',
  attempts: 0,
  consequence: 'none',
  role: 'none',
  helper: 'none',
  route: 'none',
  retrieval: 'none',
  interruptions: 0,
  scouted: false,
  teacherApproved: false,
  patrolStartedAt: 0,
  patrolObserved: false,
  setupReady: false,
  retrieved: false,
});

export const createInitialDistrictProgress = (): DistrictProgress => ({
  version: 1,
  makerMarket: 0,
  storybookLane: 0,
});

export function normalizeCaper(value: unknown): CaperState {
  const initial = createInitialCaper();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return initial;
  const candidate = value as Partial<CaperState>;
  const rawCandidate = value as Record<string, unknown>;
  const steps = new Set<CaperStep>([
    'idle',
    'plan',
    'scout',
    'teacher-check',
    'patrol-timing',
    'safe-distraction',
    'retrieve',
    'escape',
    'interrupted',
    'celebrate',
    'complete',
  ]);
  const consequences = new Set<CaperState['consequence']>(['none', 'teacher-guided', 'friends-helped']);
  const roles = new Set<CaperRole>(['none', 'route-leader', 'lookout', 'supply-helper']);
  const helpers = new Set<CaperState['helper']>(['none', 'Mae', 'Sam', 'Zoe']);
  const routes = new Set<CaperState['route']>(['none', 'reading-corner', 'garden-gate', 'art-hall']);
  const rawStep = rawCandidate.step === 'gather' ? 'scout' : candidate.step;
  const requestedStep = steps.has(rawStep as CaperStep) ? rawStep as CaperStep : 'idle';
  const legacy = rawCandidate.version !== 2;
  const legacyActive = legacy && requestedStep !== 'idle' && requestedStep !== 'plan';
  const role = roles.has(candidate.role as CaperRole)
    ? candidate.role as CaperRole
    : legacyActive ? 'route-leader' : 'none';
  const helper = helpers.has(candidate.helper as CaperState['helper'])
    ? candidate.helper as CaperState['helper']
    : legacyActive ? 'Mae' : 'none';
  const route = routes.has(candidate.route as CaperState['route'])
    ? candidate.route as CaperState['route']
    : legacyActive ? 'garden-gate' : 'none';
  const atOrAfter = (step: CaperStep) => {
    const order: CaperStep[] = ['idle', 'plan', 'scout', 'teacher-check', 'patrol-timing', 'safe-distraction', 'retrieve', 'escape', 'celebrate', 'complete'];
    return order.indexOf(requestedStep) >= order.indexOf(step);
  };
  const scouted = legacy ? atOrAfter('teacher-check') : candidate.scouted === true;
  const teacherApproved = legacy ? atOrAfter('patrol-timing') : candidate.teacherApproved === true;
  const patrolObserved = legacy ? atOrAfter('safe-distraction') : candidate.patrolObserved === true;
  const setupReady = legacy ? atOrAfter('retrieve') : candidate.setupReady === true;
  const retrieved = legacy ? atOrAfter('escape') : candidate.retrieved === true;
  let step = requestedStep;
  if (step !== 'idle' && step !== 'plan' && role === 'none') step = 'plan';
  else if (atOrAfter('teacher-check') && !scouted) step = 'scout';
  else if (atOrAfter('patrol-timing') && !teacherApproved) step = 'teacher-check';
  else if (atOrAfter('safe-distraction') && !patrolObserved) step = 'patrol-timing';
  else if (atOrAfter('retrieve') && !setupReady) step = 'safe-distraction';
  else if (atOrAfter('escape') && !retrieved) step = 'retrieve';
  return {
    version: 2,
    step,
    attempts: typeof candidate.attempts === 'number' && Number.isFinite(candidate.attempts)
      ? Math.min(99, Math.max(0, Math.floor(candidate.attempts)))
      : 0,
    consequence: consequences.has(candidate.consequence as CaperState['consequence'])
      ? candidate.consequence as CaperState['consequence']
      : 'none',
    role,
    helper,
    route,
    retrieval: candidate.retrieval === 'parade-banner' || retrieved
      ? 'parade-banner'
      : 'none',
    interruptions: typeof candidate.interruptions === 'number' && Number.isFinite(candidate.interruptions)
      ? Math.min(20, Math.max(0, Math.floor(candidate.interruptions)))
      : 0,
    scouted,
    teacherApproved,
    patrolStartedAt: typeof candidate.patrolStartedAt === 'number' && Number.isFinite(candidate.patrolStartedAt)
      ? Math.max(0, candidate.patrolStartedAt)
      : 0,
    patrolObserved,
    setupReady,
    retrieved,
  };
}

export function normalizeDistrictProgress(value: unknown): DistrictProgress {
  const initial = createInitialDistrictProgress();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return initial;
  const candidate = value as Partial<DistrictProgress>;
  const count = (entry: unknown) => typeof entry === 'number' && Number.isFinite(entry)
    ? Math.min(3, Math.max(0, Math.floor(entry)))
    : 0;
  return { version: 1, makerMarket: count(candidate.makerMarket), storybookLane: count(candidate.storybookLane) };
}

export function startCaper(caper: CaperState): CaperState {
  if (caper.step !== 'idle' && caper.step !== 'complete') return caper;
  return {
    version: 2,
    step: 'plan',
    attempts: caper.attempts + 1,
    consequence: 'none',
    role: 'none',
    helper: 'none',
    route: 'none',
    retrieval: 'none',
    interruptions: 0,
    scouted: false,
    teacherApproved: false,
    patrolStartedAt: 0,
    patrolObserved: false,
    setupReady: false,
    retrieved: false,
  };
}

export function chooseCaperRole(caper: CaperState, role: Exclude<CaperRole, 'none'>): CaperState {
  if (caper.step !== 'plan' || caper.role !== 'none') return caper;
  const choices: Record<Exclude<CaperRole, 'none'>, Pick<CaperState, 'helper' | 'route'>> = {
    'route-leader': { helper: 'Mae', route: 'garden-gate' },
    lookout: { helper: 'Zoe', route: 'reading-corner' },
    'supply-helper': { helper: 'Sam', route: 'art-hall' },
  };
  return {
    ...caper,
    step: 'scout',
    role,
    ...choices[role],
    scouted: false,
  };
}

export function advanceCaper(caper: CaperState): CaperState {
  const next: Partial<Record<CaperStep, CaperStep>> = {
    scout: 'teacher-check',
    'teacher-check': 'patrol-timing',
    escape: 'celebrate',
    interrupted: 'scout',
    celebrate: 'complete',
  };
  if (caper.step === 'teacher-check' && !caper.scouted) return caper;
  if (caper.step === 'escape' && !caper.retrieved) return caper;
  const nextStep = next[caper.step];
  if (!nextStep) return caper;
  return {
    ...caper,
    step: nextStep,
    consequence: nextStep === 'complete' && caper.consequence === 'none'
      ? 'friends-helped'
      : caper.consequence,
    retrieval: caper.step === 'retrieve' ? 'parade-banner' : caper.retrieval,
    scouted: caper.step === 'scout' ? true : caper.scouted,
    teacherApproved: caper.step === 'teacher-check' ? true : caper.teacherApproved,
    patrolStartedAt: caper.step === 'teacher-check' ? 0 : caper.patrolStartedAt,
  };
}

export function observeCaperPatrol(caper: CaperState, now: number): CaperState {
  if (caper.step !== 'patrol-timing' || !caper.teacherApproved || !Number.isFinite(now)) return caper;
  if (caper.patrolStartedAt <= 0) return { ...caper, patrolStartedAt: now };
  if (now - caper.patrolStartedAt < 2_500) return caper;
  return { ...caper, step: 'safe-distraction', patrolObserved: true };
}

export function completeCaperSafeSetup(caper: CaperState): CaperState {
  if (caper.step !== 'safe-distraction' || !caper.teacherApproved || !caper.patrolObserved) return caper;
  return { ...caper, step: 'retrieve', setupReady: true };
}

export function completeCaperRetrieval(caper: CaperState): CaperState {
  if (caper.step !== 'retrieve' || !caper.teacherApproved || !caper.setupReady) return caper;
  return { ...caper, step: 'escape', retrieval: 'parade-banner', retrieved: true };
}

export function interruptCaper(caper: CaperState): CaperState {
  if (!new Set<CaperStep>(['patrol-timing', 'safe-distraction', 'retrieve', 'escape']).has(caper.step)) return caper;
  return {
    ...caper,
    step: 'interrupted',
    consequence: 'teacher-guided',
    retrieval: 'none',
    interruptions: Math.min(20, caper.interruptions + 1),
    scouted: false,
    teacherApproved: false,
    patrolStartedAt: 0,
    patrolObserved: false,
    setupReady: false,
    retrieved: false,
  };
}

export function advanceDistrictPreview(
  districts: DistrictProgress,
  district: 'makerMarket' | 'storybookLane',
): DistrictProgress {
  return {
    ...districts,
    [district]: Math.min(3, districts[district] + 1),
  };
}

export const RIVAL_CHAPTERS = [
  {
    id: 'the-new-plan',
    chapter: 1,
    title: 'The New Plan',
    summary: 'Meet Mae, a confident planner who wants everyone to notice her ideas.',
  },
  {
    id: 'rainbow-rules',
    chapter: 2,
    title: 'Rainbow Rules',
    summary: 'Mae turns cleanup into a friendly challenge, but your helpful work changes the mood.',
  },
  {
    id: 'garden-reversal',
    chapter: 3,
    title: 'The Garden Reversal',
    summary: 'A mixed-up garden plan gives both rivals a reason to listen and adapt.',
  },
  {
    id: 'two-stars-one-team',
    chapter: 4,
    title: 'Two Stars, One Team',
    summary: 'Choose how to turn a tense rivalry into a fair partnership.',
  },
] as const;

const STORY_BEATS = new Set<RivalStoryBeat>([
  'meet-mae',
  'rainbow-challenge',
  'garden-reversal',
  'make-peace',
  'complete',
]);
const STORY_CHOICES = new Set<RivalChoice>(['kind', 'bold', 'curious', 'team-up']);
const CHAPTER_IDS = new Set(RIVAL_CHAPTERS.map((chapter) => chapter.id));
const STORY_UNLOCKS = new Set(['mae-note', 'rainbow-ribbon', 'garden-plan', 'two-stars-sticker', 'bridge-builder']);

export function createInitialRivalStory(): RivalStoryState {
  return {
    version: 1,
    chapter: 1,
    beat: 'meet-mae',
    trust: 0,
    completedChapters: [],
    choices: [],
    unlocks: [],
  };
}

function safeStrings(value: unknown, allowed: ReadonlySet<string>, limit: number) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(
    (item): item is string => typeof item === 'string' && allowed.has(item),
  ))).slice(0, limit);
}

export function normalizeRivalStory(value: unknown): RivalStoryState {
  const initial = createInitialRivalStory();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return initial;
  const candidate = value as Partial<RivalStoryState>;
  const choices = Array.isArray(candidate.choices)
    ? candidate.choices.filter((record): record is RivalChoiceRecord => (
        Boolean(record)
        && typeof record === 'object'
        && STORY_BEATS.has((record as RivalChoiceRecord).beat)
        && STORY_CHOICES.has((record as RivalChoiceRecord).choice)
      )).slice(0, 8)
    : [];
  const requestedBeat = STORY_BEATS.has(candidate.beat as RivalStoryBeat)
    ? candidate.beat as RivalStoryBeat
    : 'meet-mae';
  if (requestedBeat === 'meet-mae') return initial;

  const completed = new Set(safeStrings(candidate.completedChapters, CHAPTER_IDS, 4));
  const unlocks = new Set(safeStrings(candidate.unlocks, STORY_UNLOCKS, 8));
  const introduction = choices.find((record) => (
    record.beat === 'meet-mae' && record.choice !== 'team-up'
  ));
  if (!introduction || !completed.has('the-new-plan') || !unlocks.has('mae-note')) return initial;
  let canonical = chooseMaeIntroduction(initial, introduction.choice as Exclude<RivalChoice, 'team-up'>);
  if (requestedBeat === 'rainbow-challenge') return canonical;

  if (!completed.has('rainbow-rules') || !unlocks.has('rainbow-ribbon')) return canonical;
  canonical = recordRainbowStoryMilestone(canonical);
  if (requestedBeat === 'garden-reversal') return canonical;

  if (!completed.has('garden-reversal') || !unlocks.has('garden-plan')) return canonical;
  canonical = recordGardenStoryMilestone(canonical);
  if (requestedBeat === 'make-peace') return canonical;

  const teamChoice = choices.some((record) => record.beat === 'make-peace' && record.choice === 'team-up');
  if (
    !teamChoice
    || !completed.has('two-stars-one-team')
    || !unlocks.has('two-stars-sticker')
    || !unlocks.has('bridge-builder')
  ) return canonical;
  return resolveMaeStory(canonical);
}

export function chooseMaeIntroduction(
  story: RivalStoryState,
  choice: Exclude<RivalChoice, 'team-up'>,
): RivalStoryState {
  if (story.beat !== 'meet-mae' || story.choices.some((record) => record.beat === 'meet-mae')) return story;
  const trustGain = choice === 'kind' ? 18 : choice === 'curious' ? 14 : 10;
  return {
    ...story,
    chapter: 2,
    beat: 'rainbow-challenge',
    trust: Math.min(100, story.trust + trustGain),
    completedChapters: [...story.completedChapters, 'the-new-plan'],
    choices: [...story.choices, { beat: 'meet-mae', choice }],
    unlocks: [...story.unlocks, 'mae-note'],
  };
}

export function recordRainbowStoryMilestone(story: RivalStoryState): RivalStoryState {
  if (story.beat !== 'rainbow-challenge') return story;
  return {
    ...story,
    chapter: 3,
    beat: 'garden-reversal',
    trust: Math.min(100, story.trust + 12),
    completedChapters: [...story.completedChapters, 'rainbow-rules'],
    unlocks: [...story.unlocks, 'rainbow-ribbon'],
  };
}

export function recordGardenStoryMilestone(story: RivalStoryState): RivalStoryState {
  if (story.beat !== 'garden-reversal') return story;
  return {
    ...story,
    chapter: 4,
    beat: 'make-peace',
    trust: Math.min(100, story.trust + 16),
    completedChapters: [...story.completedChapters, 'garden-reversal'],
    unlocks: [...story.unlocks, 'garden-plan'],
  };
}

export function resolveMaeStory(story: RivalStoryState): RivalStoryState {
  if (story.beat !== 'make-peace' || story.choices.some((record) => record.beat === 'make-peace')) return story;
  return {
    ...story,
    beat: 'complete',
    trust: Math.min(100, story.trust + 25),
    completedChapters: [...story.completedChapters, 'two-stars-one-team'],
    choices: [...story.choices, { beat: 'make-peace', choice: 'team-up' }],
    unlocks: [...story.unlocks, 'two-stars-sticker', 'bridge-builder'],
  };
}

export function normalizeRewardEvents(value: unknown): RewardEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter((event): event is RewardEvent => (
    Boolean(event)
    && typeof event === 'object'
    && typeof (event as RewardEvent).id === 'string'
    && typeof (event as RewardEvent).title === 'string'
    && typeof (event as RewardEvent).detail === 'string'
    && typeof (event as RewardEvent).tokens === 'number'
    && typeof (event as RewardEvent).reputation === 'number'
  )).slice(-6);
}

export function appendRewardEvent(events: RewardEvent[], event: RewardEvent) {
  if (events.some((candidate) => candidate.id === event.id)) return events;
  return [...events, event].slice(-6);
}

export function getOptionalRewardMultiplier(activeUntil: number, now = Date.now()) {
  return Number.isFinite(activeUntil) && activeUntil > now ? 2 : 1;
}