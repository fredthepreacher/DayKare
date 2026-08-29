import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createInitialProgression,
  getUnlockedRoutes,
  normalizeProgression,
  PROGRESSION_VERSION,
  type ProgressionState,
} from './progression';

export type ScheduleState = 'morning-play' | 'art-time' | 'juice-club' | 'outdoor-play' | 'pickup';
export type BinkyStatus = 'not-started' | 'talked-to-owner' | 'found-clue' | 'traded-info' | 'found' | 'returned-good' | 'returned-bad';

export interface FriendState {
  mood: 'happy' | 'sad' | 'curious' | 'grumpy' | 'excited';
  friendship: number; // 0 to 100
  recentMemory: string;
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
  setIsRiding: (r: boolean) => void;
  
  updateFriend: (name: string, updates: Partial<FriendState>) => void;
  setTeacherSuspicion: (s: number | ((prev: number) => number)) => void;

  updateBinkyStatus: (status: BinkyStatus) => void;
  addClue: (clue: string) => void;
  
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
        return {
          inventory: [...state.inventory, item],
          progression: {
            ...state.progression,
            collectibleProgress: {
              ...state.progression.collectibleProgress,
              [item]: (state.progression.collectibleProgress[item] ?? 0) + 1,
            },
          },
        };
      }),
      
      drop: (item) => set((state) => ({ 
        inventory: state.inventory.filter(i => i !== item) 
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

      setTeacherSuspicion: (s) => set((state) => ({
        teacherSuspicion: typeof s === 'function' ? s(state.teacherSuspicion) : s
      })),
      
      updateBinkyStatus: (status) => set((state) => {
        if (status === 'returned-good' && state.binkyStatus !== 'returned-good') {
          const progression = withQualifiedRoutes({
            ...state.progression,
            reputation: Math.min(100, state.progression.reputation + 8),
            tokens: state.progression.tokens + 5,
          });
          return { binkyStatus: status, progression };
        }
        return { binkyStatus: status };
      }),
      
      addClue: (clue) => set((state) => {
        if (!state.binkyClues.includes(clue)) {
          return { binkyClues: [...state.binkyClues, clue] };
        }
        return state;
      }),

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
            progression: createInitialProgression(),
          };
        }
        return {
          ...initialState,
          ...persisted,
          progression: normalizeProgression(persisted.progression),
        };
      },
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<GameState>;
        return {
          ...currentState,
          ...persisted,
          progression: normalizeProgression(persisted.progression),
        };
      },
    }
  )
);