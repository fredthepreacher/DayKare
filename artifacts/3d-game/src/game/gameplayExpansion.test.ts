import assert from "node:assert/strict";
import {
  ART_CASH,
  ART_XP,
  COLLECTIBLE_DEFINITIONS,
  FISH_CATCH_XP,
  FISH_SALE_CASH,
  FISH_SALE_XP,
  FISHING_RODS,
  MISSED_ACTIVITY_REP,
  PLANTING_XP,
  SEED_QUALITY_TIERS,
  collectibleRotation,
  createGameplayExpansion,
  heistForDay,
  lostFoundReward,
  normalizeGameplayExpansion,
  nextSeedQuality,
  seedValueMultiplier,
} from "./gameplayExpansion";
import { createInitialProgression } from "./progression";
import { softActivityGuidance } from "./schedulePolicy";
import { useGameStore } from "./store";
import { absoluteGameMinute, GUMMY_GROWTH_MINUTES } from "./gardenEconomy";
import { mapStandardGamepad } from "./gamepadInput";

assert.equal(PLANTING_XP, 12);
assert.equal(FISH_CATCH_XP + FISH_SALE_XP, 3);
assert.equal(FISH_SALE_CASH, 5);
assert.equal(ART_XP, 20);
assert.equal(ART_CASH, 20);
assert.equal(MISSED_ACTIVITY_REP, 5);
assert.deepEqual(FISHING_RODS, ["red", "white", "blue", "green", "purple"]);
assert.deepEqual(SEED_QUALITY_TIERS.map((tier) => tier.multiplier), [1, 1.15, 1.3, 1.5]);
assert.equal(nextSeedQuality("premium"), "golden");
assert.equal(nextSeedQuality("golden"), "golden");
assert.equal(seedValueMultiplier("premium"), 1.3);
const buttons = Array.from({ length: 12 }, () => ({ pressed: false, value: 0 }));
buttons[0] = { pressed: true, value: 1 };
buttons[7] = { pressed: false, value: 0.8 };
assert.deepEqual(mapStandardGamepad({ axes: [0.7, -0.5], buttons }), { x: 0.7, y: -0.5, run: true, crouch: false, jump: false, interact: true, journal: false });
assert.notEqual(heistForDay(2, null), heistForDay(3, heistForDay(2, null)), "controlled rotation avoids an immediate repeat");
assert.equal(collectibleRotation(4).length, 3);
assert.equal(new Set(collectibleRotation(4)).size, 3);
assert.ok(collectibleRotation(4).every((id) => COLLECTIBLE_DEFINITIONS.some((entry) => entry.id === id)));

const normalized = normalizeGameplayExpansion({ ownedRods: ["purple", "hacked"], swedishFish: 4_000, seedPackets: -1 }, 3);
assert.deepEqual(normalized.ownedRods, ["purple"]);
assert.equal(normalized.swedishFish, 999);
assert.equal(normalized.seedPackets, 0);
assert.equal(normalizeGameplayExpansion({ seedQuality: "premium", seedInspectionDay: 8 }, 9).seedQuality, "premium", "seed quality persists without rerolling");

const tug = softActivityGuidance("art-time", "hub", [0, 0, 0]);
assert.deepEqual(tug, [0, 0], "structured periods never apply an invisible tether before a teacher catches the player");
assert.deepEqual(softActivityGuidance("recess", "garden", [14, 0, 14]), [0, 0], "recess remains free movement");
assert.deepEqual(softActivityGuidance("juice-club", "hub", [-14, 0, 14]), [0, 0], "Juice Club remains flexible");

let normalHighTiers = 0;
let juiceHighTiers = 0;
for (let seed = 1; seed <= 200; seed += 1) {
  if (["rare", "very-rare", "jackpot"].includes(lostFoundReward(seed, false).tier)) normalHighTiers += 1;
  const boosted = lostFoundReward(seed, true);
  if (["rare", "very-rare", "jackpot"].includes(boosted.tier)) juiceHighTiers += 1;
  assert.ok(boosted.xp <= 1000, "Lost & Found payout never exceeds the configured jackpot");
}
assert.ok(juiceHighTiers > normalHighTiers, "Juice Time increases high-tier reward frequency without guaranteeing it");

useGameStore.getState().resetGame();
useGameStore.setState({
  zone: "garden",
  progression: createInitialProgression(),
  gardenActivityStep: 0,
  gummyCrop: { plantedAt: null, gummyDrops: 0, harvests: 0 },
  gummyCrop2: { plantedAt: null, gummyDrops: 0, harvests: 0 },
  expansion: createGameplayExpansion(1),
});

assert.equal(useGameStore.getState().startGardenActivity(0), true);
assert.equal(useGameStore.getState().advanceGardenActivity(0), 2);
assert.equal(useGameStore.getState().advanceGardenActivity(0), 3);
useGameStore.getState().completeActivity("garden-planting", 999, 999, 0);
assert.equal(useGameStore.getState().progression.experience, 12);
assert.equal(useGameStore.getState().expansion.seedPackets, 9);
useGameStore.getState().completeActivity("garden-planting", 999, 999, 0);
assert.equal(useGameStore.getState().progression.experience, 12, "one planting set cannot reward twice");

assert.equal(useGameStore.getState().startGardenActivity(1), true);
assert.equal(useGameStore.getState().advanceGardenActivity(1), 2);
assert.equal(useGameStore.getState().advanceGardenActivity(1), 3);
useGameStore.getState().completeActivity("garden-planting", 0, 0, 1);
assert.equal(useGameStore.getState().progression.experience, 24, "the second bed reuses the same exact reward path");
assert.equal(useGameStore.getState().expansion.secondPlantingStep, 4);

const plantedAt = absoluteGameMinute(1, 9 * 60);
useGameStore.setState((state) => ({
  gummyCrop: { plantedAt, gummyDrops: 0, harvests: 0 },
  gummyCrop2: { plantedAt, gummyDrops: 0, harvests: 0 },
  clock: { ...state.clock, minute: 9 * 60 + GUMMY_GROWTH_MINUTES },
}));
assert.equal(useGameStore.getState().harvestGummyDrops(0), 'harvested');
assert.equal(useGameStore.getState().harvestGummyDrops(1), 'harvested');
assert.equal(useGameStore.getState().gummyCrop.gummyDrops, 10);
assert.equal(useGameStore.getState().gummyCrop2.gummyDrops, 10);

assert.equal(useGameStore.getState().castFishingLine(), true);
const catchSerial = useGameStore.getState().expansion.fishingCatchSerial;
assert.equal(useGameStore.getState().catchSwedishFish(), true);
assert.equal(useGameStore.getState().expansion.fishingCatchSerial, catchSerial + 1, "successful catch starts one visual sequence");
assert.equal(useGameStore.getState().catchSwedishFish(), false, "a cast cannot be caught twice");
assert.equal(useGameStore.getState().expansion.fishingCatchSerial, catchSerial + 1, "failed duplicate catch cannot replay the visual");
const beforeFishSaleXp = useGameStore.getState().progression.experience ?? 0;
const beforeFishSaleCash = useGameStore.getState().juiceClubCash;
assert.equal(useGameStore.getState().sellSwedishFish(), true);
assert.equal(useGameStore.getState().sellSwedishFish(), false, "a fish cannot be sold twice");
assert.equal(useGameStore.getState().progression.experience, beforeFishSaleXp + 2);
assert.equal(useGameStore.getState().juiceClubCash, beforeFishSaleCash + 5);

useGameStore.setState({ juiceClubCash: 20 });
assert.equal(useGameStore.getState().purchaseFishingRod("purple"), true);
assert.equal(useGameStore.getState().purchaseFishingRod("purple"), false);
assert.equal(useGameStore.getState().equipFishingRod("purple"), true);
assert.equal(useGameStore.getState().expansion.equippedRod, "purple");

useGameStore.setState((state) => ({ dayNumber: 4, expansion: { ...state.expansion, seedQuality: "basic", seedInspectionDay: null } }));
assert.equal(useGameStore.getState().inspectSeed(false), "failed");
assert.equal(useGameStore.getState().expansion.seedQuality, "basic", "failure never downgrades seed quality");
assert.equal(useGameStore.getState().inspectSeed(true), "already-inspected", "reload/retry cannot reroll the same daily attempt");
useGameStore.setState((state) => ({ dayNumber: 5, expansion: { ...state.expansion, seedInspectionDay: null } }));
assert.equal(useGameStore.getState().inspectSeed(true), "upgraded");
assert.equal(useGameStore.getState().expansion.seedQuality, "good");
useGameStore.setState((state) => ({ juiceClubCash: 0, gummyCrop: { ...state.gummyCrop, gummyDrops: 10 } }));
assert.equal(useGameStore.getState().sellGummyCrop(0), true);
assert.equal(useGameStore.getState().juiceClubCash, 35, "Good Seed applies the centralized 1.15x full-crop value");

useGameStore.getState().setTimeOfDay(10.5);
const beforeArtXp = useGameStore.getState().progression.experience ?? 0;
const beforeArtCash = useGameStore.getState().juiceClubCash;
assert.equal(useGameStore.getState().completeArtActivity(), true);
assert.equal(useGameStore.getState().completeArtActivity(), false);
assert.equal(useGameStore.getState().progression.experience, beforeArtXp + 20);
assert.equal(useGameStore.getState().juiceClubCash, beforeArtCash + 20);

useGameStore.getState().resetGame();
useGameStore.getState().setTimeOfDay(10.25);
assert.equal(useGameStore.getState().completeShowAndTell(), true, "starter seed packets are eligible for Show & Tell");
assert.equal(useGameStore.getState().completeShowAndTell(), false, "Show & Tell rewards once per day");

useGameStore.getState().resetGame();
assert.equal(useGameStore.getState().sitAtSeat('cafeteria-seat-0'), true);
assert.equal(useGameStore.getState().sitAtSeat('cafeteria-seat-1'), false, 'the occupied player seat remains reserved');
useGameStore.getState().recordAttendance('breakfast', 10);
assert.equal(useGameStore.getState().expansion.attendance.breakfast.completed, true, 'meal attendance requires seated participation');
useGameStore.getState().standUp();
assert.equal(useGameStore.getState().seatedSeatId, null);

useGameStore.getState().setTimeOfDay(13);
assert.equal(useGameStore.getState().beginNap(), true);
useGameStore.getState().recordAttendance('nap', 120);
const napXpBefore = useGameStore.getState().progression.experience;
assert.equal(useGameStore.getState().completeNapSession(), 4, 'two real minutes award 4 XP at the centralized rate');
assert.equal(useGameStore.getState().progression.experience, napXpBefore + 4);
assert.equal(useGameStore.getState().completeNapSession(), 0, 'the same nap cannot reward twice');
useGameStore.setState((state) => ({ dayNumber: 2, schedule: 'nap', isNapping: false, expansion: { ...state.expansion, attendanceDay: 2, attendance: { ...state.expansion.attendance, nap: { seconds: 0, completed: false } } } }));
assert.equal(useGameStore.getState().beginNap(), true);
useGameStore.getState().recordAttendance('nap', 120);
useGameStore.getState().standUp(true);
assert.equal(useGameStore.getState().completeNapSession(), 0, 'getting up early forfeits the completion reward');

console.log("DayKare gameplay expansion tests passed.");
