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
import { KID_CAST, facingAngleForDirection, kidActivityMode, kidDestination, resolveNpcMovement, stepNpc, teacherPatrolSpots } from './NPCs';
import { isGameplayBlocked } from './gameplayGate';
import { isTouchDoubleTap, isTouchTap } from './TouchControls';
import { GARDEN_CAST, gardenNpcDestination } from './Garden';
import { artworkBackingSize } from './Artwork';
import { dialogueDismissLabel } from './dialogueActions';
import { getSharedActivitySession, reportSessionArrival, resetActivitySessions } from './activitySessions';
import { activitySessionIsInterrupted, sessionParticipant } from './activitySessions';
import { FramePerformanceTelemetry } from './performanceTelemetry';

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
assert.ok(PLAY_SLIDE_RAMP.solid.maxZ >= PLAY_SLIDE_RAMP.position[2] + 1);
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
  quality: 'ultra',
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
assert.equal(corruptSave.quality, 'high');
assert.equal(corruptSave.timeOfDay, 9);
assert.equal(corruptSave.schedule, 'morning-play');
assert.equal(corruptSave.isRainy, false);
assert.deepEqual(corruptSave.inventory, []);
assert.deepEqual(corruptSave.collectibles, ['Shiny Rock']);
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
assert.equal(CAMERA_DISTANCE, 12.6, 'desktop uses a substantially wider fixed camera frame');
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
const pointerOwnership = new TouchPointerOwnership();
assert.equal(pointerOwnership.claimMovement(11), true);
assert.equal(pointerOwnership.claimLook(21), true);
assert.equal(pointerOwnership.claimMovement(31), false, 'another pointer cannot steal movement ownership');
assert.equal(pointerOwnership.releaseLook(21), true);
assert.equal(pointerOwnership.movementPointer, 11, 'lifting look leaves movement ownership intact');
assert.equal(pointerOwnership.claimLook(22), true, 'a new look pointer can orbit while movement remains owned');
assert.equal(pointerOwnership.releaseMovement(11), true);
assert.equal(pointerOwnership.lookPointer, 22, 'lifting movement leaves look ownership intact');
assert.equal(pointerOwnership.releaseLook(22), true);

const sustainedFrameProbe = new FramePerformanceTelemetry();
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
assert.ok(telemetrySnapshot.p95FrameMs >= 60, 'frame telemetry reports a meaningful p95 rather than only average FPS');
assert.ok(telemetrySnapshot.droppedFrames > 0, 'frame telemetry reports missed 60Hz frame budgets');
for (let frame = 0; frame < 470; frame += 1) {
  sustainedFrameProbe.recordFrame(16, telemetryAt, telemetryContext);
  telemetryAt += 16;
}
telemetrySnapshot = sustainedFrameProbe.getSnapshot();
assert.equal(telemetrySnapshot.degradationDetected, false, 'a healthy rolling frame window clears degradation');
assert.equal(telemetrySnapshot.adaptiveSafeguardActive, false, 'optional animation recovers only after a long healthy period');

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