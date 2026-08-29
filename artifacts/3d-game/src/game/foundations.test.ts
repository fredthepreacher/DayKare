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
import { clearTouchMove, getTouchInput, resetTouchInput, setTouchCrouch, setTouchMove, toggleTouchRun } from './touchInput';
import {
  GARDEN_SPAWN,
  MIN_CAMERA_DISTANCE,
  PLAYER_RADIUS,
  PLAY_SLIDE_RAMP,
  WORLD_SOLIDS,
  getWorldSolidTransform,
  isWalkable,
  resolveCameraPosition,
  resolveMovement,
  trackPlayerPosition,
} from './world';
import { normalizeSavedItems, normalizeTidyItems, restoreZoneState, serializeGameState } from './store';
import { HUB_ROUTES, isRouteUnlocked, normalizeProgression, requirementProgressLabel } from './progression';
import { useGameStore } from './store';
import { facingAngleForDirection, kidActivityMode, kidDestination, teacherPatrolSpots } from './NPCs';
import { isGameplayBlocked } from './gameplayGate';
import { isTouchDoubleTap, isTouchTap } from './TouchControls';
import { GARDEN_CAST, gardenNpcDestination } from './Garden';
import { artworkBackingSize } from './Artwork';
import { dialogueDismissLabel } from './dialogueActions';

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

const closeWallTarget = new THREE.Vector3(0, 1, -6.5);
const closeWallCamera = resolveCameraPosition(closeWallTarget, new THREE.Vector3(0, 1, -9));
assert.ok(
  closeWallCamera.distanceTo(closeWallTarget) >= MIN_CAMERA_DISTANCE,
  'nearby walls use a safe side angle instead of collapsing the camera',
);
assert.ok(closeWallCamera.z > -7.5, 'camera remains on the playable side of the wall');
const lowPropCameraTarget = new THREE.Vector3(3, 1, -1);
const lowPropDesiredCamera = new THREE.Vector3(3, 1, -5);
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
assert.ok(PLAY_SLIDE_RAMP.solid.maxZ >= PLAY_SLIDE_RAMP.position[2] + 1);
const upperStorageBox = getWorldSolidTransform('storage-box-upper', 0.8, 1.4);
assert.deepEqual(upperStorageBox.position, [-14, 1.4, 10]);
assert.deepEqual(upperStorageBox.size, [0.8000000000000007, 0.8, 0.8000000000000007]);
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

useGameStore.getState().resetGame();
useGameStore.setState({
  schedule: 'juice-club',
  waitingCustomers: ['Max', 'Noah'],
  juiceStock: 2,
  crackerStock: 2,
});
useGameStore.getState().serveCustomer();
assert.deepEqual(useGameStore.getState().waitingCustomers, ['Noah'], 'Juice Club service promotes the next queued customer');
assert.equal(useGameStore.getState().juiceClubServedCustomer, 'Max', 'served customer enters the visible drink-and-exit phase');
useGameStore.getState().clearJuiceClubServedCustomer();
assert.equal(useGameStore.getState().juiceClubServedCustomer, null);
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
useGameStore.getState().setAmbientMessage('stale Hub greeting');
assert.equal(useGameStore.getState().ambientMessage, null, 'Hub social messages cannot publish after Garden remount');
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
    ['standing', 'sitting', 'playing', 'gathering'].includes(kidActivityMode(scheduleName, false, 4.2)),
    `kid activity mode is defined for ${scheduleName}`,
  );
}

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
assert.deepEqual(artPairA.toArray(), artPairB.toArray(), 'paired children share a coordinated art-session anchor');

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

recenterCamera();
assert.equal(consumeCameraRecenterRequest(), true);
addCameraOrbit(100, -20);
const directYaw = getCameraInput().yaw;
stepCameraInput(1 / 30);
stepCameraInput(1 / 120);
assert.equal(getCameraInput().yaw, directYaw, 'camera drag does not accumulate frame-dependent inertia');
assert.equal(CAMERA_DISTANCE, 9.8, 'desktop and touch use one naturally wider stable camera frame');
const landscapeProfile = getCameraProfile(1280, 720);
const portraitProfile = getCameraProfile(390, 844);
assert.ok(portraitProfile.distance > landscapeProfile.distance, 'portrait starts with a wider fixed camera distance');
assert.ok(portraitProfile.fov > landscapeProfile.fov, 'portrait uses a wider lens instead of manual zoom');
assert.ok(portraitProfile.lookAhead > landscapeProfile.lookAhead, 'portrait keeps useful movement look-ahead');
assert.deepEqual(artworkBackingSize([2, 1]), [2.16, 1.16], 'artwork support extends beyond the supplied graphic');
assert.equal(dialogueDismissLabel(false), 'Continue / Close');
assert.equal(dialogueDismissLabel(true), 'Cancel / Leave');
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