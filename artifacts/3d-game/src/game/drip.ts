/**
 * Drip: the cosmetic catalog, its unlock economy, and the rules that decide what
 * a player may own.
 *
 * The catalog is DATA, transcribed from the owner's authored
 * `drip_catalog_v1.json`, because the whole point of the brief is that adding an
 * item later should be a row rather than a code change.
 *
 * Two rules shape everything here.
 *
 * 1. THE BROWSER MAY NOT MINT OWNERSHIP. Prices and requirements are read from
 *    this catalog by the store action, never passed in by the caller - the same
 *    pattern buyStock already uses, for the same reason. A forged call can ask
 *    to buy an item; it cannot say what the item costs.
 *
 * 2. ACHIEVEMENT ITEMS ARE DERIVED, NOT TRUSTED. A prestige item is a claim
 *    about something the player did, so it is recomputed from the evidence in
 *    the save on every load rather than read back from a list. Editing
 *    `dripOwned` in localStorage cannot grant the Sticker Parade Cap; only
 *    completing the caper can. Purchased items are trusted from the save, since
 *    cash history is not reconstructible - but they are still filtered to known
 *    ids and to items that are actually purchasable.
 */

export type DripCategory = 'top' | 'bottom' | 'shoes' | 'hat' | 'backpack' | 'accessory' | 'ride_on';

export type DripRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';

export type DripUnlockType = 'money' | 'rep+money' | 'achievement' | 'achievement+rep+money';

/**
 * The achievements a prestige item can require. Each maps to a predicate over
 * real save state in `achievementsEarned` below - there are no free-floating
 * flags, so an achievement cannot be set except by doing the thing.
 */
export type DripAchievement =
  | 'binky-complete'
  | 'sticker-parade-complete'
  | 'garden-first-milestone'
  | 'garden-mastery'
  | 'rainbow-10-rounds'
  | 'juice-25-customers'
  | 'art-5-activities'
  | 'friend-trusted';

export interface DripItem {
  id: string;
  name: string;
  category: DripCategory;
  rarity: DripRarity;
  repRequired: number;
  priceCash: number;
  unlockType: DripUnlockType;
  unlockDetail: string;
  prestige: boolean;
  achievement?: DripAchievement;
  /** Colour used to tint the equipped item on the character. */
  color: string;
  accent?: string;
}

/**
 * Drop 01. Transcribed from drip_catalog_v1.json; the colours are the only
 * addition, taken from the concept sheets so equipped items read at a glance in
 * a low-poly character rig.
 */
export const DRIP_CATALOG: DripItem[] = [
  // Tops
  { id: 'sunbeam_tee', name: 'Sunbeam Tee', category: 'top', rarity: 'Common', repRequired: 0, priceCash: 4, unlockType: 'money', unlockDetail: 'Available from the starter shop', prestige: false, color: '#f6c453', accent: '#fff3d6' },
  { id: 'crayon_stripe_rugby', name: 'Crayon Stripe Rugby', category: 'top', rarity: 'Common', repRequired: 50, priceCash: 7, unlockType: 'rep+money', unlockDetail: 'Reach 50 REP', prestige: false, color: '#2f80c2', accent: '#e94f37' },
  { id: 'tiny_varsity_cardigan', name: 'Tiny Varsity Cardigan', category: 'top', rarity: 'Uncommon', repRequired: 120, priceCash: 12, unlockType: 'rep+money', unlockDetail: 'Reach 120 REP', prestige: false, color: '#22335c', accent: '#f2ece1' },
  { id: 'playground_hoodie', name: 'Playground Hoodie', category: 'top', rarity: 'Uncommon', repRequired: 160, priceCash: 14, unlockType: 'rep+money', unlockDetail: 'Reach 160 REP', prestige: false, color: '#49b79b', accent: '#ffd166' },
  { id: 'maker_art_smock', name: 'Maker Art Smock', category: 'top', rarity: 'Uncommon', repRequired: 0, priceCash: 0, unlockType: 'achievement', unlockDetail: 'Finish 5 art or maker activities', prestige: true, achievement: 'art-5-activities', color: '#f4efe2', accent: '#8ec7a1' },

  // Bottoms
  { id: 'puddle_joggers', name: 'Puddle Joggers', category: 'bottom', rarity: 'Common', repRequired: 0, priceCash: 6, unlockType: 'money', unlockDetail: 'Starter shop', prestige: false, color: '#8fb8dd' },
  { id: 'mini_cargo_shorts', name: 'Mini Cargo Shorts', category: 'bottom', rarity: 'Uncommon', repRequired: 100, priceCash: 9, unlockType: 'rep+money', unlockDetail: 'Reach 100 REP', prestige: false, color: '#6b7a4b' },
  { id: 'storybook_pleated_shorts', name: 'Storybook Pleated Shorts', category: 'bottom', rarity: 'Rare', repRequired: 240, priceCash: 14, unlockType: 'rep+money', unlockDetail: 'Reach 240 REP', prestige: false, color: '#ddd0b4' },

  // Shoes
  { id: 'tiny_high_tops', name: 'Tiny High-Tops', category: 'shoes', rarity: 'Uncommon', repRequired: 110, priceCash: 11, unlockType: 'rep+money', unlockDetail: 'Reach 110 REP', prestige: false, color: '#26324f', accent: '#ffffff' },
  { id: 'rainbow_runners', name: 'Rainbow Runners', category: 'shoes', rarity: 'Rare', repRequired: 250, priceCash: 18, unlockType: 'achievement+rep+money', unlockDetail: 'Finish 10 Rainbow Tidy-Up rounds, reach 250 REP, then $18', prestige: false, achievement: 'rainbow-10-rounds', color: '#e05780', accent: '#4cc9f0' },
  { id: 'garden_rain_boots', name: 'Garden Rain Boots', category: 'shoes', rarity: 'Uncommon', repRequired: 0, priceCash: 0, unlockType: 'achievement', unlockDetail: 'Reach your first Garden milestone', prestige: true, achievement: 'garden-first-milestone', color: '#3f8f5f', accent: '#f4c95d' },
  { id: 'starlight_sneakers', name: 'Starlight Sneakers', category: 'shoes', rarity: 'Epic', repRequired: 500, priceCash: 30, unlockType: 'rep+money', unlockDetail: 'Reach 500 REP, then $30', prestige: false, color: '#2b2a5e', accent: '#ffd166' },

  // Hats
  { id: 'little_bucket_hat', name: 'Little Bucket Hat', category: 'hat', rarity: 'Common', repRequired: 0, priceCash: 5, unlockType: 'money', unlockDetail: 'Starter shop', prestige: false, color: '#f2c14e' },
  { id: 'backyard_cap', name: 'Backyard Cap', category: 'hat', rarity: 'Uncommon', repRequired: 140, priceCash: 8, unlockType: 'rep+money', unlockDetail: 'Reach 140 REP', prestige: false, color: '#3f8f5f', accent: '#2f6fa8' },
  { id: 'sticker_parade_cap', name: 'Sticker Parade Cap', category: 'hat', rarity: 'Epic', repRequired: 0, priceCash: 0, unlockType: 'achievement', unlockDetail: 'Complete the Sticker Parade Caper', prestige: true, achievement: 'sticker-parade-complete', color: '#f4efe2', accent: '#9b6fd4' },

  // Backpacks
  { id: 'star_satchel', name: 'Star Satchel', category: 'backpack', rarity: 'Uncommon', repRequired: 125, priceCash: 12, unlockType: 'rep+money', unlockDetail: 'Reach 125 REP', prestige: false, color: '#4d86c6', accent: '#f4c95d' },
  { id: 'crayon_case_pack', name: 'Crayon Case Pack', category: 'backpack', rarity: 'Rare', repRequired: 220, priceCash: 17, unlockType: 'rep+money', unlockDetail: 'Reach 220 REP', prestige: false, color: '#6fa8dc', accent: '#e94f37' },
  { id: 'binky_buddy_pack', name: 'Binky Buddy Pack', category: 'backpack', rarity: 'Rare', repRequired: 0, priceCash: 0, unlockType: 'achievement', unlockDetail: "Complete Where's Binky?", prestige: true, achievement: 'binky-complete', color: '#7fc3c9', accent: '#a9764f' },
  { id: 'juicebox_boss_pack', name: 'Juicebox Boss Pack', category: 'backpack', rarity: 'Epic', repRequired: 350, priceCash: 25, unlockType: 'achievement+rep+money', unlockDetail: 'Serve 25 Juice Club customers, reach 350 REP, then $25', prestige: false, achievement: 'juice-25-customers', color: '#5fb0ae', accent: '#f18f01' },

  // Accessories
  { id: 'tiny_shades', name: 'Tiny Shades', category: 'accessory', rarity: 'Uncommon', repRequired: 180, priceCash: 10, unlockType: 'rep+money', unlockDetail: 'Reach 180 REP', prestige: false, color: '#7c9c56' },
  { id: 'friendship_band', name: 'Friendship Band', category: 'accessory', rarity: 'Rare', repRequired: 0, priceCash: 0, unlockType: 'achievement', unlockDetail: 'Become trusted by a friend', prestige: true, achievement: 'friend-trusted', color: '#e05780', accent: '#4cc9f0' },
  { id: 'sticker_sash', name: 'Sticker Sash', category: 'accessory', rarity: 'Rare', repRequired: 300, priceCash: 15, unlockType: 'rep+money', unlockDetail: 'Reach 300 REP', prestige: false, color: '#b28ad6' },

  // Ride-ons
  { id: 'garden_scout_trike', name: 'Garden Scout Trike', category: 'ride_on', rarity: 'Epic', repRequired: 400, priceCash: 35, unlockType: 'achievement+rep+money', unlockDetail: 'Reach Garden mastery, 400 REP, then $35', prestige: false, achievement: 'garden-mastery', color: '#8fae7a', accent: '#a9764f' },
  { id: 'daykare_legend_scooter', name: 'DayKare Legend Scooter', category: 'ride_on', rarity: 'Legendary', repRequired: 750, priceCash: 60, unlockType: 'rep+money', unlockDetail: 'Reach 750 REP, then $60', prestige: false, color: '#9b6fd4', accent: '#f4c95d' },
];

const catalogById = new Map(DRIP_CATALOG.map((item) => [item.id, item]));

export function getDripItem(id: string): DripItem | undefined {
  return catalogById.get(id);
}

export const DRIP_CATEGORIES: DripCategory[] = ['top', 'bottom', 'shoes', 'hat', 'backpack', 'accessory', 'ride_on'];

export const DRIP_CATEGORY_LABELS: Record<DripCategory, string> = {
  top: 'Tops',
  bottom: 'Bottoms',
  shoes: 'Shoes',
  hat: 'Hats',
  backpack: 'Backpacks',
  accessory: 'Accessories',
  ride_on: 'Ride-Ons',
};

export const RARITY_ORDER: DripRarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

/**
 * The REP tiers from economy_rules_v1.json. Purely descriptive - they name where
 * the player is, they do not gate anything on their own.
 */
export const REP_TIERS = [
  { name: 'Starter', min: 0 },
  { name: 'Known Kid', min: 100 },
  { name: 'Popular Kid', min: 250 },
  { name: 'DayKare Legend', min: 500 },
] as const;

export function repTierName(reputation: number): string {
  let name = REP_TIERS[0].name as string;
  for (const tier of REP_TIERS) if (reputation >= tier.min) name = tier.name;
  return name;
}

/* -------------------------------------------------------------------------- */
/* Achievements                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Everything the achievement predicates are allowed to look at. Keeping this an
 * explicit input rather than the whole store is what makes the rules testable
 * and keeps them honest: an achievement can only depend on recorded evidence.
 */
export interface AchievementEvidence {
  binkyComplete: boolean;
  caperComplete: boolean;
  rainbowRounds: number;
  gardenRuns: number;
  juiceCustomersServed: number;
  artActivities: number;
  /** Highest friendship value across the cast. */
  bestFriendship: number;
}

const ART_ACHIEVEMENT_TARGET = 5;
const RAINBOW_ACHIEVEMENT_TARGET = 10;
const JUICE_ACHIEVEMENT_TARGET = 25;
const GARDEN_MASTERY_TARGET = 5;
const TRUSTED_FRIENDSHIP = 60;

export function achievementsEarned(evidence: AchievementEvidence): Set<DripAchievement> {
  const earned = new Set<DripAchievement>();
  if (evidence.binkyComplete) earned.add('binky-complete');
  if (evidence.caperComplete) earned.add('sticker-parade-complete');
  if (evidence.gardenRuns >= 1) earned.add('garden-first-milestone');
  if (evidence.gardenRuns >= GARDEN_MASTERY_TARGET) earned.add('garden-mastery');
  if (evidence.rainbowRounds >= RAINBOW_ACHIEVEMENT_TARGET) earned.add('rainbow-10-rounds');
  if (evidence.juiceCustomersServed >= JUICE_ACHIEVEMENT_TARGET) earned.add('juice-25-customers');
  if (evidence.artActivities >= ART_ACHIEVEMENT_TARGET) earned.add('art-5-activities');
  if (evidence.bestFriendship >= TRUSTED_FRIENDSHIP) earned.add('friend-trusted');
  return earned;
}

/** Human-readable progress toward an achievement, for the locked-item card. */
export function achievementProgress(
  achievement: DripAchievement,
  evidence: AchievementEvidence,
): { current: number; required: number } | null {
  switch (achievement) {
    case 'rainbow-10-rounds': return { current: evidence.rainbowRounds, required: RAINBOW_ACHIEVEMENT_TARGET };
    case 'juice-25-customers': return { current: evidence.juiceCustomersServed, required: JUICE_ACHIEVEMENT_TARGET };
    case 'art-5-activities': return { current: evidence.artActivities, required: ART_ACHIEVEMENT_TARGET };
    case 'garden-mastery': return { current: evidence.gardenRuns, required: GARDEN_MASTERY_TARGET };
    case 'garden-first-milestone': return { current: evidence.gardenRuns, required: 1 };
    case 'friend-trusted': return { current: evidence.bestFriendship, required: TRUSTED_FRIENDSHIP };
    default: return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Eligibility                                                                */
/* -------------------------------------------------------------------------- */

export type DripStatus = 'owned' | 'buyable' | 'needs-rep' | 'needs-cash' | 'needs-achievement' | 'earned-pending';

export interface DripWallet {
  reputation: number;
  cash: number;
}

export interface DripView {
  item: DripItem;
  status: DripStatus;
  /** Plain-words reason, present whenever the item is not owned or buyable. */
  requirement?: string;
  owned: boolean;
  equipped: boolean;
}

/** Is this item purchasable at all, or is it earned only? */
export function isPurchasable(item: DripItem): boolean {
  return item.unlockType !== 'achievement';
}

/**
 * The single authority on whether a purchase may go through.
 *
 * Both the UI and the store action call this, so the button can never offer
 * something the action would refuse, and the action can never accept something
 * the button would not have offered.
 */
export function canPurchase(
  item: DripItem,
  wallet: DripWallet,
  earned: Set<DripAchievement>,
  owned: Set<string>,
): { ok: boolean; reason?: string } {
  if (owned.has(item.id)) return { ok: false, reason: 'Already owned' };
  if (!isPurchasable(item)) return { ok: false, reason: item.unlockDetail };
  if (item.achievement && !earned.has(item.achievement)) {
    return { ok: false, reason: item.unlockDetail };
  }
  if (wallet.reputation < item.repRequired) {
    return { ok: false, reason: `Needs ${item.repRequired} REP (you have ${wallet.reputation})` };
  }
  if (wallet.cash < item.priceCash) {
    return { ok: false, reason: `Needs $${item.priceCash} (you have $${wallet.cash})` };
  }
  return { ok: true };
}

export function describeDripItem(
  item: DripItem,
  wallet: DripWallet,
  earned: Set<DripAchievement>,
  owned: Set<string>,
  equipped: Partial<Record<DripCategory, string | null>>,
): DripView {
  const isOwned = owned.has(item.id);
  const isEquipped = equipped[item.category] === item.id;

  if (isOwned) return { item, status: 'owned', owned: true, equipped: isEquipped };

  if (!isPurchasable(item)) {
    // An achievement item the player has earned but that has not yet been
    // granted is a bug, not a state - grants are derived on load. This exists so
    // that if it ever happens it is visible rather than silent.
    return {
      item,
      status: item.achievement && earned.has(item.achievement) ? 'earned-pending' : 'needs-achievement',
      requirement: item.unlockDetail,
      owned: false,
      equipped: false,
    };
  }

  const check = canPurchase(item, wallet, earned, owned);
  if (check.ok) return { item, status: 'buyable', owned: false, equipped: false };

  const status: DripStatus = item.achievement && !earned.has(item.achievement)
    ? 'needs-achievement'
    : wallet.reputation < item.repRequired
      ? 'needs-rep'
      : 'needs-cash';

  return { item, status, requirement: check.reason, owned: false, equipped: false };
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

/** Hard ceiling so a forged save cannot balloon the list. */
const MAX_OWNED = DRIP_CATALOG.length;

/**
 * Rebuild ownership from a persisted list plus current evidence.
 *
 * Purchased items are trusted (cash history is not reconstructible) but filtered
 * to real, purchasable ids. Achievement items are IGNORED from the save and
 * recomputed, so editing localStorage cannot grant a prestige item - and,
 * equally, a player who earned one never loses it.
 */
export function normalizeDripOwned(value: unknown, evidence: AchievementEvidence): string[] {
  const earned = achievementsEarned(evidence);
  const owned = new Set<string>();

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== 'string') continue;
      const item = catalogById.get(entry);
      if (!item) continue;
      if (!isPurchasable(item)) continue; // derived below, never trusted
      owned.add(item.id);
      if (owned.size >= MAX_OWNED) break;
    }
  }

  for (const item of DRIP_CATALOG) {
    if (item.achievement && earned.has(item.achievement)) owned.add(item.id);
  }

  return DRIP_CATALOG.filter((item) => owned.has(item.id)).map((item) => item.id);
}

export type DripEquipped = Partial<Record<DripCategory, string | null>>;

/** An item can only be equipped if it is owned and is in the slot it claims. */
export function normalizeDripEquipped(value: unknown, owned: string[]): DripEquipped {
  const ownedSet = new Set(owned);
  const result: DripEquipped = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  const candidate = value as Record<string, unknown>;
  for (const category of DRIP_CATEGORIES) {
    const id = candidate[category];
    if (typeof id !== 'string') continue;
    const item = catalogById.get(id);
    if (!item || item.category !== category || !ownedSet.has(id)) continue;
    result[category] = id;
  }
  return result;
}

/** The colours to tint the player with, for the character rig. */
export function equippedAppearance(equipped: DripEquipped): {
  top?: string; bottom?: string; shoes?: string; hat?: string; accent?: string;
} {
  const read = (category: DripCategory) => {
    const id = equipped[category];
    return id ? catalogById.get(id) : undefined;
  };
  const top = read('top');
  const bottom = read('bottom');
  const shoes = read('shoes');
  const hat = read('hat');
  return {
    top: top?.color,
    bottom: bottom?.color,
    shoes: shoes?.color,
    hat: hat?.color,
    accent: top?.accent ?? hat?.accent ?? shoes?.accent,
  };
}
