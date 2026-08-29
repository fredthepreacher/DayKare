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
  recenterCamera,
  stepCameraInput,
} from './cameraInput';
import { clearInteractionCandidates, registerInteractionCandidate, resolveInteractionCandidate } from './interactionFocus';
import { getNavigationTarget, getPortalWaypoints } from './navigation';
import { clearTouchMove, getTouchInput, resetTouchInput, setTouchCrouch, setTouchMove, toggleTouchRun } from './touchInput';
import {
  GARDEN_SPAWN,
  PLAYER_RADIUS,
  PLAY_SLIDE_RAMP,
  getWorldSolidTransform,
  isWalkable,
  resolveCameraPosition,
  resolveMovement,
  trackPlayerPosition,
} from './world';
import { normalizeSavedItems, normalizeTidyItems, serializeGameState } from './store';
import { HUB_ROUTES, isRouteUnlocked, normalizeProgression, requirementProgressLabel } from './progression';
import { useGameStore } from './store';
import { kidActivityMode, teacherPatrolSpots } from './NPCs';
import { isGameplayBlocked } from './gameplayGate';
import { isTouchDoubleTap, isTouchTap } from './TouchControls';

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

const wallSlideStart = new THREE.Vector3(7.1, 0, 4);
const wallSlideDesired = new THREE.Vector3(9, 0, 2.6);
const wallSlideResult = resolveMovement(wallSlideStart, wallSlideDesired, PLAYER_RADIUS);
assert.ok(wallSlideResult.x < 7.4, 'divider blocks traversal outside the doorway');
assert.ok(wallSlideResult.z < wallSlideStart.z, 'axis separation still permits wall sliding');

const doorwayStart = new THREE.Vector3(7.1, 0, 0);
const doorwayResult = resolveMovement(doorwayStart, new THREE.Vector3(9, 0, 0), PLAYER_RADIUS);
assert.ok(doorwayResult.x > 8.5, 'authored doorway remains traversable');
assert.ok(isWalkable(doorwayResult, PLAYER_RADIUS));

const closeWallTarget = new THREE.Vector3(0, 1, -6.5);
const closeWallCamera = resolveCameraPosition(closeWallTarget, new THREE.Vector3(0, 1, -9));
assert.ok(closeWallCamera.distanceTo(closeWallTarget) < 1.8, 'nearby blockers override framing minimums');
assert.ok(closeWallCamera.z > -7.5, 'camera remains on the target-facing side of the wall');
const routeGateCamera = resolveCameraPosition(
  new THREE.Vector3(12, 1, -13),
  new THREE.Vector3(16, 1, -13),
);
assert.ok(routeGateCamera.x < 13, 'route gate blocks the camera before it clips through the arch');

const route = getPortalWaypoints(new THREE.Vector3(0, 0, 0), new THREE.Vector3(12, 0, 5));
assert.equal(route[0].x, 7.1);
assert.equal(route.at(-1)?.x, 12);

const persistentDestination = new THREE.Vector3(12, 0, -11.5);
const firstNpcWaypoint = getNavigationTarget('test-kid', new THREE.Vector3(0, 0, 0), persistentDestination);
const secondNpcWaypoint = getNavigationTarget('test-kid', new THREE.Vector3(0.1, 0, 0), persistentDestination);
assert.equal(firstNpcWaypoint.x, secondNpcWaypoint.x, 'NPC keeps the same portal waypoint while following a path');

const artTable = getWorldSolidTransform('art-table', 1);
assert.deepEqual(artTable.position, [-12, 0.5, -12]);
assert.deepEqual(artTable.size, [3.3999999999999986, 1, 3.3999999999999986]);
assert.ok(PLAY_SLIDE_RAMP.solid.minZ <= PLAY_SLIDE_RAMP.position[2] - 1);
assert.ok(PLAY_SLIDE_RAMP.solid.maxZ >= PLAY_SLIDE_RAMP.position[2] + 1);
const upperStorageBox = getWorldSolidTransform('storage-box-upper', 0.8, 1.4);
assert.deepEqual(upperStorageBox.position, [-14, 1.4, 10]);
assert.deepEqual(upperStorageBox.size, [0.8000000000000007, 0.8, 0.8000000000000007]);

assert.equal(isWalkable(new THREE.Vector3(10, 0, 0), PLAYER_RADIUS, [], 'hub'), true);
assert.equal(isWalkable(new THREE.Vector3(10, 0, 0), PLAYER_RADIUS, [], 'garden'), false, 'Garden pond owns Garden-only collision');
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
assert.equal(
  requirementProgressLabel(HUB_ROUTES[0], normalizeProgression({ reputation: 7 })),
  '7/10 hub reputation',
);

useGameStore.getState().resetGame();
assert.equal(useGameStore.getState().enterGarden(), false, 'Garden remains blocked below ten reputation');
useGameStore.setState((state) => ({
  progression: { ...state.progression, routeUnlocks: ['garden-district'] },
}));
assert.equal(useGameStore.getState().enterGarden(), false, 'a forged route flag cannot bypass the live reputation requirement');
useGameStore.getState().resetGame();
useGameStore.getState().completeActivity('test-reputation', 0, 10);
assert.equal(useGameStore.getState().progression.routeUnlocks.includes('garden-district'), true);
trackPlayerPosition(new THREE.Vector3(12, 0, -10.4));
assert.equal(useGameStore.getState().enterGarden(), true);
assert.equal(useGameStore.getState().pendingZone, 'garden');
useGameStore.getState().completeZoneTransition();
assert.equal(useGameStore.getState().zone, 'garden');
assert.deepEqual(useGameStore.getState().playerPosition, GARDEN_SPAWN);
assert.equal(useGameStore.getState().startGardenActivity(), true);
assert.equal(useGameStore.getState().startGardenActivity(), false, 'Garden activity cannot be started twice');
assert.equal(useGameStore.getState().advanceGardenActivity(), 2);
assert.equal(useGameStore.getState().advanceGardenActivity(), 3);
useGameStore.getState().completeActivity('garden-planting', 2, 1);
assert.equal(useGameStore.getState().progression.activityRuns['garden-planting'], 1);
assert.equal(useGameStore.getState().progression.activityRewards['garden-planting'], 2);
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
    ['standing', 'sitting', 'playing', 'gathering'].includes(kidActivityMode(scheduleName, false, 4.2)),
    `kid activity mode is defined for ${scheduleName}`,
  );
}

recenterCamera();
assert.equal(consumeCameraRecenterRequest(), true);
addCameraOrbit(100, -20);
const directYaw = getCameraInput().yaw;
stepCameraInput(1 / 30);
stepCameraInput(1 / 120);
assert.equal(getCameraInput().yaw, directYaw, 'camera drag does not accumulate frame-dependent inertia');
assert.equal(CAMERA_DISTANCE, 8.8, 'desktop and touch use one stable camera frame');
assert.equal(isGameplayBlocked({ journalOpen: true, activeDialogue: null, zoneTransitioning: false }), true);
assert.equal(isGameplayBlocked({ journalOpen: false, activeDialogue: { text: 'pause' }, zoneTransitioning: false }), true);
assert.equal(isGameplayBlocked({ journalOpen: false, activeDialogue: null, zoneTransitioning: true }), true);
assert.equal(isGameplayBlocked({ journalOpen: false, activeDialogue: null, zoneTransitioning: false }), false);

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