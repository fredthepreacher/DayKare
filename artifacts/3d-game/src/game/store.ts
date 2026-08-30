import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import * as THREE from 'three';
import {
  ACTIVITY_DEFINITIONS,
  HUB_UPGRADE_IDS,
  createInitialProgression,
  getUnlockedRoutes,
  MAX_ACTIVITY_RUNS,
  MAX_TOKENS,
  normalizeProgression,
  PROGRESSION_VERSION,
  type ProgressionState,
} from './progression';
import {
  activateQuest,
  advanceObjective,
  createInitialQuests,
  legacyStatusForQuest,
  normalizeQuestStates,
  resetRepeatableQuest,
  type QuestStates,
} from './quests';
import {
  GARDEN_SPAWN,
  GARDEN_RETURN_SPAWN,
  getTrackedPlayerPosition,
  isWalkable,
  type GameZone,
} from './world';
import { resetTouchInput } from './touchInput';

export type ScheduleState = 'morning-play' | 'art-time' | 'juice-club' | 'outdoor-play' | 'pickup';
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
  quality: 'low' | 'high';

  // Time and Schedule
  timeOfDay: number; // 9.0 to 17.0
  schedule: ScheduleState;
  isRainy: boolean;
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
  zoneTransitioning: boolean;
  pendingZone: GameZone | null;
  gardenActivityStep: number;
  ambientMessage: string | null;
  // This is deliberately session-only: it must never alter the save payload.
  storageWarning: boolean;
  
  // Actions
  setQuality: (q: 'low' | 'high') => void;
  setTimeOfDay: (time: number) => void;
  advanceSchedule: () => void;
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
  
  buyStock: (type: 'juice' | 'cracker', cost: number, amount: number) => void;
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
  completeActivity: (activityId: string, tokenReward: number, reputationReward: number) => void;
  startGardenActivity: () => boolean;
  advanceGardenActivity: () => number;
  resetGardenActivity: () => void;
  setAmbientMessage: (message: string | null) => void;
  addProgressionTokens: (amount: number) => void;
  buyHubUpgrade: (id: string, cost: number) => boolean;
  setTrustedHelperPass: () => void;
  setPlayerPosition: (position: [number, number, number]) => void;
  enterGarden: () => boolean;
  returnToHub: () => boolean;
  completeZoneTransition: () => void;
  resetGame: () => void;
}

const getScheduleForTime = (time: number): ScheduleState => {
  if (time < 10.5) return 'morning-play';
  if (time < 12.0) return 'art-time';
  if (time < 13.5) return 'juice-club';
  if (time < 15.5) return 'outdoor-play';
  return 'pickup';
};

const withQualifiedRoutes = (progression: ProgressionState): ProgressionState => ({
  ...progression,
  routeUnlocks: Array.from(new Set([
    ...progression.routeUnlocks,
    ...getUnlockedRoutes(progression),
  ])),
});

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
};

const initialState = {
  quality: 'high' as const,
  timeOfDay: 9.0,
  schedule: 'morning-play' as ScheduleState,
  isRainy: false,
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
  zoneTransitioning: false,
  pendingZone: null,
  gardenActivityStep: 0,
  ambientMessage: null,
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
  const gardenAuthorized = getUnlockedRoutes(progression).includes('garden-district');
  const requestedZone: GameZone = persisted.zone === 'garden' ? 'garden' : 'hub';
  const zone: GameZone = requestedZone === 'garden' && gardenAuthorized ? 'garden' : 'hub';
  const playerPosition = requestedZone === zone
    ? safePosition(
        persisted.playerPosition,
        zone === 'garden' ? gardenPosition : hubPosition,
        zone,
      )
    : hubPosition;
  return { zone, playerPosition, hubPosition, gardenPosition };
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
    trustedHelperPass: rawProgression.trustedHelperPass === true,
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

export function normalizePersistedGameState(value: unknown) {
  const persisted = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<GameState>
    : {};
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
  const timeOfDay = safeNumber(persisted.timeOfDay, initialState.timeOfDay, 9, 17);
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
    quality: persisted.quality === 'low' || persisted.quality === 'high' ? persisted.quality : initialState.quality,
    timeOfDay,
    schedule,
    isRainy: persisted.isRainy === true,
    isImaginationMode: false,
    inventory,
    // Early builds pre-granted the rock without recording a world pickup. Keep
    // ownership only when the active trade stage and pickup history corroborate
    // each other; every other save should rediscover or have consumed the rock.
    collectibles: shinyRockGenuinelyCollected
      ? normalizedCollectibles
      : normalizedCollectibles.filter((item) => item !== 'Shiny Rock'),
    isRiding: false,
    friends: normalizeFriends(persisted.friends),
    teacherSuspicion: safeNumber(persisted.teacherSuspicion, 0, 0, 100),
    binkyStatus,
    binkyClues: safeStringArray(persisted.binkyClues)
      .filter((clue) => clue.length <= 120)
      .slice(0, MAX_CLUES),
    quests,
    droppedItems,
    tidyPlacedItems: normalizeTidyItems(persisted.tidyPlacedItems),
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
    ambientMessage: null,
  };
}

export function serializeGameState(state: GameState) {
  return {
    quality: state.quality,
    timeOfDay: state.timeOfDay,
    schedule: state.schedule,
    isRainy: state.isRainy,
    inventory: state.inventory,
    collectibles: state.collectibles,
    friends: state.friends,
    teacherSuspicion: state.teacherSuspicion,
    binkyStatus: state.binkyStatus,
    binkyClues: state.binkyClues,
    quests: state.quests,
    droppedItems: state.droppedItems,
    tidyPlacedItems: state.tidyPlacedItems,
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
  };
}

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      ...initialState,
      
      setQuality: (quality) => set({
        quality: quality === 'low' || quality === 'high' ? quality : initialState.quality,
      }),
      setTimeOfDay: (time) => set((state) => {
        const timeOfDay = safeNumber(time, initialState.timeOfDay, 9, 17);
        const schedule = getScheduleForTime(timeOfDay);
        return { timeOfDay, schedule, ...(schedule === 'juice-club' ? {} : resetJuiceClubCustomerState(state)) };
      }),
      
      advanceSchedule: () => set((state) => {
        let nextTime = safeNumber(state.timeOfDay, initialState.timeOfDay, 9, 17) + 1.5;
        if (nextTime > 17.0) nextTime = 9.0;
        const schedule = getScheduleForTime(nextTime);
        return { timeOfDay: nextTime, schedule, ...(schedule === 'juice-club' ? {} : resetJuiceClubCustomerState(state)) };
      }),
      
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
            reputation: Math.min(100, state.progression.reputation + 8),
            tokens: Math.min(MAX_TOKENS, state.progression.tokens + 5),
            trustedHelperPass: true,
          });
          changed = true;
          return {
            binkyStatus: status,
            quests,
            progression,
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
          const completedRound = nextQuests['rainbow-tidy-up'].status === 'complete';
          const nextProgression = completedRound
            ? withQualifiedRoutes({
                ...state.progression,
                tokens: Math.min(MAX_TOKENS, state.progression.tokens + 2),
                reputation: Math.min(100, state.progression.reputation + 2),
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
                    (state.progression.activityRewards['rainbow-tidy-up'] ?? 0) + 2,
                  ),
                },
              })
            : state.progression;
          changed = true;
          return {
            inventory: state.inventory.filter((inventoryItem) => inventoryItem !== item),
            tidyPlacedItems: [...state.tidyPlacedItems.filter((placedItem) => placedItem !== item), item].slice(-3),
            quests: completedRound ? resetRepeatableQuest(nextQuests, 'rainbow-tidy-up') : nextQuests,
            progression: nextProgression,
          };
        });
        return changed;
      },
      buyStock: (type) => set((state) => {
        const purchase = type === 'juice'
          ? { cost: 2, amount: 5 }
          : type === 'cracker'
            ? { cost: 2, amount: 5 }
            : null;
        if (purchase && state.juiceClubCash >= purchase.cost) {
          return {
            juiceClubCash: state.juiceClubCash - purchase.cost,
            juiceStock: type === 'juice'
              ? Math.min(MAX_STOCK, state.juiceStock + purchase.amount)
              : state.juiceStock,
            crackerStock: type === 'cracker'
              ? Math.min(MAX_STOCK, state.crackerStock + purchase.amount)
              : state.crackerStock,
          };
        }
        return state;
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
          const progression = withQualifiedRoutes({
            ...state.progression,
            reputation: Math.min(100, state.progression.reputation + reward.reputationReward),
            tokens: Math.min(MAX_TOKENS, state.progression.tokens + reward.tokenReward),
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
                (state.progression.activityRewards['juice-club-service'] ?? 0) + reward.tokenReward,
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
      completeActivity: (activityId) => set((state) => {
        const definition = ACTIVITY_DEFINITIONS[activityId as keyof typeof ACTIVITY_DEFINITIONS];
        if (
          !definition
          || activityId !== 'garden-planting'
          || state.zone !== 'garden'
          || state.zoneTransitioning
          || state.gardenActivityStep !== 3
        ) return state;
        const nextRuns = {
          ...state.progression.activityRuns,
          [activityId]: Math.min(
            MAX_ACTIVITY_RUNS,
            (state.progression.activityRuns[activityId] ?? 0) + 1,
          ),
        };
        const nextRewards = {
          ...state.progression.activityRewards,
          [activityId]: Math.min(
            MAX_TOKENS,
            (state.progression.activityRewards[activityId] ?? 0) + definition.tokenReward,
          ),
        };
        const nextProgression: ProgressionState = {
          ...state.progression,
          version: PROGRESSION_VERSION,
          tokens: Math.min(MAX_TOKENS, state.progression.tokens + definition.tokenReward),
          reputation: Math.min(100, state.progression.reputation + definition.reputationReward),
          activityRuns: nextRuns,
          activityRewards: nextRewards,
        };
        return {
          progression: withQualifiedRoutes(nextProgression),
          gardenActivityStep: 4,
        };
      }),
      startGardenActivity: () => {
        let changed = false;
        set((state) => {
          if (state.zone !== 'garden' || state.zoneTransitioning || state.gardenActivityStep !== 0) return state;
          changed = true;
          return { gardenActivityStep: 1 };
        });
        return changed;
      },
      advanceGardenActivity: () => {
        let nextStep = 0;
        set((state) => {
          if (state.zone !== 'garden' || state.zoneTransitioning || state.gardenActivityStep < 1 || state.gardenActivityStep >= 3) {
            nextStep = state.gardenActivityStep;
            return state;
          }
          nextStep = state.gardenActivityStep + 1;
          return { gardenActivityStep: nextStep };
        });
        return nextStep;
      },
      resetGardenActivity: () => set({ gardenActivityStep: 0 }),
      setAmbientMessage: (ambientMessage) => set((state) => (
        state.zone !== 'hub' || state.activeDialogue || state.journalOpen || state.zoneTransitioning
          ? { ambientMessage: null }
          : { ambientMessage }
      )),
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
            }
          : {}),
      })),
      enterGarden: () => {
        let changed = false;
        set((state) => {
          if (
            state.zone !== 'hub'
            || state.zoneTransitioning
            || !getUnlockedRoutes(state.progression).includes('garden-district')
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
        const position = zone === 'garden' ? state.gardenPosition : state.hubPosition;
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