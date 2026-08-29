import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createInitialProgression,
  getUnlockedRoutes,
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
import { getTrackedPlayerPosition } from './world';

export type ScheduleState = 'morning-play' | 'art-time' | 'juice-club' | 'outdoor-play' | 'pickup';
export type BinkyStatus = 'not-started' | 'talked-to-owner' | 'found-clue' | 'traded-info' | 'found' | 'returned-good' | 'returned-bad';

export interface FriendState {
  mood: 'happy' | 'sad' | 'curious' | 'grumpy' | 'excited';
  friendship: number; // 0 to 100
  recentMemory: string;
}

export interface DroppedWorldItem {
  id: string;
  item: string;
  position: [number, number, number];
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
  
  // Interaction & UI
  activeInteractable: string | null;
  activeDialogue: { name: string; text: string; options?: { label: string; action: () => void }[] } | null;
  journalOpen: boolean;
  tricycleColorIndex: number;
  teleportTrigger: number;
  progression: ProgressionState;
  
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
  setIsRiding: (r: boolean) => void;
  
  updateFriend: (name: string, updates: Partial<FriendState>) => void;
  setTeacherSuspicion: (s: number | ((prev: number) => number)) => void;

  updateBinkyStatus: (status: BinkyStatus) => void;
  addClue: (clue: string) => void;
  advanceQuestObjective: (questId: string, objectiveId: string) => boolean;
  completeTidyToy: (item: string) => boolean;
  
  buyStock: (type: 'juice' | 'cracker', cost: number, amount: number) => void;
  buyUpgrade: (id: string, cost: number) => void;
  addWaitingCustomer: (id: string) => void;
  removeWaitingCustomer: (id: string) => void;
  serveCustomer: () => void;
  
  setActiveInteractable: (id: string | null) => void;
  setActiveDialogue: (dialogue: GameState['activeDialogue']) => void;
  toggleJournal: () => void;
  cycleTricycleColor: () => void;
  triggerTeleport: () => void;
  completeActivity: (activityId: string, tokenReward: number, reputationReward: number) => void;
  addProgressionTokens: (amount: number) => void;
  buyHubUpgrade: (id: string, cost: number) => boolean;
  setTrustedHelperPass: () => void;
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
  collectibles: ['Shiny Rock'],
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
  
  activeInteractable: null,
  activeDialogue: null,
  journalOpen: false,
  tricycleColorIndex: 0,
  teleportTrigger: 0,
  progression: createInitialProgression(),
};

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      ...initialState,
      
      setQuality: (quality) => set({ quality }),
      setTimeOfDay: (time) => set({ timeOfDay: time, schedule: getScheduleForTime(time) }),
      
      advanceSchedule: () => set((state) => {
        let nextTime = state.timeOfDay + 1.5;
        if (nextTime > 17.0) nextTime = 9.0;
        return { timeOfDay: nextTime, schedule: getScheduleForTime(nextTime) };
      }),
      
      toggleImagination: () => set((state) => ({ isImaginationMode: !state.isImaginationMode })),
      toggleRain: () => set((state) => ({ isRainy: !state.isRainy })),
      
      pickUp: (item) => set((state) => {
        if (state.inventory.includes(item)) return state;
        const dropped = state.droppedItems.filter((droppedItem) => droppedItem.item !== item);
        return {
          inventory: [...state.inventory, item],
          droppedItems: dropped,
          progression: {
            ...state.progression,
            collectibleProgress: {
              ...state.progression.collectibleProgress,
              [item]: (state.progression.collectibleProgress[item] ?? 0) + 1,
            },
          },
        };
      }),
      
      drop: (item) => set((state) => {
        const protectedItem = item === 'binky' || item.endsWith('-block');
        const position: [number, number, number] = protectedItem
          && state.progression.hubUpgrades.includes('storage-organizer')
          ? [-10.5, 0.25, 10.2]
          : getTrackedPlayerPosition();
        if (item === 'binky') {
          return {
            droppedItems: [
              ...state.droppedItems.filter((droppedItem) => droppedItem.item !== item),
              { id: `dropped-${item}`, item, position },
            ],
            inventory: state.inventory.filter((inventoryItem) => inventoryItem !== item),
          };
        }
        return {
          droppedItems: [
            ...state.droppedItems.filter((droppedItem) => droppedItem.item !== item),
            { id: `dropped-${item}`, item, position },
          ],
          inventory: state.inventory.filter((inventoryItem) => inventoryItem !== item),
        };
      }),
      dropAt: (item, position) => set((state) => ({
        droppedItems: [
          ...state.droppedItems.filter((droppedItem) => droppedItem.item !== item),
          { id: `dropped-${item}`, item, position },
        ],
        inventory: state.inventory.filter((inventoryItem) => inventoryItem !== item),
      })),
      recoverDroppedItem: (id) => set((state) => ({
        droppedItems: state.droppedItems.filter((droppedItem) => droppedItem.id !== id),
      })),

      setIsRiding: (r) => set((state) => ({
        isRiding: r,
        progression: state.isRiding && !r
          ? {
              ...state.progression,
              vehicleProgress: {
                ...state.progression.vehicleProgress,
                tricycleRides: (state.progression.vehicleProgress.tricycleRides ?? 0) + 1,
              },
            }
          : state.progression,
      })),
      
      updateFriend: (name, updates) => set((state) => ({
        friends: {
          ...state.friends,
          [name]: { ...state.friends[name], ...updates }
        }
      })),

      setTeacherSuspicion: (s) => set((state) => {
        const teacherSuspicion = typeof s === 'function' ? s(state.teacherSuspicion) : s;
        return teacherSuspicion === state.teacherSuspicion ? state : { teacherSuspicion };
      }),
      
      updateBinkyStatus: (status) => set((state) => {
        const quests = status === 'returned-good'
          ? activateQuest(advanceObjective(state.quests, 'where-binky', 'return-binky'), 'rainbow-tidy-up')
          : state.quests;
        if (status === 'returned-good' && state.binkyStatus !== 'returned-good') {
          const progression = withQualifiedRoutes({
            ...state.progression,
            reputation: Math.min(100, state.progression.reputation + 8),
            tokens: state.progression.tokens + 5,
            trustedHelperPass: true,
          });
          return { binkyStatus: status, quests, progression };
        }
        return { binkyStatus: status, quests };
      }),
      
      addClue: (clue) => set((state) => {
        if (!state.binkyClues.includes(clue)) {
          return { binkyClues: [...state.binkyClues, clue] };
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
                tokens: state.progression.tokens + 2,
                reputation: Math.min(100, state.progression.reputation + 2),
                trustedHelperPass: true,
                activityRuns: {
                  ...state.progression.activityRuns,
                  'rainbow-tidy-up': (state.progression.activityRuns['rainbow-tidy-up'] ?? 0) + 1,
                },
                activityRewards: {
                  ...state.progression.activityRewards,
                  'rainbow-tidy-up': (state.progression.activityRewards['rainbow-tidy-up'] ?? 0) + 2,
                },
              })
            : state.progression;
          changed = true;
          return {
            inventory: state.inventory.filter((inventoryItem) => inventoryItem !== item),
            tidyPlacedItems: [...state.tidyPlacedItems, item],
            quests: completedRound ? resetRepeatableQuest(nextQuests, 'rainbow-tidy-up') : nextQuests,
            progression: nextProgression,
          };
        });
        return changed;
      },
      buyStock: (type, cost, amount) => set((state) => {
        if (state.juiceClubCash >= cost) {
          return {
            juiceClubCash: state.juiceClubCash - cost,
            juiceStock: type === 'juice' ? state.juiceStock + amount : state.juiceStock,
            crackerStock: type === 'cracker' ? state.crackerStock + amount : state.crackerStock,
          };
        }
        return state;
      }),

      buyUpgrade: (id, cost) => set((state) => {
        if (state.juiceClubCash >= cost && !state.juiceUpgrades.includes(id)) {
          return {
            juiceClubCash: state.juiceClubCash - cost,
            juiceUpgrades: [...state.juiceUpgrades, id]
          };
        }
        return state;
      }),

      addWaitingCustomer: (id) => set((state) => {
        if (!state.waitingCustomers.includes(id)) {
          return { waitingCustomers: [...state.waitingCustomers, id] };
        }
        return state;
      }),

      removeWaitingCustomer: (id) => set((state) => ({
        waitingCustomers: state.waitingCustomers.filter(c => c !== id)
      })),
      
      serveCustomer: () => set((state) => {
        // Need 1 juice and 1 cracker minimum, and a waiting customer
        if (state.juiceStock > 0 && state.crackerStock > 0 && state.waitingCustomers.length > 0) {
          const premiumMultiplier = state.juiceUpgrades.includes('premium-cups') ? 2 : 1;
          const cashEarned = 2 * premiumMultiplier;
          const servedId = state.waitingCustomers[0];
          const progression = withQualifiedRoutes({
            ...state.progression,
            reputation: Math.min(100, state.progression.reputation + 1),
            tokens: state.progression.tokens + 1,
            activityRuns: {
              ...state.progression.activityRuns,
              'juice-club-service': (state.progression.activityRuns['juice-club-service'] ?? 0) + 1,
            },
            activityRewards: {
              ...state.progression.activityRewards,
              'juice-club-service': (state.progression.activityRewards['juice-club-service'] ?? 0) + 1,
            },
          });
          
          return {
            juiceStock: state.juiceStock - 1,
            crackerStock: state.crackerStock - 1,
            juiceClubCash: state.juiceClubCash + cashEarned,
            juiceClubCustomersServed: state.juiceClubCustomersServed + 1,
            waitingCustomers: state.waitingCustomers.slice(1),
            progression,
            friends: {
              ...state.friends,
              [servedId]: {
                ...state.friends[servedId],
                friendship: Math.min(100, state.friends[servedId].friendship + 5),
                recentMemory: 'Loved the juice!'
              }
            }
          };
        }
        return state;
      }),
      
      setActiveInteractable: (id) => set({ activeInteractable: id }),
      setActiveDialogue: (dialogue) => set({ activeDialogue: dialogue }),
      toggleJournal: () => set((state) => ({ journalOpen: !state.journalOpen })),
      cycleTricycleColor: () => set((state) => ({ tricycleColorIndex: (state.tricycleColorIndex + 1) % 4 })),
      triggerTeleport: () => set((state) => ({ teleportTrigger: state.teleportTrigger + 1 })),
      completeActivity: (activityId, tokenReward, reputationReward) => set((state) => {
        const nextRuns = {
          ...state.progression.activityRuns,
          [activityId]: (state.progression.activityRuns[activityId] ?? 0) + 1,
        };
        const nextRewards = {
          ...state.progression.activityRewards,
          [activityId]: (state.progression.activityRewards[activityId] ?? 0) + tokenReward,
        };
        const nextProgression: ProgressionState = {
          ...state.progression,
          version: PROGRESSION_VERSION,
          tokens: state.progression.tokens + tokenReward,
          reputation: Math.min(100, state.progression.reputation + reputationReward),
          activityRuns: nextRuns,
          activityRewards: nextRewards,
        };
        return { progression: withQualifiedRoutes(nextProgression) };
      }),
      addProgressionTokens: (amount) => set((state) => {
        const progression = withQualifiedRoutes({
          ...state.progression,
          tokens: Math.max(0, state.progression.tokens + amount),
        });
        return { progression };
      }),
      buyHubUpgrade: (id, cost) => {
        let changed = false;
        set((state) => {
          if (!state.progression.trustedHelperPass || state.progression.tokens < cost || state.progression.hubUpgrades.includes(id)) return state;
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
      resetGame: () => set(initialState),
    }),
    {
      name: 'daykare-save',
      partialize: (state) => ({
        quality: state.quality,
        timeOfDay: state.timeOfDay,
        schedule: state.schedule,
        isRainy: state.isRainy,
        inventory: state.inventory,
        collectibles: state.collectibles,
        friends: state.friends,
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
        tricycleColorIndex: state.tricycleColorIndex,
        progression: state.progression,
      }),
      version: PROGRESSION_VERSION,
      migrate: (persistedState, storedVersion) => {
        const persisted = persistedState as Partial<GameState>;
        if (storedVersion > PROGRESSION_VERSION) {
          console.warn(
            `DayKare save version ${storedVersion} is newer than supported version ${PROGRESSION_VERSION}; keeping legacy game fields and resetting only progression.`,
          );
          return {
            ...initialState,
            ...persisted,
            quests: normalizeQuestStates(persisted.quests, persisted.binkyStatus, persisted.inventory ?? []),
            progression: normalizeProgression(persisted.progression),
          };
        }
         const migratedQuests = normalizeQuestStates(
           persisted.quests,
           persisted.binkyStatus,
           persisted.inventory ?? [],
         );
         const migratedBinkyStatus = (persisted.binkyStatus ?? legacyStatusForQuest(migratedQuests)) as BinkyStatus;
         const droppedItems = Array.isArray(persisted.droppedItems) ? persisted.droppedItems : [];
         const needsBinkyRecovery = migratedBinkyStatus === 'found'
           && !(persisted.inventory ?? []).includes('binky')
           && !droppedItems.some((item) => item.item === 'binky');
         return {
          ...initialState,
          ...persisted,
           binkyStatus: migratedBinkyStatus,
           quests: migratedQuests,
           droppedItems: needsBinkyRecovery
             ? [...droppedItems, { id: 'recovered-binky', item: 'binky', position: [-14, 0.2, 14] as [number, number, number] }]
             : droppedItems,
           progression: normalizeProgression(persisted.progression),
        };
      },
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<GameState>;
        const quests = normalizeQuestStates(persisted.quests, persisted.binkyStatus, persisted.inventory ?? []);
        const droppedItems = Array.isArray(persisted.droppedItems) ? persisted.droppedItems : [];
        const needsBinkyRecovery = quests['where-binky'].currentObjectiveId === 'return-binky'
          && !(persisted.inventory ?? []).includes('binky')
          && !droppedItems.some((item) => item.item === 'binky');
        return {
          ...currentState,
          ...persisted,
          quests,
          droppedItems: needsBinkyRecovery
            ? [...droppedItems, { id: 'recovered-binky', item: 'binky', position: [-14, 0.2, 14] as [number, number, number] }]
            : droppedItems,
          progression: normalizeProgression(persisted.progression),
        };
      },
    }
  )
);