import assert from 'node:assert/strict';
import { SCHEDULE_BLOCKS } from './gameClock';
import { playerFollowsSchedule, schedulePolicy } from './schedulePolicy';
import {
  GUMMY_FULL_CROP_CASH,
  GUMMY_GROWTH_MINUTES,
  GUMMY_HARVEST_SIZE,
  absoluteGameMinute,
  createGummyCrop,
  cropIsReady,
  cropProgress,
} from './gardenEconomy';
import { buildQuestBoard } from './questBoard';
import { createInitialProgression } from './progression';
import { createInitialQuests } from './quests';
import { createInitialCaper, createInitialRivalStory } from './storyProgression';
import { useGameStore } from './store';

for (const [id, duration] of [
  ['breakfast', 15],
  ['show-and-tell', 15],
  ['lunch', 15],
  ['nap', 30],
  ['recess', 30],
] as const) {
  const block = SCHEDULE_BLOCKS.find((candidate) => candidate.id === id);
  assert.ok(block, `${id} is scheduled`);
  assert.equal(block.endMinute - block.startMinute, duration, `${id} has its promised duration`);
}
assert.equal(schedulePolicy('recess')?.zone, 'garden');
assert.equal(playerFollowsSchedule('recess', 'hub', [0, 0, 0]), false, 'recess rejects staying inside');
assert.equal(playerFollowsSchedule('recess', 'garden', [0, 0, 2]), true, 'recess accepts the Garden gathering area');
assert.equal(playerFollowsSchedule('art-time', 'hub', [0, 0, 0]), false, 'art time catches a hallway wanderer');
assert.equal(playerFollowsSchedule('art-time', 'hub', [-12, 0, -12]), true);

const crop = { ...createGummyCrop(), plantedAt: absoluteGameMinute(2, 600) };
assert.equal(cropProgress(crop, crop.plantedAt + GUMMY_GROWTH_MINUTES / 2), 0.5);
assert.equal(cropIsReady(crop, crop.plantedAt + GUMMY_GROWTH_MINUTES - 1), false);
assert.equal(cropIsReady(crop, crop.plantedAt + GUMMY_GROWTH_MINUTES), true);
assert.equal(GUMMY_HARVEST_SIZE, 10);
assert.equal(GUMMY_FULL_CROP_CASH, 30);

const quests = createInitialQuests();
quests['rainbow-tidy-up'] = {
  ...quests['rainbow-tidy-up'],
  status: 'active',
  completionCount: 4,
};
const progression = {
  ...createInitialProgression(),
  activityRuns: { 'rainbow-tidy-up': 4 },
};
const tidy = buildQuestBoard({
  quests,
  progression,
  caper: createInitialCaper(),
  rivalStory: createInitialRivalStory(),
  juiceStock: 5,
  crackerStock: 5,
  juiceClubCash: 0,
  juiceClubCustomersServed: 0,
  schedule: 'breakfast',
}).find((entry) => entry.id === 'rainbow-tidy-up');
assert.equal(tidy?.roundProgress?.label, '0/6 this round', 'fresh round progress is explicit');
assert.equal(tidy?.milestoneProgress?.label, 'Storybook Lane unlocked · 4 lifetime rounds', 'permanent route progress does not reset');

useGameStore.getState().resetGame();
useGameStore.setState((state) => ({
  zone: 'garden',
  gummyCrop: {
    plantedAt: absoluteGameMinute(1, 9 * 60),
    gummyDrops: 0,
    harvests: 0,
  },
  clock: { ...state.clock, minute: 14 * 60 },
  timeOfDay: 14,
}));
assert.equal(useGameStore.getState().harvestGummyDrops(), true);
assert.equal(useGameStore.getState().gummyCrop.gummyDrops, 10);
assert.equal(useGameStore.getState().sellGummyCrop(), true);
assert.equal(useGameStore.getState().juiceClubCash, 30, 'one full crop earns the promised $30');
assert.equal(useGameStore.getState().progression.reputation, 5, 'selling a crop earns community REP');
assert.equal(useGameStore.getState().sellGummyCrop(), false, 'the same crop cannot be sold twice');

console.log('DayKare daily loop tests passed.');
