import { readFileSync } from 'node:fs';
import { ZONE_LABELS, zoneLabel } from './world';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  activateQuest,
  advanceObjective,
  createInitialQuests,
  normalizeQuestStates,
} from './quests';
import {
  CAMERA_DISTANCE,
  addCameraOrbit,
  consumeCameraRecenterRequest,
  getCameraInput,
  getCameraProfile,
  recenterCamera,
  stepCameraInput,
} from './cameraInput';
import { clearInteractionCandidates, registerInteractionCandidate, resolveInteractionCandidate } from './interactionFocus';
import {
  clearNpcNavigation,
  getNavigationTarget,
  getNpcNavigationSnapshot,
  getPortalWaypoints,
  registerNpcPosition,
} from './navigation';
import {
  TouchPointerOwnership,
  clearTouchMove,
  getTouchInput,
  resetTouchInput,
  setTouchCrouch,
  setTouchMove,
  toggleTouchRun,
} from './touchInput';
import {
  GARDEN_SPAWN,
  MIN_CAMERA_DISTANCE,
  PLAYER_RADIUS,
  PLAY_SLIDE_RAMP,
  SHINY_ROCK_SPAWN,
  TRICYCLE_RADIUS,
  WORLD_PORTALS,
  WORLD_SOLIDS,
  getWorldSolidTransform,
  getWorldSolidSurfaceTransform,
  isCameraPositionClear,
  isCameraTransitionClear,
  isWalkable,
  resolveCameraPosition,
  resolveMovement,
  trackPlayerPosition,
} from './world';
import { shouldSpawnShinyRock } from './Interactables';
import { CameraRig, advanceCameraPosition, isSweptSphereClear } from './cameraRig';
import {
  normalizePersistedGameState,
  normalizeSavedItems,
  normalizeTidyItems,
  restoreZoneState,
  serializeGameState,
} from './store';
import { HUB_ROUTES, MAX_TOKENS, isRouteUnlocked, normalizeProgression, requirementProgressLabel } from './progression';
import { useGameStore } from './store';
import { KID_CAST, facingAngleForDirection, kidActivityMode, kidDestination, resolveNpcMovement, stepNpc, teacherPatrolProfile, teacherPatrolSpots } from './NPCs';
import { isGameplayBlocked } from './gameplayGate';
import { isTouchDoubleTap, isTouchTap } from './TouchControls';
import { GARDEN_CAST, GARDEN_LANDMARKS, gardenNpcDestination } from './Garden';
import {
  RAINBOW_TIDY_PLACEMENT_RANGE,
  ROUTE_FOCUS_RING_Y,
  getRouteGateInteractionPosition,
} from './HubProgression';
import { artworkBackingSize, validateArtworkSurfaceAnchor, type ArtworkSurfaceAnchor } from './Artwork';
import { dialogueDismissLabel } from './dialogueActions';
import { getSharedActivitySession, reportSessionArrival, resetActivitySessions } from './activitySessions';
import { activitySessionIsInterrupted, sessionParticipant, shouldUseSessionSlot } from './activitySessions';
import {
  FramePerformanceTelemetry,
  getRecommendedPixelRatio,
  shouldUseRendererShadows,
} from './performanceTelemetry';
import {
  acknowledgeTeacherCall,
  getChildIntervention,
  getTeacherSupervisionTarget,
  getTeacherIntervention,
  getTeacherInterventionSnapshot,
  interventionIsActive,
  resetTeacherInterventions,
  teacherInterventionDestination,
  updateChildBehavior,
} from './teacherInterventions';
import {
  MAX_CHILD_ACTIVITY_DWELL_SECONDS,
  MIN_CHILD_ACTIVITY_DWELL_SECONDS,
  activityIsSocial,
  getChildActivityPlan,
} from './npcActivities';
import {
  advanceCaper as advanceCaperState,
  advanceDistrictPreview,
  appendRewardEvent,
  chooseCaperRole,
  completeCaperRetrieval,
  completeCaperSafeSetup,
  chooseMaeIntroduction,
  createInitialCaper,
  createInitialDistrictProgress,
  createInitialRivalStory,
  getOptionalRewardMultiplier,
  interruptCaper,
  observeCaperPatrol,
  normalizeCaper,
  normalizeDistrictProgress,
  normalizeRewardEvents,
  normalizeRivalStory,
  recordGardenStoryMilestone,
  recordRainbowStoryMilestone,
  resolveMaeStory,
  startCaper as startCaperState,
} from './storyProgression';
import {
  ONLINE_MAX_PLAYERS,
  ONLINE_STORAGE_KEY,
  createInitialOnlinePreview,
  normalizeOnlinePreview,
  serializeOnlinePreview,
} from './modeStore';

const freshRivalStory = createInitialRivalStory();
const curiousIntroduction = chooseMaeIntroduction(freshRivalStory, 'curious');
assert.equal(curiousIntroduction.beat, 'rainbow-challenge');
assert.equal(curiousIntroduction.chapter, 2);
assert.equal(curiousIntroduction.choices[0]?.choice, 'curious');
assert.equal(
  chooseMaeIntroduction(curiousIntroduction, 'bold'),
  curiousIntroduction,
  'the introduction choice is idempotent and cannot be replaced on replay',
);
const afterRainbowStory = recordRainbowStoryMilestone(curiousIntroduction);
assert.equal(afterRainbowStory.beat, 'garden-reversal');
assert.equal(
  recordGardenStoryMilestone(curiousIntroduction),
  curiousIntroduction,
  'Garden cannot skip the authored Rainbow chapter',
);
const afterGardenStory = recordGardenStoryMilestone(afterRainbowStory);
const resolvedRivalStory = resolveMaeStory(afterGardenStory);
assert.equal(resolvedRivalStory.beat, 'complete');
assert.equal(resolvedRivalStory.unlocks.includes('bridge-builder'), true);
assert.equal(resolveMaeStory(resolvedRivalStory), resolvedRivalStory);

const repairedRivalStory = normalizeRivalStory({
  beat: 'garden-reversal',
  chapter: 99,
  trust: 900,
  completedChapters: ['the-new-plan', 'forged'],
  unlocks: ['mae-note', 'forged'],
  choices: [{ beat: 'meet-mae', choice: 'kind' }, { beat: 'oops', choice: 'bold' }],
});
assert.equal(repairedRivalStory.chapter, 2);
assert.equal(repairedRivalStory.beat, 'rainbow-challenge');
assert.equal(repairedRivalStory.trust, 18);
assert.deepEqual(repairedRivalStory.completedChapters, ['the-new-plan']);
assert.deepEqual(repairedRivalStory.unlocks, ['mae-note']);
assert.equal(repairedRivalStory.choices.length, 1);
const forgedCompleteStory = normalizeRivalStory({
  ...resolvedRivalStory,
  choices: resolvedRivalStory.choices.filter((record) => record.beat !== 'make-peace'),
});
assert.equal(forgedCompleteStory.beat, 'make-peace', 'a forged completion cannot skip the final authored choice');

const rewardReceipt = {
  id: 'test-reward',
  title: 'Test',
  detail: 'A safe visual receipt',
  tokens: 2,
  reputation: 1,
};
const oneRewardReceipt = appendRewardEvent([], rewardReceipt);
assert.equal(appendRewardEvent(oneRewardReceipt, rewardReceipt), oneRewardReceipt);
assert.deepEqual(normalizeRewardEvents([rewardReceipt, { bad: true }]), [rewardReceipt]);
assert.equal(getOptionalRewardMultiplier(1_001, 1_000), 2);
assert.equal(getOptionalRewardMultiplier(1_000, 1_000), 1);

let caperRules = startCaperState(createInitialCaper());
assert.equal(caperRules.step, 'plan');
caperRules = chooseCaperRole(caperRules, 'lookout');
assert.equal(caperRules.step, 'scout');
assert.equal(caperRules.helper, 'Zoe');
caperRules = advanceCaperState(caperRules);
assert.equal(caperRules.step, 'teacher-check');
caperRules = advanceCaperState(caperRules);
assert.equal(caperRules.step, 'patrol-timing');
caperRules = observeCaperPatrol(caperRules, 1_000);
assert.equal(caperRules.step, 'patrol-timing');
assert.equal(observeCaperPatrol(caperRules, 3_000), caperRules, 'the patrol window cannot be skipped');
caperRules = observeCaperPatrol(caperRules, 3_500);
assert.equal(caperRules.step, 'safe-distraction');
caperRules = completeCaperSafeSetup(caperRules);
assert.equal(caperRules.step, 'retrieve');
caperRules = completeCaperRetrieval(caperRules);
assert.equal(caperRules.step, 'escape');
caperRules = advanceCaperState(caperRules);
assert.equal(caperRules.step, 'celebrate');
caperRules = advanceCaperState(caperRules);
assert.equal(caperRules.step, 'complete');
assert.equal(advanceCaperState(caperRules), caperRules, 'a completed caper cannot reward twice');
assert.equal(caperRules.consequence, 'friends-helped');
assert.equal(normalizeCaper({ step: 'forged', attempts: -5 }).step, 'idle');
assert.equal(normalizeCaper({ version: 1, step: 'gather', attempts: 1 }).step, 'scout');
assert.equal(
  normalizeCaper({ version: 2, step: 'retrieve', attempts: 1 }).step,
  'plan',
  'a forged v2 stage cannot authorize restricted Storage access',
);
const interruptedCaper = interruptCaper({
  ...chooseCaperRole(startCaperState(createInitialCaper()), 'route-leader'),
  step: 'patrol-timing',
});
assert.equal(interruptedCaper.step, 'interrupted');
assert.equal(interruptedCaper.consequence, 'teacher-guided');
assert.equal(advanceCaperState(interruptedCaper).step, 'scout');

const onlinePreview = createInitialOnlinePreview();
assert.equal(onlinePreview.seats.length >= 8 && onlinePreview.seats.length <= ONLINE_MAX_PLAYERS, true);
assert.equal(ONLINE_STORAGE_KEY === 'daykare-save', false, 'Online preview has a separate persistence namespace');
assert.deepEqual(
  normalizeOnlinePreview({ visibility: 'invite', selectedOutfit: 99, selectedAccessory: -1 }).visibility,
  'invite',
);
assert.equal(serializeOnlinePreview(onlinePreview).selectedOutfit, 0);
let districtRules = createInitialDistrictProgress();
for (let index = 0; index < 5; index += 1) {
  districtRules = advanceDistrictPreview(districtRules, 'makerMarket');
}
assert.equal(districtRules.makerMarket, 3, 'district entrance foundations have a bounded authored endpoint');
assert.deepEqual(
  normalizeDistrictProgress({ makerMarket: 99, storybookLane: -4 }),
  { version: 1, makerMarket: 3, storybookLane: 0 },
);

useGameStore.getState().resetGame();
useGameStore.setState((state) => ({
  progression: { ...state.progression, reputation: 17, tokens: 26, trustedHelperPass: true },
}));
useGameStore.getState().setTimeOfDay(17.5);
const dayBeforeRollover = useGameStore.getState().dayNumber;
useGameStore.getState().advanceSchedule();
const rolledDay = useGameStore.getState();
assert.equal(rolledDay.dayNumber, dayBeforeRollover + 1);
assert.equal(rolledDay.timeOfDay, 9);
assert.equal(rolledDay.schedule, 'morning-play');
assert.equal(rolledDay.progression.tokens, 26, 'day rollover preserves permanent progression');
assert.equal(rolledDay.progression.reputation, 17);

assert.equal(rolledDay.startCaper(), true);
assert.equal(rolledDay.startCaper(), false, 'an active caper cannot restart over itself');
assert.equal(useGameStore.getState().chooseCaperRole('route-leader'), true);
assert.equal(useGameStore.getState().advanceCaper(), true);
assert.equal(useGameStore.getState().advanceCaper(), true);
assert.equal(useGameStore.getState().observeCaperPatrol(1_000), true);
assert.equal(useGameStore.getState().observeCaperPatrol(3_500), true);
assert.equal(useGameStore.getState().completeCaperSafeSetup(), true);
assert.equal(useGameStore.getState().completeCaperRetrieval(), true);
assert.equal(useGameStore.getState().advanceCaper(), true);
const caperRewardBefore = useGameStore.getState().progression.tokens;
assert.equal(useGameStore.getState().advanceCaper(), true);
assert.equal(useGameStore.getState().progression.tokens, caperRewardBefore + 3);
assert.equal(useGameStore.getState().advanceCaper(), false, 'caper completion is idempotent');
assert.equal(useGameStore.getState().progression.tokens, caperRewardBefore + 3);

useGameStore.setState((state) => ({
  progression: { ...state.progression, tokens: Math.max(25, state.progression.tokens) },
}));
assert.equal(useGameStore.getState().advanceDistrictPreview('makerMarket'), true);
assert.equal(useGameStore.getState().districtProgress.makerMarket >= 1, true);
const boostStartedAt = Date.now();
assert.equal(useGameStore.getState().activateOptionalRewardBoost(boostStartedAt), true);
assert.equal(useGameStore.getState().activateOptionalRewardBoost(boostStartedAt + 100), false);
assert.equal(useGameStore.getState().startCaper(), true);
assert.equal(useGameStore.getState().chooseCaperRole('supply-helper'), true);
assert.equal(useGameStore.getState().advanceCaper(), true);
assert.equal(useGameStore.getState().advanceCaper(), true);
assert.equal(useGameStore.getState().observeCaperPatrol(10_000), true);
assert.equal(useGameStore.getState().observeCaperPatrol(12_500), true);
assert.equal(useGameStore.getState().completeCaperSafeSetup(), true);
assert.equal(useGameStore.getState().completeCaperRetrieval(), true);
assert.equal(useGameStore.getState().advanceCaper(), true);
const boostedCaperRewardBefore = useGameStore.getState().progression.tokens;
assert.equal(useGameStore.getState().advanceCaper(), true);
assert.equal(
  useGameStore.getState().progression.tokens,
  boostedCaperRewardBefore + 6,
  'the visible optional boost doubles ordinary Star Token rewards for 15 seconds',
);
const serializedExpandedSave = serializeGameState(useGameStore.getState());
assert.equal('rewardEvents' in serializedExpandedSave, false, 'transient reward receipts are never persisted');
const expandedSave = normalizePersistedGameState(serializedExpandedSave);
assert.equal(expandedSave.dayNumber, dayBeforeRollover + 1);
assert.equal(expandedSave.caper.step, 'complete');
assert.equal(expandedSave.districtProgress.makerMarket >= 1, true);
assert.equal(expandedSave.optionalRewardBoostUntil, 0, 'the optional 15-second boost remains session-only');
assert.deepEqual(expandedSave.rewardEvents, [], 'reload never replays stale reward celebrations');
useGameStore.getState().resetGame();

const migratedFound = normalizeQuestStates(undefined, 'found', []);
assert.equal(migratedFound['where-binky'].currentObjectiveId, 'return-binky');
assert.equal(migratedFound['where-binky'].objectiveStates['search-storage'], 'complete');

const migratedComplete = normalizeQuestStates(undefined, 'returned-good', ['keepsake']);
assert.equal(migratedComplete['where-binky'].status, 'complete');
assert.equal(migratedComplete['rainbow-tidy-up'].status, 'active');

const interrupted = normalizeQuestStates({
  'where-binky': {
    status: 'active',
    currentObjectiveId: null,
    objectiveStates: {
      'talk-to-leo': 'complete',
      'ask-mia': 'complete',
      'trade-with-sam': 'complete',
      'search-storage': 'complete',
      'return-binky': 'pending',
    },
  },
}, 'found', []);
assert.equal(interrupted['where-binky'].currentObjectiveId, 'return-binky');
assert.equal(interrupted['where-binky'].objectiveStates['return-binky'], 'active');

const malformed = normalizeQuestStates({ 'where-binky': { status: 'oops', objectiveStates: null } });
assert.equal(malformed['where-binky'].status, 'active');
assert.equal(malformed['where-binky'].currentObjectiveId, 'talk-to-leo');

const shinyRockQuest = advanceObjective(
  advanceObjective(createInitialQuests(), 'where-binky', 'talk-to-leo'),
  'where-binky',
  'ask-mia',
);
assert.equal(shouldSpawnShinyRock(shinyRockQuest, [], 'hub'), true);
assert.equal(shouldSpawnShinyRock(shinyRockQuest, ['Shiny Rock'], 'hub'), false);
assert.equal(shouldSpawnShinyRock(shinyRockQuest, [], 'garden'), false);
assert.equal(isWalkable(new THREE.Vector3(...SHINY_ROCK_SPAWN), 0.34, [], 'hub'), true);

const contradictoryActive = normalizeQuestStates({
  'where-binky': {
    status: 'active',
    currentObjectiveId: 'return-binky',
    objectiveStates: Object.fromEntries([
      'talk-to-leo', 'ask-mia', 'trade-with-sam', 'search-storage', 'return-binky',
    ].map((id) => [id, 'complete'])),
  },
});
assert.equal(contradictoryActive['where-binky'].status, 'complete');
assert.equal(contradictoryActive['where-binky'].currentObjectiveId, null);

const contradictoryComplete = normalizeQuestStates({
  'where-binky': {
    status: 'complete',
    currentObjectiveId: null,
    objectiveStates: { 'talk-to-leo': 'complete' },
  },
});
assert.equal(contradictoryComplete['where-binky'].status, 'active');
assert.equal(contradictoryComplete['where-binky'].currentObjectiveId, 'ask-mia');

const contradictoryLockedTidy = normalizeQuestStates({
  'rainbow-tidy-up': {
    status: 'locked',
    currentObjectiveId: null,
    objectiveStates: Object.fromEntries([
      'collect-blue-block', 'place-blue-block', 'collect-red-block',
      'place-red-block', 'collect-yellow-block', 'place-yellow-block',
    ].map((id) => [id, 'complete'])),
  },
}, 'returned-good');
assert.equal(contradictoryLockedTidy['rainbow-tidy-up'].status, 'active');
assert.equal(contradictoryLockedTidy['rainbow-tidy-up'].currentObjectiveId, 'collect-blue-block');

const ownership = normalizeSavedItems(
  ['binky', 'binky'],
  [
    { id: 'same', item: 'binky', position: [1, 0, 1] },
    { id: 'same', item: 'blue-block', position: [2, 0, 2] },
  ],
);
assert.deepEqual(ownership.inventory, ['binky']);
assert.deepEqual(ownership.droppedItems.map((item) => item.id), ['dropped-blue-block']);
assert.deepEqual(
  normalizeTidyItems(['blue-block', 'red-block', 'yellow-block', 'blue-block', 'junk']),
  ['blue-block', 'red-block', 'yellow-block'],
);

const unsafeOwnership = normalizeSavedItems(
  [],
  [
    { id: 'outside', item: 'blue-block', position: [99, 0, 99], zone: 'hub' },
    { id: 'garden-quest-item', item: 'binky', position: [0, 0, 12], zone: 'garden' },
  ],
);
assert.deepEqual(unsafeOwnership.droppedItems, [], 'invalid and cross-zone quest drops recover instead of persisting');

let quests = createInitialQuests();
quests = advanceObjective(quests, 'where-binky', 'talk-to-leo');
assert.equal(quests['where-binky'].currentObjectiveId, 'ask-mia');
const unchanged = advanceObjective(quests, 'where-binky', 'return-binky');
assert.equal(unchanged, quests);
quests = activateQuest(quests, 'rainbow-tidy-up');
assert.equal(quests['rainbow-tidy-up'].currentObjectiveId, 'collect-blue-block');

let bluePlacementQuests = advanceObjective(quests, 'rainbow-tidy-up', 'collect-blue-block');
useGameStore.getState().resetGame();
useGameStore.setState({
  quests: bluePlacementQuests,
  inventory: ['red-block'],
  tidyPlacedItems: [],
});
assert.equal(
  useGameStore.getState().completeTidyToy('red-block'),
  false,
  'the station rejects a carried block that does not match the active placement objective',
);
assert.equal(
  useGameStore.getState().completeTidyToy('blue-block'),
  false,
  'the station rejects placement when the required block is not carried',
);
useGameStore.setState({ inventory: ['blue-block'] });
assert.equal(useGameStore.getState().completeTidyToy('blue-block'), true);
assert.deepEqual(useGameStore.getState().inventory, [], 'placement consumes the carried block atomically');
assert.deepEqual(useGameStore.getState().tidyPlacedItems, ['blue-block']);
assert.equal(useGameStore.getState().quests['rainbow-tidy-up'].currentObjectiveId, 'collect-red-block');
assert.equal(
  useGameStore.getState().completeTidyToy('blue-block'),
  false,
  'a placed block cannot advance the activity twice',
);
const reloadedBluePlacement = normalizePersistedGameState(serializeGameState(useGameStore.getState()));
assert.deepEqual(reloadedBluePlacement.inventory, []);
assert.deepEqual(reloadedBluePlacement.tidyPlacedItems, ['blue-block']);
assert.equal(reloadedBluePlacement.quests['rainbow-tidy-up'].currentObjectiveId, 'collect-red-block');

let finalPlacementQuests = quests;
for (const objective of [
  'collect-blue-block',
  'place-blue-block',
  'collect-red-block',
  'place-red-block',
  'collect-yellow-block',
]) {
  finalPlacementQuests = advanceObjective(finalPlacementQuests, 'rainbow-tidy-up', objective);
}
useGameStore.getState().resetGame();
useGameStore.setState({
  quests: finalPlacementQuests,
  inventory: ['yellow-block'],
  tidyPlacedItems: ['blue-block', 'red-block'],
});
const rewardBeforeTidy = useGameStore.getState().progression;
assert.equal(useGameStore.getState().completeTidyToy('yellow-block'), true);
const completedTidy = useGameStore.getState();
assert.equal(completedTidy.progression.tokens, rewardBeforeTidy.tokens + 2);
assert.equal(completedTidy.progression.reputation, rewardBeforeTidy.reputation + 2);
assert.equal(completedTidy.progression.trustedHelperPass, true);
assert.equal(completedTidy.quests['rainbow-tidy-up'].currentObjectiveId, 'collect-blue-block');
const completedTidySave = normalizePersistedGameState(serializeGameState(completedTidy));
assert.equal(completedTidySave.progression.tokens, completedTidy.progression.tokens);
assert.equal(completedTidySave.progression.reputation, completedTidy.progression.reputation);
assert.equal(completedTidySave.progression.activityRuns['rainbow-tidy-up'], 1);
useGameStore.setState(completedTidySave);
assert.equal(useGameStore.getState().completeTidyToy('yellow-block'), false);
assert.equal(
  useGameStore.getState().progression.activityRewards['rainbow-tidy-up'],
  2,
  'reload preserves one completion reward without allowing a duplicate',
);
useGameStore.getState().resetGame();

const wallSlideStart = new THREE.Vector3(7.1, 0, 4);
const wallSlideDesired = new THREE.Vector3(9, 0, 2.6);
const wallSlideResult = resolveMovement(wallSlideStart, wallSlideDesired, PLAYER_RADIUS);
assert.ok(wallSlideResult.x < 7.4, 'divider blocks traversal outside the doorway');
assert.ok(wallSlideResult.z < wallSlideStart.z, 'axis separation still permits wall sliding');

const doorwayStart = new THREE.Vector3(7.1, 0, 0);
const doorwayResult = resolveMovement(doorwayStart, new THREE.Vector3(9, 0, 0), PLAYER_RADIUS);
assert.ok(doorwayResult.x > 8.5, 'authored doorway remains traversable');
assert.ok(isWalkable(doorwayResult, PLAYER_RADIUS));
const doorwayEdgeResult = resolveMovement(
  new THREE.Vector3(7.1, 0, 1.66),
  new THREE.Vector3(9, 0, 1.66),
  PLAYER_RADIUS,
);
assert.ok(doorwayEdgeResult.x > 8.5, 'doorway clearance includes a conservative edge margin');
const solidWallResult = resolveMovement(
  new THREE.Vector3(7.1, 0, 4),
  new THREE.Vector3(12, 0, 4),
  PLAYER_RADIUS,
);
assert.ok(solidWallResult.x < 7.4, 'sub-stepping cannot tunnel through a visible divider panel');

for (const portal of WORLD_PORTALS) {
  const axisIndex = portal.axis === 'x' ? 0 : 2;
  const alongIndex = portal.axis === 'x' ? 2 : 0;
  for (const direction of [-1, 1]) {
    for (const radius of [PLAYER_RADIUS, TRICYCLE_RADIUS]) {
      const speed = radius === TRICYCLE_RADIUS ? 10 : 8;
      const start = new THREE.Vector3(...portal.position);
      const target = new THREE.Vector3(...portal.position);
      start.setComponent(axisIndex, portal.position[axisIndex] - direction * 1.2);
      target.setComponent(axisIndex, portal.position[axisIndex] + direction * 0.9);
      start.setComponent(alongIndex, portal.position[alongIndex] + 0.7);
      target.setComponent(alongIndex, portal.position[alongIndex] + 0.7 + direction * 0.25);
      let position = start.clone();
      let crossed = false;
      let stalledFrames = 0;
      for (let frame = 0; frame < 180 && position.distanceTo(target) > 0.04; frame += 1) {
        const towardTarget = target.clone().sub(position).setY(0);
        const remaining = towardTarget.length();
        const desired = position.clone().add(
          towardTarget.normalize().multiplyScalar(Math.min(speed / 60, remaining)),
        );
        const next = resolveMovement(position, desired, radius, 0.2, 'hub');
        const moved = next.distanceTo(position);
        stalledFrames = moved < 1e-6 ? stalledFrames + 1 : 0;
        assert.ok(moved <= speed / 60 + 1e-5, `${portal.id} never exceeds its requested running step`);
        assert.equal(isWalkable(next, radius, [], 'hub'), true, `${portal.id} keeps radius ${radius} walkable`);
        if ((next.getComponent(axisIndex) - portal.position[axisIndex]) * direction > 0) crossed = true;
        position = next;
      }
      assert.equal(crossed, true, `${portal.id} crosses in direction ${direction} at radius ${radius}`);
      assert.ok(position.distanceTo(target) < 0.06, `${portal.id} diagonal run completes at radius ${radius}`);
      assert.ok(stalledFrames < 3, `${portal.id} diagonal run does not settle into a doorway stall`);
    }
  }
}

const closeWallTarget = new THREE.Vector3(0, 1, -6.5);
const closeWallCamera = resolveCameraPosition(closeWallTarget, new THREE.Vector3(0, 1, -9));
assert.ok(
  closeWallCamera.distanceTo(closeWallTarget) >= MIN_CAMERA_DISTANCE,
  'nearby walls use a safe side angle instead of collapsing the camera',
);
assert.ok(closeWallCamera.z > -7.5, 'camera remains on the playable side of the wall');
const lowPropCameraTarget = new THREE.Vector3(3, 2, -1);
const lowPropDesiredCamera = new THREE.Vector3(3, 2, -5);
assert.deepEqual(
  resolveCameraPosition(lowPropCameraTarget, lowPropDesiredCamera).toArray(),
  lowPropDesiredCamera.toArray(),
  'low counters do not obstruct a camera ray above them',
);
const routeGateCamera = resolveCameraPosition(
  new THREE.Vector3(12, 1, -13),
  new THREE.Vector3(16, 1, -13),
);
assert.ok(
  routeGateCamera.distanceTo(new THREE.Vector3(12, 1, -13)) >= MIN_CAMERA_DISTANCE,
  'route gate obstruction preserves a nonzero framing distance',
);
assert.equal(isCameraPositionClear(routeGateCamera), true, 'camera alternate is outside every structural blocker');
const cameraRig = new CameraRig();
let rigCamera = new THREE.Vector3(0, 2.8, 8);
const rigFrames = [1 / 30, 1 / 60, 1 / 120];
for (let frame = 0; frame < 120; frame += 1) {
  // This path follows the north wall, crosses a corner and reverses through a
  // doorway-like opening. The deterministic rig must not chatter sides.
  const target = new THREE.Vector3(
    frame < 45 ? -3 + frame * 0.06 : frame < 80 ? -0.3 : 3.2 - (frame - 80) * 0.085,
    1,
    -6.5 + (frame % 7) * 0.015,
  );
  const desired = target.clone().add(new THREE.Vector3(0, 3.2, -9.2));
  const result = cameraRig.resolve(
    target,
    desired,
    rigCamera,
    0.2,
    MIN_CAMERA_DISTANCE,
    WORLD_SOLIDS.filter((solid) => (
      solid.zone === 'hub' && (solid.cameraRole === 'structural' || solid.cameraRole === 'substantial')
    )),
    rigFrames[frame % rigFrames.length],
  );
  assert.equal(isCameraPositionClear(result.position), true, 'wall-following emits no clipped camera position');
  assert.equal(
    isCameraTransitionClear(target, result.position),
    true,
    'every emitted rig position has a continuous clear target sightline',
  );
  if (result.transitionClear) {
    assert.equal(isCameraTransitionClear(rigCamera, result.position), true, 'reported clear transition is swept-safe');
  }
  rigCamera.copy(result.position);
}
assert.ok(cameraRig.state.switches <= 5, 'side hysteresis bounds wall and corner switching');
for (const frameRate of [30, 60, 120]) {
  const blockers = WORLD_SOLIDS.filter((solid) => (
    solid.zone === 'hub' && (solid.cameraRole === 'structural' || solid.cameraRole === 'substantial')
  ));
  const target = new THREE.Vector3(0, 1, -6.2);
  let position = new THREE.Vector3(0, 3.8, 1.5);
  const goal = new THREE.Vector3(3.1, 4.2, -7.2);
  for (let frame = 0; frame < frameRate; frame += 1) {
    const previous = position.clone();
    position = advanceCameraPosition(previous, target, goal, 7 / frameRate, 0.2, blockers);
    assert.equal(isCameraTransitionClear(previous, position), true, `${frameRate}Hz camera step stays physically clear`);
    assert.equal(isCameraTransitionClear(target, position), true, `${frameRate}Hz camera step keeps a clear sightline`);
  }
}
const recoveryBlockers = [{
  id: 'recovery-wall',
  minX: -2,
  maxX: 2,
  minZ: -0.2,
  maxZ: 0.2,
  minY: 0,
  maxY: 4,
  shape: 'box' as const,
}];
const recoveryRig = new CameraRig();
const oldTarget = new THREE.Vector3(0, 1, 2);
let recoveryCamera = recoveryRig.resolve(
  oldTarget,
  new THREE.Vector3(0, 2.5, 5),
  new THREE.Vector3(0, 2.5, 4),
  0.2,
  MIN_CAMERA_DISTANCE,
  recoveryBlockers,
).position;
const crossedTarget = new THREE.Vector3(0, 1, -2);
const crossedDesired = new THREE.Vector3(0, 2.5, -6);
let recoveredSightline = false;
for (let frame = 0; frame < 240; frame += 1) {
  const result = recoveryRig.resolve(
    crossedTarget,
    crossedDesired,
    recoveryCamera,
    0.2,
    MIN_CAMERA_DISTANCE,
    recoveryBlockers,
    1 / 60,
  );
  const previous = recoveryCamera.clone();
  recoveryCamera = advanceCameraPosition(
    previous,
    crossedTarget,
    result.position,
    7 / 60,
    0.2,
    recoveryBlockers,
  );
  assert.equal(
    isSweptSphereClear(previous, recoveryCamera, 0.2, recoveryBlockers),
    true,
    'occluded recovery never moves the camera body through a wall',
  );
  if (isSweptSphereClear(crossedTarget, recoveryCamera, 0.2, recoveryBlockers)) {
    recoveredSightline = true;
  }
}
assert.equal(recoveredSightline, true, 'an occluded camera eventually recovers a clear sightline');
const sweepBox = [{
  id: 'sweep-box',
  minX: 0,
  maxX: 1,
  minZ: -1,
  maxZ: 1,
  minY: 0,
  maxY: 2,
  shape: 'box' as const,
}];
assert.equal(
  isSweptSphereClear(new THREE.Vector3(-0.21, 1, -2), new THREE.Vector3(-0.21, 1, 2), 0.2, sweepBox),
  true,
  'a swept camera volume just outside an expanded box remains clear',
);
assert.equal(
  isSweptSphereClear(new THREE.Vector3(-0.19, 1, -2), new THREE.Vector3(-0.19, 1, 2), 0.2, sweepBox),
  false,
  'continuous sweep catches a thin box-edge crossing',
);
assert.equal(
  isSweptSphereClear(new THREE.Vector3(0.5, 1, 0), new THREE.Vector3(0.5, 1, 0), 0.2, sweepBox),
  false,
  'zero-length sweeps still reject a camera already inside a blocker',
);
const gardenRig = new CameraRig();
const gardenTarget = new THREE.Vector3(-2.7, 1, 1.5);
const gardenResult = gardenRig.resolve(
  gardenTarget,
  new THREE.Vector3(-2.7, 3.4, 7.5),
  new THREE.Vector3(-2.7, 3.4, 0.5),
  0.2,
  MIN_CAMERA_DISTANCE,
  WORLD_SOLIDS.filter((solid) => solid.zone === 'garden' && (solid.cameraRole === 'structural' || solid.cameraRole === 'substantial')),
);
assert.equal(isCameraPositionClear(gardenResult.position, 0.2, 'garden'), true, 'tall Garden posts are camera blockers');
assert.equal(isCameraTransitionClear(gardenTarget, gardenResult.position, 0.2, 'garden'), true, 'Garden sightline is continuously clear');
for (const [zone, blockers, path] of [
  [
    'hub',
    WORLD_SOLIDS.filter((solid) => solid.zone === 'hub' && (solid.cameraRole === 'structural' || solid.cameraRole === 'substantial')),
    [
      new THREE.Vector3(-5.8, 1, -6.45),
      new THREE.Vector3(5.8, 1, -6.45),
      new THREE.Vector3(5.8, 1, 6.45),
      new THREE.Vector3(-5.8, 1, 6.45),
    ],
  ],
  [
    'garden',
    WORLD_SOLIDS.filter((solid) => solid.zone === 'garden' && (solid.cameraRole === 'structural' || solid.cameraRole === 'substantial')),
    [
      new THREE.Vector3(-4.2, 1, 4.8),
      new THREE.Vector3(4.2, 1, 4.8),
      new THREE.Vector3(5.8, 1, -3.4),
      new THREE.Vector3(-4.8, 1, -3.4),
    ],
  ],
] as const) {
  for (const frameRate of [30, 60, 120]) {
    const rig = new CameraRig();
    let segment = 0;
    let target = path[0].clone();
    let desired = target.clone().add(new THREE.Vector3(0, 3.4, 8.6));
    let camera = rig.resolve(target, desired, desired, 0.2, MIN_CAMERA_DISTANCE, blockers, 1 / frameRate).position;
    let maxOccludedFrames = 0;
    let occludedFrames = 0;
    for (let frame = 0; frame < frameRate * 16; frame += 1) {
      if (frame > 0 && frame % (frameRate * 2) === 0) segment = (segment + 1) % path.length;
      const nextSegment = (segment + 1) % path.length;
      const localTime = (frame % (frameRate * 2)) / (frameRate * 2);
      const direction = Math.floor(frame / (frameRate * 8)) % 2 === 0 ? 1 : -1;
      const from = direction > 0 ? path[segment] : path[nextSegment];
      const to = direction > 0 ? path[nextSegment] : path[segment];
      target = from.clone().lerp(to, localTime);
      desired = target.clone().add(new THREE.Vector3(0, 3.4, 8.6));
      if (frame > 0 && frame % (frameRate * 4) === 0) rig.reset(false);
      const result = rig.resolve(target, desired, camera, 0.2, MIN_CAMERA_DISTANCE, blockers, 1 / frameRate);
      const previous = camera.clone();
      camera = advanceCameraPosition(previous, target, result.position, 7 / frameRate, 0.2, blockers);
      assert.ok(previous.distanceTo(camera) <= 7 / frameRate + 1e-5, `${zone} ${frameRate}Hz camera has no one-frame jump`);
      assert.equal(isSweptSphereClear(previous, camera, 0.2, blockers), true, `${zone} ${frameRate}Hz camera body remains swept-safe`);
      const clearSightline = isSweptSphereClear(target, camera, 0.2, blockers);
      occludedFrames = clearSightline ? 0 : occludedFrames + 1;
      maxOccludedFrames = Math.max(maxOccludedFrames, occludedFrames);
    }
    assert.ok(maxOccludedFrames <= frameRate * 2, `${zone} ${frameRate}Hz camera recovers its sightline within two seconds`);
    assert.ok(rig.state.switches <= 24, `${zone} ${frameRate}Hz side switching stays bounded through corners and reversals`);
  }
}
for (const desiredCamera of [
  new THREE.Vector3(0, 1, -10),
  new THREE.Vector3(10, 1, -8.4),
  new THREE.Vector3(-16.1, 1, 0),
]) {
  const safeCamera = resolveCameraPosition(new THREE.Vector3(0, 1, 0), desiredCamera);
  assert.equal(isCameraPositionClear(safeCamera), true, `resolved camera ${safeCamera.toArray().join(',')} never clips a wall`);
}

const route = getPortalWaypoints(new THREE.Vector3(0, 0, 0), new THREE.Vector3(12, 0, 5));
assert.equal(route[0].x, 7.1);
assert.equal(route.at(-1)?.x, 12);

const persistentDestination = new THREE.Vector3(12, 0, -11.5);
const firstNpcWaypoint = getNavigationTarget('test-kid', new THREE.Vector3(0, 0, 0), persistentDestination);
const secondNpcWaypoint = getNavigationTarget('test-kid', new THREE.Vector3(0.1, 0, 0), persistentDestination);
assert.equal(firstNpcWaypoint.x, secondNpcWaypoint.x, 'NPC keeps the same portal waypoint while following a path');
clearNpcNavigation();
const cleanupMirror = new THREE.Vector3(0, 0, 0);
const unregisterNpc = registerNpcPosition('cleanup-kid', cleanupMirror);
getNavigationTarget('cleanup-kid', cleanupMirror, new THREE.Vector3(4, 0, 0));
assert.deepEqual(getNpcNavigationSnapshot(), { positionCount: 1, pathCount: 1 });
unregisterNpc();
assert.deepEqual(
  getNpcNavigationSnapshot(),
  { positionCount: 0, pathCount: 0 },
  'unmount cleanup removes both NPC separation and path registrations',
);

const artTable = getWorldSolidTransform('art-table', 1);
assert.deepEqual(artTable.position, [-12, 0.5, -12]);
assert.deepEqual(artTable.size, [3.3999999999999986, 1, 3.3999999999999986]);
assert.ok(PLAY_SLIDE_RAMP.solid.minZ <= PLAY_SLIDE_RAMP.position[2] - 1);
// The ramp is a 3-long box rotated -45 degrees about X, so it crosses y = 0 at
// z = -3 and everything south of that is buried under the playground floor. The
// collider now stops there. It used to run to the full rotated footprint, which
// put 0.28 m of invisible wall over bare grass at the bottom of the slide.
assert.equal(
  PLAY_SLIDE_RAMP.solid.maxZ,
  -3,
  'the ramp collider ends where the ramp stops being above the floor',
);
assert.ok(
  PLAY_SLIDE_RAMP.solid.maxZ < PLAY_SLIDE_RAMP.position[2] + 1.06,
  'the collider does not extend past the visible ramp geometry',
);
const upperStorageBox = getWorldSolidTransform('storage-box-upper', 0.8, 1.4);
assert.deepEqual(upperStorageBox.position, [-14, 1.4, 10]);
assert.deepEqual(upperStorageBox.size, [0.8000000000000007, 0.8, 0.8000000000000007]);
assert.deepEqual(
  getWorldSolidSurfaceTransform('main-south-wall', 'north', 1.72, 4.6),
  { position: [4.6, 1.72, 7.66], rotation: [0, Math.PI, 0] },
  'wall art placement derives from the authored wall face',
);
assert.deepEqual(
  getWorldSolidSurfaceTransform('west-boundary', 'east', 1.65, 4.4),
  { position: [-15.66, 1.65, 4.4], rotation: [0, Math.PI / 2, 0] },
  'side-wall anchors derive both position and facing',
);
assert.equal(
  WORLD_SOLIDS.find((solid) => solid.id === 'storage-box-upper')?.collision,
  false,
  'the elevated storage box does not add a redundant ground-level collider',
);

assert.equal(isWalkable(new THREE.Vector3(10, 0, 0), PLAYER_RADIUS, [], 'hub'), true);
assert.equal(isWalkable(new THREE.Vector3(10, 0, 0), PLAYER_RADIUS, [], 'garden'), false, 'Garden pond owns Garden-only collision');
assert.equal(
  isWalkable(new THREE.Vector3(7.35, 0, 2.45), PLAYER_RADIUS, [], 'garden'),
  true,
  'round pond collision does not block visibly grassy corners',
);
assert.equal(
  isWalkable(new THREE.Vector3(0, 0, 6.1), PLAYER_RADIUS, [], 'garden'),
  true,
  'the open gazebo center is traversable',
);
assert.equal(
  isWalkable(new THREE.Vector3(-2.7, 0, 3.4), PLAYER_RADIUS, [], 'garden'),
  false,
  'visible gazebo posts have matching collision',
);
const diagonalPondResult = resolveMovement(
  new THREE.Vector3(6.8, 0, -3.4),
  new THREE.Vector3(8.4, 0, -1.8),
  PLAYER_RADIUS,
  0.2,
  'garden',
);
assert.ok(
  Math.hypot(diagonalPondResult.x - 10, diagonalPondResult.z + 0.2) >= 2.72 + PLAYER_RADIUS,
  'round pond contacts resolve radially outside the visible shoreline',
);
const gardenEdge = resolveMovement(
  new THREE.Vector3(0, 0, 14),
  new THREE.Vector3(0, 0, 22),
  PLAYER_RADIUS,
  0.38,
  'garden',
);
assert.ok(gardenEdge.z < 17.4, 'Garden bounds prevent leaving the playable region');

const gardenRoute = HUB_ROUTES.find((routeDefinition) => routeDefinition.id === 'garden-district');
assert.ok(gardenRoute);
assert.equal(normalizeProgression({ reputation: 9 }).routeUnlocks.includes('garden-district'), false);
assert.equal(normalizeProgression({ reputation: 10 }).routeUnlocks.includes('garden-district'), true);
const forgedGardenUnlock = normalizeProgression({
  reputation: 0,
  routeUnlocks: ['garden-district'],
});
assert.equal(forgedGardenUnlock.routeUnlocks.includes('garden-district'), false);
assert.equal(isRouteUnlocked(HUB_ROUTES[0], forgedGardenUnlock), false, 'Garden requirement stays authoritative over saved unlock flags');
const malformedProgression = normalizeProgression({
  reputation: Number.POSITIVE_INFINITY,
  tokens: Number.MAX_VALUE,
  activityRuns: {
    'garden-planting': 2,
    'forged-activity': 500,
    'juice-club-service': -1,
  },
  activityRewards: {
    'garden-planting': 999,
    'forged-activity': 500,
    'juice-club-service': Number.NaN,
  },
  collectibleProgress: { 'Shiny Rock': 3, 'forged-item': 90 },
  vehicleProgress: { tricycleRides: 4, flying: 100 },
  hubUpgrades: ['storage-organizer', 'forged-upgrade'],
});
assert.equal(malformedProgression.reputation, 0);
assert.equal(malformedProgression.tokens, MAX_TOKENS);
assert.deepEqual(malformedProgression.activityRuns, { 'garden-planting': 2 });
assert.deepEqual(malformedProgression.activityRewards, { 'garden-planting': 4 });
assert.deepEqual(malformedProgression.collectibleProgress, { 'Shiny Rock': 3 });
assert.deepEqual(malformedProgression.vehicleProgress, { tricycleRides: 4 });
assert.deepEqual(malformedProgression.hubUpgrades, ['storage-organizer']);
assert.equal(
  restoreZoneState(
    { zone: 'garden', playerPosition: [0, 0, 12], hubPosition: [1, 0, 1], gardenPosition: [0, 0, 12] },
    forgedGardenUnlock,
  ).zone,
  'hub',
  'an unauthorized saved Garden zone restores safely to the Hub',
);
assert.equal(
  restoreZoneState(
    { zone: 'garden', playerPosition: [0, 0, 12], hubPosition: [1, 0, 1], gardenPosition: [0, 0, 12] },
    normalizeProgression({ reputation: 10 }),
  ).zone,
  'garden',
  'an authorized Garden save remains in the Garden',
);
assert.equal(
  requirementProgressLabel(HUB_ROUTES[0], normalizeProgression({ reputation: 7 })),
  '7/10 hub reputation',
);

const validSaveSource = {
  ...serializeGameState(useGameStore.getState()),
  quality: 'low' as const,
  timeOfDay: 12.25,
  schedule: 'juice-club' as const,
  isRainy: true,
  inventory: ['blue-block'],
  collectibles: [],
  friends: {
    ...useGameStore.getState().friends,
    Leo: { mood: 'happy' as const, friendship: 72, recentMemory: 'Got Binky back!' },
  },
  juiceStock: 17,
  crackerStock: 14,
  juiceClubCash: 22,
  juiceClubCustomersServed: 9,
  juiceClubSatisfaction: 88,
  juiceUpgrades: ['premium-cups'],
  waitingCustomers: ['Max', 'Noah'],
  juiceClubActiveCustomer: 'Max',
  juiceClubServedCustomer: null,
  juiceClubCustomerPhase: 'ordering' as const,
  progression: normalizeProgression({
    reputation: 10,
    tokens: 12,
    activityRuns: { 'garden-planting': 2, 'juice-club-service': 9 },
    activityRewards: { 'garden-planting': 4, 'juice-club-service': 9 },
    hubUpgrades: ['storage-organizer'],
    trustedHelperPass: true,
  }),
  zone: 'garden' as const,
  playerPosition: [1, 0, 12] as [number, number, number],
  gardenPosition: [1, 0, 12] as [number, number, number],
  hubPosition: [12, 0, -10.4] as [number, number, number],
};
const validSave = normalizePersistedGameState(validSaveSource);
assert.equal(validSave.quality, 'low');
// The preset field was widened from 'low' | 'high' to the five presets. Every
// existing save keeps its setting because both legacy values are still valid,
// and the new ones round-trip rather than being normalised away.
for (const preset of ['auto', 'low', 'medium', 'high', 'ultra'] as const) {
  assert.equal(
    (normalizePersistedGameState({ quality: preset }) as { quality: string }).quality,
    preset,
    `the ${preset} preset survives a save round trip`,
  );
}
assert.equal(validSave.timeOfDay, 12.25);
assert.equal(validSave.schedule, 'juice-club');
assert.equal(validSave.isRainy, true);
assert.deepEqual(validSave.inventory, ['blue-block']);
assert.equal(validSave.friends.Leo.friendship, 72);
assert.equal(validSave.friends.Leo.recentMemory, 'Got Binky back!');
assert.equal(validSave.juiceClubCash, 22);
assert.deepEqual(validSave.waitingCustomers, ['Max', 'Noah']);
assert.equal(validSave.juiceClubActiveCustomer, 'Max');
assert.equal(validSave.juiceClubCustomerPhase, 'ordering');
assert.deepEqual(validSave.progression, validSaveSource.progression);
assert.equal(validSave.zone, 'garden');
assert.deepEqual(validSave.playerPosition, [1, 0, 12]);

const corruptSave = normalizePersistedGameState({
  // Was 'ultra', which this block used as an example of nonsense. 'ultra' is a
  // real preset now, so the forged value has to be something that genuinely is
  // not one - otherwise this stops testing the guard and starts asserting that
  // a valid setting gets thrown away.
  quality: 'cinematic-raytraced',
  timeOfDay: Number.POSITIVE_INFINITY,
  schedule: 'juice-club',
  isRainy: 'yes',
  inventory: ['forged-item', null],
  collectibles: ['Shiny Rock', 'forged-collectible', 'Shiny Rock'],
  friends: {
    Leo: { mood: 'furious', friendship: Number.NaN, recentMemory: 'forged memory' },
    Ghost: { mood: 'happy', friendship: 100, recentMemory: 'boo' },
  },
  teacherSuspicion: -50,
  quests: { 'forged-quest': { status: 'complete' } },
  binkyStatus: 'forged',
  droppedItems: [
    { item: 'forged-item', position: [0, 0, 0], zone: 'hub' },
    { item: 'red-block', position: [0, 0, 3], zone: 'moon' },
  ],
  tidyPlacedItems: ['red-block', 'forged-item'],
  juiceStock: -4,
  crackerStock: Number.NaN,
  juiceClubCash: Number.POSITIVE_INFINITY,
  juiceClubCustomersServed: Number.MAX_VALUE,
  juiceClubSatisfaction: 400,
  juiceUpgrades: ['forged-upgrade'],
  waitingCustomers: ['Ghost'],
  juiceClubActiveCustomer: 'Ghost',
  juiceClubServedCustomer: 'Ghost',
  juiceClubCustomerPhase: 'ordering',
  progression: {
    reputation: 0,
    routeUnlocks: ['garden-district'],
    activityRuns: { forged: 100 },
    activityRewards: { forged: 100 },
  },
  zone: 'garden',
  playerPosition: [Number.NaN, 0, 0],
  gardenActivityStep: 2,
  zoneTransitioning: true,
  pendingZone: 'garden',
});
assert.equal(corruptSave.quality, 'high', 'an unknown quality preset falls back rather than being stored');
assert.equal(corruptSave.timeOfDay, 9);
assert.equal(corruptSave.schedule, 'morning-play');
assert.equal(corruptSave.isRainy, false);
assert.deepEqual(corruptSave.inventory, []);
assert.deepEqual(corruptSave.collectibles, []);
assert.deepEqual(Object.keys(corruptSave.friends), Object.keys(useGameStore.getState().friends));
assert.equal(corruptSave.friends.Leo.friendship, 10);
assert.equal(corruptSave.teacherSuspicion, 0);
assert.deepEqual(corruptSave.droppedItems, []);
assert.deepEqual(corruptSave.tidyPlacedItems, ['red-block']);
assert.equal(corruptSave.juiceStock, 0);
assert.equal(corruptSave.crackerStock, 5);
assert.equal(corruptSave.juiceClubCash, 0);
assert.equal(corruptSave.juiceClubCustomersServed, 99_999);
assert.equal(corruptSave.juiceClubSatisfaction, 100);
assert.deepEqual(corruptSave.juiceUpgrades, []);
assert.deepEqual(corruptSave.waitingCustomers, []);
assert.equal(corruptSave.zone, 'hub');
assert.equal(corruptSave.gardenActivityStep, 0);
assert.equal(corruptSave.zoneTransitioning, false);
assert.equal(corruptSave.pendingZone, null);
assert.deepEqual(corruptSave.progression.activityRuns, { 'juice-club-service': 99_999 });
assert.deepEqual(corruptSave.progression.activityRewards, { 'juice-club-service': 99_999 });

const tradedRockSave = normalizePersistedGameState({
  quests: advanceObjective(shinyRockQuest, 'where-binky', 'trade-with-sam'),
  binkyStatus: 'traded-info',
  collectibles: ['Shiny Rock'],
  progression: { collectibleProgress: { 'Shiny Rock': 1 } },
});
assert.deepEqual(tradedRockSave.collectibles, [], 'a traded Shiny Rock cannot reappear from a contradictory save');

const legacyPreGrantedRockSave = normalizePersistedGameState({
  quests: shinyRockQuest,
  binkyStatus: 'found-clue',
  collectibles: ['Shiny Rock'],
  progression: { version: 3, collectibleProgress: {} },
});
assert.deepEqual(
  legacyPreGrantedRockSave.collectibles,
  [],
  'legacy pre-granted ownership is removed so the active world pickup can appear',
);
assert.equal(
  shouldSpawnShinyRock(legacyPreGrantedRockSave.quests, legacyPreGrantedRockSave.collectibles, 'hub'),
  true,
);

const genuineRockPickupSave = normalizePersistedGameState({
  quests: shinyRockQuest,
  binkyStatus: 'found-clue',
  collectibles: ['Shiny Rock'],
  progression: { version: 3, collectibleProgress: { 'Shiny Rock': 1 } },
});
assert.deepEqual(
  genuineRockPickupSave.collectibles,
  ['Shiny Rock'],
  'recorded world pickup ownership survives migration while the trade remains active',
);

const forgedKnownActivity = normalizePersistedGameState({
  quests: {
    'rainbow-tidy-up': {
      status: 'active',
      currentObjectiveId: 'collect-blue-block',
      objectiveStates: {},
      completionCount: 0,
    },
  },
  progression: {
    reputation: 0,
    tokens: 0,
    activityRuns: { 'rainbow-tidy-up': 99_999 },
    activityRewards: { 'rainbow-tidy-up': 199_998 },
  },
});
assert.equal(
  forgedKnownActivity.progression.activityRuns['rainbow-tidy-up'],
  undefined,
  'current saves reconcile tidy runs against quest completion evidence',
);
assert.equal(forgedKnownActivity.progression.trustedHelperPass, false);
assert.equal(forgedKnownActivity.progression.routeUnlocks.includes('storybook-lane'), false);

const repairedQueue = normalizePersistedGameState({
  ...serializeGameState(useGameStore.getState()),
  timeOfDay: 12.25,
  waitingCustomers: ['Ghost', 'Max', 'Max'],
  juiceClubActiveCustomer: 'Ghost',
  juiceClubCustomerPhase: 'ordering',
});
assert.deepEqual(repairedQueue.waitingCustomers, ['Max']);
assert.equal(repairedQueue.juiceClubActiveCustomer, 'Max');
assert.equal(repairedQueue.juiceClubCustomerPhase, 'ordering');

useGameStore.getState().resetGame();
assert.deepEqual(useGameStore.getState().collectibles, [], 'new games discover the Shiny Rock in the world');
useGameStore.setState({ quests: shinyRockQuest, zone: 'hub' });
assert.equal(useGameStore.getState().collectShinyRock(), true, 'the active trade objective can collect the world rock');
assert.deepEqual(useGameStore.getState().collectibles, ['Shiny Rock']);
assert.equal(useGameStore.getState().collectShinyRock(), false, 'the world rock cannot be collected twice');
assert.equal(useGameStore.getState().progression.collectibleProgress['Shiny Rock'], 1);
assert.equal(useGameStore.getState().tradeShinyRock(), true, 'Sam consumes the owned rock and advances atomically');
assert.deepEqual(useGameStore.getState().collectibles, []);
assert.equal(useGameStore.getState().quests['where-binky'].currentObjectiveId, 'search-storage');
assert.equal(useGameStore.getState().binkyStatus, 'traded-info');
assert.equal(useGameStore.getState().tradeShinyRock(), false, 'the Shiny Rock trade cannot advance twice');

useGameStore.getState().resetGame();
useGameStore.setState({
  schedule: 'juice-club',
  waitingCustomers: ['Ghost'],
  juiceClubActiveCustomer: 'Ghost',
  juiceClubCustomerPhase: 'ordering',
  juiceStock: 2,
  crackerStock: 2,
});
assert.doesNotThrow(() => useGameStore.getState().serveCustomer());
assert.equal(useGameStore.getState().juiceClubCustomersServed, 0, 'unknown customers cannot reach friendship or reward handling');
useGameStore.getState().addWaitingCustomer('Ghost');
assert.deepEqual(useGameStore.getState().waitingCustomers, ['Ghost'], 'unknown callers cannot add another forged customer');

useGameStore.getState().resetGame();
useGameStore.setState({ juiceClubCash: 12 });
useGameStore.getState().buyStock('juice', 0, 99);
assert.equal(useGameStore.getState().juiceClubCash, 10, 'stock price comes from the authored purchase');
assert.equal(useGameStore.getState().juiceStock, 10, 'stock amount comes from the authored purchase');
useGameStore.getState().buyUpgrade('premium-cups', 0);
assert.equal(useGameStore.getState().juiceClubCash, 0, 'upgrade price cannot be forged by the caller');
assert.deepEqual(useGameStore.getState().juiceUpgrades, ['premium-cups']);

useGameStore.getState().resetGame();
useGameStore.setState({
  schedule: 'juice-club',
  waitingCustomers: ['Max', 'Noah'],
  juiceClubActiveCustomer: 'Max',
  juiceClubCustomerPhase: 'ordering',
  juiceStock: 2,
  crackerStock: 2,
});
useGameStore.getState().serveCustomer();
assert.deepEqual(useGameStore.getState().waitingCustomers, ['Noah'], 'Juice Club service promotes the next queued customer');
assert.equal(useGameStore.getState().juiceClubServedCustomer, 'Max', 'served customer enters the visible drink-and-exit phase');
assert.equal(useGameStore.getState().juiceClubCustomerPhase, 'service');
useGameStore.getState().reportJuiceClubArrival('Max', 'service');
assert.equal(useGameStore.getState().juiceClubCustomerPhase, 'drink');
useGameStore.getState().advanceJuiceClubCustomer();
assert.equal(useGameStore.getState().juiceClubCustomerPhase, 'reaction');
useGameStore.getState().advanceJuiceClubCustomer();
assert.equal(useGameStore.getState().juiceClubCustomerPhase, 'departure');
assert.equal(useGameStore.getState().juiceClubServedCustomer, null);
useGameStore.getState().reportJuiceClubArrival('Max', 'departure');
assert.equal(useGameStore.getState().juiceClubActiveCustomer, 'Noah');
assert.equal(useGameStore.getState().juiceClubCustomerPhase, 'entry', 'next queued child begins a fresh lifecycle');
useGameStore.getState().reportJuiceClubArrival('Noah', 'entry');
assert.equal(useGameStore.getState().juiceClubCustomerPhase, 'queue');
useGameStore.getState().reportJuiceClubArrival('Noah', 'queue');
assert.equal(useGameStore.getState().juiceClubCustomerPhase, 'ordering');
useGameStore.getState().resetGame();
assert.equal(useGameStore.getState().enterGarden(), false, 'Garden remains blocked below ten reputation');
useGameStore.setState((state) => ({
  progression: { ...state.progression, routeUnlocks: ['garden-district'] },
}));
assert.equal(useGameStore.getState().enterGarden(), false, 'a forged route flag cannot bypass the live reputation requirement');
useGameStore.getState().resetGame();
useGameStore.setState({ progression: normalizeProgression({ reputation: 10 }) });
assert.equal(useGameStore.getState().progression.routeUnlocks.includes('garden-district'), true);
trackPlayerPosition(new THREE.Vector3(12, 0, -10.4));
assert.equal(useGameStore.getState().enterGarden(), true);
assert.equal(useGameStore.getState().pendingZone, 'garden');
useGameStore.getState().completeZoneTransition();
assert.equal(useGameStore.getState().zone, 'garden');
assert.deepEqual(useGameStore.getState().playerPosition, GARDEN_SPAWN);
useGameStore.getState().setAmbientMessage('stale Hub greeting');
assert.equal(useGameStore.getState().ambientMessage, null, 'Hub social messages cannot publish after Garden remount');
assert.equal(useGameStore.getState().startGardenActivity(), true);
assert.equal(useGameStore.getState().startGardenActivity(), false, 'Garden activity cannot be started twice');
assert.equal(useGameStore.getState().advanceGardenActivity(), 2);
assert.equal(useGameStore.getState().advanceGardenActivity(), 3);
const beforeForgedActivity = useGameStore.getState().progression;
useGameStore.getState().completeActivity('forged-activity', 1000, 1000);
assert.equal(useGameStore.getState().progression, beforeForgedActivity, 'unknown activity IDs cannot create progression records');
useGameStore.getState().completeActivity('garden-planting', 1000, 1000);
assert.equal(useGameStore.getState().progression.activityRuns['garden-planting'], 1);
assert.equal(useGameStore.getState().progression.activityRewards['garden-planting'], 2);
assert.equal(useGameStore.getState().progression.tokens, 2, 'Garden reward tokens come from the authored activity');
assert.equal(useGameStore.getState().progression.reputation, 11, 'Garden reputation comes from the authored activity');
const completedGardenProgression = useGameStore.getState().progression;
useGameStore.getState().completeActivity('garden-planting', 1000, 1000);
assert.equal(useGameStore.getState().progression, completedGardenProgression, 'a completed Garden step cannot reward twice');
useGameStore.getState().resetGardenActivity();
assert.equal(useGameStore.getState().gardenActivityStep, 0, 'Garden activity is repeatable');
useGameStore.getState().setPlayerPosition([1, 0, 12]);
const persistedGarden = serializeGameState(useGameStore.getState());
assert.equal(persistedGarden.zone, 'garden');
assert.deepEqual(persistedGarden.playerPosition, [1, 0, 12], 'Garden position is included in local save state');
assert.deepEqual(persistedGarden.gardenPosition, [1, 0, 12], 'Garden position is retained independently of the active zone');
assert.deepEqual(persistedGarden.hubPosition, [12, 0, -10.4], 'hub return position survives a Garden save');
trackPlayerPosition(new THREE.Vector3(0, 0, 16));
assert.equal(useGameStore.getState().returnToHub(), true);
useGameStore.getState().completeZoneTransition();
assert.equal(useGameStore.getState().zone, 'hub');
assert.deepEqual(useGameStore.getState().playerPosition, [12, 0, -10.4], 'return restores the saved hub-side gate position');

useGameStore.getState().resetGame();
useGameStore.setState({
  quests: normalizeQuestStates(undefined, 'found', []),
  binkyStatus: 'found',
  inventory: [],
});
assert.equal(useGameStore.getState().updateBinkyStatus('returned-good'), false, 'Binky cannot be delivered without carrying it');
assert.equal(useGameStore.getState().progression.reputation, 0);
useGameStore.setState({ inventory: ['binky'] });
assert.equal(useGameStore.getState().updateBinkyStatus('returned-good'), true, 'a proven Binky delivery completes once');
assert.equal(useGameStore.getState().inventory.includes('binky'), false, 'delivery consumes Binky atomically');
assert.equal(useGameStore.getState().progression.reputation, 8);
assert.equal(useGameStore.getState().progression.tokens, 5);
assert.equal(useGameStore.getState().updateBinkyStatus('returned-good'), false, 'Binky delivery rewards cannot be duplicated');
assert.equal(useGameStore.getState().progression.reputation, 8);

useGameStore.getState().resetGame();
useGameStore.setState({ inventory: ['binky'] });
useGameStore.getState().dropAt('binky', [3, 0, -3]);
assert.deepEqual(useGameStore.getState().inventory, ['binky'], 'solid-overlapping drops are rejected');
assert.deepEqual(useGameStore.getState().droppedItems, []);
useGameStore.getState().dropAt('binky', [0, 0, 3]);
assert.deepEqual(useGameStore.getState().inventory, []);
assert.equal(useGameStore.getState().droppedItems[0]?.zone, 'hub');
trackPlayerPosition(new THREE.Vector3(5, 0, 5));
useGameStore.getState().recoverDroppedItem('dropped-binky');
assert.deepEqual(useGameStore.getState().inventory, [], 'a dropped quest item cannot be recovered remotely');
trackPlayerPosition(new THREE.Vector3(0, 0, 3));
useGameStore.getState().recoverDroppedItem('dropped-binky');
assert.deepEqual(useGameStore.getState().inventory, ['binky'], 'nearby dropped items can be recovered safely');

for (const teacher of [
  { name: 'Ms. Harper', defaultPos: [-2, 0, 2] as [number, number, number] },
  { name: 'Mr. Davis', defaultPos: [4, 0, 4] as [number, number, number] },
]) {
  for (const scheduleName of ['morning-play', 'art-time', 'juice-club', 'outdoor-play', 'pickup']) {
    for (const rainy of [false, true]) {
      for (const patrolPoint of teacherPatrolSpots(teacher.name, scheduleName, rainy, teacher.defaultPos)) {
        assert.equal(
          isWalkable(new THREE.Vector3(...patrolPoint), 0.34),
          true,
          `${teacher.name} ${scheduleName} patrol point ${patrolPoint.join(',')} must be reachable`,
        );
      }
    }
  }
}

for (const scheduleName of ['morning-play', 'art-time', 'juice-club', 'outdoor-play', 'pickup']) {
  assert.ok(
    ['standing', 'walking', 'sitting', 'playing', 'gathering', 'coloring', 'toy-play', 'conversation', 'reading', 'singing', 'dancing', 'pretend-play', 'circle-time', 'snacking', 'following', 'reacting', 'intervening']
      .includes(kidActivityMode(scheduleName, false, 4.2)),
    `kid activity mode is defined for ${scheduleName}`,
  );
}

const authoredActivityKinds = new Set<string>();
for (const scheduleName of ['morning-play', 'art-time', 'juice-club', 'outdoor-play', 'pickup']) {
  for (const rainy of [false, true]) {
    const firstCyclePositions = new Set<string>();
    for (const [index, kid] of KID_CAST.entries()) {
      for (let cycle = 0; cycle < 3; cycle += 1) {
        const plan = getChildActivityPlan(kid.name, scheduleName, rainy, cycle, index * 0.37);
        authoredActivityKinds.add(plan.activity);
        assert.equal(
          isWalkable(new THREE.Vector3(...plan.position), 0.34),
          true,
          `${kid.name} ${scheduleName} ${rainy ? 'rainy' : 'dry'} activity ${plan.activity} must be reachable`,
        );
        assert.ok(
          scheduleName === 'juice-club'
            ? plan.duration >= 4 && plan.duration < 5
            : plan.duration >= MIN_CHILD_ACTIVITY_DWELL_SECONDS
              && plan.duration <= MAX_CHILD_ACTIVITY_DWELL_SECONDS,
          scheduleName === 'juice-club'
            ? 'Juice Club keeps its original customer turnover timing'
            : 'authored toddler activities remain visible long enough to notice while staying bounded',
        );
        assert.equal(plan.soloFallback, true, 'every authored activity can continue without a missing partner');
        if (cycle === 0) firstCyclePositions.add(plan.position.join(','));
      }
    }
    assert.ok(firstCyclePositions.size >= 4, `${scheduleName} spreads the cast across multiple first-cycle stations`);
  }
}
for (const [scheduleName, expectedPosition, expectedFocus] of [
  ['morning-play', [-2.8, 0, 1.4], [-1.8, 0, 1.4]],
  ['art-time', [-14.5, 0, -10.5], [-13.5, 0, -10.5]],
  ['juice-club', [5.2, 0, -3.8], [4.4, 0, -3.2]],
  ['outdoor-play', [10.3, 0, -10.7], [11.2, 0, -10.7]],
  ['pickup', [-9.2, 0, -5.2], [-10.2, 0, -5.2]],
] as const) {
  const plan = getChildActivityPlan('Leo', scheduleName, false, 0, 0);
  assert.deepEqual(plan.position, expectedPosition, `${scheduleName} begins at its authored activity station`);
  assert.deepEqual(plan.focus, expectedFocus, `${scheduleName} faces the authored activity focus`);
  assert.deepEqual(
    getChildActivityPlan('Leo', scheduleName, false, 0, 999),
    plan,
    `${scheduleName} plan stays deterministic when frame timing differs`,
  );
}
for (const requiredActivity of ['picture-books', 'singing', 'dancing', 'pretend-play', 'circle-time', 'snacking', 'following', 'reacting']) {
  assert.equal(authoredActivityKinds.has(requiredActivity), true, `${requiredActivity} appears in the rotating authored routine`);
}
assert.equal(activityIsSocial('following'), true);
assert.equal(activityIsSocial('coloring'), false);

for (const [index, name] of ['Leo', 'Mia', 'Sam', 'Zoe', 'Eli', 'Noah', 'Lily', 'Finn', 'Ruby', 'Max'].entries()) {
  const destination = kidDestination(name, 'art-time', false, [0, 0, 0], index * 0.37, 0, []);
  assert.equal(
    isWalkable(destination, 0.34),
    true,
    `${name} art-time social destination must be reachable`,
  );
}
const promotedQueueDestination = kidDestination('Max', 'juice-club', false, [0, 0, 0], 0, 0, ['Max']);
assert.equal(isWalkable(promotedQueueDestination, 0.34), true, 'front Juice Club customer can reach the live queue marker');
const secondQueueDestination = kidDestination('Noah', 'juice-club', false, [0, 0, 0], 0, 0, ['Max', 'Noah']);
assert.ok(secondQueueDestination.x < promotedQueueDestination.x, 'customers line up outward from the service point');
const servedExitDestination = kidDestination('Max', 'juice-club', false, [0, 0, 0], 0, 0, ['Max'], 'Max');
assert.ok(servedExitDestination.x > promotedQueueDestination.x, 'served customer leaves through the counter-side exit');
const artPairA = kidDestination('Leo', 'art-time', false, [0, 0, 0], 0, 0, []);
const artPairB = kidDestination('Mia', 'art-time', false, [0, 0, 0], 1, 0, []);
assert.ok(Math.abs(artPairA.distanceTo(artPairB) - 0.76) < 1e-6, 'paired children keep personal space within one art-session area');
assert.deepEqual(
  artPairA.clone().add(artPairB).multiplyScalar(0.5).toArray(),
  [-14.1, 0, -11.5],
  'pair offsets preserve the authored social anchor',
);

const crowdTeachers = [
  { name: 'Ms. Harper', defaultPos: [-2, 0, -2] as [number, number, number] },
  { name: 'Mr. Davis', defaultPos: [10, 0, 0] as [number, number, number] },
];
function runCrowdScenario(scheduleName: string) {
  clearNpcNavigation();
  const actors = [
    ...KID_CAST.map((kid, index) => ({
      id: `crowd-${scheduleName}-${kid.name}`,
      start: new THREE.Vector3(...kid.defaultPos),
      target: kidDestination(kid.name, scheduleName, false, kid.defaultPos, index * 0.37, 0, []),
    })),
    ...crowdTeachers.map((teacher) => ({
      id: `crowd-${scheduleName}-${teacher.name}`,
      start: new THREE.Vector3(...teacher.defaultPos),
      target: new THREE.Vector3(...teacherPatrolSpots(
        teacher.name,
        scheduleName,
        false,
        teacher.defaultPos,
      )[0]),
    })),
  ].map((actor) => {
    const ref = new THREE.Group();
    ref.position.copy(actor.start);
    const mirror = actor.start.clone();
    return {
      ...actor,
      ref,
      mirror,
      unregister: registerNpcPosition(actor.id, mirror),
      lastPosition: actor.start.clone(),
      stalledFrames: 0,
      maxStalledFrames: 0,
      reverseFrames: 0,
      maxReverseFrames: 0,
    };
  });
  const overlappingFrames = new Map<string, number>();
  let maxOverlapFrames = 0;
  for (let frame = 0; frame < 2400; frame += 1) {
    for (const actor of actors) {
      const remaining = actor.ref.position.distanceTo(actor.target);
      if (remaining > 0.48) stepNpc(actor.id, actor.ref, actor.target, null, 1 / 30, 1.25, 'hub');
      actor.mirror.copy(actor.ref.position);
      const displacement = actor.ref.position.clone().sub(actor.lastPosition).setY(0);
      if (displacement.lengthSq() < 1e-8 && remaining > 0.55) {
        actor.stalledFrames += 1;
        actor.maxStalledFrames = Math.max(actor.maxStalledFrames, actor.stalledFrames);
      } else {
        actor.stalledFrames = 0;
      }
      if (displacement.lengthSq() > 1e-7) {
        const facing = new THREE.Vector3(-Math.sin(actor.ref.rotation.y), 0, -Math.cos(actor.ref.rotation.y));
        actor.reverseFrames = facing.dot(displacement.clone().normalize()) < -0.1
          ? actor.reverseFrames + 1
          : 0;
        actor.maxReverseFrames = Math.max(actor.maxReverseFrames, actor.reverseFrames);
      }
      actor.lastPosition.copy(actor.ref.position);
    }
    for (let first = 0; first < actors.length; first += 1) {
      for (let second = first + 1; second < actors.length; second += 1) {
        const key = `${first}:${second}`;
        const overlapping = actors[first].ref.position.distanceTo(actors[second].ref.position) < 0.12;
        const frames = overlapping ? (overlappingFrames.get(key) ?? 0) + 1 : 0;
        overlappingFrames.set(key, frames);
        maxOverlapFrames = Math.max(maxOverlapFrames, frames);
      }
    }
  }
  const result = actors.map((actor) => ({
    position: actor.ref.position.toArray().map((value) => Number(value.toFixed(4))),
    remaining: actor.ref.position.distanceTo(actor.target),
    maxStalledFrames: actor.maxStalledFrames,
    maxReverseFrames: actor.maxReverseFrames,
  }));
  actors.forEach((actor) => actor.unregister());
  assert.deepEqual(getNpcNavigationSnapshot(), { positionCount: 0, pathCount: 0 }, `${scheduleName} crowd cleanup is finite`);
  assert.ok(result.every((actor) => actor.remaining <= 0.49), `${scheduleName} full cast reaches its authored destinations`);
  assert.ok(result.every((actor) => actor.maxStalledFrames < 84), `${scheduleName} full cast avoids a long stall`);
  assert.ok(result.every((actor) => actor.maxReverseFrames < 24), `${scheduleName} full cast avoids persistent moonwalking`);
  assert.ok(maxOverlapFrames < 60, `${scheduleName} full cast avoids persistent exact overlap`);
  return result.map((actor) => actor.position);
}

const deterministicArtCrowd = runCrowdScenario('art-time');
runCrowdScenario('juice-club');
runCrowdScenario('outdoor-play');
assert.deepEqual(runCrowdScenario('art-time'), deterministicArtCrowd, 'repeated crowded navigation is deterministic');

resetActivitySessions();
const gatheringSession = getSharedActivitySession('hub', 'morning-play', 0);
assert.equal(gatheringSession?.phase, 'gathering', 'a shared activity waits at an arrival barrier');
assert.ok(gatheringSession);
const sharedBlockCenter = gatheringSession.participants
  .reduce(
    (center, participant) => center.add(new THREE.Vector3(...participant.slot)),
    new THREE.Vector3(),
  )
  .multiplyScalar(1 / gatheringSession.participants.length);
assert.ok(
  sharedBlockCenter.distanceTo(new THREE.Vector3(-2.8, 0, 1.4)) < 0.05,
  'shared block play is visibly centered on the authored block station',
);
for (const [scheduleName, expectedCenter] of [
  ['morning-play', [-2.8, 0, 1.4]],
  ['art-time', [-14.7, 0, -11.4]],
  ['outdoor-play', [10, 0, -10.7]],
] as const) {
  resetActivitySessions();
  const alignedSession = getSharedActivitySession('hub', scheduleName, 0);
  assert.ok(alignedSession);
  const center = alignedSession.participants
    .reduce(
      (sum, participant) => sum.add(new THREE.Vector3(...participant.slot)),
      new THREE.Vector3(),
    )
    .multiplyScalar(1 / alignedSession.participants.length);
  assert.deepEqual(
    center.toArray(),
    expectedCenter,
    `${scheduleName} shared activity slots stay centered on their authored station`,
  );
}
reportSessionArrival('hub', 'morning-play', gatheringSession.id, 'Leo', 1);
assert.equal(getSharedActivitySession('hub', 'morning-play', 1)?.phase, 'gathering', 'one participant cannot start the pair activity');
const activeSession = reportSessionArrival('hub', 'morning-play', gatheringSession.id, 'Mia', 2);
assert.equal(activeSession?.phase, 'active');
assert.equal(activeSession?.startsAt, 2);
assert.equal(activeSession?.endsAt, 14);
assert.equal(getSharedActivitySession('hub', 'morning-play', 13)?.id, gatheringSession.id, 'the assignment stays stable for its shared active duration');
const nextGatheringSession = getSharedActivitySession('hub', 'morning-play', 14);
assert.equal(nextGatheringSession?.phase, 'gathering');
assert.notEqual(nextGatheringSession?.id, gatheringSession.id, 'only a completed active phase rotates the assignment');

resetActivitySessions();
const abandonedGathering = getSharedActivitySession('hub', 'morning-play', 0);
assert.ok(abandonedGathering);
const abandonedParticipant = abandonedGathering.participants[0];
assert.equal(
  shouldUseSessionSlot(abandonedGathering, abandonedParticipant, null),
  true,
  'a child initially approaches the shared activity slot',
);
assert.equal(
  shouldUseSessionSlot(abandonedGathering, abandonedParticipant, abandonedGathering.id),
  false,
  'a timed-out child leaves the gathering slot for a visible solo activity',
);
reportSessionArrival('hub', 'morning-play', abandonedGathering.id, abandonedGathering.participants[0].name, 1);
assert.equal(getSharedActivitySession('hub', 'morning-play', 9)?.id, abandonedGathering.id);
assert.notEqual(
  getSharedActivitySession('hub', 'morning-play', 10)?.id,
  abandonedGathering.id,
  'a missing shared-activity partner cannot leave the gathering barrier stale forever',
);
resetActivitySessions();
const reclaimableSession = getSharedActivitySession('hub', 'morning-play', 0);
assert.ok(reclaimableSession);
reportSessionArrival('hub', 'morning-play', reclaimableSession.id, reclaimableSession.participants[0].name, 1);
const reclaimableActive = reportSessionArrival('hub', 'morning-play', reclaimableSession.id, reclaimableSession.participants[1].name, 1);
assert.equal(
  shouldUseSessionSlot(reclaimableActive, reclaimableActive?.participants[0] ?? null, reclaimableSession.id),
  true,
  'an active shared session reclaims a child that previously selected solo fallback',
);
assert.equal(shouldUseSessionSlot(null, abandonedParticipant, abandonedGathering.id), false, 'an interrupted session releases its slot');

for (const definition of GARDEN_CAST) {
  for (let cycle = 0; cycle < definition.route.length; cycle += 1) {
    const stop = gardenNpcDestination(definition.name, cycle);
    assert.ok(stop);
    assert.equal(
      isWalkable(stop.position, 0.34, [], 'garden'),
      true,
      `${definition.name} Garden stop ${cycle} stays on a valid Garden route`,
    );
  }
}

const wallSlideDisplacement = wallSlideResult.clone().sub(wallSlideStart);
assert.ok(Math.abs(wallSlideDisplacement.z) > Math.abs(wallSlideDisplacement.x), 'collision changes the actual movement heading');
assert.equal(
  facingAngleForDirection(wallSlideDisplacement),
  Math.atan2(-wallSlideDisplacement.x, -wallSlideDisplacement.z),
  'NPC facing derives from resolved displacement rather than the blocked request',
);
const gardenNpcStart = new THREE.Vector3(6.8, 0, -3.4);
const gardenNpcDesired = new THREE.Vector3(8.4, 0, -1.8);
const gardenNpcMovement = resolveNpcMovement(gardenNpcStart, gardenNpcDesired, 'garden');
assert.ok(gardenNpcMovement.displacement.lengthSq() > 0, 'NPC collision integration retains valid sliding movement');
const gardenNpcGroup = new THREE.Group();
gardenNpcGroup.position.copy(gardenNpcStart);
const npcMoved = stepNpc('facing-integration', gardenNpcGroup, gardenNpcDesired, null, 1, 4, 'garden');
assert.equal(npcMoved, true);
const actualNpcDisplacement = gardenNpcGroup.position.clone().sub(gardenNpcStart);
assert.ok(
  Math.abs(
    THREE.MathUtils.euclideanModulo(
      gardenNpcGroup.rotation.y - facingAngleForDirection(actualNpcDisplacement) + Math.PI,
      Math.PI * 2,
    ) - Math.PI,
  ) < 0.01,
  'stepNpc rotates the rendered group from the displacement that survived pond collision',
);
clearNpcNavigation('facing-integration');

resetActivitySessions();
const sharedArt = getSharedActivitySession('hub', 'art-time', 1);
assert.ok(sharedArt);
assert.equal(sharedArt.participants.length, 2);
assert.deepEqual(sharedArt.participants[0].focus, sharedArt.participants[1].slot, 'session partners face each other');
assert.deepEqual(sharedArt.participants[1].focus, sharedArt.participants[0].slot);
assert.equal(sessionParticipant(sharedArt, sharedArt.participants[0].name)?.activity, sharedArt.participants[0].activity);
reportSessionArrival('hub', 'art-time', sharedArt.id, sharedArt.participants[0].name, 2);
const waitingForPartner = getSharedActivitySession('hub', 'art-time', 7);
assert.equal(waitingForPartner?.id, sharedArt.id, 'an early arrival keeps the same gathering assignment');
assert.equal(waitingForPartner?.phase, 'gathering');
assert.equal(waitingForPartner?.endsAt, null, 'gathering has no local dwell deadline that can expire');
reportSessionArrival('hub', 'art-time', sharedArt.id, sharedArt.participants[1].name, 8);
const staggeredActiveSession = getSharedActivitySession('hub', 'art-time', 8);
assert.equal(staggeredActiveSession?.phase, 'active');
assert.equal(staggeredActiveSession?.startsAt, 8, 'the final staggered arrival opens one shared start');
assert.ok(staggeredActiveSession?.endsAt && staggeredActiveSession.endsAt > 8);
resetActivitySessions();
const synchronizedArt = getSharedActivitySession('hub', 'art-time', 1);
assert.ok(synchronizedArt);
reportSessionArrival('hub', 'art-time', synchronizedArt.id, synchronizedArt.participants[0].name, 1);
reportSessionArrival('hub', 'art-time', synchronizedArt.id, synchronizedArt.participants[1].name, 1);
assert.equal(getSharedActivitySession('hub', 'art-time', 12)?.id, synchronizedArt.id, 'shared participants remain assigned through one synchronized active phase');
assert.notEqual(getSharedActivitySession('hub', 'art-time', 13)?.id, synchronizedArt.id, 'the next assignment starts only after the active phase ends');
assert.equal(getSharedActivitySession('hub', 'art-time', 1, true), null, 'priority interruption cancels ambient sessions');
assert.equal(activitySessionIsInterrupted({
  activeDialogue: { text: 'quest' },
  journalOpen: false,
  zoneTransitioning: false,
}), true);
assert.equal(activitySessionIsInterrupted({
  activeDialogue: null,
  journalOpen: false,
  zoneTransitioning: false,
}), false);
for (const [sessionZone, scheduleName] of [
  ['hub', 'morning-play'],
  ['hub', 'art-time'],
  ['hub', 'outdoor-play'],
  ['garden', 'garden-routine'],
] as const) {
  for (const elapsed of [1, 13, 25]) {
    const session = getSharedActivitySession(sessionZone, scheduleName, elapsed);
    assert.ok(session);
    for (const participant of session.participants) {
      assert.equal(
        isWalkable(new THREE.Vector3(...participant.slot), 0.34, [], sessionZone),
        true,
        `${session.id} slot for ${participant.name} must be reachable`,
      );
    }
  }
}

recenterCamera();
assert.equal(consumeCameraRecenterRequest(), true);
addCameraOrbit(100, -20);
const directYaw = getCameraInput().yaw;
stepCameraInput(1 / 30);
stepCameraInput(1 / 120);
assert.equal(getCameraInput().yaw, directYaw, 'camera drag does not accumulate frame-dependent inertia');
recenterCamera();
for (let drag = 0; drag < 8; drag += 1) addCameraOrbit(125, drag % 2 === 0 ? 8 : -8);
assert.ok(getCameraInput().yaw > Math.PI * 2, 'horizontal touch travel supports a complete orbit');
addCameraOrbit(0, 500);
assert.equal(getCameraInput().pitch, 0.62, 'vertical orbit stays within the comfortable upper pitch limit');
addCameraOrbit(0, -500);
assert.equal(getCameraInput().pitch, -0.05, 'vertical orbit stays within the comfortable lower pitch limit');
recenterCamera();
assert.equal(CAMERA_DISTANCE, 12.6, 'desktop uses a substantially wider fixed camera frame');
const landscapeProfile = getCameraProfile(1280, 720);
const portraitProfile = getCameraProfile(390, 844);
assert.ok(portraitProfile.distance > landscapeProfile.distance, 'portrait starts with a wider fixed camera distance');
assert.ok(portraitProfile.fov > landscapeProfile.fov, 'portrait uses a wider lens instead of manual zoom');
assert.ok(portraitProfile.lookAhead > landscapeProfile.lookAhead, 'portrait keeps useful movement look-ahead');
assert.deepEqual(artworkBackingSize([2, 1]), [2.16, 1.16], 'artwork support extends beyond the supplied graphic');
const anchoredArtwork: Array<{
  fileName: string;
  anchor: ArtworkSurfaceAnchor;
  size: [number, number];
}> = [
  { fileName: '02_wall_mural_welcome.png', anchor: { solidId: 'main-south-wall', face: 'north', height: 1.72, along: 0 }, size: [4.25, 3.15] },
  { fileName: '03_wall_decals_set.png', anchor: { solidId: 'hall-divider-south', face: 'east', height: 1.6, along: 4.5 }, size: [2.15, 1.6] },
  { fileName: '04_classroom_scene.png', anchor: { solidId: 'main-south-wall', face: 'north', height: 1.72, along: 4.6 }, size: [2.55, 1.9] },
  { fileName: '05_playground_equipment.png', anchor: { solidId: 'east-boundary', face: 'west', height: 1.65, along: -4.2 }, size: [2.55, 1.9] },
  { fileName: '06_posters_charts.png', anchor: { solidId: 'north-boundary', face: 'south', height: 1.72, along: -12 }, size: [2.5, 1.88] },
  { fileName: '07_classroom_signs.png', anchor: { solidId: 'hall-divider-north', face: 'east', height: 1.6, along: -4.5 }, size: [2.15, 1.6] },
  { fileName: '09_cubby_labels.png', anchor: { solidId: 'cubbies', face: 'north', height: 1.18, along: -5.7 }, size: [2.95, 0.72] },
  { fileName: '10_props_toys.png', anchor: { solidId: 'art-table', face: 'top', height: 1.03 }, size: [2.25, 1.55] },
  { fileName: '11_juice_club_branding.png', anchor: { solidId: 'juice-signboard', face: 'south', height: 1.5, along: 3 }, size: [1.7, 1.22] },
  { fileName: '12_garden_signage.png', anchor: { solidId: 'garden-sign', face: 'south', height: 0.98 }, size: [3.55, 1.3] },
  { fileName: '14_environment_props.png', anchor: { solidId: 'west-boundary', face: 'east', height: 1.65, along: 4.4 }, size: [2.35, 1.75] },
  { fileName: '17_motivational_banner.png', anchor: { solidId: 'west-boundary', face: 'east', height: 1.65, along: 0 }, size: [2.55, 1.9] },
  { fileName: '18_door_sign.png', anchor: { solidId: 'hall-divider-north', face: 'east', height: 1.7, along: -6.65 }, size: [1.35, 1] },
  { fileName: '19_attendance_chart.png', anchor: { solidId: 'west-boundary', face: 'east', height: 1.7, along: -4.5 }, size: [2.3, 1.72] },
];
for (const artwork of anchoredArtwork) {
  const validation = validateArtworkSurfaceAnchor(artwork.anchor, artwork.size);
  assert.equal(validation.valid, true, `${artwork.fileName} mount: ${validation.issues.join(', ')}`);
}
assert.equal(
  validateArtworkSurfaceAnchor(
    { solidId: 'hall-divider-north', face: 'east', height: 4, along: -6.65 },
    [5, 5],
  ).valid,
  false,
  'oversized artwork is rejected instead of silently floating beyond its support',
);

resetTeacherInterventions();
assert.notDeepEqual(
  teacherPatrolProfile('Ms. Harper'),
  teacherPatrolProfile('Mr. Davis'),
  'teachers keep visibly different supervision styles',
);
updateChildBehavior({
  name: 'Quiet Reader',
  position: new THREE.Vector3(1, 0, 1),
  activity: 'picture-books',
  disruptive: false,
  questPriority: false,
  updatedAt: 5,
});
updateChildBehavior({
  name: 'Nearby Friend',
  position: new THREE.Vector3(1.8, 0, 1.2),
  activity: 'conversation',
  disruptive: false,
  questPriority: false,
  updatedAt: 5,
});
const crowdedSupervision = getTeacherSupervisionTarget(
  'hub:Ms. Harper',
  5,
  new THREE.Vector3(-2, 0, 2),
  teacherPatrolProfile('Ms. Harper'),
);
assert.equal(crowdedSupervision?.reason, 'crowd', 'teachers scan clustered activity groups between interventions');
assert.equal(isWalkable(crowdedSupervision!.position, 0.34), true, 'teacher scan target remains navigable');
resetTeacherInterventions();
updateChildBehavior({
  name: 'Wandering Friend',
  position: new THREE.Vector3(2, 0, 1),
  activity: 'following',
  disruptive: true,
  questPriority: false,
  updatedAt: 5,
});
const problemSupervision = getTeacherSupervisionTarget(
  'hub:Ms. Harper',
  5,
  new THREE.Vector3(-2, 0, 2),
  teacherPatrolProfile('Ms. Harper'),
);
assert.equal(problemSupervision?.reason, 'disruption', 'problem behavior outranks a routine patrol scan');
resetTeacherInterventions();
updateChildBehavior({
  name: 'Quest Friend',
  position: new THREE.Vector3(1, 0, 1),
  activity: 'toy-play',
  disruptive: true,
  questPriority: true,
  updatedAt: 5,
});
assert.equal(
  getTeacherIntervention('hub:Ms. Harper', 5).phase,
  'observing',
  'teacher ambience never interrupts a quest-priority child',
);
resetTeacherInterventions();
const interventionChildPosition = new THREE.Vector3(1, 0, 1);
const reportPlayFriend = (updatedAt: number, questPriority = false) => updateChildBehavior({
  name: 'Play Friend',
  position: interventionChildPosition,
  activity: 'toy-play',
  disruptive: true,
  questPriority,
  updatedAt,
});
reportPlayFriend(5);
let teacherIntervention = getTeacherIntervention('hub:Ms. Harper', 5);
assert.equal(teacherIntervention.phase, 'approaching');
assert.equal(interventionIsActive(teacherIntervention), true);
const interventionDestination = teacherInterventionDestination(
  teacherIntervention,
  new THREE.Vector3(-2, 0, 2),
);
assert.ok(interventionDestination);
assert.equal(isWalkable(interventionDestination!, 0.34), true, 'teacher intervention destination stays navigable');
assert.equal(getChildIntervention('Play Friend', 5)?.reaction, 'listen');
reportPlayFriend(5.1, true);
teacherIntervention = getTeacherIntervention('hub:Ms. Harper', 5.1);
assert.equal(teacherIntervention.phase, 'observing', 'an active intervention releases a child who becomes quest-critical');
assert.equal(getChildIntervention('Play Friend', 5.1), null, 'quest presentation resumes in the same update');
resetTeacherInterventions();
reportPlayFriend(5);
teacherIntervention = getTeacherIntervention('hub:Ms. Harper', 5);
reportPlayFriend(7.3);
teacherIntervention = getTeacherIntervention('hub:Ms. Harper', 7.3);
assert.equal(teacherIntervention.phase, 'warning');
reportPlayFriend(100);
teacherIntervention = getTeacherIntervention('hub:Ms. Harper', 100, false);
assert.equal(teacherIntervention.phase, 'warning', 'dialogue and journal overlays freeze intervention progression');
assert.equal(
  getChildIntervention('Play Friend', 100)?.phase,
  'warning',
  'the child remains synchronized with a paused teacher intervention',
);
resetTeacherInterventions();
reportPlayFriend(5);
teacherIntervention = getTeacherIntervention('hub:Ms. Harper', 5);
reportPlayFriend(7.3);
teacherIntervention = getTeacherIntervention('hub:Ms. Harper', 7.3);
reportPlayFriend(9.2);
teacherIntervention = getTeacherIntervention('hub:Ms. Harper', 9.2);
assert.equal(teacherIntervention.phase, 'redirecting');
const redirectingChild = getChildIntervention('Play Friend', 9.2);
assert.ok(redirectingChild?.destination);
assert.equal(isWalkable(redirectingChild!.destination!, 0.34), true, 'redirection moves to a collision-safe activity point');
reportPlayFriend(11.3);
teacherIntervention = getTeacherIntervention('hub:Ms. Harper', 11.3);
assert.equal(teacherIntervention.phase, 'separating');
const separatedChild = getChildIntervention('Play Friend', 11.3);
assert.ok(separatedChild?.destination);
assert.notDeepEqual(separatedChild?.destination?.toArray(), redirectingChild?.destination?.toArray());
reportPlayFriend(13);
teacherIntervention = getTeacherIntervention('hub:Ms. Harper', 13);
assert.equal(teacherIntervention.phase, 'calling-player');
assert.equal(getTeacherInterventionSnapshot('hub:Ms. Harper')?.phase, 'calling-player');
assert.equal(acknowledgeTeacherCall('hub:Ms. Harper')?.phase, 'consequence', 'talking to the teacher answers the call-over');
reportPlayFriend(14.9);
teacherIntervention = getTeacherIntervention('hub:Ms. Harper', 14.9);
assert.equal(teacherIntervention.phase, 'consequence');
reportPlayFriend(15.1);
teacherIntervention = getTeacherIntervention('hub:Ms. Harper', 15.1);
assert.equal(teacherIntervention.phase, 'praise');
reportPlayFriend(17.4);
teacherIntervention = getTeacherIntervention('hub:Ms. Harper', 17.4);
assert.equal(teacherIntervention.phase, 'observing');
assert.ok(teacherIntervention.nextEligibleAt > 17.4, 'teacher interventions have a calm cooldown');
resetTeacherInterventions();
assert.equal(dialogueDismissLabel(false), 'Continue / Close');
assert.equal(dialogueDismissLabel(true), 'Cancel / Leave');
assert.equal(isGameplayBlocked({ journalOpen: true, activeDialogue: null, zoneTransitioning: false }), true);
assert.equal(isGameplayBlocked({ journalOpen: false, activeDialogue: { text: 'pause' }, zoneTransitioning: false }), true);
assert.equal(isGameplayBlocked({ journalOpen: false, activeDialogue: null, zoneTransitioning: true }), true);
assert.equal(isGameplayBlocked({ journalOpen: false, activeDialogue: null, zoneTransitioning: false }), false);
assert.equal(isGameplayBlocked({ journalOpen: false, activeDialogue: null, zoneTransitioning: false, frontEndBlocked: true }), true);

setTouchMove(2, -2);
assert.deepEqual({ x: getTouchInput().x, y: getTouchInput().y }, { x: 1, y: -1 }, 'touch movement clamps to a stable unit range');
assert.equal(toggleTouchRun(), true);
setTouchCrouch(true);
assert.equal(getTouchInput().crouch, true);
clearTouchMove();
assert.deepEqual({ x: getTouchInput().x, y: getTouchInput().y }, { x: 0, y: 0 });
resetTouchInput();
assert.deepEqual(getTouchInput(), { x: 0, y: 0, run: false, crouch: false }, 'blocking overlays clear all touch toggles');
assert.equal(isTouchTap(true, 0), false, 'a completed hold cannot become a tap on pointer release');
assert.equal(isTouchTap(false, 12), true, 'a short untouched release remains a tap');
assert.equal(isTouchTap(false, 24), false, 'a movement gesture cannot become a tap');
assert.equal(isTouchDoubleTap(0, 200), false, 'the zero sentinel cannot count as a completed first tap');
assert.equal(isTouchDoubleTap(100, 300), true, 'two completed taps inside the window toggle run');
assert.equal(isTouchDoubleTap(0, 300), false, 'tap state cleared by cancellation cannot toggle run');
const pointerOwnership = new TouchPointerOwnership();
assert.equal(pointerOwnership.claimMovement(11), true);
assert.equal(pointerOwnership.claimLook(21), true);
assert.equal(pointerOwnership.claimMovement(21), false, 'a look pointer cannot also claim movement');
assert.equal(pointerOwnership.claimMovement(31), false, 'another pointer cannot steal movement ownership');
assert.equal(pointerOwnership.releaseLook(21), true);
assert.equal(pointerOwnership.movementPointer, 11, 'lifting look leaves movement ownership intact');
assert.equal(pointerOwnership.claimLook(22), true, 'a new look pointer can orbit while movement remains owned');
assert.equal(pointerOwnership.releaseMovement(11), true);
assert.equal(pointerOwnership.lookPointer, 22, 'lifting movement leaves look ownership intact');
assert.equal(pointerOwnership.releaseLook(22), true);

const sustainedFrameProbe = new FramePerformanceTelemetry();
assert.equal(getRecommendedPixelRatio('high', 2, 'full'), 2, 'full high quality preserves native DPR');
assert.equal(getRecommendedPixelRatio('low', 2, 'full'), 1, 'low quality bounds renderer DPR at 1x');
assert.equal(getRecommendedPixelRatio('high', 2, 'reduced'), 1, 'adaptive reduction bounds high quality at 1x');
assert.equal(getRecommendedPixelRatio('high', Number.NaN, 'full'), 1, 'invalid device DPR uses a safe renderer default');
assert.equal(shouldUseRendererShadows('high', 'full'), true, 'full high quality retains authored shadows');
assert.equal(shouldUseRendererShadows('low', 'full'), false, 'low quality disables shadow-map work');
assert.equal(shouldUseRendererShadows('high', 'reduced'), false, 'adaptive reduction disables shadow-map work');
const telemetryContext = {
  renderer: 'test renderer',
  vendor: 'test vendor',
  api: 'WebGL2',
  devicePixelRatio: 2,
  viewportWidth: 390,
  viewportHeight: 844,
  renderCalls: 25,
  triangles: 8000,
  geometries: 40,
  textures: 12,
  sceneChildren: 9,
  zone: 'hub' as const,
  npcCount: 12,
  quality: 'high' as const,
};
let telemetryAt = 0;
for (let frame = 0; frame < 90; frame += 1) {
  sustainedFrameProbe.recordFrame(60, telemetryAt, telemetryContext);
  telemetryAt += 50;
}
let telemetrySnapshot = sustainedFrameProbe.getSnapshot();
assert.equal(telemetrySnapshot.degradationDetected, true, 'frame telemetry identifies sustained frame pacing degradation');
assert.equal(telemetrySnapshot.adaptiveSafeguardActive, true, 'optional animation throttling waits for sustained degradation');
assert.equal(telemetrySnapshot.adaptiveRenderMode, 'reduced', 'sustained degradation requests the reduced renderer policy');
assert.ok(telemetrySnapshot.p95FrameMs >= 60, 'frame telemetry reports a meaningful p95 rather than only average FPS');
assert.ok(telemetrySnapshot.droppedFrames > 0, 'frame telemetry reports missed 60Hz frame budgets');
for (let frame = 0; frame < 470; frame += 1) {
  sustainedFrameProbe.recordFrame(16, telemetryAt, telemetryContext);
  telemetryAt += 16;
}
telemetrySnapshot = sustainedFrameProbe.getSnapshot();
assert.equal(telemetrySnapshot.degradationDetected, false, 'a healthy rolling frame window clears degradation');
assert.equal(telemetrySnapshot.adaptiveSafeguardActive, false, 'optional animation recovers only after a long healthy period');
assert.equal(telemetrySnapshot.adaptiveRenderMode, 'full', 'healthy recovery restores the full renderer policy');

const fortyFpsProbe = new FramePerformanceTelemetry();
let fortyFpsAt = 0;
for (let frame = 0; frame < 180; frame += 1) {
  fortyFpsProbe.recordFrame(25, fortyFpsAt, telemetryContext);
  fortyFpsAt += 25;
}
assert.equal(fortyFpsProbe.getSnapshot().adaptiveSafeguardActive, true, 'sustained 40 FPS is meaningful mobile degradation');
assert.ok(fortyFpsProbe.getSnapshot().droppedFrames > 0, 'fractional frame budgets expose 40 FPS frame loss');

const quantizedThirtyFpsProbe = new FramePerformanceTelemetry();
let thirtyFpsAt = 0;
for (let frame = 0; frame < 130; frame += 1) {
  quantizedThirtyFpsProbe.recordFrame(33.333, thirtyFpsAt, telemetryContext);
  thirtyFpsAt += 33.333;
}
assert.equal(quantizedThirtyFpsProbe.getSnapshot().adaptiveSafeguardActive, true, 'quantized 30 FPS samples activate the sustained safeguard');

const shortSpikeProbe = new FramePerformanceTelemetry();
let shortSpikeAt = 0;
for (let frame = 0; frame < 80; frame += 1) {
  shortSpikeProbe.recordFrame(25, shortSpikeAt, telemetryContext);
  shortSpikeAt += 25;
}
assert.equal(shortSpikeProbe.getSnapshot().adaptiveSafeguardActive, false, 'a short frame-rate drop does not reduce optional animation');

for (const landmark of GARDEN_LANDMARKS) {
  assert.equal(
    isWalkable(new THREE.Vector3(...landmark.position), PLAYER_RADIUS, [], 'garden'),
    true,
    `Garden landmark ${landmark.id} has a reachable interaction marker`,
  );
}

const returnThreshold = getWorldSolidTransform('garden-return-threshold', 2.5, 1.25);
assert.deepEqual(returnThreshold.size, [2.4, 2.5, 0.5], 'Garden return gate visual derives from its collision footprint');
for (const route of HUB_ROUTES) {
  const gate = getWorldSolidTransform(`route-${route.id}`, 2.5, 1.25);
  assert.deepEqual(
    getRouteGateInteractionPosition(route.id).toArray(),
    [gate.position[0], 0, gate.position[2]],
    `${route.label} interaction focus matches its collision-derived visible gate`,
  );
  assert.equal(
    getRouteGateInteractionPosition(route.id).y + ROUTE_FOCUS_RING_Y,
    0.035,
    `${route.label} focus ring stays on the ground while its gate geometry uses the collider center`,
  );
}

clearInteractionCandidates();
registerInteractionCandidate({
  id: 'approach-priority-station',
  position: new THREE.Vector3(0, 0, -4),
  approach: new THREE.Vector3(0, 0, -2.8),
  range: RAINBOW_TIDY_PLACEMENT_RANGE,
  priority: 70,
  questPriority: true,
  forcePriority: true,
  valid: true,
});
registerInteractionCandidate({
  id: 'competing-quest-target',
  position: new THREE.Vector3(0, 0, -0.7),
  range: 2,
  priority: 100,
  questPriority: true,
  valid: true,
});
assert.equal(
  resolveInteractionCandidate(
    new THREE.Vector3(0, 0, 0.3),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, 1),
  )?.id,
  'approach-priority-station',
  'the carried-block station overrides quest focus competition and unfavorable player/camera facing',
);
assert.notEqual(
  resolveInteractionCandidate(new THREE.Vector3(0, 0, 0.46), new THREE.Vector3(0, 0, -1))?.id,
  'approach-priority-station',
  'the station remains unavailable just outside its forgiving placement range',
);
clearInteractionCandidates();
const fartherQuestTarget = {
  id: 'farther-quest',
  position: new THREE.Vector3(0, 0, -1.6),
  range: 2,
  priority: 100,
  valid: true,
};
const closeIntendedTarget = {
  id: 'close-intended',
  position: new THREE.Vector3(0, 0, -0.45),
  range: 2,
  priority: 10,
  valid: true,
};
registerInteractionCandidate(fartherQuestTarget);
registerInteractionCandidate(closeIntendedTarget);
const focused = resolveInteractionCandidate(
  new THREE.Vector3(),
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 0, -1),
);
assert.equal(focused?.id, 'close-intended');
clearInteractionCandidates();
registerInteractionCandidate({
  id: 'calling-teacher',
  position: new THREE.Vector3(0, 0, -1.7),
  range: 2,
  priority: 62,
  urgentPriority: true,
  valid: true,
});
registerInteractionCandidate({
  id: 'nearby-child',
  position: new THREE.Vector3(0, 0, -0.25),
  range: 2,
  priority: 55,
  valid: true,
});
assert.equal(
  resolveInteractionCandidate(new THREE.Vector3(), new THREE.Vector3(0, 0, -1))?.id,
  'calling-teacher',
  'an active teacher call takes precedence over a nearby non-quest target',
);
registerInteractionCandidate({
  id: 'quest-child',
  position: new THREE.Vector3(0.2, 0, -1.8),
  range: 2,
  priority: 55,
  questPriority: true,
  valid: true,
});
assert.equal(
  resolveInteractionCandidate(new THREE.Vector3(), new THREE.Vector3(0, 0, -1))?.id,
  'quest-child',
  'quest priority remains authoritative over an active teacher call',
);
clearInteractionCandidates();
const gardenCandidateCleanup = registerInteractionCandidate({
  id: 'garden-activity-host',
  position: new THREE.Vector3(-10.8, 0, 5.35),
  range: 2.4,
  priority: 72,
  valid: true,
});
assert.equal(
  resolveInteractionCandidate(
    new THREE.Vector3(-10.8, 0, 5.35),
    new THREE.Vector3(0, 0, -1),
    undefined,
    -1,
  )?.id,
  'garden-activity-host',
);
gardenCandidateCleanup();
assert.equal(
  resolveInteractionCandidate(
    new THREE.Vector3(-10.8, 0, 5.35),
    new THREE.Vector3(0, 0, -1),
    undefined,
    -1,
  ),
  null,
  'Garden-only interaction is removed when returning to the Hub',
);
clearInteractionCandidates();

console.log('DayKare foundation checks passed');
// --- Juice Club: out of stock -> restock -> serve ----------------------------
//
// The regression this proves is a soft-lock, not a cosmetic bug. The Journal's
// only restock button is labelled "Restock (5 Juice & Crackers) - $2" but used
// to call buyStock('juice'), which added juice alone. serveCustomer requires
// juice AND crackers, and nothing anywhere restocked crackers. A player who ran
// both to zero paid, saw juice refill, still could not serve, and could repeat
// that until the cash was gone - ending the Juice Club permanently for that
// save. The purchase always "registered"; it bought half of what it promised.

useGameStore.getState().resetGame();
useGameStore.setState({
  schedule: 'juice-club',
  zone: 'hub',
  juiceStock: 0,
  crackerStock: 0,
  juiceClubCash: 10,
  waitingCustomers: ['Max'],
  juiceClubActiveCustomer: 'Max',
  juiceClubCustomerPhase: 'ordering',
});

// 1. Out of stock: the customer cannot be served, and nothing is consumed.
const strandedBefore = useGameStore.getState().juiceClubCustomersServed;
useGameStore.getState().serveCustomer();
assert.equal(
  useGameStore.getState().juiceClubCustomersServed,
  strandedBefore,
  'with no stock nobody can be served - this is the state the player was stuck in',
);

// 2. Restock through the same call the Journal button makes.
const cashBeforeRestock = useGameStore.getState().juiceClubCash;
useGameStore.getState().buyStock('supplies', 2, 5);
const afterRestock = useGameStore.getState();

// 3. Charged exactly once, for exactly the authored price.
assert.equal(afterRestock.juiceClubCash, cashBeforeRestock - 2, 'one restock deducts the price exactly once');

// 4. BOTH stocks are usable. Juice alone is what made this a soft-lock.
assert.ok(afterRestock.juiceStock > 0, 'restocking makes juice available');
assert.ok(
  afterRestock.crackerStock > 0,
  'restocking makes CRACKERS available too - serving needs both, and nothing else in the game restocks them',
);

// 5. The next customer can now actually be served.
const servedBefore = afterRestock.juiceClubCustomersServed;
const juiceBefore = afterRestock.juiceStock;
const crackerBefore = afterRestock.crackerStock;
useGameStore.getState().serveCustomer();
const afterServe = useGameStore.getState();
assert.equal(
  afterServe.juiceClubCustomersServed,
  servedBefore + 1,
  'out of stock -> restock -> stock > 0 -> the next customer IS served',
);
assert.equal(afterServe.juiceStock, juiceBefore - 1, 'serving consumes one juice');
assert.equal(afterServe.crackerStock, crackerBefore - 1, 'serving consumes one cracker');

// 6. Repeated purchases charge per purchase and never duplicate a single one.
useGameStore.getState().resetGame();
useGameStore.setState({ juiceClubCash: 10, juiceStock: 0, crackerStock: 0 });
useGameStore.getState().buyStock('supplies', 2, 5);
useGameStore.getState().buyStock('supplies', 2, 5);
const twice = useGameStore.getState();
assert.equal(twice.juiceClubCash, 6, 'two restocks cost exactly two prices - never double-charged for one');
assert.equal(twice.juiceStock, 10, 'two restocks add exactly two lots of juice');
assert.equal(twice.crackerStock, 10, 'two restocks add exactly two lots of crackers');

// 7. A purchase that cannot afford itself changes nothing at all.
useGameStore.getState().resetGame();
useGameStore.setState({ juiceClubCash: 1, juiceStock: 0, crackerStock: 0 });
useGameStore.getState().buyStock('supplies', 2, 5);
const broke = useGameStore.getState();
assert.equal(broke.juiceClubCash, 1, 'an unaffordable restock takes no money');
assert.equal(broke.juiceStock, 0, 'and grants no stock');
assert.equal(broke.crackerStock, 0, 'and grants no crackers');

// 8. Full shelves are not charged for. Paying for stock that cannot be added is
//    how a player ends up broke AND unable to serve.
useGameStore.getState().resetGame();
useGameStore.setState({ juiceClubCash: 10, juiceStock: 99, crackerStock: 99 });
useGameStore.getState().buyStock('supplies', 2, 5);
assert.equal(useGameStore.getState().juiceClubCash, 10, 'a restock that cannot add anything is not charged');

// 9. Stock survives the save round trip, so a restock is not undone by a reload.
useGameStore.getState().resetGame();
useGameStore.setState({ juiceStock: 7, crackerStock: 4, juiceClubCash: 9 });
const restocked = normalizePersistedGameState(serializeGameState(useGameStore.getState())) as {
  juiceStock: number; crackerStock: number; juiceClubCash: number;
};
assert.equal(restocked.juiceStock, 7, 'juice stock is persisted and restored');
assert.equal(restocked.crackerStock, 4, 'cracker stock is persisted and restored');
assert.equal(restocked.juiceClubCash, 9, 'club cash is persisted and restored');

// 10. Caller-supplied price and amount are still ignored, so the fix did not
//     open a way to forge free stock.
useGameStore.getState().resetGame();
useGameStore.setState({ juiceClubCash: 10, juiceStock: 0, crackerStock: 0 });
useGameStore.getState().buyStock('supplies', 0, 999);
const forged = useGameStore.getState();
assert.equal(forged.juiceClubCash, 8, 'a forged price is ignored - the authored price is charged');
assert.equal(forged.juiceStock, 5, 'a forged amount is ignored - the authored amount is granted');
assert.equal(forged.crackerStock, 5, 'a forged amount cannot inflate crackers either');

// --- canonical clock: store integration and save migration -------------------
//
// The clock is new state in an existing save. The risk is not that the clock is
// wrong - clock.test.ts covers the maths - it is that adding it disturbs a save
// that predates it. These assertions run through the REAL store normalizer.

// tickClock caps a single tick at one real second, so a tab that was
// backgrounded cannot fast-forward the day when it returns. Real ticking runs
// four times a second; these helpers tick the same way rather than pretending a
// single 60-second frame exists.
const tickRealSeconds = (seconds: number) => {
  for (let i = 0; i < seconds; i += 1) useGameStore.getState().tickClock(1);
};

// A save written before the clock existed has timeOfDay and dayNumber and no
// clock at all. It must migrate, never reset.
{
  const legacySave = {
    timeOfDay: 13.5,
    dayNumber: 6,
    juiceStock: 4,
    crackerStock: 2,
    juiceClubCash: 11,
    progression: { version: 4, reputation: 30, tokens: 12 },
  };
  const migrated = normalizePersistedGameState(legacySave) as {
    clock: { minute: number; dayIndex: number; timeScale: number; paused: boolean };
    timeOfDay: number; dayNumber: number; schedule: string;
    juiceStock: number; crackerStock: number; juiceClubCash: number;
  };
  assert.equal(migrated.clock.minute, 13.5 * 60, 'a pre-clock save gets a clock built from its own timeOfDay');
  assert.equal(migrated.clock.dayIndex, 6, 'and from its own day number');
  assert.equal(migrated.timeOfDay, 13.5, 'the legacy timeOfDay is untouched');
  assert.equal(migrated.dayNumber, 6, 'the legacy day number is untouched');
  assert.equal(migrated.schedule, 'outdoor-play', 'and the schedule still resolves the same way it always did');
  assert.equal(migrated.juiceStock, 4, 'unrelated progress survives the migration');
  assert.equal(migrated.crackerStock, 2, 'including crackers');
  assert.equal(migrated.juiceClubCash, 11, 'including Juice Club cash');
  assert.equal(migrated.clock.paused, false, 'a migrated save never loads frozen');
  assert.equal(migrated.clock.timeScale, 1, 'and never loads fast-forwarded');
}

// A save WITH a clock round-trips it.
{
  useGameStore.getState().resetGame();
  useGameStore.setState({ timeOfDay: 11.25, dayNumber: 3 });
  useGameStore.getState().setTimeOfDay(11.25);
  const roundTripped = normalizePersistedGameState(serializeGameState(useGameStore.getState())) as {
    clock: { minute: number; dayIndex: number }; timeOfDay: number;
  };
  assert.equal(roundTripped.clock.minute, 11.25 * 60, 'the logical minute survives a save round trip');
  assert.equal(roundTripped.timeOfDay, 11.25, 'and stays consistent with timeOfDay');
}

// Ticking the store clock moves the legacy timeOfDay with it, so every existing
// consumer - the HUD, the teachers, the Juice Club window - keeps working
// without knowing the clock exists.
{
  useGameStore.getState().resetGame();
  const before = useGameStore.getState().timeOfDay;
  tickRealSeconds(60); // one real minute -> 30 game minutes
  const after = useGameStore.getState();
  assert.ok(after.timeOfDay > before, 'ticking the clock advances the legacy timeOfDay too');
  assert.ok(Math.abs(after.timeOfDay - (before + 0.5)) < 1e-6, 'by exactly half an hour');
  assert.equal(after.clock.minute, after.timeOfDay * 60, 'the two never disagree');
}

// The per-tick cap, at the store level: one enormous tick is not an hour of
// free progress.
{
  useGameStore.getState().resetGame();
  const start = useGameStore.getState().clock.minute;
  useGameStore.getState().tickClock(3600);
  assert.ok(
    useGameStore.getState().clock.minute - start <= 0.5 + 1e-9,
    'a single huge tick advances at most one real second of game time',
  );
}

// Crossing into Juice Club by clock, and back out of it, behaves exactly as the
// manual "+1.5h" advance always did - including tearing down customer state.
{
  useGameStore.getState().resetGame();
  useGameStore.getState().setTimeOfDay(11.9);
  tickRealSeconds(30); // 15 game minutes -> 12:05, into Juice Club
  assert.equal(useGameStore.getState().schedule, 'juice-club', 'the clock opens Juice Club at noon');
  useGameStore.setState({ waitingCustomers: ['Max'], juiceClubActiveCustomer: 'Max' });
  useGameStore.getState().setTimeOfDay(13.4);
  tickRealSeconds(30); // out of Juice Club
  const left = useGameStore.getState();
  assert.notEqual(left.schedule, 'juice-club', 'and closes it again on time');
  assert.deepEqual(left.waitingCustomers, [], 'leaving Juice Club by clock clears customers, as leaving it always did');
}

// Pausing the store clock stops it, and no time is repaid on resume.
{
  useGameStore.getState().resetGame();
  tickRealSeconds(60);
  const parked = useGameStore.getState().clock.minute;
  useGameStore.getState().setClockPaused(true, 'dialogue');
  tickRealSeconds(60);
  assert.equal(useGameStore.getState().clock.minute, parked, 'a paused store clock does not advance');
  assert.equal(useGameStore.getState().clock.pauseReason, 'dialogue', 'and records why it stopped');
  useGameStore.getState().setClockPaused(false);
  tickRealSeconds(60);
  assert.ok(
    Math.abs(useGameStore.getState().clock.minute - (parked + 30)) < 1e-6,
    'resuming continues from where it stopped rather than catching up',
  );
}

// Fast-forward is limited to the three authored speeds.
{
  useGameStore.getState().resetGame();
  useGameStore.getState().setTimeScale(4);
  assert.equal(useGameStore.getState().clock.timeScale, 4, '4x is allowed');
  useGameStore.getState().setTimeScale(16 as unknown as 4);
  assert.equal(useGameStore.getState().clock.timeScale, 4, 'an unauthored speed is refused, leaving the last valid one');
}

// The day rollover still owns what a new day means, and now moves the clock too.
{
  useGameStore.getState().resetGame();
  useGameStore.setState({ timeOfDay: 17.5, teacherSuspicion: 40 });
  const dayBefore = useGameStore.getState().dayNumber;
  useGameStore.getState().advanceSchedule();
  const rolled = useGameStore.getState();
  assert.equal(rolled.dayNumber, dayBefore + 1, 'the day still advances');
  assert.equal(rolled.clock.dayIndex, dayBefore + 1, 'and the clock advances with it');
  assert.equal(rolled.clock.minute, 9 * 60, 'the clock returns to the start of the daycare day');
  assert.equal(rolled.teacherSuspicion, 0, 'and the existing rollover effects still happen');
}

// --- district travel and the current-location readout ------------------------
//
// The HUD's "DAYKARE HUB" chip looked like a button and did nothing when
// tapped. It is a LOCATION READOUT, not a control, and it never had a handler:
// district travel is diegetic - walk to the portal, press E - and the chip
// simply shared the card styling of the Menu and Journal buttons above it.
//
// These assertions pin both halves: the readout stays a readout, and the real
// travel path stays guarded against the duplicate triggers a portal can produce
// on a touchscreen.

assert.equal(zoneLabel('hub'), 'DayKare Hub', 'the hub has a player-facing name');
assert.equal(zoneLabel('garden'), 'Garden District', 'and so does the garden');
assert.deepEqual(
  Object.keys(ZONE_LABELS).sort(),
  ['garden', 'hub'],
  'every zone has a label - a future district must fail to compile rather than silently render as the hub',
);

// The readout must not become a control again. A styled div that does nothing
// is the exact defect that was reported, so this checks the markup directly.
{
  const uiSource = readFileSync(new URL('./UI.tsx', import.meta.url), 'utf8');
  const start = uiSource.indexOf('daykare-hud-zone');
  assert.ok(start > -1, 'the zone readout still exists');
  const block = uiSource.slice(start, start + 900);
  assert.ok(block.includes('role="status"'), 'the zone readout announces itself as status, not as a control');
  assert.ok(block.includes('cursor-default'), 'and does not present a clickable cursor');
  assert.ok(
    !/onClick/.test(block),
    'the zone readout must not gain a click handler here - district travel is diegetic, and HUD fast-travel would replace a designed mechanic with a menu',
  );
}

// Travel itself: guarded, and safe against the double-fire a portal can produce.
{
  useGameStore.getState().resetGame();
  // Returning to the hub from the hub is a no-op, not a transition.
  assert.equal(useGameStore.getState().returnToHub(), false, 'you cannot return to the hub while already in it');
  assert.equal(useGameStore.getState().zoneTransitioning, false, 'and no transition is started');
}
{
  // Entering the garden needs the route unlocked - the readout never bypassed that.
  useGameStore.getState().resetGame();
  const locked = useGameStore.getState().enterGarden();
  assert.equal(locked, false, 'the garden cannot be entered before its route is unlocked');
}
{
  useGameStore.getState().resetGame();
  // The garden route unlocks at 10 REP - that gate is progression's business
  // and this test must not pretend to bypass it.
  useGameStore.setState({
    progression: { ...useGameStore.getState().progression, reputation: 10 },
  });
  const first = useGameStore.getState().enterGarden();
  assert.equal(first, true, 'an unlocked garden route starts the transition');
  assert.equal(useGameStore.getState().zoneTransitioning, true, 'and marks the transition in flight');

  // The duplicate trigger. A touch portal can fire twice; the second must do
  // nothing rather than stack a second transition or reset the saved position.
  const hubPositionAfterFirst = useGameStore.getState().hubPosition;
  const second = useGameStore.getState().enterGarden();
  assert.equal(second, false, 'a second trigger while a transition is in flight is refused');
  assert.deepEqual(
    useGameStore.getState().hubPosition,
    hubPositionAfterFirst,
    'and does not overwrite the position we are returning to',
  );

  useGameStore.getState().completeZoneTransition();
  assert.equal(useGameStore.getState().zone, 'garden', 'the transition completes into the garden');
  assert.equal(useGameStore.getState().zoneTransitioning, false, 'and clears the in-flight flag');

  // And back, with the same guard.
  assert.equal(useGameStore.getState().returnToHub(), true, 'the garden return portal works');
  const gardenPositionAfterFirst = useGameStore.getState().gardenPosition;
  assert.equal(useGameStore.getState().returnToHub(), false, 'a duplicate return trigger is refused');
  assert.deepEqual(
    useGameStore.getState().gardenPosition,
    gardenPositionAfterFirst,
    'and does not overwrite where the player left the garden',
  );
  useGameStore.getState().completeZoneTransition();
  assert.equal(useGameStore.getState().zone, 'hub', 'and the player is back in the daycare');
}

// Save integrity across a round trip: Juice Club progress is untouched by travel.
{
  useGameStore.getState().resetGame();
  useGameStore.setState({
    progression: { ...useGameStore.getState().progression, reputation: 10 },
    juiceStock: 7, crackerStock: 3, juiceClubCash: 13, dayNumber: 4,
  });
  useGameStore.getState().enterGarden();
  useGameStore.getState().completeZoneTransition();
  useGameStore.getState().returnToHub();
  useGameStore.getState().completeZoneTransition();
  const after = useGameStore.getState();
  assert.equal(after.zone, 'hub', 'the round trip ends in the hub');
  assert.equal(after.juiceStock, 7, 'juice stock survives district travel');
  assert.equal(after.crackerStock, 3, 'so do crackers');
  assert.equal(after.juiceClubCash, 13, 'and Juice Club cash');
  assert.equal(after.dayNumber, 4, 'and the day');
}
