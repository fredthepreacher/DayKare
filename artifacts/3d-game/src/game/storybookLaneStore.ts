import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  ICE_CREAM_RECOVERY_SECONDS,
  ICE_CREAM_SICK_THRESHOLD,
  STORYBOOK_FLAVORS,
  STORYBOOK_ITEM_IDS,
  STORYBOOK_PRICES,
  STORYBOOK_STARTER_RB,
  storybookItemPrice,
  type StorybookItemId,
} from './storybookLaneConfig';

export interface StorybookLaneSave {
  ribbonBucks: number;
  ownedItems: StorybookItemId[];
  cribTier: 0 | 1 | 2 | 3;
}

interface StorybookLaneStore extends StorybookLaneSave {
  sessionScoops: number;
  recoveringUntil: number;
  lastFlavor: string | null;
  purchaseItem: (item: StorybookItemId) => 'purchased' | 'owned' | 'insufficient';
  purchaseCribTier: (tier: 1 | 2 | 3) => 'purchased' | 'owned' | 'locked' | 'insufficient';
  buyIceCream: (now?: number) => 'purchased' | 'insufficient' | 'recovering' | 'sick';
  recordAuthorizedIceCream: (ribbonBucks: number, now?: number) => 'purchased' | 'recovering' | 'sick';
  applyAuthoritativeProfile: (save: StorybookLaneSave) => void;
  recover: () => void;
  resetSession: () => void;
  grantRibbonBucks: (amount: number) => void;
}

const safeItems = (value: unknown): StorybookItemId[] => Array.isArray(value)
  ? [...new Set(value.filter((item): item is StorybookItemId => STORYBOOK_ITEM_IDS.includes(item as StorybookItemId)))]
  : [];

export function normalizeStorybookSave(value: unknown): StorybookLaneSave {
  const candidate = value && typeof value === 'object' ? value as Partial<StorybookLaneSave> : {};
  const ribbonBucks = typeof candidate.ribbonBucks === 'number' && Number.isFinite(candidate.ribbonBucks)
    ? Math.max(0, Math.min(999_999, Math.floor(candidate.ribbonBucks)))
    : STORYBOOK_STARTER_RB;
  const cribTier = typeof candidate.cribTier === 'number'
    ? Math.max(0, Math.min(3, Math.floor(candidate.cribTier))) as 0 | 1 | 2 | 3
    : 0;
  return { ribbonBucks, ownedItems: safeItems(candidate.ownedItems), cribTier };
}

const storage = createJSONStorage(() => typeof window === 'undefined'
  ? { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }
  : window.localStorage);

export const useStorybookLaneStore = create<StorybookLaneStore>()(persist((set) => ({
  ...normalizeStorybookSave(null),
  sessionScoops: 0,
  recoveringUntil: 0,
  lastFlavor: null,
  purchaseItem: (item) => {
    let result: 'purchased' | 'owned' | 'insufficient' = 'insufficient';
    set((state) => {
      if (state.ownedItems.includes(item)) { result = 'owned'; return state; }
      const cost = storybookItemPrice(item);
      if (state.ribbonBucks < cost) return state;
      result = 'purchased';
      return { ribbonBucks: state.ribbonBucks - cost, ownedItems: [...state.ownedItems, item] };
    });
    return result;
  },
  purchaseCribTier: (tier) => {
    let result: 'purchased' | 'owned' | 'locked' | 'insufficient' = 'insufficient';
    set((state) => {
      if (!state.ownedItems.includes('crib')) { result = 'locked'; return state; }
      if (state.cribTier >= tier) { result = 'owned'; return state; }
      if (tier !== state.cribTier + 1) { result = 'locked'; return state; }
      const cost = STORYBOOK_PRICES[`cribTier${tier}`];
      if (state.ribbonBucks < cost) return state;
      result = 'purchased';
      return { ribbonBucks: state.ribbonBucks - cost, cribTier: tier };
    });
    return result;
  },
  buyIceCream: (now = Date.now()) => {
    let result: 'purchased' | 'insufficient' | 'recovering' | 'sick' = 'insufficient';
    set((state) => {
      if (state.recoveringUntil > now) { result = 'recovering'; return state; }
      if (state.ribbonBucks < STORYBOOK_PRICES.iceCream) return state;
      const sessionScoops = state.sessionScoops + 1;
      const sick = sessionScoops >= ICE_CREAM_SICK_THRESHOLD;
      result = sick ? 'sick' : 'purchased';
      return {
        ribbonBucks: state.ribbonBucks - STORYBOOK_PRICES.iceCream,
        sessionScoops,
        recoveringUntil: sick ? now + ICE_CREAM_RECOVERY_SECONDS * 1_000 : 0,
        lastFlavor: STORYBOOK_FLAVORS[(sessionScoops - 1) % STORYBOOK_FLAVORS.length],
      };
    });
    return result;
  },
  recordAuthorizedIceCream: (ribbonBucks, now = Date.now()) => {
    let result: 'purchased' | 'recovering' | 'sick' = 'purchased';
    set((state) => {
      if (state.recoveringUntil > now) { result = 'recovering'; return state; }
      const sessionScoops = state.sessionScoops + 1;
      const sick = sessionScoops >= ICE_CREAM_SICK_THRESHOLD;
      result = sick ? 'sick' : 'purchased';
      return {
        ribbonBucks: Math.max(0, Math.floor(ribbonBucks)),
        sessionScoops,
        recoveringUntil: sick ? now + ICE_CREAM_RECOVERY_SECONDS * 1_000 : 0,
        lastFlavor: STORYBOOK_FLAVORS[(sessionScoops - 1) % STORYBOOK_FLAVORS.length],
      };
    });
    return result;
  },
  applyAuthoritativeProfile: (save) => set(normalizeStorybookSave(save)),
  recover: () => set({ sessionScoops: 0, recoveringUntil: 0, lastFlavor: null }),
  resetSession: () => set({ sessionScoops: 0, recoveringUntil: 0, lastFlavor: null }),
  grantRibbonBucks: (amount) => set((state) => ({
    ribbonBucks: Math.max(0, Math.min(999_999, state.ribbonBucks + Math.floor(Number.isFinite(amount) ? amount : 0))),
  })),
}), {
  name: 'daykare-storybook-lane',
  storage,
  partialize: (state) => ({ ribbonBucks: state.ribbonBucks, ownedItems: state.ownedItems, cribTier: state.cribTier }),
  merge: (persisted, current) => ({ ...current, ...normalizeStorybookSave(persisted) }),
}));
