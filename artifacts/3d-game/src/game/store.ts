import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import * as THREE from 'three';
import {
  ACTIVITY_DEFINITIONS,
  addLifetimeXp,
  HUB_UPGRADE_IDS,
  createInitialProgression,
  getUnlockedRoutes,
  MAX_ACTIVITY_RUNS,
  MAX_TOKENS,
  MAX_REPUTATION,
  normalizeProgression,
  PROGRESSION_VERSION,
  type ProgressionState,
} from './progression';
import { normalizeWeatherSeed } from './weather';
import {
  achievementsEarned,
  canPurchase,
  getDripItem,
  normalizeDripEquipped,
  normalizeDripOwned,
  type AchievementEvidence,
  type DripCategory,
  type DripEquipped,
} from './drip';

/**
 * The optional Star Token boost.
 *
 * 15 seconds was long enough to activate and too short to spend: a Rainbow
 * Tidy-Up round is three fetch-and-carry trips, so the boost routinely expired
 * before the round it was started for finished, and doubled nothing.
 *
 * It cannot be extended by reloading: the field is deliberately absent from the
 * save allowlist and is zeroed on load, so a reload cancels a running boost
 * rather than banking it. It cannot stack either - activateOptionalRewardBoost
 * refuses while one is live, and the multiplier is a constant 2, not a product.
 */
export const OPTIONAL_BOOST_DURATION_MS = 45_000;
import {
  activateQuest,
  advanceObjective,
  createInitialQuests,
  legacyStatusForQuest,
  normalizeQuestStates,
  roundWasCompleted,
  type QuestStates,
} from './quests';
import {
  GARDEN_SPAWN,
  GARDEN_RETURN_SPAWN,
  STORYBOOK_SPAWN,
  getTrackedPlayerPosition,
  isWalkable,
  type GameZone,
} from './world';
import { resetTouchInput } from './touchInput';
import { type QualityPreset, isQualityPreset } from './qualityManager';
import {
  type ClockState,
  type PauseReason as ClockPauseReason,
  advanceClock as advanceClockState,
  createClockState,
  minuteToTimeOfDay,
  normalizeClockState,
  pauseClock as pauseClockState,
  resumeClock as resumeClockState,
  scheduleIdForMinute,
  serializeClockState,
  setTimeScale as setClockTimeScale,
  startNextDay,
  timeOfDayToMinute,
} from './gameClock';
import {
  appendRewardEvent,
  chooseMaeIntroduction,
  chooseCaperRole as chooseCaperRoleState,
  completeCaperRetrieval as completeCaperRetrievalState,
  completeCaperSafeSetup as completeCaperSafeSetupState,
  createInitialRivalStory,
  normalizeRivalStory,
  recordGardenStoryMilestone,
  recordRainbowStoryMilestone,
  resolveMaeStory,
  advanceCaper as advanceCaperState,
  advanceDistrictPreview as advanceDistrictPreviewState,
  createInitialCaper,
  createInitialDistrictProgress,
  normalizeCaper,
  normalizeDistrictProgress,
  interruptCaper as interruptCaperState,
  observeCaperPatrol as observeCaperPatrolState,
  startCaper as startCaperState,
  type CaperState,
  type CaperRole,
  type DistrictProgress,
  type RewardEvent,
  type RivalChoice,
  type RivalStoryState,
  getOptionalRewardMultiplier,
} from './storyProgression';
import { monetizedReputation } from './monetizationStore';
import { GUMMY_FULL_CROP_CASH, GUMMY_HARVEST_SIZE, GUMMY_UNIT_CASH, absoluteGameMinute, createGummyCrop, cropIsReady, normalizeGummyCrop, type GummyCropState } from './gardenEconomy';
import { STORYBOOK_CLOSE_MINUTE, storybookIsOpen } from './storybookLaneConfig';
import { useStorybookLaneStore } from './storybookLaneStore';
import { getEscapeRetrievalSnapshot } from './escapeRetrieval';
import {
  ART_CASH,
  ART_XP,
  FISH_CATCH_XP,
  FISH_SALE_CASH,
  FISH_SALE_XP,
  FISHING_RODS,
  LOST_FOUND_INTERVAL_MINUTES,
  MISSED_ACTIVITY_REP,
  PLANTING_XP,
  attendanceSatisfied,
  collectibleRotation,
  createGameplayExpansion,
  createLostFoundJob,
  heistForDay,
  lostFoundReward,
  normalizeGameplayExpansion,
  nextSeedQuality,
  seedValueMultiplier,
  type CollectibleId,
  type FishingRodColor,
  type GameplayExpansionState,
  type RequiredActivityId,
} from './gameplayExpansion';

export type ScheduleState = import('./gameClock').ScheduleBlockId;
export type BinkyStatus = 'not-started' | 'talked-to-owner' | 'found-clue' | 'traded-info' | 'found' | 'returned-good' | 'returned-bad';
export type JuiceClubCustomerPhase = 'idle' | 'entry' | 'queue' | 'ordering' | 'service' | 'drink' | 'reaction' | 'departure';

export interface FriendState {
  mood: 'happy' | 'sad' | 'curious' | 'grumpy' | 'excited';
  friendship: number; // 0 to 100
  recentMemory: string;
}

export interface DroppedWorldItem {
  id: string;
  item: string;
  position: [number, number, number];
  zone: GameZone;
}

export interface GameState {
  // Settings
  quality: QualityPreset;

  // Time and Schedule
  timeOfDay: number; // 9.0 to 18.5
  /**
   * The canonical clock. `timeOfDay` remains the fractional-hours value every
   * existing consumer reads, and is now DERIVED from this - one source of
   * truth, and no existing component had to change to get it.
   */
  clock: ClockState; // 9.0 to 18.5
  dayNumber: number;
  schedule: ScheduleState;
  isRainy: boolean;
  /**
   * Seed for the deterministic weather forecast. Only the seed is persisted;
   * the weather itself is derived from (day, minute, seed), so no save can
   * carry an impossible weather state and an old save simply starts
   * forecasting from whatever day it is on.
   */
  weatherSeed: number;
  isImaginationMode: boolean;
  
  // Player
  inventory: string[];
  collectibles: string[];
  isRiding: boolean;
  
  // NPCs & Social
  friends: Record<string, FriendState>;
  teacherSuspicion: number;

  // Mission: Binky
  binkyStatus: BinkyStatus;
  binkyClues: string[];
  quests: QuestStates;
  droppedItems: DroppedWorldItem[];
  tidyPlacedItems: string[];
  /**
   * Has the player been shown where the tidy blocks go?
   *
   * The placement popup fired on EVERY block of EVERY round forever - three
   * interruptions per round, for as many rounds as the player chose to grind.
   * It is a tutorial, so it runs once. The Journal objective and the interaction
   * prompt still carry the instruction for anyone who needs reminding; what goes
   * away is the modal dialogue.
   */
  tidyTutorialSeen: boolean;
  /** Purchased and earned cosmetics. Achievement items are re-derived on load. */
  dripOwned: string[];
  /** One equipped item per slot. */
  dripEquipped: DripEquipped;
  
  // Business
  juiceStock: number;
  crackerStock: number;
  juiceClubCash: number;
  juiceClubCustomersServed: number;
  juiceClubSatisfaction: number;
  juiceUpgrades: string[];
  waitingCustomers: string[];
  juiceClubServedCustomer: string | null;
  juiceClubCustomerPhase: JuiceClubCustomerPhase;
  juiceClubActiveCustomer: string | null;
  
  // Interaction & UI
  activeInteractable: string | null;
  activeDialogue: { name: string; text: string; options?: { label: string; action: () => void }[] } | null;
  journalOpen: boolean;
  tricycleColorIndex: number;
  teleportTrigger: number;
  progression: ProgressionState;
  zone: GameZone;
  playerPosition: [number, number, number];
  hubPosition: [number, number, number];
  gardenPosition: [number, number, number];
  storybookPosition: [number, number, number];
  zoneTransitioning: boolean;
  pendingZone: GameZone | null;
  gardenActivityStep: number;
  gummyCrop: GummyCropState;
  gummyCrop2: GummyCropState;
  expansion: GameplayExpansionState;
  ambientMessage: string | null;
  activeInstruction: GameplayInstruction | null;
  recentInstructions: GameplayInstruction[];
  rivalStory: RivalStoryState;
  rewardEvents: RewardEvent[];
  caper: CaperState;
  districtProgress: DistrictProgress;
  optionalRewardBoostUntil: number;
  // This is deliberately session-only: it must never alter the save payload.
  storageWarning: boolean;
  
  // Actions
  setQuality: (q: QualityPreset) => void;
  setTimeOfDay: (time: number) => void;
  advanceSchedule: () => void;
  /** Advances the clock by real elapsed seconds. Never by frames. */
  tickClock: (realSeconds: number) => void;
  setTimeScale: (scale: 1 | 2 | 4) => void;
  setClockPaused: (paused: boolean, reason?: ClockPauseReason | null) => void;
  toggleImagination: () => void;
  toggleRain: () => void;
  pickUp: (item: string) => void;
  drop: (item: string) => void;
  dropAt: (item: string, position: [number, number, number]) => void;
  recoverDroppedItem: (id: string) => void;
  collectShinyRock: () => boolean;
  tradeShinyRock: () => boolean;
  setIsRiding: (r: boolean) => void;
  
  updateFriend: (name: string, updates: Partial<FriendState>) => void;
  setTeacherSuspicion: (s: number | ((prev: number) => number)) => void;

  updateBinkyStatus: (status: BinkyStatus) => boolean;
  addClue: (clue: string) => void;
  advanceQuestObjective: (questId: string, objectiveId: string) => boolean;
  completeTidyToy: (item: string) => boolean;
  markTidyTutorialSeen: () => void;
  purchaseDripItem: (itemId: string) => boolean;
  /** Grants only known, non-prestige catalog cosmetics after verified fulfillment. */
  grantMonetizationCosmetics: (itemIds: string[]) => void;
  equipDripItem: (itemId: string) => boolean;
  unequipDripCategory: (category: DripCategory) => void;
  
  /** `cost` and `amount` are ignored - prices are authored in the store. */
  buyStock: (type: 'juice' | 'cracker' | 'supplies', cost: number, amount: number) => void;
  buyUpgrade: (id: string, cost: number) => void;
  addWaitingCustomer: (id: string) => void;
  removeWaitingCustomer: (id: string) => void;
  serveCustomer: () => void;
  clearJuiceClubServedCustomer: () => void;
  advanceJuiceClubCustomer: () => void;
  reportJuiceClubArrival: (customer: string, phase: JuiceClubCustomerPhase) => void;
  resetJuiceClubCustomer: () => void;
  
  setActiveInteractable: (id: string | null) => void;
  setActiveDialogue: (dialogue: GameState['activeDialogue']) => void;
  toggleJournal: () => void;
  cycleTricycleColor: () => void;
  triggerTeleport: () => void;
  completeActivity: (activityId: string, tokenReward: number, reputationReward: number, bed?: 0 | 1) => void;
  startGardenActivity: (bed?: 0 | 1) => boolean;
  advanceGardenActivity: (bed?: 0 | 1) => number;
  resetGardenActivity: (bed?: 0 | 1) => void;
  plantGummyDrops: (bed?: 0 | 1) => boolean;
  harvestGummyDrops: (bed?: 0 | 1) => boolean;
  eatGummyDrop: (bed?: 0 | 1) => boolean;
  feedGummyDrop: (bed?: 0 | 1) => boolean;
  sellGummyCrop: (bed?: 0 | 1) => boolean;
  castFishingLine: () => boolean;
  catchSwedishFish: () => boolean;
  sellSwedishFish: () => boolean;
  purchaseFishingRod: (color: FishingRodColor) => boolean;
  equipFishingRod: (color: FishingRodColor) => boolean;
  inspectSeed: (success: boolean) => 'upgraded' | 'failed' | 'already-inspected' | 'max-tier';
  completeArtActivity: () => boolean;
  completeShowAndTell: () => boolean;
  takeAfternoonSnack: () => boolean;
  recordAttendance: (activity: RequiredActivityId, seconds: number) => void;
  dismissDayReport: () => void;
  rotateExpansionContent: () => void;
  collectExpansionCollectible: (id: CollectibleId) => boolean;
  acceptLostFoundJob: () => boolean;
  collectLostFoundItem: () => boolean;
  turnInLostFoundJob: () => boolean;
  advanceTechHeist: () => boolean;
  setAmbientMessage: (message: string | null) => void;
  showInstruction: (instruction: Omit<GameplayInstruction, 'shownAt'> & { shownAt?: number }) => boolean;
  dismissInstruction: () => void;
  chooseRivalResponse: (choice: Exclude<RivalChoice, 'team-up'>) => boolean;
  resolveRivalStory: () => boolean;
  dismissRewardEvent: (id: string) => void;
  startCaper: () => boolean;
  chooseCaperRole: (role: Exclude<CaperRole, 'none'>) => boolean;
  advanceCaper: () => boolean;
  observeCaperPatrol: (now: number) => boolean;
  completeCaperSafeSetup: () => boolean;
  completeCaperRetrieval: () => boolean;
  interruptCaper: () => boolean;
  advanceDistrictPreview: (district: 'makerMarket' | 'storybookLane') => boolean;
  activateOptionalRewardBoost: (now: number) => boolean;
  addProgressionTokens: (amount: number) => void;
  buyHubUpgrade: (id: string, cost: number) => boolean;
  setTrustedHelperPass: () => void;
  setPlayerPosition: (position: [number, number, number]) => void;
  enterGarden: (tutorialAccess?: boolean) => boolean;
  enterStorybookLane: () => boolean;
  leaveStorybookLane: () => boolean;
  finishDay: () => boolean;
  returnToHub: () => boolean;
  completeZoneTransition: () => void;
  resetGame: () => void;
}

export interface GameplayInstruction {
  id: string;
  text: string;
  shownAt: number;
}

/**
 * The schedule for a fractional-hours time.
 *
 * Delegates to the canonical clock so the thresholds exist in exactly one
 * place. They used to be four literals here and the same four implied by the
 * clock; two copies of a boundary is two chances to disagree about when Juice
 * Club starts.
 */
const getScheduleForTime = (time: number): ScheduleState =>
  scheduleIdForMinute(timeOfDayToMinute(time)) as ScheduleState;

const withQualifiedRoutes = (progression: ProgressionState): ProgressionState => ({
  ...progression,
  routeUnlocks: Array.from(new Set([
    ...progression.routeUnlocks,
    ...getUnlockedRoutes(progression),
  ])),
});

const withExperience = (progression: ProgressionState, amount: number): ProgressionState => ({
  ...progression,
  experience: addLifetimeXp(progression.experience, amount).experience,
});

function closeExpansionDay(state: GameState) {
  const required = ['show-and-tell', 'art-time'] as const;
  const attended = required.filter((id) => attendanceSatisfied(state.expansion.attendance[id]));
  const missed = required.filter((id) => !attended.includes(id));
  const reputationLost = missed.length * MISSED_ACTIVITY_REP;
  const nextReputation = Math.max(0, state.progression.reputation - reputationLost);
  const nextDay = state.dayNumber + 1;
  const previousHeist = state.expansion.dailyHeist;
  const report = {
    day: state.dayNumber,
    attended: [...attended],
    missed: [...missed],
    goodBehavior: missed.length === 0,
    escapeAttempts: Math.max(0, getEscapeRetrievalSnapshot().strikes - state.expansion.dayStartEscapeStrikes),
    jobsCompleted: state.expansion.lostFoundCompleted - state.expansion.dayStartJobsCompleted,
    reputationEarned: Math.max(0, state.progression.reputation - state.expansion.dayStartReputation),
    reputationLost,
    xpEarned: Math.max(0, (state.progression.experience ?? 0) - state.expansion.dayStartExperience),
    moneyEarned: Math.max(0, state.juiceClubCash - state.expansion.dayStartCash),
  };
  return {
    progression: withQualifiedRoutes({ ...state.progression, reputation: nextReputation }),
    expansion: {
      ...state.expansion,
      attendanceDay: nextDay,
      attendance: {
        'show-and-tell': { seconds: 0, completed: false },
        'art-time': { seconds: 0, completed: false },
      },
      dayStartExperience: state.progression.experience ?? 0,
      dayStartCash: state.juiceClubCash,
      dayStartReputation: nextReputation,
      dayStartJobsCompleted: state.expansion.lostFoundCompleted,
      dayStartEscapeStrikes: getEscapeRetrievalSnapshot().strikes,
      lastDayReport: report,
      dailyHeistDay: nextDay,
      previousHeist,
      dailyHeist: heistForDay(nextDay, previousHeist),
      techHeistStep: 'idle' as const,
      rotationDay: nextDay,
      activeCollectibles: collectibleRotation(nextDay),
    },
  };
}

const initialFriends: Record<string, FriendState> = {
  Leo: { mood: 'sad', friendship: 10, recentMemory: 'Lost his favorite toy.' },
  Mia: { mood: 'curious', friendship: 20, recentMemory: 'Wants to trade for shiny rocks.' },
  Sam: { mood: 'happy', friendship: 15, recentMemory: 'Just loves playing tag.' },
  Zoe: { mood: 'excited', friendship: 30, recentMemory: 'Can wait to go outside.' },
  Eli: { mood: 'grumpy', friendship: 5, recentMemory: 'Needs a nap.' },
  Noah: { mood: 'happy', friendship: 10, recentMemory: 'Likes juice.' },
  Lily: { mood: 'curious', friendship: 15, recentMemory: 'Looking for bugs.' },
  Finn: { mood: 'excited', friendship: 20, recentMemory: 'Building a tower.' },
  Ruby: { mood: 'happy', friendship: 25, recentMemory: 'Drawing a picture.' },
  Max: { mood: 'grumpy', friendship: 10, recentMemory: 'Hungry for crackers.' },
  Mae: { mood: 'curious', friendship: 8, recentMemory: 'Wants her plans to be taken seriously.' },
};

const initialState = {
  quality: 'high' as const,
  timeOfDay: 9.0,
  clock: createClockState(1, 9 * 60),
  dayNumber: 1,
  schedule: 'breakfast' as ScheduleState,
  isRainy: false,
  weatherSeed: 0x5eed,
  isImaginationMode: false,
  inventory: [],
  collectibles: [],
  isRiding: false,
  
  friends: initialFriends,
  teacherSuspicion: 0,

  binkyStatus: 'not-started' as BinkyStatus,
  binkyClues: [],
  quests: createInitialQuests(),
  droppedItems: [] as DroppedWorldItem[],
  tidyPlacedItems: [] as string[],
  tidyTutorialSeen: false,
  dripOwned: [] as string[],
  dripEquipped: {} as DripEquipped,
  
  juiceStock: 5,
  crackerStock: 5,
  juiceClubCash: 0,
  juiceClubCustomersServed: 0,
  juiceClubSatisfaction: 100,
  juiceUpgrades: [],
  waitingCustomers: [],
  juiceClubServedCustomer: null,
  juiceClubCustomerPhase: 'idle' as JuiceClubCustomerPhase,
  juiceClubActiveCustomer: null,
  
  activeInteractable: null,
  activeDialogue: null,
  journalOpen: false,
  tricycleColorIndex: 0,
  teleportTrigger: 0,
  progression: createInitialProgression(),
  zone: 'hub' as GameZone,
  playerPosition: [0, 0, 0] as [number, number, number],
  hubPosition: [0, 0, 0] as [number, number, number],
  gardenPosition: GARDEN_SPAWN,
  storybookPosition: STORYBOOK_SPAWN,
  zoneTransitioning: false,
  pendingZone: null,
  gardenActivityStep: 0,
  gummyCrop: createGummyCrop(),
  gummyCrop2: createGummyCrop(),
  expansion: createGameplayExpansion(1),
  ambientMessage: null,
  activeInstruction: null,
  recentInstructions: [] as GameplayInstruction[],
  rivalStory: createInitialRivalStory(),
  rewardEvents: [] as RewardEvent[],
  caper: createInitialCaper(),
  districtProgress: createInitialDistrictProgress(),
  optionalRewardBoostUntil: 0,
  storageWarning: false,
};

let reportStorageUnavailable: (() => void) | undefined;
let storageOperationFailed = false;

function noteStorageUnavailable() {
  storageOperationFailed = true;
  reportStorageUnavailable?.();
}

// Private browsing and embedded webviews can expose localStorage but throw on
// individual operations. Keep the game state in memory when that happens.
const resilientStorage = {
  getItem: (name: string) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      noteStorageUnavailable();
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      noteStorageUnavailable();
    }
  },
  removeItem: (name: string) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      noteStorageUnavailable();
    }
  },
};

const BINKY_STATUSES = new Set<BinkyStatus>([
  'not-started', 'talked-to-owner', 'found-clue', 'traded-info', 'found', 'returned-good', 'returned-bad',
]);
const TIDY_ITEMS = new Set(['blue-block', 'red-block', 'yellow-block']);
const AUTHORED_ITEMS = new Set(['binky', ...TIDY_ITEMS]);
const AUTHORED_COLLECTIBLES = new Set(['Shiny Rock']);
const JUICE_CLUB_CUSTOMERS = new Set(['Max', 'Noah', 'Zoe']);
const JUICE_CLUB_PHASES = new Set<JuiceClubCustomerPhase>([
  'idle', 'entry', 'queue', 'ordering', 'service', 'drink', 'reaction', 'departure',
]);
const AUTHORED_FRIEND_NAMES = new Set(Object.keys(initialFriends));
const AUTHORED_FRIEND_MEMORIES = new Set([
  ...Object.values(initialFriends).map((friend) => friend.recentMemory),
  'Loved the juice!',
  'Got Binky back!',
]);
const MAX_INVENTORY_ITEMS = 4;
const MAX_DROPPED_ITEMS = 4;
const MAX_STOCK = 99;
const MAX_CUSTOMERS_SERVED = 99_999;
const MAX_CASH = MAX_TOKENS;
const MAX_CLUES = 8;
const MAX_RECENT_MEMORY_LENGTH = 80;

function safeNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function safeInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  return Math.floor(safeNumber(value, fallback, minimum, maximum));
}

function nextJuiceClubCustomerState(waitingCustomers: string[]) {
  const customer = waitingCustomers[0] ?? null;
  return customer
    ? { juiceClubActiveCustomer: customer, juiceClubCustomerPhase: 'entry' as JuiceClubCustomerPhase }
    : { juiceClubActiveCustomer: null, juiceClubCustomerPhase: 'idle' as JuiceClubCustomerPhase };
}

function resetJuiceClubCustomerState(state: Pick<GameState, 'waitingCustomers'>) {
  return {
    waitingCustomers: [],
    juiceClubServedCustomer: null,
    juiceClubActiveCustomer: null,
    juiceClubCustomerPhase: 'idle' as JuiceClubCustomerPhase,
  };
}

function safeStringArray(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === 'string')))
    : [];
}

export function normalizeTidyItems(value: unknown) {
  return safeStringArray(value).filter((item) => TIDY_ITEMS.has(item)).slice(-3);
}

function normalizeKnownStrings(value: unknown, known: ReadonlySet<string>, maximum: number) {
  return safeStringArray(value).filter((item) => known.has(item)).slice(0, maximum);
}

function normalizeFriends(value: unknown): Record<string, FriendState> {
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(
    Object.entries(initialFriends).map(([name, fallback]) => {
      const saved = candidate[name];
      const record = saved && typeof saved === 'object' && !Array.isArray(saved)
        ? saved as Partial<FriendState>
        : {};
      return [name, {
        mood: ['happy', 'sad', 'curious', 'grumpy', 'excited'].includes(record.mood as string)
          ? record.mood as FriendState['mood']
          : fallback.mood,
        friendship: safeInteger(record.friendship, fallback.friendship, 0, 100),
        recentMemory: typeof record.recentMemory === 'string'
          && AUTHORED_FRIEND_MEMORIES.has(record.recentMemory)
          && record.recentMemory.length <= MAX_RECENT_MEMORY_LENGTH
          ? record.recentMemory
          : fallback.recentMemory,
      }];
    }),
  );
}

function safePosition(value: unknown, fallback: [number, number, number], zone: GameZone) {
  if (
    Array.isArray(value)
    && value.length === 3
    && value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
  ) {
    const position: [number, number, number] = [value[0], value[1], value[2]];
    if (isWalkable(new THREE.Vector3(...position), 0.34, [], zone)) return position;
  }
  return fallback;
}

function safeDroppedItems(value: unknown): DroppedWorldItem[] {
  if (!Array.isArray(value)) return [];
  const byItem = new Map<string, DroppedWorldItem>();
  value.forEach((candidate) => {
    if (!candidate || typeof candidate !== 'object') return;
    const item = (candidate as Partial<DroppedWorldItem>).item;
    const position = (candidate as Partial<DroppedWorldItem>).position;
    const savedZone = (candidate as Partial<DroppedWorldItem>).zone;
    if (savedZone !== undefined && savedZone !== 'hub' && savedZone !== 'garden') return;
    const zone: GameZone = savedZone ?? 'hub';
    if (typeof item !== 'string' || !Array.isArray(position) || position.length !== 3) return;
    if (!AUTHORED_ITEMS.has(item)) return;
    if (!position.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))) return;
    if ((item === 'binky' || TIDY_ITEMS.has(item)) && zone !== 'hub') return;
    if (!isWalkable(new THREE.Vector3(...position), 0.25, [], zone)) return;
    byItem.set(item, {
      id: `dropped-${item}`,
      item,
      position: [position[0], position[1], position[2]],
      zone,
    });
  });
  return [...byItem.values()].slice(0, MAX_DROPPED_ITEMS);
}

export function normalizeSavedItems(inventoryValue: unknown, droppedValue: unknown) {
  const inventory = normalizeKnownStrings(inventoryValue, AUTHORED_ITEMS, MAX_INVENTORY_ITEMS);
  return {
    inventory,
    droppedItems: safeDroppedItems(droppedValue).filter((item) => !inventory.includes(item.item)),
  };
}

function currentPosition(state: Pick<GameState, 'zone'>): [number, number, number] {
  const tracked = getTrackedPlayerPosition();
  return [tracked[0], tracked[1], tracked[2]];
}

function safeBinkyStatus(value: unknown, quests: QuestStates): BinkyStatus {
  return typeof value === 'string' && BINKY_STATUSES.has(value as BinkyStatus)
    ? value as BinkyStatus
    : legacyStatusForQuest(quests) as BinkyStatus;
}

export function restoreZoneState(persisted: Partial<GameState>, progression: ProgressionState) {
  const hubPosition = safePosition(persisted.hubPosition, GARDEN_RETURN_SPAWN, 'hub');
  const gardenPosition = safePosition(persisted.gardenPosition, GARDEN_SPAWN, 'garden');
  const storybookPosition = safePosition(persisted.storybookPosition, STORYBOOK_SPAWN, 'storybook');
  const gardenAuthorized = getUnlockedRoutes(progression).includes('garden-district');
  const storybookAuthorized = getUnlockedRoutes(progression).includes('storybook-lane')
    && storybookIsOpen(normalizeClockState(persisted.clock, persisted.timeOfDay ?? 9, persisted.dayNumber ?? 1).minute);
  const requestedZone: GameZone = persisted.zone === 'garden' || persisted.zone === 'storybook' ? persisted.zone : 'hub';
  const zone: GameZone = requestedZone === 'garden'
    ? (gardenAuthorized ? 'garden' : 'hub')
    : requestedZone === 'storybook'
      ? (storybookAuthorized ? 'storybook' : 'hub')
      : 'hub';
  const playerPosition = requestedZone === zone
    ? safePosition(
        persisted.playerPosition,
        zone === 'garden' ? gardenPosition : zone === 'storybook' ? storybookPosition : hubPosition,
        zone,
      )
    : hubPosition;
  return { zone, playerPosition, hubPosition, gardenPosition, storybookPosition };
}

function reconcilePersistedProgression(
  persisted: Partial<GameState>,
  progression: ProgressionState,
  quests: QuestStates,
  juiceClubCustomersServed: number,
) {
  const activityRuns = { ...progression.activityRuns };
  const persistedQuests = persisted.quests && typeof persisted.quests === 'object' && !Array.isArray(persisted.quests)
    ? persisted.quests as Record<string, unknown>
    : null;
  if (persistedQuests && Object.hasOwn(persistedQuests, 'rainbow-tidy-up')) {
    const tidyRuns = quests['rainbow-tidy-up'].completionCount;
    if (tidyRuns > 0) activityRuns['rainbow-tidy-up'] = tidyRuns;
    else delete activityRuns['rainbow-tidy-up'];
  }
  if (Object.hasOwn(persisted, 'juiceClubCustomersServed')) {
    if (juiceClubCustomersServed > 0) activityRuns['juice-club-service'] = juiceClubCustomersServed;
    else delete activityRuns['juice-club-service'];
  }
  const rawProgression = persisted.progression && typeof persisted.progression === 'object'
    ? persisted.progression as Partial<ProgressionState>
    : {};
  return normalizeProgression({
    ...progression,
    routeUnlocks: [],
    activityRuns,
    activityRewards: {},
    // A finished Binky quest IS the Trusted Helper Pass. Deriving it only from
    // the persisted flag left saves that migrated to complete without one
    // permanently unable to earn it: the pass is granted in exactly one place,
    // and that place refuses a quest already marked complete. The player saw
    // "Where's Binky - complete" and no Sticker Parade board, forever.
    trustedHelperPass: rawProgression.trustedHelperPass === true
      || quests['where-binky']?.status === 'complete',
  });
}

function normalizeJuiceClubState(
  value: unknown,
  schedule: ScheduleState,
): Pick<
  GameState,
  | 'waitingCustomers'
  | 'juiceClubServedCustomer'
  | 'juiceClubCustomerPhase'
  | 'juiceClubActiveCustomer'
> {
  if (schedule !== 'juice-club') return resetJuiceClubCustomerState({ waitingCustomers: [] });
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const waitingCustomers = normalizeKnownStrings(candidate.waitingCustomers, JUICE_CLUB_CUSTOMERS, 3);
  const savedActive = typeof candidate.juiceClubActiveCustomer === 'string'
    && JUICE_CLUB_CUSTOMERS.has(candidate.juiceClubActiveCustomer)
    ? candidate.juiceClubActiveCustomer
    : null;
  const savedServed = typeof candidate.juiceClubServedCustomer === 'string'
    && JUICE_CLUB_CUSTOMERS.has(candidate.juiceClubServedCustomer)
    ? candidate.juiceClubServedCustomer
    : null;
  const phase = typeof candidate.juiceClubCustomerPhase === 'string'
    && JUICE_CLUB_PHASES.has(candidate.juiceClubCustomerPhase as JuiceClubCustomerPhase)
    ? candidate.juiceClubCustomerPhase as JuiceClubCustomerPhase
    : 'idle';

  if (phase === 'idle') {
    return waitingCustomers.length > 0
      ? {
          waitingCustomers,
          juiceClubServedCustomer: null,
          ...nextJuiceClubCustomerState(waitingCustomers),
        }
      : resetJuiceClubCustomerState({ waitingCustomers: [] });
  }
  if (phase === 'entry' || phase === 'queue' || phase === 'ordering') {
    const active = waitingCustomers[0];
    return active
      ? {
          waitingCustomers,
          juiceClubServedCustomer: null,
          juiceClubActiveCustomer: active,
          juiceClubCustomerPhase: phase,
        }
      : resetJuiceClubCustomerState({ waitingCustomers: [] });
  }
  if (phase === 'service' || phase === 'drink' || phase === 'reaction') {
    const active = savedActive ?? savedServed;
    if (!active || (savedServed && savedServed !== active)) {
      return resetJuiceClubCustomerState({ waitingCustomers: [] });
    }
    return {
      waitingCustomers: waitingCustomers.filter((customer) => customer !== active),
      juiceClubServedCustomer: active,
      juiceClubActiveCustomer: active,
      juiceClubCustomerPhase: phase,
    };
  }
  if (phase === 'departure' && savedActive) {
    return {
      waitingCustomers: waitingCustomers.filter((customer) => customer !== savedActive),
      juiceClubServedCustomer: null,
      juiceClubActiveCustomer: savedActive,
      juiceClubCustomerPhase: phase,
    };
  }
  return resetJuiceClubCustomerState({ waitingCustomers: [] });
}


/**
 * The evidence achievements are judged on.
 *
 * Everything here is already recorded elsewhere in the save for its own reasons,
 * which is the point: a prestige item is a claim about play that happened, so it
 * is derived from the record of that play rather than from a flag that could be
 * set directly.
 */
function dripEvidenceFrom(input: {
  quests: QuestStates;
  caper: { step: string };
  progression: ProgressionState;
  juiceClubCustomersServed: number;
  friends: Record<string, { friendship: number }>;
}): AchievementEvidence {
  const runs = input.progression.activityRuns;
  return {
    binkyComplete: input.quests['where-binky']?.status === 'complete',
    caperComplete: input.caper.step === 'complete',
    rainbowRounds: runs['rainbow-tidy-up'] ?? 0,
    gardenRuns: runs['garden-planting'] ?? 0,
    juiceCustomersServed: input.juiceClubCustomersServed,
    // The art achievement rides on garden/craft activity runs until 4C gives art
    // its own counter; using a real counter now beats inventing a flag that
    // nothing increments.
    artActivities: runs['garden-planting'] ?? 0,
    bestFriendship: Object.values(input.friends ?? {}).reduce(
      (best, friend) => Math.max(best, friend?.friendship ?? 0),
      0,
    ),
  };
}

export function normalizePersistedGameState(value: unknown) {
  const persisted = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<GameState>
    : {};
  const recentInstructions = Array.isArray(persisted.recentInstructions)
    ? persisted.recentInstructions
        .filter((entry): entry is GameplayInstruction => Boolean(
          entry
          && typeof entry === 'object'
          && typeof entry.id === 'string'
          && typeof entry.text === 'string'
          && entry.text.trim().length > 0,
        ))
        .slice(0, 3)
        .map((entry) => ({
          id: entry.id.slice(0, 80),
          text: entry.text.trim().slice(0, 240),
          shownAt: safeNumber(entry.shownAt, 0, 0, Number.MAX_SAFE_INTEGER),
        }))
    : [];
  const savedItems = normalizeSavedItems(persisted.inventory, persisted.droppedItems);
  const inventory = savedItems.inventory;
  const quests = normalizeQuestStates(persisted.quests, persisted.binkyStatus, inventory);
  const normalizedCollectibles = normalizeKnownStrings(persisted.collectibles, AUTHORED_COLLECTIBLES, 8);
  const juiceClubCustomersServed = safeInteger(
    persisted.juiceClubCustomersServed,
    initialState.juiceClubCustomersServed,
    0,
    MAX_CUSTOMERS_SERVED,
  );
  const progression = reconcilePersistedProgression(
    persisted,
    normalizeProgression(persisted.progression),
    quests,
    juiceClubCustomersServed,
  );
  const normalizedFriends = normalizeFriends(persisted.friends);
  const normalizedCaper = normalizeCaper(persisted.caper);
  const normalizedDripOwned = normalizeDripOwned(
    persisted.dripOwned,
    dripEvidenceFrom({
      quests,
      caper: normalizedCaper,
      progression,
      juiceClubCustomersServed,
      friends: normalizedFriends,
    }),
  );
  const shinyRockGenuinelyCollected = (
    quests['where-binky']?.currentObjectiveId === 'trade-with-sam'
    && (progression.collectibleProgress['Shiny Rock'] ?? 0) > 0
  );
  const binkyStatus = safeBinkyStatus(persisted.binkyStatus, quests);
  const needsBinkyRecovery = (
    (binkyStatus === 'found' || quests['where-binky'].currentObjectiveId === 'return-binky')
    && !inventory.includes('binky')
    && !savedItems.droppedItems.some((item) => item.item === 'binky')
  );
  const timeOfDay = safeNumber(persisted.timeOfDay, initialState.timeOfDay, 9, 18.5);
  const schedule = getScheduleForTime(timeOfDay);
  const restoredZone = restoreZoneState(persisted, progression);
  const clubState = normalizeJuiceClubState(persisted, schedule);
  const droppedItems = needsBinkyRecovery
    ? [
        ...savedItems.droppedItems,
        {
          id: 'recovered-binky',
          item: 'binky',
          position: [-14, 0.2, 14] as [number, number, number],
          zone: 'hub' as GameZone,
        },
      ]
    : savedItems.droppedItems;

  return {
    // 'low' and 'high' remain valid presets, so every existing save keeps the
    // setting it had. Widening the field needed no migration - only the guard
    // widening with it.
    quality: isQualityPreset(persisted.quality) ? persisted.quality : initialState.quality,
    timeOfDay,
    // A save written before the clock existed carries no `clock` key at all.
    // It is migrated from the timeOfDay and dayNumber it does have, never
    // discarded - losing a player's day because we shipped a feature would be
    // the worst trade available to us.
    clock: normalizeClockState(
      persisted.clock,
      timeOfDay,
      safeInteger(persisted.dayNumber, initialState.dayNumber, 1, 9999),
    ),
    dayNumber: safeInteger(persisted.dayNumber, initialState.dayNumber, 1, 9999),
    schedule,
    isRainy: persisted.isRainy === true,
    weatherSeed: normalizeWeatherSeed(persisted.weatherSeed),
    isImaginationMode: false,
    inventory,
    // Early builds pre-granted the rock without recording a world pickup. Keep
    // ownership only when the active trade stage and pickup history corroborate
    // each other; every other save should rediscover or have consumed the rock.
    collectibles: shinyRockGenuinelyCollected
      ? normalizedCollectibles
      : normalizedCollectibles.filter((item) => item !== 'Shiny Rock'),
    isRiding: false,
    friends: normalizedFriends,
    // Achievement cosmetics are recomputed from evidence, never trusted from the
    // save, so a hand-edited dripOwned cannot mint a prestige item - and a
    // player who earned one can never lose it either.
    dripOwned: normalizedDripOwned,
    dripEquipped: normalizeDripEquipped(persisted.dripEquipped, normalizedDripOwned),
    teacherSuspicion: safeNumber(persisted.teacherSuspicion, 0, 0, 100),
    binkyStatus,
    binkyClues: safeStringArray(persisted.binkyClues)
      .filter((clue) => clue.length <= 120)
      .slice(0, MAX_CLUES),
    quests,
    droppedItems,
    tidyPlacedItems: normalizeTidyItems(persisted.tidyPlacedItems),
    // Defaulting to false would hand the beginner tutorial back to every
    // existing player on their next load. A save with completed rounds has
    // demonstrably seen it, so derive rather than default.
    tidyTutorialSeen: persisted.tidyTutorialSeen === true
      || (progression.activityRuns['rainbow-tidy-up'] ?? 0) > 0
      || quests['rainbow-tidy-up']?.completionCount > 0,
    juiceStock: safeInteger(persisted.juiceStock, initialState.juiceStock, 0, MAX_STOCK),
    crackerStock: safeInteger(persisted.crackerStock, initialState.crackerStock, 0, MAX_STOCK),
    juiceClubCash: safeInteger(persisted.juiceClubCash, initialState.juiceClubCash, 0, MAX_CASH),
    juiceClubCustomersServed,
    juiceClubSatisfaction: safeNumber(persisted.juiceClubSatisfaction, initialState.juiceClubSatisfaction, 0, 100),
    juiceUpgrades: normalizeKnownStrings(persisted.juiceUpgrades, new Set(['premium-cups']), 2),
    ...clubState,
    activeInteractable: null,
    activeDialogue: null,
    journalOpen: false,
    tricycleColorIndex: safeInteger(persisted.tricycleColorIndex, 0, 0, 3),
    teleportTrigger: 0,
    progression,
    ...restoredZone,
    zoneTransitioning: false,
    pendingZone: null,
    gardenActivityStep: 0,
    gummyCrop: normalizeGummyCrop(persisted.gummyCrop),
    gummyCrop2: normalizeGummyCrop(persisted.gummyCrop2),
    expansion: normalizeGameplayExpansion(persisted.expansion, safeInteger(persisted.dayNumber, initialState.dayNumber, 1, 9999)),
    ambientMessage: null,
    activeInstruction: null,
    recentInstructions,
    rivalStory: normalizeRivalStory(persisted.rivalStory),
    rewardEvents: [],
    caper: normalizedCaper,
    districtProgress: normalizeDistrictProgress(persisted.districtProgress),
    optionalRewardBoostUntil: 0,
  };
}

export function serializeGameState(state: GameState) {
  return {
    quality: state.quality,
    timeOfDay: state.timeOfDay,
    clock: serializeClockState(state.clock),
    dayNumber: state.dayNumber,
    schedule: state.schedule,
    isRainy: state.isRainy,
    weatherSeed: state.weatherSeed,
    inventory: state.inventory,
    collectibles: state.collectibles,
    recentInstructions: state.recentInstructions,
    friends: state.friends,
    teacherSuspicion: state.teacherSuspicion,
    binkyStatus: state.binkyStatus,
    binkyClues: state.binkyClues,
    quests: state.quests,
    droppedItems: state.droppedItems,
    tidyPlacedItems: state.tidyPlacedItems,
    tidyTutorialSeen: state.tidyTutorialSeen,
    dripOwned: state.dripOwned,
    dripEquipped: state.dripEquipped,
    juiceStock: state.juiceStock,
    crackerStock: state.crackerStock,
    juiceClubCash: state.juiceClubCash,
    juiceClubCustomersServed: state.juiceClubCustomersServed,
    juiceClubSatisfaction: state.juiceClubSatisfaction,
    juiceUpgrades: state.juiceUpgrades,
    waitingCustomers: state.waitingCustomers,
    juiceClubServedCustomer: state.juiceClubServedCustomer,
    juiceClubCustomerPhase: state.juiceClubCustomerPhase,
    juiceClubActiveCustomer: state.juiceClubActiveCustomer,
    tricycleColorIndex: state.tricycleColorIndex,
    progression: state.progression,
    zone: state.zone,
    playerPosition: state.playerPosition,
    hubPosition: state.hubPosition,
    gardenPosition: state.gardenPosition,
    storybookPosition: state.storybookPosition,
    gummyCrop: state.gummyCrop,
    gummyCrop2: state.gummyCrop2,
    expansion: state.expansion,
    rivalStory: state.rivalStory,
    caper: state.caper,
    districtProgress: state.districtProgress,
  };
}

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      ...initialState,
      
      setQuality: (quality) => set({
        // Presets are authored in qualityManager; an unknown one falls back
        // rather than being stored, so a stray value cannot poison a save.
        quality: isQualityPreset(quality) ? quality : initialState.quality,
      }),
      setTimeOfDay: (time) => set((state) => {
         const timeOfDay = safeNumber(time, initialState.timeOfDay, 9, 18.5);
        const schedule = getScheduleForTime(timeOfDay);
        const minute = timeOfDayToMinute(timeOfDay);
        return {
          timeOfDay,
          schedule,
          // Jumping the clock also settles which boundaries count as already
          // seen, so a jump forward does not then replay every block it passed.
          clock: { ...state.clock, minute, lastBoundaryMinute: minute },
          ...(schedule === 'juice-club' ? {} : resetJuiceClubCustomerState(state)),
        };
      }),
      
      advanceSchedule: () => set((state) => {
         const currentTime = safeNumber(state.timeOfDay, initialState.timeOfDay, 9, 18.5);
         const isNewDay = currentTime >= 18.5;
         const nextTime = isNewDay ? 9.0 : Math.min(18.5, currentTime + 1.5);
        const schedule = getScheduleForTime(nextTime);
         if (isNewDay) {
           return {
             ...closeExpansionDay(state),
             timeOfDay: nextTime,
             dayNumber: state.dayNumber + 1,
             schedule,
             zone: 'hub',
             playerPosition: [0, 0, 0],
             hubPosition: [0, 0, 0],
              gardenActivityStep: 0,
              storybookPosition: STORYBOOK_SPAWN,
             teacherSuspicion: 0,
             optionalRewardBoostUntil: 0,
             ambientMessage: `Day ${state.dayNumber + 1} is ready. Yesterday’s progress is safe in your Journal.`,
             // The day rollover stays here, in the one place that already knows
             // a new day also means the hub, the origin, no suspicion and a
             // reset Juice Club. The clock follows it rather than owning it.
              clock: startNextDay(state.clock),
             ...resetJuiceClubCustomerState(state),
           };
         }
         const advancedMinute = timeOfDayToMinute(nextTime);
         return {
           timeOfDay: nextTime,
           schedule,
           clock: { ...state.clock, minute: advancedMinute, lastBoundaryMinute: advancedMinute },
           ...(schedule === 'juice-club' ? {} : resetJuiceClubCustomerState(state)),
         };
      }),

      /**
       * Advances the clock by REAL elapsed seconds.
       *
       * Called from a single driver that measures wall-clock time. Frame count
       * is never an input: the game day is a promise to the player, not a
       * property of their hardware, so a 30 FPS phone and a 144 FPS desktop
       * must reach lunch at the same moment.
       *
       * Schedule boundaries crossed by the tick are applied here, in order and
       * once each - including when a single tick under fast-forward skips a
       * whole block.
       */
      tickClock: (realSeconds) => set((state) => {
        const tick = advanceClockState(state.clock, realSeconds);
        if (tick.advancedMinutes <= 0) return {};

        const timeOfDay = minuteToTimeOfDay(tick.clock.minute);
        const schedule = getScheduleForTime(timeOfDay);
        if (schedule === state.schedule) {
          return { clock: tick.clock, timeOfDay };
        }
        // Leaving Juice Club tears down its customer state exactly as the
        // manual advance always did - the same teardown, reached a new way.
        return {
          clock: tick.clock,
          timeOfDay,
          schedule,
          ...(schedule === 'juice-club' ? {} : resetJuiceClubCustomerState(state)),
        };
      }),

      setTimeScale: (scale) => set((state) => ({ clock: setClockTimeScale(state.clock, scale) })),

      setClockPaused: (paused, reason = null) => set((state) => ({
        clock: paused
          ? pauseClockState(state.clock, reason ?? 'menu')
          : resumeClockState(state.clock),
      })),
      
      toggleImagination: () => set((state) => ({ isImaginationMode: !state.isImaginationMode })),
      toggleRain: () => set((state) => ({ isRainy: !state.isRainy })),
      
      pickUp: (item) => set((state) => {
        if (!AUTHORED_ITEMS.has(item) || state.inventory.includes(item)) return state;
        const dropped = state.droppedItems.filter((droppedItem) => droppedItem.item !== item);
        return {
          inventory: [...state.inventory, item],
          droppedItems: dropped,
          progression: {
            ...state.progression,
            collectibleProgress: {
              ...state.progression.collectibleProgress,
              [item]: Math.min(
                MAX_ACTIVITY_RUNS,
                (state.progression.collectibleProgress[item] ?? 0) + 1,
              ),
            },
          },
        };
      }),
      
      drop: (item) => set((state) => {
        if (!AUTHORED_ITEMS.has(item) || !state.inventory.includes(item)) return state;
        const protectedItem = item === 'binky' || item.endsWith('-block');
        if (protectedItem && state.zone !== 'hub') return state;
        const position: [number, number, number] = protectedItem
          && state.progression.hubUpgrades.includes('storage-organizer')
          ? [-10.5, 0.25, 10.2]
          : currentPosition(state);
        if (!isWalkable(new THREE.Vector3(...position), 0.25, [], state.zone)) return state;
        if (item === 'binky') {
          return {
            droppedItems: [
              ...state.droppedItems.filter((droppedItem) => droppedItem.item !== item),
              { id: `dropped-${item}`, item, position, zone: state.zone },
            ],
            inventory: state.inventory.filter((inventoryItem) => inventoryItem !== item),
          };
        }
        return {
          droppedItems: [
            ...state.droppedItems.filter((droppedItem) => droppedItem.item !== item),
            { id: `dropped-${item}`, item, position, zone: state.zone },
          ],
          inventory: state.inventory.filter((inventoryItem) => inventoryItem !== item),
        };
      }),
      dropAt: (item, position) => set((state) => {
        if (
          !AUTHORED_ITEMS.has(item)
          || !state.inventory.includes(item)
          || !Array.isArray(position)
          || position.length !== 3
          || !position.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
        ) return state;
        if ((item === 'binky' || item.endsWith('-block')) && state.zone !== 'hub') return state;
        if (!isWalkable(new THREE.Vector3(...position), 0.25, [], state.zone)) return state;
        return {
          droppedItems: [
            ...state.droppedItems.filter((droppedItem) => droppedItem.item !== item),
            { id: `dropped-${item}`, item, position, zone: state.zone },
          ],
          inventory: state.inventory.filter((inventoryItem) => inventoryItem !== item),
        };
      }),
      recoverDroppedItem: (id) => set((state) => {
        const droppedItem = state.droppedItems.find((candidate) => candidate.id === id);
        const player = getTrackedPlayerPosition();
        if (
          !droppedItem
          || droppedItem.zone !== state.zone
          || Math.hypot(player[0] - droppedItem.position[0], player[2] - droppedItem.position[2]) > 2.1
        ) return state;
        return {
          droppedItems: state.droppedItems.filter((candidate) => candidate.id !== id),
          inventory: state.inventory.includes(droppedItem.item)
            ? state.inventory
            : [...state.inventory, droppedItem.item],
        };
      }),
      collectShinyRock: () => {
        let changed = false;
        set((state) => {
          if (
            state.zone !== 'hub'
            || state.quests['where-binky']?.currentObjectiveId !== 'trade-with-sam'
            || state.collectibles.includes('Shiny Rock')
          ) return state;
          changed = true;
          return {
            collectibles: [...state.collectibles, 'Shiny Rock'],
            progression: {
              ...state.progression,
              collectibleProgress: {
                ...state.progression.collectibleProgress,
                'Shiny Rock': Math.min(
                  MAX_ACTIVITY_RUNS,
                  (state.progression.collectibleProgress['Shiny Rock'] ?? 0) + 1,
                ),
              },
            },
          };
        });
        return changed;
      },
      tradeShinyRock: () => {
        let changed = false;
        set((state) => {
          if (
            state.quests['where-binky']?.currentObjectiveId !== 'trade-with-sam'
            || !state.collectibles.includes('Shiny Rock')
          ) return state;
          const quests = advanceObjective(state.quests, 'where-binky', 'trade-with-sam');
          if (quests === state.quests) return state;
          changed = true;
          return {
            collectibles: state.collectibles.filter((item) => item !== 'Shiny Rock'),
            quests,
            binkyStatus: legacyStatusForQuest(quests) as BinkyStatus,
          };
        });
        return changed;
      },

      setIsRiding: (r) => set((state) => ({
        isRiding: r,
        progression: state.isRiding && !r
          ? {
              ...state.progression,
              vehicleProgress: {
                ...state.progression.vehicleProgress,
                tricycleRides: Math.min(
                  MAX_ACTIVITY_RUNS,
                  (state.progression.vehicleProgress.tricycleRides ?? 0) + 1,
                ),
              },
            }
          : state.progression,
      })),
      
      updateFriend: (name, updates) => set((state) => {
        if (!AUTHORED_FRIEND_NAMES.has(name) || !state.friends[name] || !updates || typeof updates !== 'object') {
          return state;
        }
        const current = state.friends[name];
        const next = {
          ...current,
          ...(updates.mood && ['happy', 'sad', 'curious', 'grumpy', 'excited'].includes(updates.mood)
            ? { mood: updates.mood }
            : {}),
          ...(updates.friendship !== undefined
            ? { friendship: safeInteger(updates.friendship, current.friendship, 0, 100) }
            : {}),
          ...(typeof updates.recentMemory === 'string' && AUTHORED_FRIEND_MEMORIES.has(updates.recentMemory)
            ? { recentMemory: updates.recentMemory }
            : {}),
        };
        return { friends: { ...state.friends, [name]: next } };
      }),

      setTeacherSuspicion: (s) => set((state) => {
        const requested = typeof s === 'function' ? s(state.teacherSuspicion) : s;
        const teacherSuspicion = safeNumber(requested, state.teacherSuspicion, 0, 100);
        return teacherSuspicion === state.teacherSuspicion ? state : { teacherSuspicion };
      }),
      
      updateBinkyStatus: (status) => {
        let changed = false;
        set((state) => {
          if (!BINKY_STATUSES.has(status)) return state;
          if (status !== 'returned-good') {
            changed = status !== state.binkyStatus;
            return changed ? { binkyStatus: status } : state;
          }
          const quest = state.quests['where-binky'];
          if (
            state.binkyStatus === 'returned-good'
            || quest?.status === 'complete'
            || quest?.currentObjectiveId !== 'return-binky'
            || !state.inventory.includes('binky')
          ) return state;
          const quests = activateQuest(
            advanceObjective(state.quests, 'where-binky', 'return-binky'),
            'rainbow-tidy-up',
          );
          const progression = withQualifiedRoutes({
            ...state.progression,
            reputation: Math.min(MAX_REPUTATION, state.progression.reputation + monetizedReputation(8)),
            tokens: Math.min(MAX_TOKENS, state.progression.tokens + 5),
            trustedHelperPass: true,
          });
          changed = true;
          return {
            binkyStatus: status,
            quests,
            progression,
            rewardEvents: appendRewardEvent(state.rewardEvents, {
              id: 'where-binky-complete',
              title: 'Binky is home!',
              detail: 'Trusted Helper Pass earned',
              tokens: 5,
              reputation: monetizedReputation(8),
              sticker: 'Binky Buddy',
            }),
            inventory: state.inventory.filter((item) => item !== 'binky'),
            droppedItems: state.droppedItems.filter((item) => item.item !== 'binky'),
          };
        });
        return changed;
      },
      
      addClue: (clue) => set((state) => {
        if (typeof clue === 'string' && clue.length <= 120 && !state.binkyClues.includes(clue)) {
          return { binkyClues: [...state.binkyClues, clue].slice(0, MAX_CLUES) };
        }
        return state;
      }),
      advanceQuestObjective: (questId, objectiveId) => {
        let changed = false;
        set((state) => {
          const nextQuests = advanceObjective(state.quests, questId, objectiveId);
          changed = nextQuests !== state.quests;
          if (!changed) return state;
          const nextStatus = questId === 'where-binky'
            ? legacyStatusForQuest(nextQuests) as BinkyStatus
            : state.binkyStatus;
          return {
            quests: nextQuests,
            binkyStatus: nextStatus,
          };
        });
        return changed;
      },
      /**
       * Buy a cosmetic.
       *
       * The caller passes ONLY an id. Price, REP requirement and achievement
       * gate are all read from the catalog here, so a forged call cannot say
       * what an item costs - the same reason buyStock ignores its own cost
       * argument. canPurchase is the single authority, shared with the UI, so
       * the shop can never offer something this would refuse.
       */
      purchaseDripItem: (itemId) => {
        let changed = false;
        set((state) => {
          const item = getDripItem(itemId);
          if (!item) return state;
          const evidence = dripEvidenceFrom({
            quests: state.quests,
            caper: state.caper,
            progression: state.progression,
            juiceClubCustomersServed: state.juiceClubCustomersServed,
            friends: state.friends,
          });
          const verdict = canPurchase(
            item,
            { reputation: state.progression.reputation, cash: state.juiceClubCash },
            achievementsEarned(evidence),
            new Set(state.dripOwned),
          );
          if (!verdict.ok) return state;
          changed = true;
          const owned = normalizeDripOwned([...state.dripOwned, item.id], evidence);
          return {
            juiceClubCash: Math.max(0, state.juiceClubCash - item.priceCash),
            dripOwned: owned,
            // Equip it immediately - buying something you cannot see is a poor
            // reward moment, and the slot it fills is unambiguous.
            dripEquipped: normalizeDripEquipped(
              { ...state.dripEquipped, [item.category]: item.id },
              owned,
            ),
            rewardEvents: appendRewardEvent(state.rewardEvents, {
              id: `drip-${item.id}`,
              title: item.name,
              detail: item.prestige ? 'Earned' : 'Added to your wardrobe',
              tokens: 0,
              reputation: 0,
              sticker: item.rarity,
            }),
          };
        });
        return changed;
      },
      grantMonetizationCosmetics: (itemIds) => set((state) => {
        const safeIds = Array.isArray(itemIds)
          ? itemIds.filter((id) => {
              const item = typeof id === 'string' ? getDripItem(id) : undefined;
              return Boolean(item && !item.prestige);
            })
          : [];
        if (!safeIds.length) return state;
        const evidence = dripEvidenceFrom({
          quests: state.quests,
          caper: state.caper,
          progression: state.progression,
          juiceClubCustomersServed: state.juiceClubCustomersServed,
          friends: state.friends,
        });
        const dripOwned = normalizeDripOwned([...state.dripOwned, ...safeIds], evidence);
        return { dripOwned };
      }),
      equipDripItem: (itemId) => {
        let changed = false;
        set((state) => {
          const item = getDripItem(itemId);
          if (!item || !state.dripOwned.includes(itemId)) return state;
          if (state.dripEquipped[item.category] === itemId) return state;
          changed = true;
          return {
            dripEquipped: normalizeDripEquipped(
              { ...state.dripEquipped, [item.category]: itemId },
              state.dripOwned,
            ),
          };
        });
        return changed;
      },
      unequipDripCategory: (category) => set((state) => {
        if (!state.dripEquipped[category]) return state;
        const next = { ...state.dripEquipped };
        delete next[category];
        return { dripEquipped: next };
      }),
      markTidyTutorialSeen: () => set((state) => (
        state.tidyTutorialSeen ? state : { tidyTutorialSeen: true }
      )),
      completeTidyToy: (item) => {
        let changed = false;
        set((state) => {
          const objectiveByItem: Record<string, [string, string]> = {
            'blue-block': ['collect-blue-block', 'place-blue-block'],
            'red-block': ['collect-red-block', 'place-red-block'],
            'yellow-block': ['collect-yellow-block', 'place-yellow-block'],
          };
          const pair = objectiveByItem[item];
          const quest = state.quests['rainbow-tidy-up'];
          if (!pair || !quest || quest.currentObjectiveId !== pair[1] || !state.inventory.includes(item)) return state;
          const nextQuests = advanceObjective(state.quests, 'rainbow-tidy-up', pair[1]);
          // advanceObjective now resets the repeatable itself, so the round is
          // detected by the completion counter rather than by a 'complete'
          // status that no longer appears.
          const completedRound = roundWasCompleted(state.quests, nextQuests, 'rainbow-tidy-up');
          const tokenReward = 2 * getOptionalRewardMultiplier(state.optionalRewardBoostUntil);
          const nextProgression = completedRound
            ? withQualifiedRoutes({
                ...state.progression,
                tokens: Math.min(MAX_TOKENS, state.progression.tokens + tokenReward),
                reputation: Math.min(MAX_REPUTATION, state.progression.reputation + monetizedReputation(2)),
                trustedHelperPass: true,
                activityRuns: {
                  ...state.progression.activityRuns,
                  'rainbow-tidy-up': Math.min(
                    MAX_ACTIVITY_RUNS,
                    (state.progression.activityRuns['rainbow-tidy-up'] ?? 0) + 1,
                  ),
                },
                activityRewards: {
                  ...state.progression.activityRewards,
                  'rainbow-tidy-up': Math.min(
                    MAX_TOKENS,
                    (state.progression.activityRewards['rainbow-tidy-up'] ?? 0) + tokenReward,
                  ),
                },
              })
            : state.progression;
          changed = true;
          return {
            inventory: state.inventory.filter((inventoryItem) => inventoryItem !== item),
            tidyPlacedItems: [...state.tidyPlacedItems.filter((placedItem) => placedItem !== item), item].slice(-3),
            quests: nextQuests,
            progression: nextProgression,
            rivalStory: completedRound
              ? recordRainbowStoryMilestone(state.rivalStory)
              : state.rivalStory,
            rewardEvents: completedRound
              ? appendRewardEvent(state.rewardEvents, {
                  id: `rainbow-tidy-${(state.progression.activityRuns['rainbow-tidy-up'] ?? 0) + 1}`,
                  title: 'Rainbow Tidy-Up!',
                  detail: 'A fresh round is ready',
                  tokens: tokenReward,
                  reputation: monetizedReputation(2),
                  sticker: 'Rainbow Ribbon',
                })
              : state.rewardEvents,
          };
        });
        return changed;
      },
      /**
       * Buys supplies. Prices and amounts are authored HERE and the caller's
       * `cost` and `amount` arguments are deliberately ignored, so a forged
       * call cannot mint free stock.
       *
       * `supplies` restocks BOTH juice and crackers, and it exists because its
       * absence was a soft-lock. The Journal's only restock button is labelled
       * "Restock (5 Juice & Crackers) - $2" but called buyStock('juice'), which
       * added juice alone. serveCustomer requires juice AND crackers, and no
       * code path anywhere restocked crackers. So a player who ran both to zero
       * paid $2, watched juice refill, still could not serve anyone, and could
       * repeat that until the cash ran out - at which point the Juice Club was
       * dead for the rest of that save. That is the "I restocked and it did not
       * register" bug: the purchase registered perfectly, it just bought half
       * of what the button promised.
       */
      buyStock: (type) => set((state) => {
        const purchases = {
          juice: { cost: 2, juice: 5, cracker: 0 },
          cracker: { cost: 2, juice: 0, cracker: 5 },
          supplies: { cost: 2, juice: 5, cracker: 5 },
        } as const;
        const purchase = purchases[type as keyof typeof purchases];
        if (!purchase) return state;
        if (state.juiceClubCash < purchase.cost) return state;

        const juiceStock = Math.min(MAX_STOCK, state.juiceStock + purchase.juice);
        const crackerStock = Math.min(MAX_STOCK, state.crackerStock + purchase.cracker);

        // Already full: charging for stock we cannot add is taking money for
        // nothing, and it is how a player ends up broke and still unable to
        // serve.
        if (juiceStock === state.juiceStock && crackerStock === state.crackerStock) return state;

        return {
          juiceClubCash: state.juiceClubCash - purchase.cost,
          juiceStock,
          crackerStock,
        };
      }),

      buyUpgrade: (id) => set((state) => {
        const cost = id === 'premium-cups' ? 10 : null;
        if (cost !== null && state.juiceClubCash >= cost && !state.juiceUpgrades.includes(id)) {
          return {
            juiceClubCash: state.juiceClubCash - cost,
            juiceUpgrades: [...state.juiceUpgrades, id]
          };
        }
        return state;
      }),

      addWaitingCustomer: (id) => set((state) => {
        if (
          state.schedule === 'juice-club'
          && state.zone === 'hub'
          && JUICE_CLUB_CUSTOMERS.has(id)
          && !state.waitingCustomers.includes(id)
          && state.juiceClubServedCustomer !== id
          && state.juiceClubActiveCustomer !== id
        ) {
          const waitingCustomers = [...state.waitingCustomers, id];
          return state.juiceClubCustomerPhase === 'idle'
            ? { waitingCustomers, juiceClubActiveCustomer: id, juiceClubCustomerPhase: 'entry' }
            : { waitingCustomers };
        }
        return state;
      }),

      removeWaitingCustomer: (id) => set((state) => {
        if (!JUICE_CLUB_CUSTOMERS.has(id)) return state;
        const waitingCustomers = state.waitingCustomers.filter((customer) => customer !== id);
        return state.juiceClubActiveCustomer === id
          ? { waitingCustomers, ...nextJuiceClubCustomerState(waitingCustomers) }
          : { waitingCustomers };
      }),
      
      serveCustomer: () => set((state) => {
        // Need 1 juice and 1 cracker minimum, and a waiting customer
        if (
          state.schedule === 'juice-club'
          && state.zone === 'hub'
          && state.juiceStock > 0
          && state.crackerStock > 0
          && state.waitingCustomers.length > 0
          && state.juiceClubActiveCustomer === state.waitingCustomers[0]
          && state.juiceClubCustomerPhase === 'ordering'
        ) {
          const premiumMultiplier = state.juiceUpgrades.includes('premium-cups') ? 2 : 1;
          const cashEarned = 2 * premiumMultiplier;
          const servedId = state.waitingCustomers[0];
          const friend = state.friends[servedId];
          if (!JUICE_CLUB_CUSTOMERS.has(servedId) || !friend) return state;
          const reward = ACTIVITY_DEFINITIONS['juice-club-service'];
          const tokenReward = reward.tokenReward * getOptionalRewardMultiplier(state.optionalRewardBoostUntil);
          const progression = withQualifiedRoutes({
            ...state.progression,
            reputation: Math.min(MAX_REPUTATION, state.progression.reputation + monetizedReputation(reward.reputationReward)),
            tokens: Math.min(MAX_TOKENS, state.progression.tokens + tokenReward),
            activityRuns: {
              ...state.progression.activityRuns,
              'juice-club-service': Math.min(
                MAX_ACTIVITY_RUNS,
                (state.progression.activityRuns['juice-club-service'] ?? 0) + 1,
              ),
            },
            activityRewards: {
              ...state.progression.activityRewards,
              'juice-club-service': Math.min(
                MAX_TOKENS,
                  (state.progression.activityRewards['juice-club-service'] ?? 0) + tokenReward,
              ),
            },
          });
          
          return {
            juiceStock: state.juiceStock - 1,
            crackerStock: state.crackerStock - 1,
            juiceClubCash: Math.min(MAX_CASH, state.juiceClubCash + cashEarned),
            juiceClubCustomersServed: Math.min(
              MAX_CUSTOMERS_SERVED,
              state.juiceClubCustomersServed + 1,
            ),
            waitingCustomers: state.waitingCustomers.slice(1),
            juiceClubServedCustomer: servedId,
            juiceClubActiveCustomer: servedId,
            juiceClubCustomerPhase: 'service',
            progression,
            rewardEvents: appendRewardEvent(state.rewardEvents, {
              id: `juice-service-${state.juiceClubCustomersServed + 1}`,
              title: 'Happy customer!',
              detail: `${servedId} loved the snack`,
              tokens: tokenReward,
              reputation: monetizedReputation(reward.reputationReward),
            }),
            friends: {
              ...state.friends,
              [servedId]: {
                ...friend,
                friendship: Math.min(100, friend.friendship + 5),
                recentMemory: 'Loved the juice!'
              }
            }
          };
        }
        return state;
      }),
      clearJuiceClubServedCustomer: () => set((state) => ({
        juiceClubServedCustomer: null,
        juiceClubCustomerPhase: state.juiceClubActiveCustomer ? 'departure' : state.juiceClubCustomerPhase,
      })),
      advanceJuiceClubCustomer: () => set((state) => {
        const phase = state.juiceClubCustomerPhase;
        if (phase === 'drink') return { juiceClubCustomerPhase: 'reaction' };
        if (phase === 'reaction') return { juiceClubServedCustomer: null, juiceClubCustomerPhase: 'departure' };
        return state;
      }),
      reportJuiceClubArrival: (customer, phase) => set((state) => {
        if (
          !JUICE_CLUB_CUSTOMERS.has(customer)
          || !JUICE_CLUB_PHASES.has(phase)
          || state.juiceClubActiveCustomer !== customer
          || state.juiceClubCustomerPhase !== phase
        ) return state;
        if (phase === 'entry') return { juiceClubCustomerPhase: 'queue' };
        if (phase === 'queue') return { juiceClubCustomerPhase: 'ordering' };
        if (phase === 'service') return { juiceClubCustomerPhase: 'drink' };
        if (phase === 'departure') return nextJuiceClubCustomerState(state.waitingCustomers);
        return state;
      }),
      resetJuiceClubCustomer: () => set((state) => resetJuiceClubCustomerState(state)),
      
      setActiveInteractable: (id) => set((state) => ({
        activeInteractable: state.activeDialogue || state.journalOpen || state.zoneTransitioning ? null : id,
      })),
      setActiveDialogue: (dialogue) => set({
        activeDialogue: dialogue,
        activeInteractable: null,
        ambientMessage: null,
      }),
      toggleJournal: () => set((state) => {
        const journalOpen = !state.journalOpen;
        if (journalOpen) resetTouchInput();
        return { journalOpen, activeInteractable: null };
      }),
      cycleTricycleColor: () => set((state) => ({ tricycleColorIndex: (state.tricycleColorIndex + 1) % 4 })),
      triggerTeleport: () => set((state) => ({
        teleportTrigger: state.teleportTrigger + 1,
        playerPosition: state.zone === 'garden' ? GARDEN_SPAWN : [0, 0, 0],
        hubPosition: state.zone === 'hub' ? [0, 0, 0] : state.hubPosition,
        gardenPosition: state.zone === 'garden' ? GARDEN_SPAWN : state.gardenPosition,
      })),
      completeActivity: (activityId, _requestedTokens, _requestedReputation, bed = 0) => set((state) => {
        const definition = ACTIVITY_DEFINITIONS[activityId as keyof typeof ACTIVITY_DEFINITIONS];
        const plantingStep = bed === 0 ? state.gardenActivityStep : state.expansion.secondPlantingStep;
        if (
          !definition
          || activityId !== 'garden-planting'
          || state.zone !== 'garden'
          || state.zoneTransitioning
          || plantingStep !== 3
          || state.expansion.seedPackets < 3
        ) return state;
        const nextRuns = {
          ...state.progression.activityRuns,
          [activityId]: Math.min(
            MAX_ACTIVITY_RUNS,
            (state.progression.activityRuns[activityId] ?? 0) + 1,
          ),
        };
        const tokenReward = definition.tokenReward * getOptionalRewardMultiplier(state.optionalRewardBoostUntil);
        const nextRewards = {
          ...state.progression.activityRewards,
          [activityId]: Math.min(
            MAX_TOKENS,
            (state.progression.activityRewards[activityId] ?? 0) + tokenReward,
          ),
        };
        const nextProgression: ProgressionState = withExperience({
          ...state.progression,
          version: PROGRESSION_VERSION,
          tokens: Math.min(MAX_TOKENS, state.progression.tokens + tokenReward),
          reputation: Math.min(MAX_REPUTATION, state.progression.reputation + monetizedReputation(definition.reputationReward)),
          activityRuns: nextRuns,
          activityRewards: nextRewards,
        }, PLANTING_XP);
        const expansion = {
          ...state.expansion,
          seedPackets: state.expansion.seedPackets - 3,
          secondPlantingStep: bed === 1 ? 4 : state.expansion.secondPlantingStep,
        };
        return {
          progression: withQualifiedRoutes(nextProgression),
          gardenActivityStep: bed === 0 ? 4 : state.gardenActivityStep,
          expansion,
          rivalStory: recordGardenStoryMilestone(state.rivalStory),
          rewardEvents: appendRewardEvent(state.rewardEvents, {
            id: `garden-planting-${nextRuns[activityId]}`,
            title: 'Planting Complete! +12 XP',
            detail: `Garden bed ${bed + 1} has three fresh seedlings`,
            tokens: tokenReward,
            reputation: monetizedReputation(definition.reputationReward),
            sticker: 'Garden Helper',
          }),
        };
      }),
      startGardenActivity: (bed = 0) => {
        let changed = false;
        set((state) => {
          const step = bed === 0 ? state.gardenActivityStep : state.expansion.secondPlantingStep;
          if (state.zone !== 'garden' || state.zoneTransitioning || step !== 0 || state.expansion.seedPackets < 3) return state;
          changed = true;
          return bed === 0
            ? { gardenActivityStep: 1 }
            : { expansion: { ...state.expansion, secondPlantingStep: 1 } };
        });
        return changed;
      },
      advanceGardenActivity: (bed = 0) => {
        let nextStep = 0;
        set((state) => {
          const step = bed === 0 ? state.gardenActivityStep : state.expansion.secondPlantingStep;
          if (state.zone !== 'garden' || state.zoneTransitioning || step < 1 || step >= 3) {
            nextStep = step;
            return state;
          }
          nextStep = step + 1;
          return bed === 0
            ? { gardenActivityStep: nextStep }
            : { expansion: { ...state.expansion, secondPlantingStep: nextStep } };
        });
        return nextStep;
      },
      resetGardenActivity: (bed = 0) => set((state) => bed === 0
        ? { gardenActivityStep: 0 }
        : { expansion: { ...state.expansion, secondPlantingStep: 0 } }),
      plantGummyDrops: (bed = 0) => {
        let changed = false;
        set((state) => {
          const crop = bed === 0 ? state.gummyCrop : state.gummyCrop2;
          if (state.zone !== 'garden' || crop.plantedAt !== null) return state;
          changed = true;
          const next = { ...crop, plantedAt: absoluteGameMinute(state.dayNumber, state.clock.minute) };
          return bed === 0 ? { gummyCrop: next } : { gummyCrop2: next };
        });
        return changed;
      },
      harvestGummyDrops: (bed = 0) => {
        let changed = false;
        set((state) => {
          const now = absoluteGameMinute(state.dayNumber, state.clock.minute);
          const crop = bed === 0 ? state.gummyCrop : state.gummyCrop2;
          if (state.zone !== 'garden' || !cropIsReady(crop, now)) return state;
          changed = true;
          const next = { plantedAt: null, gummyDrops: Math.min(999, crop.gummyDrops + GUMMY_HARVEST_SIZE), harvests: crop.harvests + 1 };
          return bed === 0 ? { gummyCrop: next } : { gummyCrop2: next };
        });
        return changed;
      },
      eatGummyDrop: (bed = 0) => {
        let changed = false;
        set((state) => {
          const crop = bed === 0 ? state.gummyCrop : state.gummyCrop2;
          if (crop.gummyDrops < 1) return state;
          changed = true;
          const next = { ...crop, gummyDrops: crop.gummyDrops - 1 };
          return { ...(bed === 0 ? { gummyCrop: next } : { gummyCrop2: next }), progression: withQualifiedRoutes({ ...state.progression, reputation: Math.min(MAX_REPUTATION, state.progression.reputation + monetizedReputation(1)) }) };
        });
        return changed;
      },
      feedGummyDrop: (bed = 0) => {
        let changed = false;
        set((state) => {
          const crop = bed === 0 ? state.gummyCrop : state.gummyCrop2;
          if (crop.gummyDrops < 1) return state;
          changed = true;
          const next = { ...crop, gummyDrops: crop.gummyDrops - 1 };
          return { ...(bed === 0 ? { gummyCrop: next } : { gummyCrop2: next }), juiceClubCash: Math.min(MAX_CASH, state.juiceClubCash + GUMMY_UNIT_CASH), progression: withQualifiedRoutes({ ...state.progression, reputation: Math.min(MAX_REPUTATION, state.progression.reputation + monetizedReputation(2)) }) };
        });
        return changed;
      },
      sellGummyCrop: (bed = 0) => {
        let changed = false;
        set((state) => {
          const crop = bed === 0 ? state.gummyCrop : state.gummyCrop2;
          if (crop.gummyDrops < GUMMY_HARVEST_SIZE) return state;
          changed = true;
          const next = { ...crop, gummyDrops: crop.gummyDrops - GUMMY_HARVEST_SIZE };
          const sale = Math.round(GUMMY_FULL_CROP_CASH * seedValueMultiplier(state.expansion.seedQuality));
          return { ...(bed === 0 ? { gummyCrop: next } : { gummyCrop2: next }), juiceClubCash: Math.min(MAX_CASH, state.juiceClubCash + sale), progression: withQualifiedRoutes({ ...state.progression, reputation: Math.min(MAX_REPUTATION, state.progression.reputation + monetizedReputation(5)) }) };
        });
        return changed;
      },
      castFishingLine: () => {
        let changed = false;
        set((state) => {
          if (state.zone !== 'garden' || state.expansion.fishingCastReady) return state;
          changed = true;
          return { expansion: { ...state.expansion, fishingCastReady: true } };
        });
        return changed;
      },
      catchSwedishFish: () => {
        let changed = false;
        set((state) => {
          if (state.zone !== 'garden' || !state.expansion.fishingCastReady) return state;
          changed = true;
          return {
            progression: withExperience(state.progression, FISH_CATCH_XP),
            expansion: { ...state.expansion, fishingCastReady: false, fishingCatchSerial: state.expansion.fishingCatchSerial + 1, swedishFish: Math.min(999, state.expansion.swedishFish + 1) },
            rewardEvents: appendRewardEvent(state.rewardEvents, { id: `fish-catch-${state.dayNumber}-${state.clock.minute}-${state.expansion.swedishFish}`, title: 'Swedish Fish caught! +1 XP', detail: 'Added to Backpack Items', tokens: 0, reputation: 0 }),
          };
        });
        return changed;
      },
      sellSwedishFish: () => {
        let changed = false;
        set((state) => {
          if (state.expansion.swedishFish < 1) return state;
          changed = true;
          return {
            juiceClubCash: Math.min(MAX_CASH, state.juiceClubCash + FISH_SALE_CASH),
            progression: withExperience(state.progression, FISH_SALE_XP),
            expansion: { ...state.expansion, swedishFish: state.expansion.swedishFish - 1 },
            rewardEvents: appendRewardEvent(state.rewardEvents, { id: `fish-sale-${state.dayNumber}-${state.clock.minute}-${state.expansion.swedishFish}`, title: 'Swedish Fish sold! +$5 · +2 XP', detail: 'One fish left the backpack', tokens: 0, reputation: 0 }),
          };
        });
        return changed;
      },
      purchaseFishingRod: (color) => {
        let changed = false;
        set((state) => {
          if (!FISHING_RODS.includes(color) || state.expansion.ownedRods.includes(color) || state.juiceClubCash < 8) return state;
          changed = true;
          return { juiceClubCash: state.juiceClubCash - 8, expansion: { ...state.expansion, ownedRods: [...state.expansion.ownedRods, color] } };
        });
        return changed;
      },
      equipFishingRod: (color) => {
        let changed = false;
        set((state) => {
          if (!FISHING_RODS.includes(color) || !state.expansion.ownedRods.includes(color) || state.expansion.equippedRod === color) return state;
          changed = true;
          return { expansion: { ...state.expansion, equippedRod: color } };
        });
        return changed;
      },
      inspectSeed: (success) => {
        let result: 'upgraded' | 'failed' | 'already-inspected' | 'max-tier' = 'failed';
        set((state) => {
          if (state.expansion.seedInspectionDay === state.dayNumber) { result = 'already-inspected'; return state; }
          const next = nextSeedQuality(state.expansion.seedQuality);
          if (next === state.expansion.seedQuality) { result = 'max-tier'; return { expansion: { ...state.expansion, seedInspectionDay: state.dayNumber } }; }
          result = success ? 'upgraded' : 'failed';
          return { expansion: { ...state.expansion, seedInspectionDay: state.dayNumber, seedQuality: success ? next : state.expansion.seedQuality } };
        });
        return result;
      },
      completeArtActivity: () => {
        let changed = false;
        set((state) => {
          if (state.schedule !== 'art-time' || state.expansion.artCompletedDays.includes(state.dayNumber)) return state;
          changed = true;
          const attendance = { ...state.expansion.attendance, 'art-time': { ...state.expansion.attendance['art-time'], completed: true } };
          return {
            juiceClubCash: Math.min(MAX_CASH, state.juiceClubCash + ART_CASH),
            progression: withExperience(state.progression, ART_XP),
            expansion: { ...state.expansion, attendance, artCompletedDays: [...state.expansion.artCompletedDays, state.dayNumber].slice(-60) },
            rewardEvents: appendRewardEvent(state.rewardEvents, { id: `art-${state.dayNumber}`, title: 'Art complete! +20 XP · +$20', detail: 'The color pattern matches', tokens: 0, reputation: 0, sticker: 'Art Star' }),
          };
        });
        return changed;
      },
      completeShowAndTell: () => {
        let changed = false;
        set((state) => {
          const hasItem = state.inventory.length > 0 || state.collectibles.length > 0 || state.expansion.swedishFish > 0 || state.expansion.seedPackets > 0;
          if (state.schedule !== 'show-and-tell' || !hasItem || state.expansion.showTellCompletedDays.includes(state.dayNumber)) return state;
          changed = true;
          const attendance = { ...state.expansion.attendance, 'show-and-tell': { ...state.expansion.attendance['show-and-tell'], completed: true } };
          return {
            progression: withExperience({ ...state.progression, reputation: Math.min(MAX_REPUTATION, state.progression.reputation + monetizedReputation(2)) }, 8),
            expansion: { ...state.expansion, attendance, showTellCompletedDays: [...state.expansion.showTellCompletedDays, state.dayNumber].slice(-60) },
            rewardEvents: appendRewardEvent(state.rewardEvents, { id: `show-tell-${state.dayNumber}`, title: 'Show & Tell complete! +8 XP · +2 REP', detail: 'The whole circle reacted', tokens: 0, reputation: monetizedReputation(2), sticker: 'Great Presenter' }),
          };
        });
        return changed;
      },
      takeAfternoonSnack: () => {
        let changed = false;
        set((state) => {
          const open = state.clock.minute >= 16 * 60 + 30 && state.clock.minute < 17 * 60;
          if (!open || state.juiceStock < 1 || state.crackerStock < 1 || state.expansion.afternoonSnackDays.includes(state.dayNumber)) return state;
          changed = true;
          return {
            juiceStock: state.juiceStock - 1,
            crackerStock: state.crackerStock - 1,
            progression: withExperience(state.progression, 2),
            expansion: { ...state.expansion, afternoonSnackDays: [...state.expansion.afternoonSnackDays, state.dayNumber].slice(-60) },
            rewardEvents: appendRewardEvent(state.rewardEvents, { id: `afternoon-snack-${state.dayNumber}`, title: 'Juice + Crackers! +2 XP', detail: 'Afternoon snack served', tokens: 0, reputation: 0 }),
          };
        });
        return changed;
      },
      recordAttendance: (activity, seconds) => set((state) => {
        if (state.schedule !== activity || state.expansion.attendanceDay !== state.dayNumber) return state;
        const current = state.expansion.attendance[activity];
        return { expansion: { ...state.expansion, attendance: { ...state.expansion.attendance, [activity]: { ...current, seconds: Math.min(600, current.seconds + Math.max(0, seconds)) } } } };
      }),
      dismissDayReport: () => set((state) => ({ expansion: { ...state.expansion, lastDayReport: null } })),
      rotateExpansionContent: () => set((state) => {
        const absoluteMinute = absoluteGameMinute(state.dayNumber, state.clock.minute);
        let expansion = state.expansion;
        if (expansion.rotationDay !== state.dayNumber) expansion = { ...expansion, rotationDay: state.dayNumber, activeCollectibles: collectibleRotation(state.dayNumber) };
        if (expansion.dailyHeistDay !== state.dayNumber) {
          const nextHeist = heistForDay(state.dayNumber, expansion.dailyHeist);
          expansion = { ...expansion, dailyHeistDay: state.dayNumber, previousHeist: expansion.dailyHeist, dailyHeist: nextHeist, techHeistStep: 'idle' };
        }
        if (!expansion.lostFoundJob && absoluteMinute >= expansion.lostFoundNextMinute) {
          expansion = { ...expansion, lostFoundJob: createLostFoundJob(state.dayNumber, absoluteMinute, expansion.lostFoundCompleted), lostFoundNextMinute: absoluteMinute + LOST_FOUND_INTERVAL_MINUTES };
        }
        return expansion === state.expansion ? state : { expansion };
      }),
      collectExpansionCollectible: (id) => {
        let changed = false;
        set((state) => {
          if (!state.expansion.activeCollectibles.includes(id) || state.expansion.foundCollectibles.includes(id)) return state;
          changed = true;
          const foundCollectibles = [...state.expansion.foundCollectibles, id];
          const rotationComplete = state.expansion.activeCollectibles.every((active) => foundCollectibles.includes(active));
          return {
            progression: withExperience(state.progression, rotationComplete ? 50 : 5),
            expansion: { ...state.expansion, foundCollectibles },
            rewardEvents: appendRewardEvent(state.rewardEvents, { id: `collectible-${id}`, title: rotationComplete ? 'Collectible Hunt complete! +50 XP' : 'Collectible found! +5 XP', detail: id.replaceAll('-', ' '), tokens: 0, reputation: 0, sticker: rotationComplete ? 'Treasure Tracker' : undefined }),
          };
        });
        return changed;
      },
      acceptLostFoundJob: () => {
        let changed = false;
        set((state) => {
          const job = state.expansion.lostFoundJob;
          if (!job || job.status !== 'available') return state;
          changed = true;
          return { expansion: { ...state.expansion, lostFoundJob: { ...job, status: 'accepted' } } };
        });
        return changed;
      },
      collectLostFoundItem: () => {
        let changed = false;
        set((state) => {
          const job = state.expansion.lostFoundJob;
          if (!job || job.status !== 'accepted' || job.zone !== state.zone) return state;
          changed = true;
          return { expansion: { ...state.expansion, lostFoundJob: { ...job, status: 'found' } }, rewardEvents: appendRewardEvent(state.rewardEvents, { id: `lost-found-pickup-${job.id}`, title: `${job.label} found!`, detail: 'Return it to the Lost & Found Desk', tokens: 0, reputation: 0 }) };
        });
        return changed;
      },
      turnInLostFoundJob: () => {
        let changed = false;
        set((state) => {
          const job = state.expansion.lostFoundJob;
          if (!job || job.status !== 'found' || state.zone !== 'hub') return state;
          const juiceBoost = state.schedule === 'juice-club' || (state.clock.minute >= 16 * 60 + 30 && state.clock.minute < 17 * 60);
          const reward = lostFoundReward(job.rewardSeed, juiceBoost);
          changed = true;
          return {
            juiceClubCash: Math.min(MAX_CASH, state.juiceClubCash + reward.cash),
            progression: withExperience(state.progression, reward.xp),
            expansion: { ...state.expansion, lostFoundJob: null, lostFoundCompleted: state.expansion.lostFoundCompleted + 1, lostFoundNextMinute: absoluteGameMinute(state.dayNumber, state.clock.minute) + LOST_FOUND_INTERVAL_MINUTES },
            rewardEvents: appendRewardEvent(state.rewardEvents, { id: `lost-found-return-${job.id}`, title: `Lost & Found ${reward.tier}! +${reward.xp} XP${reward.cash ? ` · +$${reward.cash}` : ''}`, detail: `${job.label} returned safely`, tokens: 0, reputation: 0 }),
          };
        });
        return changed;
      },
      advanceTechHeist: () => {
        let changed = false;
        set((state) => {
          if (state.expansion.dailyHeist !== 'tech-stash' || state.expansion.techHeistStep === 'complete') return state;
          const next = state.expansion.techHeistStep === 'idle' ? 'diversion' : state.expansion.techHeistStep === 'diversion' ? 'retrieve' : 'complete';
          changed = true;
          return {
            progression: next === 'complete' ? withExperience(state.progression, 35) : state.progression,
            expansion: { ...state.expansion, techHeistStep: next, techTokens: next === 'complete' ? state.expansion.techTokens + 1 : state.expansion.techTokens },
            rewardEvents: next === 'complete' ? appendRewardEvent(state.rewardEvents, { id: `tech-heist-${state.dayNumber}`, title: 'Pocket Robot recovered! +35 XP', detail: 'Tech Market diversion complete', tokens: 0, reputation: 0, sticker: 'Tiny Hacker' }) : state.rewardEvents,
          };
        });
        return changed;
      },
      setAmbientMessage: (ambientMessage) => set((state) => (
        state.zone !== 'hub' || state.activeDialogue || state.journalOpen || state.zoneTransitioning
          ? { ambientMessage: null }
          : { ambientMessage }
      )),
      showInstruction: (instruction) => {
        let changed = false;
        set((state) => {
          const id = instruction.id.trim().slice(0, 80);
          const text = instruction.text.trim().slice(0, 240);
          if (!id || !text || state.recentInstructions.some((entry) => entry.id === id)) return state;
          const next = { id, text, shownAt: instruction.shownAt ?? Date.now() };
          changed = true;
          return {
            activeInstruction: next,
            recentInstructions: [next, ...state.recentInstructions.filter((entry) => entry.id !== id)].slice(0, 3),
            ambientMessage: null,
          };
        });
        return changed;
      },
      dismissInstruction: () => set((state) => (
        state.activeInstruction ? { activeInstruction: null } : state
      )),
      chooseRivalResponse: (choice) => {
        let changed = false;
        set((state) => {
          if (choice !== 'kind' && choice !== 'bold' && choice !== 'curious') return state;
          const rivalStory = chooseMaeIntroduction(state.rivalStory, choice);
          if (rivalStory === state.rivalStory) return state;
          changed = true;
          return {
            rivalStory,
            rewardEvents: appendRewardEvent(state.rewardEvents, {
              id: 'rival-mae-note',
              title: 'Story clue found',
              detail: 'Mae’s folded plan is now in your Journal',
              tokens: 0,
              reputation: 0,
              sticker: 'Mae’s Plan',
            }),
          };
        });
        return changed;
      },
      resolveRivalStory: () => {
        let changed = false;
        set((state) => {
          const rivalStory = resolveMaeStory(state.rivalStory);
          if (rivalStory === state.rivalStory) return state;
          changed = true;
          const progression = withQualifiedRoutes({
            ...state.progression,
            tokens: Math.min(MAX_TOKENS, state.progression.tokens + 5),
            reputation: Math.min(MAX_REPUTATION, state.progression.reputation + monetizedReputation(4)),
          });
          return {
            rivalStory,
            progression,
            friends: {
              ...state.friends,
              Mae: {
                ...state.friends.Mae,
                mood: 'happy',
                friendship: Math.min(100, (state.friends.Mae?.friendship ?? 0) + 35),
                recentMemory: 'Built a fair plan together.',
              },
            },
            rewardEvents: appendRewardEvent(state.rewardEvents, {
              id: 'rival-story-complete',
              title: 'Two Stars, One Team!',
              detail: 'Nickname earned: Bridge Builder',
              tokens: 5,
              reputation: monetizedReputation(4),
              sticker: 'Two Stars',
            }),
          };
        });
        return changed;
      },
      dismissRewardEvent: (id) => set((state) => ({
        rewardEvents: state.rewardEvents.filter((event) => event.id !== id),
      })),
      startCaper: () => {
        let changed = false;
        set((state) => {
          const caper = startCaperState(state.caper);
          if (caper === state.caper) return state;
          changed = true;
          return { caper };
        });
        return changed;
      },
      chooseCaperRole: (role) => {
        let changed = false;
        set((state) => {
          const caper = chooseCaperRoleState(state.caper, role);
          if (caper === state.caper) return state;
          changed = true;
          return { caper };
        });
        return changed;
      },
      advanceCaper: () => {
        let changed = false;
        set((state) => {
          const caper = advanceCaperState(state.caper);
          if (caper === state.caper) return state;
          changed = true;
          if (caper.step !== 'complete') return { caper };
          const tokenReward = 3 * getOptionalRewardMultiplier(state.optionalRewardBoostUntil);
          const progression = withQualifiedRoutes({
            ...state.progression,
            tokens: Math.min(MAX_TOKENS, state.progression.tokens + tokenReward),
            reputation: Math.min(MAX_REPUTATION, state.progression.reputation + monetizedReputation(2)),
          });
          return {
            caper,
            progression,
            districtProgress: advanceDistrictPreviewState(state.districtProgress, 'makerMarket'),
            rewardEvents: appendRewardEvent(state.rewardEvents, {
              id: `sticker-parade-${state.caper.attempts}`,
              title: 'Sticker Parade complete!',
              detail: 'Everyone had a safe role in the plan',
              tokens: tokenReward,
              reputation: monetizedReputation(2),
              sticker: 'Kindness Crew',
            }),
          };
        });
        return changed;
      },
      observeCaperPatrol: (now) => {
        let changed = false;
        set((state) => {
          const caper = observeCaperPatrolState(state.caper, now);
          if (caper === state.caper) return state;
          changed = true;
          return { caper };
        });
        return changed;
      },
      completeCaperSafeSetup: () => {
        let changed = false;
        set((state) => {
          const caper = completeCaperSafeSetupState(state.caper);
          if (caper === state.caper) return state;
          changed = true;
          return { caper };
        });
        return changed;
      },
      completeCaperRetrieval: () => {
        let changed = false;
        set((state) => {
          const caper = completeCaperRetrievalState(state.caper);
          if (caper === state.caper) return state;
          changed = true;
          return { caper };
        });
        return changed;
      },
      interruptCaper: () => {
        let changed = false;
        set((state) => {
          const caper = interruptCaperState(state.caper);
          if (caper === state.caper) return state;
          changed = true;
          return {
            caper,
            ambientMessage: 'Ms. Harper pauses the plan, clears the route, and helps everyone reset safely.',
          };
        });
        return changed;
      },
      advanceDistrictPreview: (district) => {
        let changed = false;
        set((state) => {
          const routeId = district === 'makerMarket' ? 'maker-market' : 'storybook-lane';
          if (!getUnlockedRoutes(state.progression).includes(routeId)) return state;
          const next = advanceDistrictPreviewState(state.districtProgress, district);
          if (next === state.districtProgress) return state;
          changed = true;
          return { districtProgress: next };
        });
        return changed;
      },
      activateOptionalRewardBoost: (now) => {
        if (typeof now !== 'number' || !Number.isFinite(now)) return false;
        let changed = false;
        set((state) => {
          if (state.optionalRewardBoostUntil > now) return state;
          changed = true;
          return { optionalRewardBoostUntil: now + OPTIONAL_BOOST_DURATION_MS };
        });
        return changed;
      },
      addProgressionTokens: (amount) => set((state) => {
        if (typeof amount !== 'number' || !Number.isFinite(amount)) return state;
        const progression = withQualifiedRoutes({
          ...state.progression,
          tokens: Math.min(MAX_TOKENS, Math.max(0, state.progression.tokens + Math.floor(amount))),
        });
        return { progression };
      }),
      buyHubUpgrade: (id) => {
        let changed = false;
        set((state) => {
          const cost = id === 'storage-organizer' ? 6 : null;
          if (
            cost === null
            || !(HUB_UPGRADE_IDS as readonly string[]).includes(id)
            || !state.progression.trustedHelperPass
            || state.progression.tokens < cost
            || state.progression.hubUpgrades.includes(id)
          ) return state;
          changed = true;
          return {
            progression: withQualifiedRoutes({
              ...state.progression,
              tokens: state.progression.tokens - cost,
              hubUpgrades: [...state.progression.hubUpgrades, id],
            }),
          };
        });
        return changed;
      },
      setTrustedHelperPass: () => set((state) => ({
        progression: { ...state.progression, trustedHelperPass: true },
      })),
      setPlayerPosition: (position) => set((state) => ({
        ...(Array.isArray(position)
          && position.length === 3
          && position.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
          ? {
              playerPosition: position,
              hubPosition: state.zone === 'hub' ? position : state.hubPosition,
              gardenPosition: state.zone === 'garden' ? position : state.gardenPosition,
              storybookPosition: state.zone === 'storybook' ? position : state.storybookPosition,
            }
          : {}),
      })),
      enterGarden: (tutorialAccess = false) => {
        let changed = false;
        set((state) => {
          if (
            state.zone !== 'hub'
            || state.zoneTransitioning
            || (!getUnlockedRoutes(state.progression).includes('garden-district') && state.schedule !== 'recess' && !tutorialAccess)
          ) return state;
          changed = true;
          const position = currentPosition(state);
          return {
            zoneTransitioning: true,
            pendingZone: 'garden' as GameZone,
            hubPosition: position,
            gardenPosition: GARDEN_SPAWN,
            activeInteractable: null,
            activeDialogue: null,
            ambientMessage: null,
            ...resetJuiceClubCustomerState(state),
          };
        });
        return changed;
      },
      enterStorybookLane: () => {
        let changed = false;
        set((state) => {
          if (
            state.zone !== 'hub'
            || state.zoneTransitioning
            || !storybookIsOpen(state.clock.minute)
            || !getUnlockedRoutes(state.progression).includes('storybook-lane')
          ) return state;
          changed = true;
          useStorybookLaneStore.getState().resetSession();
          return {
            zoneTransitioning: true,
            pendingZone: 'storybook' as GameZone,
            hubPosition: currentPosition(state),
            storybookPosition: STORYBOOK_SPAWN,
            activeInteractable: null,
            activeDialogue: null,
            ambientMessage: null,
            ...resetJuiceClubCustomerState(state),
          };
        });
        return changed;
      },
      leaveStorybookLane: () => {
        let changed = false;
        set((state) => {
          if (state.zone !== 'storybook' || state.zoneTransitioning) return state;
          changed = true;
          useStorybookLaneStore.getState().resetSession();
          return {
            zoneTransitioning: true,
            pendingZone: 'hub' as GameZone,
            storybookPosition: currentPosition(state),
            activeInteractable: null,
            activeDialogue: null,
            ambientMessage: null,
          };
        });
        return changed;
      },
      finishDay: () => {
        let changed = false;
        set((state) => {
          if (state.clock.minute < STORYBOOK_CLOSE_MINUTE) return state;
          changed = true;
          useStorybookLaneStore.getState().resetSession();
          const clock = startNextDay(state.clock);
          return {
            ...closeExpansionDay(state),
            clock,
            timeOfDay: minuteToTimeOfDay(clock.minute),
            dayNumber: state.dayNumber + 1,
            schedule: scheduleIdForMinute(clock.minute),
            zone: 'hub' as GameZone,
            playerPosition: [0, 0, 0] as [number, number, number],
            hubPosition: [0, 0, 0] as [number, number, number],
            storybookPosition: STORYBOOK_SPAWN,
            zoneTransitioning: false,
            pendingZone: null,
            teleportTrigger: state.teleportTrigger + 1,
            gardenActivityStep: 0,
            teacherSuspicion: 0,
            optionalRewardBoostUntil: 0,
            ambientMessage: `Day ${state.dayNumber + 1} is ready. Storybook Lane is tucked in until pickup time.`,
            ...resetJuiceClubCustomerState(state),
          };
        });
        return changed;
      },
      returnToHub: () => {
        let changed = false;
        set((state) => {
          if (state.zone !== 'garden' || state.zoneTransitioning) return state;
          changed = true;
          const position = currentPosition(state);
          return {
            zoneTransitioning: true,
            pendingZone: 'hub' as GameZone,
            gardenPosition: position,
            activeInteractable: null,
            activeDialogue: null,
            ambientMessage: null,
            ...resetJuiceClubCustomerState(state),
          };
        });
        return changed;
      },
      completeZoneTransition: () => set((state) => {
        if (!state.zoneTransitioning || !state.pendingZone) return state;
        const zone = state.pendingZone;
        const position = zone === 'garden' ? state.gardenPosition : zone === 'storybook' ? state.storybookPosition : state.hubPosition;
        resetTouchInput();
        return {
          zone,
          playerPosition: position,
          zoneTransitioning: false,
          pendingZone: null,
          teleportTrigger: state.teleportTrigger + 1,
          activeInteractable: null,
        };
      }),
      resetGame: () => set(initialState),
    }),
    {
      name: 'daykare-save',
      storage: createJSONStorage(() => resilientStorage),
      partialize: serializeGameState,
      version: PROGRESSION_VERSION,
      migrate: (persistedState, storedVersion) => {
        if (storedVersion > PROGRESSION_VERSION) {
          console.warn(
            `DayKare save version ${storedVersion} is newer than supported version ${PROGRESSION_VERSION}; restoring only recognized fields.`,
          );
        }
        return normalizePersistedGameState(persistedState);
      },
      merge: (persistedState, currentState) => {
        return {
          ...currentState,
          ...normalizePersistedGameState(persistedState),
        };
      },
    }
  )
);

reportStorageUnavailable = () => {
  if (!useGameStore.getState().storageWarning) {
    useGameStore.setState({ storageWarning: true });
  }
};
if (storageOperationFailed) reportStorageUnavailable();
