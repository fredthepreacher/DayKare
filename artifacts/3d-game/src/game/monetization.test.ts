import assert from "node:assert/strict";
import {
  MONETIZATION_CATALOG,
  MONETIZATION_CONFIG,
  applyProgressMultiplier,
  createInitialEntitlements,
  getMonetizationProduct,
  normalizeEntitlements,
  productIsAvailable,
  productsForSection,
  progressMultiplier,
  productRequirementsMet,
  productGrantRespectsProgression,
  type VerifiedTransaction,
} from "./monetization";
import { useMonetizationStore } from "./monetizationStore";
import { useGameStore } from "./store";

assert.equal(getMonetizationProduct("kare_pass_monthly")?.price, 4.99);
assert.equal(getMonetizationProduct("family_pass_monthly")?.price, 9.99);
assert.equal(MONETIZATION_CONFIG.boostStacking, "reject-while-active");
assert.ok(
  productsForSection("clothing").length > 0,
  "existing Drip clothing is exposed by config",
);
assert.ok(
  productsForSection("accessories").length > 0,
  "existing Drip accessories are exposed by config",
);
assert.ok(
  productsForSection("furniture").length > 0,
  "furniture definitions are browsable",
);
assert.ok(
  productsForSection("daily-deals").length > 0,
  "daily deal rotation resolves without UI edits",
);
assert.equal(
  new Set(MONETIZATION_CATALOG.map((product) => product.id)).size,
  MONETIZATION_CATALOG.length,
  "product ids are unique",
);
assert.ok(
  MONETIZATION_CATALOG.every(
    (product) =>
      !("areaAccess" in product.grant) &&
      !("rank" in product.grant) &&
      !("achievement" in product.grant) &&
      !("reputation" in product.grant),
  ),
  "the grant schema cannot mint gameplay access, ranks, achievements or REP",
);
assert.ok(
  MONETIZATION_CATALOG.every(productGrantRespectsProgression),
  "every cosmetic grant preserves requirements or documents its intentional bundle/pass unlock path",
);
const rainbowProduct = getMonetizationProduct("cosmetic_rainbow_runners")!;
assert.equal(
  productRequirementsMet(rainbowProduct, { reputation: 999, achievements: [] }),
  false,
  "achievement locks survive the Care Coin shop",
);
assert.equal(
  productRequirementsMet(rainbowProduct, {
    reputation: 999,
    achievements: ["rainbow-10-rounds"],
  }),
  true,
);
const rugbyProduct = getMonetizationProduct("cosmetic_crayon_stripe_rugby")!;
assert.equal(
  productRequirementsMet(rugbyProduct, { reputation: 49, achievements: [] }),
  false,
  "REP locks survive the Care Coin shop",
);
assert.equal(
  productRequirementsMet(rugbyProduct, { reputation: 50, achievements: [] }),
  true,
);

assert.equal(
  productIsAvailable(
    { ...MONETIZATION_CATALOG[0], startsAt: "2099-01-01T00:00:00Z" },
    0,
  ),
  false,
);
assert.equal(
  productIsAvailable(
    { ...MONETIZATION_CATALOG[0], endsAt: "2020-01-01T00:00:00Z" },
    Date.now(),
  ),
  false,
);

const now = 2_000_000;
const pass = {
  ...createInitialEntitlements(),
  subscriptionTier: "kare_pass" as const,
  subscriptionExpiresAt: now + 100_000,
};
assert.equal(progressMultiplier(pass, now), 1.35);
assert.equal(
  applyProgressMultiplier(10, pass, now),
  14,
  "REP uses one canonical configurable multiplier",
);
const boosted = {
  ...pass,
  activeBoost: {
    productId: "boost",
    multiplier: 1.5,
    activatedAt: now,
    expiresAt: now + 1000,
  },
};
assert.equal(
  progressMultiplier(boosted, now),
  1.5,
  "boost and pass do not compound",
);
assert.equal(
  progressMultiplier(boosted, now + 1001),
  1.35,
  "expired boost stops applying",
);
assert.equal(
  normalizeEntitlements(boosted, now + 1001).activeBoost,
  null,
  "expired boost is removed on restore",
);

const grantedCosmetics: string[] = [];
useMonetizationStore.setState({
  careCoins: 0,
  careGems: 0,
  rewardedReputation: 0,
  entitlements: createInitialEntitlements(),
  purchaseState: "idle",
  purchaseMessage: null,
  events: [],
});
const tx: VerifiedTransaction = {
  id: "verified-1",
  productId: "starter_kare_pack",
  provider: "sandbox",
  status: "verified",
  verifiedAt: now,
  sandbox: true,
};
assert.equal(
  useMonetizationStore
    .getState()
    .fulfillVerifiedTransaction(tx, (ids) => grantedCosmetics.push(...ids)),
  "success",
);
assert.equal(useMonetizationStore.getState().careCoins, 150);
assert.equal(useMonetizationStore.getState().careGems, 40);
assert.deepEqual(grantedCosmetics, ["sunbeam_tee"]);
assert.equal(
  useMonetizationStore.getState().entitlements.activeBoost?.expiresAt,
  now + 15 * 60_000,
);
assert.equal(
  useMonetizationStore
    .getState()
    .fulfillVerifiedTransaction(tx, () => undefined),
  "duplicate",
);
assert.equal(
  useMonetizationStore.getState().careCoins,
  150,
  "duplicate transaction cannot grant twice",
);

const anotherBoost: VerifiedTransaction = {
  ...tx,
  id: "verified-2",
  productId: "boost_short",
};
assert.equal(
  useMonetizationStore
    .getState()
    .fulfillVerifiedTransaction(anotherBoost, () => undefined),
  "already-owned",
  "active boosts reject accidental stacking",
);

useMonetizationStore.setState({
  careCoins: 100,
  careGems: 100,
  entitlements: createInitialEntitlements(),
  rewardedReputation: 0,
});
const eligible = { reputation: 0, achievements: [] as [] };
assert.equal(
  useMonetizationStore
    .getState()
    .spendCurrencyProduct("furniture_reading_nook", eligible, () => undefined),
  true,
);
assert.equal(useMonetizationStore.getState().careCoins, 20);
assert.ok(
  useMonetizationStore
    .getState()
    .entitlements.ownedFurniture.includes("cozy_reading_nook"),
);
assert.equal(
  useMonetizationStore
    .getState()
    .spendCurrencyProduct("furniture_reading_nook", eligible, () => undefined),
  false,
  "non-consumables cannot be repurchased",
);
useMonetizationStore.setState({
  careCoins: 1000,
  entitlements: createInitialEntitlements(),
});
assert.equal(
  useMonetizationStore
    .getState()
    .spendCurrencyProduct(
      "cosmetic_crayon_stripe_rugby",
      { reputation: 49, achievements: [] },
      () => undefined,
    ),
  false,
  "store authority rejects a forged UI attempt below REP",
);
assert.equal(
  useMonetizationStore
    .getState()
    .spendCurrencyProduct(
      "cosmetic_rainbow_runners",
      { reputation: 999, achievements: [] },
      () => undefined,
    ),
  false,
  "store authority rejects a missing achievement",
);

const gameplayBeforeGrant = useGameStore.getState();
const protectedGameplay = {
  progression: gameplayBeforeGrant.progression,
  quests: gameplayBeforeGrant.quests,
  districtProgress: gameplayBeforeGrant.districtProgress,
  caper: gameplayBeforeGrant.caper,
  inventory: gameplayBeforeGrant.inventory,
  collectibles: gameplayBeforeGrant.collectibles,
  zone: gameplayBeforeGrant.zone,
};
gameplayBeforeGrant.grantMonetizationCosmetics([
  "playground_hoodie",
  "sticker_parade_cap",
]);
const gameplayAfterGrant = useGameStore.getState();
assert.ok(
  gameplayAfterGrant.dripOwned.includes("playground_hoodie"),
  "an explicitly granted pass cosmetic reaches the existing wardrobe",
);
assert.equal(
  gameplayAfterGrant.dripOwned.includes("sticker_parade_cap"),
  false,
  "monetization can never grant achievement/prestige cosmetics",
);
assert.deepEqual(
  {
    progression: gameplayAfterGrant.progression,
    quests: gameplayAfterGrant.quests,
    districtProgress: gameplayAfterGrant.districtProgress,
    caper: gameplayAfterGrant.caper,
    inventory: gameplayAfterGrant.inventory,
    collectibles: gameplayAfterGrant.collectibles,
    zone: gameplayAfterGrant.zone,
  },
  protectedGameplay,
  "cosmetic fulfillment cannot alter ranks, routes, areas, activities, achievements, quests, inventory, or progression",
);

useMonetizationStore.setState({
  careCoins: 0,
  rewardedReputation: 0,
  entitlements: createInitialEntitlements(),
});
assert.equal(useMonetizationStore.getState().reconcileGameplayRewards(24), 4);
assert.equal(useMonetizationStore.getState().reconcileGameplayRewards(25), 1);
assert.equal(
  useMonetizationStore.getState().reconcileGameplayRewards(25),
  0,
  "same REP cannot mint Care Coins twice",
);
assert.equal(
  useMonetizationStore.getState().careCoins,
  5,
  "free play earns Care Coins through REP progress",
);

const dailyAt = Date.parse("2026-09-01T12:00:00Z");
assert.equal(useMonetizationStore.getState().claimDailyReward(dailyAt), true);
assert.equal(
  useMonetizationStore.getState().claimDailyReward(dailyAt + 1000),
  false,
  "daily reward is idempotent per UTC day",
);

console.log("monetization tests passed");
