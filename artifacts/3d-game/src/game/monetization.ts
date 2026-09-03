import { DRIP_CATALOG, type DripAchievement, type DripCategory } from "./drip";

/**
 * Rascal Bucks are earned through play; Care Gems are the rare premium tier.
 * Care Coins used to sit between them and are gone - one earned currency is
 * enough, and the shop now prices its everyday tier in the same Bucks the
 * player already spends on homes and pets.
 */
export type ShopCurrency = "rascal_bucks" | "care_gems" | "usd";

/** What one retired Care Coin is worth in Rascal Bucks, everywhere. */
export const LEGACY_CARE_COIN_TO_RASCAL_BUCKS = 50;
export type SubscriptionTier = "none" | "kare_pass" | "family_pass";
export type ProductKind =
  "cosmetic" | "furniture" | "bundle" | "boost" | "subscription" | "currency";
export type ShopSection =
  | "featured"
  | "bundles"
  | "clothing"
  | "accessories"
  | "furniture"
  | "care-gems"
  | "xp-boosts"
  | "kare-pass"
  | "seasonal"
  | "daily-deals";

export interface BoostGrant {
  durationMs: number;
  multiplier: number;
}
export interface ProductGrant {
  /**
   * Care Coins are retired. The earned currency is Rascal Bucks, which the
   * player already spends on homes, pets and rides, so a third premium-ish
   * currency was buying nothing the other two did not.
   */
  rascalBucks?: number;
  careGems?: number;
  cosmetics?: string[];
  furniture?: string[];
  boost?: BoostGrant;
  subscription?: Exclude<SubscriptionTier, "none">;
  badge?: string;
}

export interface ProductRequirements {
  minimumReputation?: number;
  achievements?: DripAchievement[];
}

export interface ProgressionEligibility {
  reputation: number;
  achievements: DripAchievement[];
}

export interface MonetizationProduct {
  id: string;
  name: string;
  description: string;
  kind: ProductKind;
  sections: ShopSection[];
  price: number;
  currency: ShopCurrency;
  rarity: "Everyday" | "Special" | "Premium" | "Seasonal";
  grant: ProductGrant;
  requirements?: ProductRequirements;
  /** Explicitly documents a paid bundle/pass cosmetic that is its own unlock path. */
  progressionOverride?: "bundle-exclusive" | "subscription-benefit";
  consumable?: boolean;
  featured?: boolean;
  startsAt?: string;
  endsAt?: string;
  discountLabel?: string;
  color: string;
}

export interface ActiveBoost {
  productId: string;
  multiplier: number;
  activatedAt: number;
  expiresAt: number;
}

export interface VerifiedTransaction {
  id: string;
  productId: string;
  provider: "sandbox" | "stripe" | "apple" | "google";
  status: "verified" | "pending" | "canceled" | "declined";
  verifiedAt: number;
  sandbox: boolean;
}

export interface EntitlementState {
  ownedProducts: string[];
  ownedFurniture: string[];
  badges: string[];
  subscriptionTier: SubscriptionTier;
  subscriptionExpiresAt: number | null;
  activeBoost: ActiveBoost | null;
  processedTransactionIds: string[];
  claimedDailyRewardDay: string | null;
}

export interface MonetizationStateShape {
  careGems: number;
  entitlements: EntitlementState;
}

export const MONETIZATION_CONFIG = {
  version: 1,
  karePass: {
    monthlyPriceUsd: 4.99,
    progressMultiplier: 1.35,
    dailyRascalBucks: 20 * LEGACY_CARE_COIN_TO_RASCAL_BUCKS,
    monthlyCareGems: 50,
  },
  familyPass: {
    monthlyPriceUsd: 9.99,
    progressMultiplier: 1.5,
    dailyRascalBucks: 40 * LEGACY_CARE_COIN_TO_RASCAL_BUCKS,
    monthlyCareGems: 120,
    futureSharedProfiles: true,
  },
  gameplayRascalBucksPerReputation: LEGACY_CARE_COIN_TO_RASCAL_BUCKS / 5,
  boostStacking: "reject-while-active" as const,
  rotations: {
    dailyDealProductIds: ["cosmetic_little_bucket_hat"],
    featuredProductIds: [
      "starter_kare_pack",
      "kare_pass_monthly",
      "seasonal_storybook_nook",
    ],
  },
} as const;

const cosmeticProducts: MonetizationProduct[] = DRIP_CATALOG.filter(
  (item) => !item.prestige,
).map((item) => {
  const accessory = ["hat", "backpack", "accessory", "ride_on"].includes(
    item.category,
  );
  const premium = ["Epic", "Legendary"].includes(item.rarity);
  return {
    id: `cosmetic_${item.id}`,
    name: item.name,
    description: item.unlockDetail,
    kind: "cosmetic" as const,
    sections: [accessory ? "accessories" : "clothing"] as ShopSection[],
    price: premium
      ? Math.max(40, item.priceCash * 3)
      : Math.max(500, item.priceCash * LEGACY_CARE_COIN_TO_RASCAL_BUCKS * 2),
    currency: premium ? ("care_gems" as const) : ("rascal_bucks" as const),
    rarity: premium ? ("Premium" as const) : ("Everyday" as const),
    grant: { cosmetics: [item.id] },
    requirements: {
      minimumReputation: item.repRequired,
      achievements: item.achievement ? [item.achievement] : [],
    },
    color: item.color,
  };
});

export const MONETIZATION_CATALOG: MonetizationProduct[] = [
  {
    id: "starter_kare_pack",
    name: "Starter Kare Pack",
    kind: "bundle",
    description:
      "A sunny outfit, 7,500 Rascal Bucks, 40 Care Gems, and a gentle 15-minute REP boost.",
    sections: ["featured", "bundles"],
    price: 2.99,
    currency: "usd",
    rarity: "Special",
    featured: true,
    grant: {
      rascalBucks: 150 * LEGACY_CARE_COIN_TO_RASCAL_BUCKS,
      careGems: 40,
      cosmetics: ["sunbeam_tee"],
      boost: { durationMs: 15 * 60_000, multiplier: 1.25 },
      badge: "Kare Starter",
    },
    progressionOverride: "bundle-exclusive",
    color: "#ffad33",
  },
  {
    id: "kare_pass_monthly",
    name: "Kare Pass",
    kind: "subscription",
    description:
      "35% REP bonus, daily Rascal Bucks, monthly rewards, a member badge, and premium seasonal access.",
    sections: ["featured", "kare-pass"],
    price: MONETIZATION_CONFIG.karePass.monthlyPriceUsd,
    currency: "usd",
    rarity: "Premium",
    featured: true,
    grant: {
      subscription: "kare_pass",
      rascalBucks: 100 * LEGACY_CARE_COIN_TO_RASCAL_BUCKS,
      careGems: 50,
      cosmetics: ["playground_hoodie"],
      furniture: ["moonlight_story_lamp"],
      badge: "Kare Pass",
    },
    progressionOverride: "subscription-benefit",
    color: "#9b6fd4",
  },
  {
    id: "family_pass_monthly",
    name: "Family Pass",
    kind: "subscription",
    description:
      "Everything in Kare Pass, a 50% REP bonus, larger rewards, and an extensible family tier for future shared profiles.",
    sections: ["kare-pass"],
    price: MONETIZATION_CONFIG.familyPass.monthlyPriceUsd,
    currency: "usd",
    rarity: "Premium",
    grant: {
      subscription: "family_pass",
      rascalBucks: 250 * LEGACY_CARE_COIN_TO_RASCAL_BUCKS,
      careGems: 120,
      cosmetics: ["tiny_varsity_cardigan"],
      furniture: ["family_picnic_set"],
      badge: "Family Pass",
    },
    progressionOverride: "subscription-benefit",
    color: "#ff66b3",
  },
  {
    id: "boost_short",
    name: "Quick Cheer Boost",
    kind: "boost",
    description: "A configurable 10-minute 20% REP boost.",
    sections: ["xp-boosts"],
    price: 0.99,
    currency: "usd",
    rarity: "Special",
    consumable: true,
    grant: { boost: { durationMs: 10 * 60_000, multiplier: 1.2 } },
    color: "#33cccc",
  },
  {
    id: "boost_15_min",
    name: "15-Minute REP Boost",
    kind: "boost",
    description:
      "Earn 50% more REP for 15 real minutes, including after rejoining.",
    sections: ["xp-boosts"],
    price: 2.99,
    currency: "usd",
    rarity: "Premium",
    consumable: true,
    grant: { boost: { durationMs: 15 * 60_000, multiplier: 1.5 } },
    color: "#4cc9f0",
  },
  {
    id: "boost_1_hour",
    name: "1-Hour REP Boost",
    kind: "boost",
    description: "Earn 50% more REP for one real hour.",
    sections: ["xp-boosts"],
    price: 5.99,
    currency: "usd",
    rarity: "Premium",
    consumable: true,
    grant: { boost: { durationMs: 60 * 60_000, multiplier: 1.5 } },
    color: "#ffd166",
  },
  {
    id: "gems_pocket",
    name: "Pocket of Care Gems",
    kind: "currency",
    description: "100 premium Care Gems for cosmetics and special collections.",
    sections: ["care-gems"],
    price: 1.99,
    currency: "usd",
    rarity: "Premium",
    consumable: true,
    grant: { careGems: 100 },
    color: "#b28ad6",
  },
  {
    id: "gems_playroom",
    name: "Playroom Gem Jar",
    kind: "currency",
    description:
      "350 Care Gems. Quantities and prices live in one configuration catalog.",
    sections: ["care-gems"],
    price: 4.99,
    currency: "usd",
    rarity: "Premium",
    consumable: true,
    grant: { careGems: 350 },
    color: "#7f5bd6",
  },
  {
    id: "furniture_reading_nook",
    name: "Cozy Reading Nook",
    kind: "furniture",
    description:
      "An earnable soft-cushion decoration for the future room editor.",
    sections: ["furniture"],
    price: 80 * LEGACY_CARE_COIN_TO_RASCAL_BUCKS,
    currency: "rascal_bucks",
    rarity: "Everyday",
    grant: { furniture: ["cozy_reading_nook"] },
    color: "#8ec7a1",
  },
  {
    id: "seasonal_storybook_nook",
    name: "Storybook Season Set",
    kind: "furniture",
    description: "A limited story lamp and cloud cushion set.",
    sections: ["featured", "furniture", "seasonal"],
    price: 90,
    currency: "care_gems",
    rarity: "Seasonal",
    featured: true,
    grant: { furniture: ["storybook_season_set"] },
    color: "#e05780",
  },
  ...cosmeticProducts,
];

const productById = new Map(
  MONETIZATION_CATALOG.map((product) => [product.id, product]),
);
export const getMonetizationProduct = (id: string) => productById.get(id);

export function productIsAvailable(
  product: MonetizationProduct,
  now = Date.now(),
) {
  const starts = product.startsAt
    ? Date.parse(product.startsAt)
    : Number.NEGATIVE_INFINITY;
  const ends = product.endsAt
    ? Date.parse(product.endsAt)
    : Number.POSITIVE_INFINITY;
  return now >= starts && now < ends;
}

export function productsForSection(section: ShopSection, now = Date.now()) {
  let products = MONETIZATION_CATALOG.filter((product) =>
    productIsAvailable(product, now),
  );
  if (section === "featured")
    products = products.filter(
      (product) =>
        product.featured ||
        MONETIZATION_CONFIG.rotations.featuredProductIds.includes(
          product.id as never,
        ),
    );
  else if (section === "daily-deals")
    products = products.filter((product) =>
      MONETIZATION_CONFIG.rotations.dailyDealProductIds.includes(
        product.id as never,
      ),
    );
  else
    products = products.filter((product) => product.sections.includes(section));
  return products;
}

export function productRequirementsMet(
  product: MonetizationProduct,
  eligibility: ProgressionEligibility,
) {
  const requirements = product.requirements;
  if (!requirements) return true;
  if (eligibility.reputation < (requirements.minimumReputation ?? 0))
    return false;
  const earned = new Set(eligibility.achievements);
  return (requirements.achievements ?? []).every((achievement) =>
    earned.has(achievement),
  );
}

/** Catalog invariant: a non-standard grant must name its intentional bypass. */
export function productGrantRespectsProgression(product: MonetizationProduct) {
  if (!product.grant.cosmetics?.length) return true;
  if (product.kind === "cosmetic") return Boolean(product.requirements);
  return Boolean(product.progressionOverride);
}

export const createInitialEntitlements = (): EntitlementState => ({
  ownedProducts: [],
  ownedFurniture: [],
  badges: [],
  subscriptionTier: "none",
  subscriptionExpiresAt: null,
  activeBoost: null,
  processedTransactionIds: [],
  claimedDailyRewardDay: null,
});

const safeIds = (value: unknown, max = 256) =>
  Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string")
        .slice(0, max)
    : [];

export function normalizeEntitlements(
  value: unknown,
  now = Date.now(),
): EntitlementState {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<EntitlementState>)
      : {};
  const tier =
    candidate.subscriptionTier === "kare_pass" ||
    candidate.subscriptionTier === "family_pass"
      ? candidate.subscriptionTier
      : "none";
  const expiry =
    typeof candidate.subscriptionExpiresAt === "number" &&
    Number.isFinite(candidate.subscriptionExpiresAt)
      ? candidate.subscriptionExpiresAt
      : null;
  const boost =
    candidate.activeBoost &&
    typeof candidate.activeBoost === "object" &&
    typeof candidate.activeBoost.expiresAt === "number" &&
    candidate.activeBoost.expiresAt > now &&
    typeof candidate.activeBoost.multiplier === "number" &&
    candidate.activeBoost.multiplier >= 1 &&
    candidate.activeBoost.multiplier <= 3
      ? candidate.activeBoost
      : null;
  return {
    ownedProducts: safeIds(candidate.ownedProducts),
    ownedFurniture: safeIds(candidate.ownedFurniture),
    badges: safeIds(candidate.badges, 64),
    subscriptionTier: expiry !== null && expiry <= now ? "none" : tier,
    subscriptionExpiresAt: expiry !== null && expiry <= now ? null : expiry,
    activeBoost: boost,
    processedTransactionIds: safeIds(candidate.processedTransactionIds, 512),
    claimedDailyRewardDay:
      typeof candidate.claimedDailyRewardDay === "string"
        ? candidate.claimedDailyRewardDay
        : null,
  };
}

export function progressMultiplier(
  entitlements: EntitlementState,
  now = Date.now(),
) {
  const boost =
    entitlements.activeBoost && entitlements.activeBoost.expiresAt > now
      ? entitlements.activeBoost.multiplier
      : 1;
  const pass =
    entitlements.subscriptionTier === "family_pass"
      ? MONETIZATION_CONFIG.familyPass.progressMultiplier
      : entitlements.subscriptionTier === "kare_pass"
        ? MONETIZATION_CONFIG.karePass.progressMultiplier
        : 1;
  return Math.max(boost, pass); // convenience bonuses never compound into an aggressive multiplier
}

export function applyProgressMultiplier(
  baseReputation: number,
  entitlements: EntitlementState,
  now = Date.now(),
) {
  return Math.max(
    0,
    Math.round(baseReputation * progressMultiplier(entitlements, now)),
  );
}

export function formatProductPrice(product: MonetizationProduct) {
  if (product.currency === "usd") return `$${product.price.toFixed(2)}`;
  return product.currency === "rascal_bucks"
    ? `${product.price.toLocaleString()} RB`
    : `${product.price} Care Gems`;
}

export function dripSectionForCategory(category: DripCategory): ShopSection {
  return ["top", "bottom", "shoes"].includes(category)
    ? "clothing"
    : "accessories";
}
