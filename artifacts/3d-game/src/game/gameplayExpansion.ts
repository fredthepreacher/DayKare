import type { GameZone } from "./world";

export const PLANTING_XP = 12;
export const FISH_CATCH_XP = 1;
export const FISH_SALE_XP = 2;
export const FISH_SALE_CASH = 5;
export const ART_XP = 20;
export const ART_CASH = 20;
export const MISSED_ACTIVITY_REP = 5;
export const LOST_FOUND_INTERVAL_MINUTES = 10;
export const MEAL_REQUIRED_REAL_SECONDS = 10;
export const NAP_XP_PER_REAL_MINUTE = 2;
export const NAP_FULL_SESSION_REAL_SECONDS = 55;

export const SEED_QUALITY_TIERS = [
  { id: "basic", label: "Basic Seed", multiplier: 1 },
  { id: "good", label: "Good Seed", multiplier: 1.15 },
  { id: "premium", label: "Premium Seed", multiplier: 1.3 },
  { id: "golden", label: "Golden Seed", multiplier: 1.5 },
] as const;
export type SeedQuality = typeof SEED_QUALITY_TIERS[number]["id"];
export function seedQualityIndex(quality: SeedQuality) { return SEED_QUALITY_TIERS.findIndex((tier) => tier.id === quality); }
export function nextSeedQuality(quality: SeedQuality) { return SEED_QUALITY_TIERS[Math.min(SEED_QUALITY_TIERS.length - 1, seedQualityIndex(quality) + 1)].id; }
export function seedValueMultiplier(quality: SeedQuality) { return SEED_QUALITY_TIERS[seedQualityIndex(quality)]?.multiplier ?? 1; }

export const FISHING_RODS = ["red", "white", "blue", "green", "purple"] as const;
export type FishingRodColor = (typeof FISHING_RODS)[number];

export const COLLECTIBLE_DEFINITIONS = [
  { id: "teddy-bear-blue", label: "Blue Teddy Bear", set: "Teddy Bears", zone: "hub", position: [-8.4, 0.24, 5.8] },
  { id: "toy-car-red", label: "Red Toy Car", set: "Toy Cars", zone: "hub", position: [7.2, 0.2, 6.2] },
  { id: "story-book-moon", label: "Moon Story Book", set: "Story Books", zone: "hub", position: [-11.8, 0.22, -6.8] },
  { id: "golden-crayon", label: "Golden Crayon", set: "Golden Crayons", zone: "garden", position: [-6.8, 0.2, 8.4] },
  { id: "sticker-rainbow", label: "Rainbow Sticker", set: "Stickers", zone: "garden", position: [5.8, 0.2, 5.7] },
  { id: "rare-toy-robot", label: "Pocket Robot", set: "Rare Toys", zone: "garden", position: [12.2, 0.22, -7.2] },
] as const;

export type CollectibleId = (typeof COLLECTIBLE_DEFINITIONS)[number]["id"];
export type HeistId = "sticker-parade" | "tech-stash";
export type RequiredActivityId = "breakfast" | "show-and-tell" | "art-time" | "lunch" | "nap";

export interface AttendanceEntry {
  seconds: number;
  completed: boolean;
}

export interface LostFoundJob {
  id: string;
  itemId: string;
  label: string;
  zone: Exclude<GameZone, "storybook">;
  position: [number, number, number];
  status: "available" | "accepted" | "found";
  createdAtMinute: number;
  rewardSeed: number;
}

export interface DayReport {
  day: number;
  attended: RequiredActivityId[];
  missed: RequiredActivityId[];
  goodBehavior: boolean;
  escapeAttempts: number;
  jobsCompleted: number;
  reputationEarned: number;
  reputationLost: number;
  xpEarned: number;
  moneyEarned: number;
}

export interface GameplayExpansionState {
  version: 1;
  secondPlantingStep: number;
  seedPackets: number;
  seedQuality: SeedQuality;
  seedInspectionDay: number | null;
  swedishFish: number;
  fishingCastReady: boolean;
  fishingCatchSerial: number;
  ownedRods: FishingRodColor[];
  equippedRod: FishingRodColor;
  artCompletedDays: number[];
  showTellCompletedDays: number[];
  afternoonSnackDays: number[];
  attendanceDay: number;
  attendance: Record<RequiredActivityId, AttendanceEntry>;
  napRewardedDays: number[];
  napInterruptedDays: number[];
  dayStartExperience: number;
  dayStartCash: number;
  dayStartReputation: number;
  dayStartJobsCompleted: number;
  dayStartEscapeStrikes: number;
  lastDayReport: DayReport | null;
  dailyHeistDay: number;
  dailyHeist: HeistId;
  previousHeist: HeistId | null;
  techHeistStep: "idle" | "diversion" | "retrieve" | "complete";
  techTokens: number;
  foundCollectibles: CollectibleId[];
  rotationDay: number;
  activeCollectibles: CollectibleId[];
  lostFoundJob: LostFoundJob | null;
  lostFoundNextMinute: number;
  lostFoundCompleted: number;
}

const emptyAttendance = (): Record<RequiredActivityId, AttendanceEntry> => ({
  "breakfast": { seconds: 0, completed: false },
  "show-and-tell": { seconds: 0, completed: false },
  "art-time": { seconds: 0, completed: false },
  "lunch": { seconds: 0, completed: false },
  "nap": { seconds: 0, completed: false },
});

export function heistForDay(day: number, previous: HeistId | null): HeistId {
  const selected: HeistId = day % 2 === 0 ? "tech-stash" : "sticker-parade";
  return selected === previous ? (selected === "tech-stash" ? "sticker-parade" : "tech-stash") : selected;
}

export function collectibleRotation(day: number): CollectibleId[] {
  const ids = COLLECTIBLE_DEFINITIONS.map((entry) => entry.id);
  const start = Math.abs(Math.trunc(day * 3 + 1)) % ids.length;
  return [ids[start], ids[(start + 2) % ids.length], ids[(start + 4) % ids.length]];
}

export function createGameplayExpansion(day = 1): GameplayExpansionState {
  return {
    version: 1,
    secondPlantingStep: 0,
    seedPackets: 12,
    seedQuality: "basic",
    seedInspectionDay: null,
    swedishFish: 0,
    fishingCastReady: false,
    fishingCatchSerial: 0,
    ownedRods: ["red"],
    equippedRod: "red",
    artCompletedDays: [],
    showTellCompletedDays: [],
    afternoonSnackDays: [],
    attendanceDay: day,
    attendance: emptyAttendance(),
    napRewardedDays: [],
    napInterruptedDays: [],
    dayStartExperience: 0,
    dayStartCash: 0,
    dayStartReputation: 0,
    dayStartJobsCompleted: 0,
    dayStartEscapeStrikes: 0,
    lastDayReport: null,
    dailyHeistDay: day,
    dailyHeist: heistForDay(day, null),
    previousHeist: null,
    techHeistStep: "idle",
    techTokens: 0,
    foundCollectibles: [],
    rotationDay: day,
    activeCollectibles: collectibleRotation(day),
    lostFoundJob: null,
    lostFoundNextMinute: 9 * 60 + LOST_FOUND_INTERVAL_MINUTES,
    lostFoundCompleted: 0,
  };
}

const count = (value: unknown, fallback = 0, max = 999_999) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(0, Math.floor(value)))
    : fallback;

const validDays = (value: unknown) =>
  Array.isArray(value)
    ? Array.from(new Set(value.filter((entry): entry is number => typeof entry === "number" && Number.isInteger(entry) && entry > 0))).slice(-60)
    : [];

export function normalizeGameplayExpansion(value: unknown, day = 1): GameplayExpansionState {
  const initial = createGameplayExpansion(day);
  if (!value || typeof value !== "object" || Array.isArray(value)) return initial;
  const raw = value as Partial<GameplayExpansionState>;
  const rods = Array.isArray(raw.ownedRods)
    ? Array.from(new Set(raw.ownedRods.filter((rod): rod is FishingRodColor => FISHING_RODS.includes(rod as FishingRodColor))))
    : initial.ownedRods;
  const ownedRods = rods.length > 0 ? rods : initial.ownedRods;
  const foundCollectibles = Array.isArray(raw.foundCollectibles)
    ? Array.from(new Set(raw.foundCollectibles.filter((id): id is CollectibleId => COLLECTIBLE_DEFINITIONS.some((entry) => entry.id === id))))
    : [];
  const activeCollectibles = Array.isArray(raw.activeCollectibles)
    ? raw.activeCollectibles.filter((id): id is CollectibleId => COLLECTIBLE_DEFINITIONS.some((entry) => entry.id === id)).slice(0, 3)
    : collectibleRotation(day);
  const attendance = emptyAttendance();
  for (const id of Object.keys(attendance) as RequiredActivityId[]) {
    const entry = raw.attendance?.[id];
    attendance[id] = { seconds: count(entry?.seconds, 0, 600), completed: entry?.completed === true };
  }
  const dailyHeist = raw.dailyHeist === "tech-stash" || raw.dailyHeist === "sticker-parade"
    ? raw.dailyHeist
    : heistForDay(day, null);
  return {
    ...initial,
    secondPlantingStep: count(raw.secondPlantingStep, 0, 4),
    seedPackets: count(raw.seedPackets, initial.seedPackets, 999),
    seedQuality: SEED_QUALITY_TIERS.some((tier) => tier.id === raw.seedQuality) ? raw.seedQuality as SeedQuality : "basic",
    seedInspectionDay: typeof raw.seedInspectionDay === "number" && Number.isInteger(raw.seedInspectionDay) ? Math.max(1, raw.seedInspectionDay) : null,
    swedishFish: count(raw.swedishFish, 0, 999),
    fishingCastReady: raw.fishingCastReady === true,
    fishingCatchSerial: count(raw.fishingCatchSerial, 0, 999_999),
    ownedRods,
    equippedRod: ownedRods.includes(raw.equippedRod as FishingRodColor) ? raw.equippedRod as FishingRodColor : ownedRods[0],
    artCompletedDays: validDays(raw.artCompletedDays),
    showTellCompletedDays: validDays(raw.showTellCompletedDays),
    afternoonSnackDays: validDays(raw.afternoonSnackDays),
    attendanceDay: count(raw.attendanceDay, day, 9999),
    attendance,
    napRewardedDays: validDays(raw.napRewardedDays),
    napInterruptedDays: validDays(raw.napInterruptedDays),
    dayStartExperience: count(raw.dayStartExperience),
    dayStartCash: count(raw.dayStartCash),
    dayStartReputation: count(raw.dayStartReputation, 0, 1000),
    dayStartJobsCompleted: count(raw.dayStartJobsCompleted),
    dayStartEscapeStrikes: count(raw.dayStartEscapeStrikes, 0, 999),
    lastDayReport: raw.lastDayReport && typeof raw.lastDayReport === "object" ? raw.lastDayReport as DayReport : null,
    dailyHeistDay: count(raw.dailyHeistDay, day, 9999),
    dailyHeist,
    previousHeist: raw.previousHeist === "tech-stash" || raw.previousHeist === "sticker-parade" ? raw.previousHeist : null,
    techHeistStep: ["idle", "diversion", "retrieve", "complete"].includes(raw.techHeistStep ?? "") ? raw.techHeistStep! : "idle",
    techTokens: count(raw.techTokens, 0, 999),
    foundCollectibles,
    rotationDay: count(raw.rotationDay, day, 9999),
    activeCollectibles: activeCollectibles.length > 0 ? activeCollectibles : collectibleRotation(day),
    lostFoundJob: normalizeLostFoundJob(raw.lostFoundJob),
    lostFoundNextMinute: count(raw.lostFoundNextMinute, 9 * 60 + LOST_FOUND_INTERVAL_MINUTES, 999_999),
    lostFoundCompleted: count(raw.lostFoundCompleted, 0, 999_999),
  };
}

function normalizeLostFoundJob(value: unknown): LostFoundJob | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<LostFoundJob>;
  if (typeof raw.id !== "string" || typeof raw.itemId !== "string" || typeof raw.label !== "string") return null;
  const status = raw.status === "accepted" || raw.status === "found" ? raw.status : "available";
  const zone = raw.zone === "garden" ? "garden" : "hub";
  const position: [number, number, number] = Array.isArray(raw.position) && raw.position.length >= 3 && raw.position.every(Number.isFinite)
    ? [Number(raw.position[0]), Number(raw.position[1]), Number(raw.position[2])]
    : [0, 0.2, 0];
  return { id: raw.id.slice(0, 80), itemId: raw.itemId.slice(0, 80), label: raw.label.slice(0, 80), zone, position, status, createdAtMinute: count(raw.createdAtMinute), rewardSeed: count(raw.rewardSeed) };
}

const LOST_ITEMS = [
  { itemId: "lost-blue-teddy", label: "Blue Teddy Bear", zone: "hub" as const, position: [-5.5, 0.2, 8.5] as [number, number, number] },
  { itemId: "lost-race-car", label: "Little Race Car", zone: "hub" as const, position: [10.5, 0.2, -5.5] as [number, number, number] },
  { itemId: "lost-story-book", label: "Star Story Book", zone: "garden" as const, position: [-11.5, 0.2, 5.5] as [number, number, number] },
  { itemId: "lost-crayon-box", label: "Crayon Box", zone: "garden" as const, position: [7.5, 0.2, -8.5] as [number, number, number] },
] as const;

export function createLostFoundJob(day: number, absoluteMinute: number, completed: number): LostFoundJob {
  const source = LOST_ITEMS[Math.abs(day * 7 + completed * 3 + Math.floor(absoluteMinute / 10)) % LOST_ITEMS.length];
  return {
    id: `lost-${day}-${Math.floor(absoluteMinute / 10)}-${completed}`,
    ...source,
    status: "available",
    createdAtMinute: absoluteMinute,
    rewardSeed: Math.abs(day * 97 + completed * 41 + Math.floor(absoluteMinute)),
  };
}

export type LostFoundRewardTier = "common" | "uncommon" | "rare" | "very-rare" | "jackpot";
export interface LostFoundReward { tier: LostFoundRewardTier; xp: number; cash: number; }

export function lostFoundReward(seed: number, juiceTime: boolean, luckyMultiplier = 1): LostFoundReward {
  const roll = ((Math.abs(Math.trunc(seed)) * 9301 + 49297) % 233280) / 233280;
  const boost = juiceTime ? 1.8 : 1;
  const adjusted = Math.min(0.9999, roll * boost * Math.max(1, luckyMultiplier));
  if (adjusted > 0.997) return { tier: "jackpot", xp: 1000, cash: 50 };
  if (adjusted > 0.965) return { tier: "very-rare", xp: 250, cash: 25 };
  if (adjusted > 0.86) return { tier: "rare", xp: 80, cash: 15 };
  if (adjusted > 0.55) return { tier: "uncommon", xp: 30, cash: 5 };
  return { tier: "common", xp: 12, cash: 0 };
}

export function attendanceSatisfied(entry: AttendanceEntry, activity?: RequiredActivityId) {
  if (activity === 'nap') return entry.completed;
  if (activity === 'breakfast' || activity === 'lunch') return entry.completed || entry.seconds >= MEAL_REQUIRED_REAL_SECONDS;
  return entry.completed || entry.seconds >= 20;
}
