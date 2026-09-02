import assert from 'node:assert/strict';
import {
  FIRST_HEIST_CASH, FIRST_HEIST_RB, FIRST_HEIST_XP, HEIST_STEPS, RASCAL_BUCKS_PER_GEM,
  REPLAY_HEIST_RB, STARTER_HOME_PRICE, TUTORIAL_CHAPTERS, canClaimDailyReplay, rbToGems, tutorialXpTotal,
} from './finalMaster';
import { useFinalMasterStore } from './finalMasterStore';
import { useGameStore } from './store';
import { useStorybookLaneStore } from './storybookLaneStore';
import { rankFromLifetimeXp, xpRequiredForNextRank } from './progression';
import { TOAST_DEDUPE_MS, TOAST_FADE_MS, TOAST_VISIBLE_MS, useToastStore } from './toastStore';
import { interactWithMissLeslie } from './missLeslieInteraction';

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
assert.equal(xpRequiredForNextRank(1), 100);
assert.equal(xpRequiredForNextRank(10), 120);
assert.equal(xpRequiredForNextRank(30), 140);
assert.deepEqual(rankFromLifetimeXp(99), { rank: 1, xpIntoRank: 99, xpForNextRank: 100 });
assert.deepEqual(rankFromLifetimeXp(100), { rank: 2, xpIntoRank: 0, xpForNextRank: 100 });
assert.deepEqual(rankFromLifetimeXp(1_020), { rank: 11, xpIntoRank: 0, xpForNextRank: 120 });

useToastStore.getState().reset();
assert.equal(useToastStore.getState().enqueue({ title: 'Saved' }, 1_000), true);
assert.equal(useToastStore.getState().enqueue({ title: 'Saved' }, 1_000 + TOAST_DEDUPE_MS - 1), false, 'duplicate toast is suppressed');
assert.deepEqual([TOAST_VISIBLE_MS, TOAST_FADE_MS], [1_750, 300]);
useToastStore.getState().dismiss();

useGameStore.setState((state) => ({ juiceClubCash: 0, progression: { ...state.progression, experience: 0, reputation: 0 } }));
useFinalMasterStore.setState({ tutorialStarted: false, tutorialChapter: 0, tutorialCompletedSteps: [], tutorialRewardedChapters: [], tutorialMovementDistance: 0, tutorialComplete: false });
assert.equal(useFinalMasterStore.getState().recordTutorialEvent('move-5m'), false, 'events cannot complete an unstarted tutorial');
useFinalMasterStore.getState().startTutorial();
assert.equal(useFinalMasterStore.getState().recordTutorialEvent('complete-art'), false, 'future chapter event is rejected');
for (const chapter of TUTORIAL_CHAPTERS) {
  for (const step of chapter.steps) assert.equal(useFinalMasterStore.getState().recordTutorialEvent(step.id), true);
}
assert.equal(useFinalMasterStore.getState().tutorialComplete, true);
assert.equal(useGameStore.getState().progression.experience, 385);
assert.equal(useFinalMasterStore.getState().recordTutorialEvent('talk-miss-leslie'), false, 'completed rewards cannot repeat');
assert.equal(useGameStore.getState().progression.experience, 385);
useGameStore.setState({ zone: 'hub', zoneTransitioning: false, schedule: 'breakfast' });
assert.equal(useGameStore.getState().enterGarden(), false, 'normal Garden progression gate remains authoritative');
assert.equal(useGameStore.getState().enterGarden(true), true, 'the active guided chapter may use temporary Garden access');
useGameStore.setState({ zone: 'hub', zoneTransitioning: false, pendingZone: null });

useStorybookLaneStore.setState({ ribbonBucks: 0, ownedItems: [], cribTier: 0 });
useGameStore.setState((state) => ({ juiceClubCash: 0, dayNumber: 3, progression: { ...state.progression, experience: 0 } }));
useFinalMasterStore.setState({ tutorialComplete: true, tutorialChapter: 7, heistStatus: 'available', heistStep: 0, firstHeistComplete: false, firstRewardChoice: null, lastReplayDay: null, ownedStarterHome: false, homeVoucher: false });
assert.equal(interactWithMissLeslie(), 'available', 'the guaranteed first story is always offered');
assert.equal(useGameStore.getState().activeDialogue?.options?.[0]?.label, 'Start Sticker Parade Heist');
useGameStore.getState().activeDialogue?.options?.[0]?.action();
assert.equal(useFinalMasterStore.getState().heistStatus, 'active');
assert.equal(useFinalMasterStore.getState().heistStep, 1, 'Miss Leslie introduction advances into the real scope phase');
assert.equal(interactWithMissLeslie(), 'resume', 'active story always returns a deterministic resume state');
useGameStore.setState({ dayNumber: 4 });
assert.deepEqual([useFinalMasterStore.getState().heistStatus, useFinalMasterStore.getState().heistStep], ['active', 1], 'day rollover preserves active story progress');
useGameStore.setState({ dayNumber: 3 });
assert.equal(useFinalMasterStore.getState().recordHeistEvent('finale-regroup'), false, 'future heist interaction is rejected');
for (const step of HEIST_STEPS.slice(1)) for (const event of step.events) assert.equal(useFinalMasterStore.getState().recordHeistEvent(event), true);
assert.equal(useGameStore.getState().juiceClubCash, 1_000);
assert.equal(useGameStore.getState().progression.experience, 250);
assert.equal(useFinalMasterStore.getState().chooseFirstReward('rb'), true);
assert.equal(useFinalMasterStore.getState().chooseFirstReward('home'), false, 'first finale reward cannot stack');
assert.equal(useStorybookLaneStore.getState().ribbonBucks, 14_000);
assert.equal(useFinalMasterStore.getState().claimReplayReward(3), true);
for (const step of HEIST_STEPS) for (const event of step.events) useFinalMasterStore.getState().recordHeistEvent(event);
assert.equal(useStorybookLaneStore.getState().ribbonBucks, 19_000);
assert.equal(useGameStore.getState().juiceClubCash, 2_000);
assert.equal(useFinalMasterStore.getState().claimReplayReward(3), false, 'same-day replay is blocked');
useFinalMasterStore.setState({ ownedStarterHome: false, homeVoucher: true });
assert.equal(useFinalMasterStore.getState().buyStarterHome(), 'purchased');
assert.equal(useStorybookLaneStore.getState().ribbonBucks, 19_000, 'home voucher never spends RB');

console.log('final master tests passed');
