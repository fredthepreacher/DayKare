import assert from 'node:assert/strict';
import * as THREE from 'three';
import { STORY_REWARDS, STORY_REWARD_LABELS, FIRST_HEIST_RB, CAPER_HEIST_RB } from './finalMaster';
import { useGameStore } from './store';
import { useStorybookLaneStore } from './storybookLaneStore';
import { useFinalMasterStore } from './finalMasterStore';
import {
  GARAGE_BAYS, GARAGE_DOOR_APPROACH, GARAGE_DOOR_RETURN, GARAGE_EXIT_POINT, GARAGE_SPAWN,
  PLAYER_RADIUS, WORLD_SOLIDS, isWalkable, zoneLabel,
} from './world';
import { garageBays, ownershipSummary } from './ownership';
import { ART_GALLERY_FACE_X, ART_GALLERY_FRAMES, ART_GALLERY_FRAME_SIZE, ART_GALLERY_HEIGHT } from './HubDetails';
import {
  AFTER_HOURS_END_MINUTE, AFTER_HOURS_START_MINUTE, isAfterHours, STORYBOOK_CLOSE_MINUTE,
} from './storybookLaneConfig';
import { STORYBOOK_PLAY_LOOPS, STORYBOOK_RIDERS, storybookPlayCastResolves, storybookPlayTarget } from './storybookPlay';
import { evaluateScheduleRetrieval, resetEscapeRetrieval } from './escapeRetrieval';
import { SCHEDULE_DETECTION_GRACE_SECONDS } from './schedulePolicy';

/**
 * Addendum v5: the reward table, the garage as its own zone, dining moved to
 * the basement, and after-hours Stony Brook.
 */

/* --------------------------- the art gallery --------------------------- */

{
  // Every frame on the classroom picture rail must have a wall behind it.
  // The middle frame used to hang at z = 0, which is the middle of the
  // hallway doorway - a panel floating in mid-air beside the window.
  const backing = WORLD_SOLIDS.filter((solid) => solid.zone === 'hub'
    && solid.id.startsWith('hall-divider')
    && solid.minX <= ART_GALLERY_FACE_X && solid.maxX >= ART_GALLERY_FACE_X - 0.12);
  assert.ok(backing.length >= 2, 'the picture rail hangs on the hallway divider segments');

  for (const z of ART_GALLERY_FRAMES) {
    const half = ART_GALLERY_FRAME_SIZE[0] / 2;
    const supported = backing.some((solid) => solid.minZ <= z - half && solid.maxZ >= z + half);
    assert.ok(supported, `the frame at z=${z} has a wall behind it, not a doorway`);
    // And it fits under the wall's height, so it cannot poke out of the top.
    assert.ok(
      ART_GALLERY_HEIGHT + ART_GALLERY_FRAME_SIZE[1] / 2 <= 3,
      'and it fits within the wall it hangs on',
    );
  }
}

/* ---------------------------- reward table ---------------------------- */

{
  assert.equal(STORY_REWARDS.leslieHeist, 9_000, "Miss Leslie's heist pays the authored amount");
  assert.equal(STORY_REWARDS.stickerParadeCaper, 2_500, 'the caper pays the authored amount');
  assert.equal(STORY_REWARDS.leoStory, 1_000, "Leo's story pays the authored amount");
  assert.equal(STORY_REWARDS.maeStory, 3_000, "Mae's story pays the authored amount");

  // One table, not four literals: the constants the rest of the game reads
  // are derived from it, so the board and the wallet cannot disagree.
  assert.equal(FIRST_HEIST_RB, STORY_REWARDS.leslieHeist);
  assert.equal(CAPER_HEIST_RB, STORY_REWARDS.stickerParadeCaper);
  for (const id of Object.keys(STORY_REWARDS) as (keyof typeof STORY_REWARDS)[]) {
    assert.ok(STORY_REWARD_LABELS[id], `${id} has a player-facing name`);
  }
}

{
  // Leo's story pays once, on the transition, and a second attempt pays
  // nothing - which is what a refresh looks like from the store's side.
  useGameStore.getState().resetGame();
  useStorybookLaneStore.setState({ ribbonBucks: 0 });
  useGameStore.setState((state) => ({
    inventory: [...state.inventory, 'binky'],
    quests: {
      ...state.quests,
      'where-binky': { ...state.quests['where-binky'], status: 'active', currentObjectiveId: 'return-binky' },
    },
  }));
  assert.equal(useGameStore.getState().updateBinkyStatus('returned-good'), true, "Leo's story completes");
  assert.equal(
    useStorybookLaneStore.getState().ribbonBucks,
    STORY_REWARDS.leoStory,
    'returning Binky pays Rascal Bucks',
  );
  useGameStore.getState().updateBinkyStatus('returned-good');
  assert.equal(
    useStorybookLaneStore.getState().ribbonBucks,
    STORY_REWARDS.leoStory,
    'and a repeat cannot pay twice',
  );
}

{
  // Mae's story, same shape.
  useGameStore.getState().resetGame();
  useStorybookLaneStore.setState({ ribbonBucks: 0 });
  useGameStore.setState((state) => ({
    rivalStory: { ...state.rivalStory, beat: 'make-peace' },
  }));
  assert.equal(useGameStore.getState().resolveRivalStory(), true, "Mae's story completes");
  assert.equal(useStorybookLaneStore.getState().ribbonBucks, STORY_REWARDS.maeStory, "Mae's story pays out");
  assert.equal(useGameStore.getState().resolveRivalStory(), false, 'a completed story is a no-op');
  assert.equal(
    useStorybookLaneStore.getState().ribbonBucks,
    STORY_REWARDS.maeStory,
    'and it cannot pay twice',
  );
}

/* ------------------------------ the garage ------------------------------ */

{
  assert.equal(zoneLabel('garage'), 'Your Garage', 'the garage is a zone with a name of its own');

  // A room you can stand in, walk across, and not fall out of.
  assert.equal(isWalkable(new THREE.Vector3(...GARAGE_SPAWN), PLAYER_RADIUS, [], 'garage'), true);
  for (const bay of GARAGE_BAYS) {
    assert.equal(
      isWalkable(new THREE.Vector3(bay[0], 0, bay[2] + 2.2), PLAYER_RADIUS, [], 'garage'),
      true,
      `bay at ${bay[0]} can be walked up to`,
    );
  }
  // Sealed: the roller door is a solid, so the exit is the interaction.
  assert.equal(isWalkable(new THREE.Vector3(0, 0, 5.9), PLAYER_RADIUS, [], 'garage'), false, 'the roller door is solid - without it the player stands in the opening');
  assert.equal(isWalkable(new THREE.Vector3(0, 0, 9), PLAYER_RADIUS, [], 'garage'), false, 'and there is nothing outside it');

  // The garage is genuinely separate from the house - none of its geometry is
  // in the home zone, so entering it loads a different space.
  const garageSolids = WORLD_SOLIDS.filter((solid) => solid.zone === 'garage');
  assert.ok(garageSolids.length >= 8, 'the garage has real walls and fixtures');
  assert.equal(
    garageSolids.some((solid) => solid.id.startsWith('home-')),
    false,
    'and it shares no geometry with the home interior',
  );
}

{
  // Bays are read from what the player owns. No second inventory.
  assert.deepEqual(garageBays([]), [null, null, null, null], 'an empty garage shows empty bays');
  const oneRide = garageBays(['tricycle', 'dog']);
  assert.equal(oneRide[0]?.id, 'tricycle', 'an owned ride is parked');
  assert.equal(oneRide[1], null, 'and the rest stay empty');
  assert.equal(oneRide.filter(Boolean).length, 1, 'a dog is not a vehicle');
  // The ownership summary agrees with the garage, because both read the same
  // list rather than keeping one each.
  const summary = ownershipSummary({
    ownedStarterHome: true, homeVoucher: false, cribTier: 0, laneItems: ['tricycle'],
    dripOwned: [], dripEquipped: {}, fishingRods: [], tokens: 0, gems: 0, rascalBucks: 0,
  });
  const ridesCategory = summary.find((category) => category.id === 'rides')!;
  assert.equal(ridesCategory.entries.length, 1);
  assert.equal(ridesCategory.entries[0].detail, 'In the garage', 'an owned ride is shown as stored in the garage');
  assert.ok(ridesCategory.emptyLabel.toLowerCase().includes('garage'), 'and an empty one points at the garage too');

  const both = garageBays(['tricycle', 'mini-ride-on', 'crib']);
  assert.equal(both.filter(Boolean).length, 2, 'both rides park, and furniture does not');
  assert.equal(both.length, GARAGE_BAYS.length, 'there is one entry per authored bay');
}

{
  // Travel in and out. The garage is entered from Stony Brook and returns you
  // to the driveway, not to the middle of the lane.
  useGameStore.getState().resetGame();
  useGameStore.setState({ zone: 'storybook', zoneTransitioning: false });
  assert.equal(useGameStore.getState().enterGarage(), true, 'the garage can be entered from the lane');
  useGameStore.getState().completeZoneTransition();
  assert.equal(useGameStore.getState().zone, 'garage');
  assert.deepEqual(useGameStore.getState().playerPosition, GARAGE_SPAWN, 'and you spawn inside the door');

  assert.equal(useGameStore.getState().leaveGarage(), true);
  useGameStore.getState().completeZoneTransition();
  assert.equal(useGameStore.getState().zone, 'storybook');
  assert.deepEqual(
    useGameStore.getState().playerPosition,
    GARAGE_DOOR_RETURN,
    'and you come out onto the driveway you went in from',
  );

  // The driveway approach and the exit both sit where the player can reach.
  assert.equal(
    isWalkable(new THREE.Vector3(...GARAGE_DOOR_APPROACH), PLAYER_RADIUS, [], 'storybook'),
    true,
    'the garage door can be walked up to from the driveway',
  );
  assert.equal(
    isWalkable(new THREE.Vector3(GARAGE_EXIT_POINT[0], 0, GARAGE_EXIT_POINT[2] - 0.6), PLAYER_RADIUS, [], 'garage'),
    true,
    'and the exit can be reached from inside',
  );

  // The garage is not enterable from anywhere else.
  useGameStore.setState({ zone: 'hub', zoneTransitioning: false });
  assert.equal(useGameStore.getState().enterGarage(), false, 'you cannot step into the garage from the daycare');
}

/* ------------------------------ after hours ------------------------------ */

{
  assert.equal(AFTER_HOURS_START_MINUTE, 17 * 60 + 30, 'after-hours opens at 5:30 PM');
  assert.equal(AFTER_HOURS_END_MINUTE, 19 * 60 + 45, 'and runs to 7:45 PM');
  assert.equal(AFTER_HOURS_END_MINUTE, STORYBOOK_CLOSE_MINUTE, 'closing and after-hours are the same moment');
  assert.equal(isAfterHours(17 * 60 + 29), false);
  assert.equal(isAfterHours(17 * 60 + 30), true);
  assert.equal(isAfterHours(19 * 60 + 44), true, '7:44 PM is still free play');
  assert.equal(isAfterHours(19 * 60 + 45), false, 'and 7:45 PM is not');
  assert.equal(isAfterHours(Number.NaN), false, 'a broken clock is not after-hours');
}

{
  // No teacher follows a child into Stony Brook. This is asserted against the
  // retrieval evaluator itself, during a mandatory block, so the rule holds
  // even if a mandatory block is ever scheduled into the evening.
  // The first call only observes the block; a retrieval can start once the
  // detection grace has elapsed, so the second call is the one that matters.
  const past = SCHEDULE_DETECTION_GRACE_SECONDS + 10;
  for (const zone of ['storybook', 'home'] as const) {
    resetEscapeRetrieval();
    evaluateScheduleRetrieval(1000, 'nap', zone, [0, 0, 0]);
    const after = evaluateScheduleRetrieval(1000 + past, 'nap', zone, [0, 0, 0]);
    assert.equal(after.phase, 'idle', `no retrieval starts in ${zone}, even mid-nap`);
  }

  // And the same call in the daycare does start one, so the assertion above
  // is about the zone rather than about the evaluator refusing everything.
  resetEscapeRetrieval();
  evaluateScheduleRetrieval(1000, 'nap', 'hub', [15, 0, 15]);
  const inTheHub = evaluateScheduleRetrieval(1000 + past, 'nap', 'hub', [15, 0, 15]);
  assert.notEqual(inTheHub.phase, 'idle', 'a teacher does come for you inside the daycare');
}

{
  // The cast is out, spread across the lane, and some of them are on wheels.
  assert.equal(storybookPlayCastResolves(), true, 'every play loop names a real child');
  assert.ok(STORYBOOK_PLAY_LOOPS.length >= 8, 'most of the cast comes out to play, not two of them');
  assert.ok(STORYBOOK_RIDERS.length >= 3, 'and some of them are on trikes or ride-ons');

  const spots = STORYBOOK_PLAY_LOOPS.flatMap((loop) => loop.spots.map((spot) => ({ loop: loop.name, spot })));
  for (const { loop, spot } of spots) {
    assert.equal(
      isWalkable(new THREE.Vector3(spot[0], 0, spot[2]), PLAYER_RADIUS, [], 'storybook'),
      true,
      `${loop} plays somewhere they can actually stand (${spot.join(',')})`,
    );
  }
  // Nobody stacks: every authored spot is more than a body's width from every
  // other, which is what stops the whole cast piling onto one anchor.
  for (let a = 0; a < spots.length; a += 1) {
    for (let b = a + 1; b < spots.length; b += 1) {
      const distance = Math.hypot(spots[a].spot[0] - spots[b].spot[0], spots[a].spot[2] - spots[b].spot[2]);
      assert.ok(
        distance >= 1.4,
        `${spots[a].loop} and ${spots[b].loop} would stand ${distance.toFixed(2)} m apart`,
      );
    }
  }

  // A loop cycles rather than ending, so nobody stops moving at dusk.
  const loop = STORYBOOK_PLAY_LOOPS[0];
  assert.deepEqual(storybookPlayTarget(loop, 0), loop.spots[0]);
  assert.deepEqual(
    storybookPlayTarget(loop, loop.legSeconds * loop.spots.length),
    loop.spots[0],
    'the loop returns to its first spot rather than running out',
  );
  assert.notDeepEqual(
    storybookPlayTarget(loop, loop.legSeconds * 1.5),
    loop.spots[0],
    'and it actually moves between spots',
  );
}

console.log('addendum v5 checks passed');
