import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  LEGACY_CARE_COIN_TO_RASCAL_BUCKS,
  MONETIZATION_CONFIG,
  applyProgressMultiplier,
  createInitialEntitlements,
  getMonetizationProduct,
  normalizeEntitlements,
  productRequirementsMet,
  productGrantRespectsProgression,
  type EntitlementState,
  type ProgressionEligibility,
  type ShopCurrency,
  type VerifiedTransaction,
} from "./monetization";
import { useStorybookLaneStore } from "./storybookLaneStore";

/** Rascal Bucks are the lane wallet's, so grants go there and nowhere else. */
function creditRascalBucks(amount: number) {
  const safe = Math.max(0, Math.floor(amount));
  if (!safe) return;
  const wallet = useStorybookLaneStore.getState();
  useStorybookLaneStore.setState({ ribbonBucks: wallet.ribbonBucks + safe });
}

export type PurchaseState =
  | "idle"
  | "loading"
  | "success"
  | "failed"
  | "canceled"
  | "pending"
  | "already-owned"
  | "duplicate";
export type EconomyEventName =
  | "shop_opened"
  | "product_viewed"
  | "checkout_started"
  | "purchase_completed"
  | "purchase_failed"
  | "care_pass_viewed"
  | "care_pass_started"
  | "care_pass_expired"
  | "boost_activated"
  | "bundle_claimed"
  | "daily_reward_claimed"
  | "currency_earned"
  | "currency_spent"
  | "purchase_restored";
export interface EconomyEvent {
  name: EconomyEventName;
  at: number;
  productId?: string;
  amount?: number;
  currency?: ShopCurrency;
  reason?: string;
}

interface MonetizationStore {
  careGems: number;
  /**
   * Legacy saves may still carry a Care Coin balance. It is converted to
   * Rascal Bucks once, on load, so the value is not stranded and the
   * conversion cannot run twice.
   */
  legacyCareCoinsMigrated: boolean;
  rewardedReputation: number;
  entitlements: EntitlementState;
  purchaseState: PurchaseState;
  purchaseMessage: string | null;
  events: EconomyEvent[];
  track: (event: Omit<EconomyEvent, "at"> & { at?: number }) => void;
  reconcileGameplayRewards: (reputation: number) => number;
  spendCurrencyProduct: (
    productId: string,
    eligibility: ProgressionEligibility,
    grantCosmetics: (ids: string[]) => void,
  ) => boolean;
  fulfillVerifiedTransaction: (
    transaction: VerifiedTransaction,
    grantCosmetics: (ids: string[]) => void,
  ) => PurchaseState;
  setPurchaseState: (state: PurchaseState, message?: string | null) => void;
  claimDailyReward: (now?: number) => boolean;
  clearExpired: (now?: number) => void;
}

const MAX_BALANCE = 1_000_000;
const addUnique = (current: string[], additions: string[]) =>
  Array.from(new Set([...current, ...additions])).slice(0, 256);
const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);

function grantProduct(
  state: MonetizationStore,
  productId: string,
  transactionId: string,
  now: number,
) {
  const product = getMonetizationProduct(productId);
  if (!product || !productGrantRespectsProgression(product)) return null;
  const grant = product.grant;
  const entitlements = normalizeEntitlements(state.entitlements, now);
  if (grant.boost && entitlements.activeBoost) return null;
  const subscriptionExpiresAt = grant.subscription
    ? now + 30 * 24 * 60 * 60_000
    : entitlements.subscriptionExpiresAt;
  if (grant.rascalBucks) creditRascalBucks(grant.rascalBucks);
  return {
    careGems: Math.min(MAX_BALANCE, state.careGems + (grant.careGems ?? 0)),
    entitlements: {
      ...entitlements,
      ownedProducts: product.consumable
        ? entitlements.ownedProducts
        : addUnique(entitlements.ownedProducts, [product.id]),
      ownedFurniture: addUnique(
        entitlements.ownedFurniture,
        grant.furniture ?? [],
      ),
      badges: addUnique(entitlements.badges, grant.badge ? [grant.badge] : []),
      subscriptionTier: grant.subscription ?? entitlements.subscriptionTier,
      subscriptionExpiresAt,
      activeBoost: grant.boost
        ? {
            productId,
            multiplier: grant.boost.multiplier,
            activatedAt: now,
            expiresAt: now + grant.boost.durationMs,
          }
        : entitlements.activeBoost,
      processedTransactionIds: addUnique(entitlements.processedTransactionIds, [
        transactionId,
      ]),
    },
  };
}

export const useMonetizationStore = create<MonetizationStore>()(
  persist(
    (set, get) => ({
      careGems: 0,
      legacyCareCoinsMigrated: false,
      rewardedReputation: 0,
      entitlements: createInitialEntitlements(),
      purchaseState: "idle",
      purchaseMessage: null,
      events: [],
      track: (event) =>
        set((state) => ({
          events: [
            ...state.events,
            { ...event, at: event.at ?? Date.now() },
          ].slice(-100),
        })),
      reconcileGameplayRewards: (reputation) => {
        const safeRep = Math.max(0, Math.floor(reputation));
        const previous = get().rewardedReputation;
        if (safeRep <= previous) return 0;
        const amount =
          Math.floor(
            safeRep * MONETIZATION_CONFIG.gameplayRascalBucksPerReputation,
          ) -
          Math.floor(
            previous * MONETIZATION_CONFIG.gameplayRascalBucksPerReputation,
          );
        creditRascalBucks(amount);
        set({ rewardedReputation: safeRep });
        if (amount > 0)
          get().track({
            name: "currency_earned",
            amount,
            currency: "rascal_bucks",
            reason: "gameplay",
          });
        return Math.max(0, amount);
      },
      spendCurrencyProduct: (productId, eligibility, grantCosmetics) => {
        const product = getMonetizationProduct(productId);
        const state = get();
        if (
          !product ||
          product.currency === "usd" ||
          !productRequirementsMet(product, eligibility) ||
          (!product.consumable &&
            state.entitlements.ownedProducts.includes(product.id))
        )
          return false;
        if (
          product.grant.boost &&
          state.entitlements.activeBoost &&
          state.entitlements.activeBoost.expiresAt > Date.now()
        )
          return false;
        const balance =
          product.currency === "rascal_bucks"
            ? useStorybookLaneStore.getState().ribbonBucks
            : state.careGems;
        if (balance < product.price) return false;
        const transactionId = `economy-${productId}-${Date.now()}`;
        const granted = grantProduct(
          state,
          productId,
          transactionId,
          Date.now(),
        );
        if (!granted) return false;
        // Rascal Bucks live in the lane wallet, so the debit happens there
        // rather than in a second balance the shop keeps for itself.
        if (product.currency === "rascal_bucks") {
          useStorybookLaneStore.setState({ ribbonBucks: balance - product.price });
        }
        set({
          ...granted,
          ...(product.currency === "care_gems"
            ? { careGems: balance - product.price }
            : {}),
          purchaseState: "success",
          purchaseMessage: `${product.name} added.`,
        });
        if (product.grant.cosmetics?.length)
          grantCosmetics(product.grant.cosmetics);
        get().track({
          name: "currency_spent",
          productId,
          amount: product.price,
          currency: product.currency,
        });
        return true;
      },
      fulfillVerifiedTransaction: (transaction, grantCosmetics) => {
        const state = get();
        const product = getMonetizationProduct(transaction.productId);
        if (!product || transaction.status !== "verified") {
          set({
            purchaseState:
              transaction.status === "pending" ? "pending" : "failed",
            purchaseMessage: "The purchase was not verified.",
          });
          return transaction.status === "pending" ? "pending" : "failed";
        }
        if (
          state.entitlements.processedTransactionIds.includes(transaction.id)
        ) {
          set({
            purchaseState: "duplicate",
            purchaseMessage: "This transaction was already fulfilled.",
          });
          return "duplicate";
        }
        if (
          !product.consumable &&
          state.entitlements.ownedProducts.includes(product.id)
        ) {
          set({
            purchaseState: "already-owned",
            purchaseMessage: "You already own this.",
          });
          return "already-owned";
        }
        const granted = grantProduct(
          state,
          product.id,
          transaction.id,
          transaction.verifiedAt,
        );
        if (!granted) {
          set({
            purchaseState: "already-owned",
            purchaseMessage:
              "Finish your active boost before activating another.",
          });
          return "already-owned";
        }
        set({
          ...granted,
          purchaseState: "success",
          purchaseMessage: `${product.name} added — sandbox only, no charge.`,
        });
        if (product.grant.cosmetics?.length)
          grantCosmetics(product.grant.cosmetics);
        get().track({ name: "purchase_completed", productId: product.id });
        if (product.kind === "boost" || product.grant.boost)
          get().track({ name: "boost_activated", productId: product.id });
        if (product.kind === "bundle")
          get().track({ name: "bundle_claimed", productId: product.id });
        if (product.grant.subscription)
          get().track({ name: "care_pass_started", productId: product.id });
        return "success";
      },
      setPurchaseState: (purchaseState, purchaseMessage = null) =>
        set({ purchaseState, purchaseMessage }),
      claimDailyReward: (now = Date.now()) => {
        const state = get();
        const entitlements = normalizeEntitlements(state.entitlements, now);
        const today = dayKey(now);
        if (entitlements.claimedDailyRewardDay === today) return false;
        const amount =
          entitlements.subscriptionTier === "family_pass"
            ? MONETIZATION_CONFIG.familyPass.dailyRascalBucks
            : entitlements.subscriptionTier === "kare_pass"
              ? MONETIZATION_CONFIG.karePass.dailyRascalBucks
              : 5;
        creditRascalBucks(amount);
        set({ entitlements: { ...entitlements, claimedDailyRewardDay: today } });
        get().track({
          name: "daily_reward_claimed",
          amount,
          currency: "rascal_bucks",
        });
        return true;
      },
      clearExpired: (now = Date.now()) =>
        set((state) => ({
          entitlements: normalizeEntitlements(state.entitlements, now),
        })),
    }),
    {
      name: "daykare-monetization-v1",
      storage: createJSONStorage(() =>
        typeof window === "undefined"
          ? {
              getItem: () => null,
              setItem: () => undefined,
              removeItem: () => undefined,
            }
          : window.localStorage,
      ),
      partialize: (state) => ({
        legacyCareCoinsMigrated: state.legacyCareCoinsMigrated,
        careGems: state.careGems,
        rewardedReputation: state.rewardedReputation,
        entitlements: state.entitlements,
      }),
      merge: (persisted, current) => {
        const candidate = (persisted ?? {}) as Partial<MonetizationStore> & {
          careCoins?: number;
        };
        // A save written before Care Coins were retired still carries a
        // balance. Convert it once rather than stranding what the player
        // earned, and record that it happened so a reload cannot pay twice.
        const legacyCoins = Math.max(0, Math.floor(candidate.careCoins ?? 0));
        const alreadyMigrated = candidate.legacyCareCoinsMigrated === true;
        if (legacyCoins > 0 && !alreadyMigrated) {
          creditRascalBucks(legacyCoins * LEGACY_CARE_COIN_TO_RASCAL_BUCKS);
        }
        return {
          ...current,
          legacyCareCoinsMigrated: alreadyMigrated || legacyCoins > 0 || candidate.careGems !== undefined,
          careGems: Math.max(
            0,
            Math.min(MAX_BALANCE, Math.floor(candidate.careGems ?? 0)),
          ),
          rewardedReputation: Math.max(
            0,
            Math.floor(candidate.rewardedReputation ?? 0),
          ),
          entitlements: normalizeEntitlements(candidate.entitlements),
        };
      },
    },
  ),
);

export function monetizedReputation(base: number, now = Date.now()) {
  return applyProgressMultiplier(
    base,
    normalizeEntitlements(useMonetizationStore.getState().entitlements, now),
    now,
  );
}
