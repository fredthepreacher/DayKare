import assert from 'node:assert/strict';
import {
  FIRST_HEIST_CASH, FIRST_HEIST_RB, FIRST_HEIST_XP, HEIST_STEPS, RASCAL_BUCKS_PER_GEM,
  REPLAY_HEIST_RB, STARTER_HOME_PRICE, TUTORIAL_CHAPTERS, canClaimDailyReplay, rbToGems, tutorialXpTotal,
} from './finalMaster';
import { useFinalMasterStore } from './finalMasterStore';
import { useGameStore } from './store';
import { useStorybookLaneStore } from './storybookLaneStore';

assert.equal(TUTORIAL_CHAPTERS.length, 7, 'orientation has exactly seven chapters');
assert.equal(tutorialXpTotal(), 385, 'orientation XP total matches the authored progression curve');
assert.equal(HEIST_STEPS.length, 6, 'heist includes briefing, scope, setup, distraction, equipment and finale');
assert.deepEqual([FIRST_HEIST_RB, FIRST_HEIST_CASH, FIRST_HEIST_XP], [14_000, 1_000, 250]);
assert.equal(REPLAY_HEIST_RB, 5_000);
assert.equal(STARTER_HOME_PRICE, 25_000);
assert.equal(RASCAL_BUCKS_PER_GEM, 10_000);
assert.deepEqual(rbToGems(24_500), { gems: 2, remainder: 4_500 });
assert.equal(canClaimDailyReplay(null, 1), true);
assert.equal(canClaimDailyReplay(4, 4), false, 'daily replay cannot duplicate on the same day');
assert.equal(canClaimDailyReplay(4, 5), true);

useStorybookLaneStore.setState({ ribbonBucks: 0, ownedItems: [], cribTier: 0 });
useGameStore.setState((state) => ({ juiceClubCash: 0, dayNumber: 3, progression: { ...state.progression, experience: 0 } }));
useFinalMasterStore.setState({ tutorialComplete: true, tutorialChapter: 7, heistStatus: 'available', heistStep: 0, firstHeistComplete: false, firstRewardChoice: null, lastReplayDay: null, ownedStarterHome: false, homeVoucher: false });
assert.equal(useFinalMasterStore.getState().startHeist(), true);
for (let step = 0; step < HEIST_STEPS.length; step += 1) assert.equal(useFinalMasterStore.getState().advanceHeist(), true);
assert.equal(useGameStore.getState().juiceClubCash, 1_000);
assert.equal(useGameStore.getState().progression.experience, 250);
assert.equal(useFinalMasterStore.getState().chooseFirstReward('rb'), true);
assert.equal(useFinalMasterStore.getState().chooseFirstReward('home'), false, 'first finale reward cannot stack');
assert.equal(useStorybookLaneStore.getState().ribbonBucks, 14_000);
assert.equal(useFinalMasterStore.getState().claimReplayReward(3), true);
for (let step = 0; step < HEIST_STEPS.length; step += 1) useFinalMasterStore.getState().advanceHeist();
assert.equal(useStorybookLaneStore.getState().ribbonBucks, 19_000);
assert.equal(useGameStore.getState().juiceClubCash, 2_000);
assert.equal(useFinalMasterStore.getState().claimReplayReward(3), false, 'same-day replay is blocked');
useFinalMasterStore.setState({ ownedStarterHome: false, homeVoucher: true });
assert.equal(useFinalMasterStore.getState().buyStarterHome(), 'purchased');
assert.equal(useStorybookLaneStore.getState().ribbonBucks, 19_000, 'home voucher never spends RB');

console.log('final master tests passed');
