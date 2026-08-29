import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  activateQuest,
  advanceObjective,
  createInitialQuests,
  normalizeQuestStates,
} from './quests';
import {
  CAMERA_ZOOM_MAX,
  CAMERA_ZOOM_MIN,
  addCameraOrbit,
  adjustCameraZoom,
  consumeCameraRecenterRequest,
  getCameraInput,
  recenterCamera,
  stepCameraInput,
} from './cameraInput';
import { clearInteractionCandidates, registerInteractionCandidate, resolveInteractionCandidate } from './interactionFocus';
import { getNavigationTarget, getPortalWaypoints } from './navigation';
import {
  PLAYER_RADIUS,
  PLAY_SLIDE_RAMP,
  getWorldSolidTransform,
  isWalkable,
  resolveCameraPosition,
  resolveMovement,
} from './world';
import { normalizeSavedItems, normalizeTidyItems } from './store';

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

recenterCamera();
assert.equal(consumeCameraRecenterRequest(), true);
addCameraOrbit(100, -20);
const directYaw = getCameraInput().yaw;
stepCameraInput(1 / 30);
stepCameraInput(1 / 120);
assert.equal(getCameraInput().yaw, directYaw, 'camera drag does not accumulate frame-dependent inertia');
adjustCameraZoom(100);
assert.equal(getCameraInput().targetZoom, CAMERA_ZOOM_MAX, 'camera zoom clamps to its far limit');
const zoomBeforeEase = getCameraInput().zoom;
stepCameraInput(1 / 60);
assert.ok(getCameraInput().zoom > zoomBeforeEase, 'camera zoom eases toward its target');
adjustCameraZoom(-100);
assert.equal(getCameraInput().targetZoom, CAMERA_ZOOM_MIN, 'camera zoom clamps to its near limit');

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

console.log('DayKare foundation checks passed');