import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  QUEST_DEFINITIONS,
  activateQuest,
  advanceObjective,
  createInitialQuests,
  normalizeQuestStates,
  roundWasCompleted,
  type QuestStates,
} from './quests';
import {
  assertEveryActionableEntryGuidesThePlayer,
  buildQuestBoard,
  primaryObjective,
  type BoardEntry,
} from './questBoard';
import { createInitialProgression, type ProgressionState } from './progression';
import { createInitialCaper, createInitialRivalStory } from './storyProgression';
import {
  PLAYER_RADIUS,
  STEP_OVER_HEIGHT,
  TRICYCLE_RADIUS,
  WORLD_PORTALS,
  WORLD_SOLIDS,
  blocksPlayer,
  isWalkable,
  resolveMovement,
} from './world';
import { buildMapView, clampPan, clampZoom, visibleViewBox } from './worldMap';
import { isDaycareHours, lightingMinute, skyAtMinute, skyFor } from './timeOfDay';
import {
  ACTIVE_WEATHER,
  RAIN_BUDGET,
  WEATHER_BLEND_MINUTES,
  WEATHER_TURN_MINUTE,
  forecastFor,
  isWet,
  normalizeWeatherSeed,
  secondForecastFor,
  weatherAt,
  type WeatherKind,
} from './weather';
import { OPTIONAL_BOOST_DURATION_MS, normalizePersistedGameState, serializeGameState, useGameStore } from './store';
import { getOptionalRewardMultiplier } from './storyProgression';
import {
  DRIP_CATALOG,
  achievementsEarned,
  canPurchase,
  equippedAppearance,
  isPurchasable,
  normalizeDripEquipped,
  normalizeDripOwned,
  repTierName,
  type AchievementEvidence,
  type DripAchievement,
} from './drip';
import { AREA_GATES, evaluateAllAreaAccess } from './areaAccess';
import { MAX_REPUTATION } from './progression';
import {
  GLOBAL_SOCIAL_FLOOR,
  commitSocialAction,
  currentApproacher,
  decideSocialAction,
  releaseApproach,
  resetNpcSocialState,
  type SocialContext,
} from './npcSocial';
import {
  MAX_RIDE_SECONDS,
  RIDEABLES,
  advanceRide,
  claimantOf,
  isRiding,
  resetRideables,
  rideableSnapshot,
  tryClaimRideable,
} from './rideables';

const vec = (x: number, z: number) => new THREE.Vector3(x, 0, z);
const solid = (id: string) => {
  const found = WORLD_SOLIDS.find((entry) => entry.id === id);
  assert.ok(found, `expected a world solid named ${id}`);
  return found;
};

/* ========================================================================== */
/* Quest state machine                                                        */
/* ========================================================================== */

function runFullTidyRound(states: QuestStates): QuestStates {
  const order = [
    'collect-blue-block', 'place-blue-block',
    'collect-red-block', 'place-red-block',
    'collect-yellow-block', 'place-yellow-block',
  ];
  let current = states;
  for (const objective of order) {
    current = advanceObjective(current, 'rainbow-tidy-up', objective);
  }
  return current;
}

{
  // A repeatable finishing a round must land back at the start of a fresh one,
  // never at 'complete'. 'complete' used to be persistable and terminal:
  // activateQuest refused it and the only reset lived inside a store action that
  // itself required a live objective, so the quest, Storybook Lane and Mae's
  // chapter three all died with it.
  let states = activateQuest(createInitialQuests(), 'rainbow-tidy-up');
  assert.equal(states['rainbow-tidy-up'].status, 'active');

  const before = states;
  states = runFullTidyRound(states);

  assert.equal(states['rainbow-tidy-up'].status, 'active', 'a finished round reopens immediately');
  assert.equal(states['rainbow-tidy-up'].currentObjectiveId, 'collect-blue-block');
  assert.equal(states['rainbow-tidy-up'].completionCount, 1);
  assert.ok(roundWasCompleted(before, states, 'rainbow-tidy-up'), 'the round is detectable by the counter');
  assert.ok(!roundWasCompleted(states, states, 'rainbow-tidy-up'), 'no false positive without a change');

  // Second round still counts.
  const second = runFullTidyRound(states);
  assert.equal(second['rainbow-tidy-up'].completionCount, 2);
}

{
  // The soft-lock, reproduced from the save side: a persisted repeatable marked
  // complete used to be unrecoverable. It must normalize into a fresh round with
  // its lifetime count intact.
  const poisoned = normalizeQuestStates({
    'where-binky': { status: 'complete', currentObjectiveId: null, objectiveStates: {
      'talk-to-leo': 'complete', 'ask-mia': 'complete', 'trade-with-sam': 'complete',
      'search-storage': 'complete', 'return-binky': 'complete',
    }, completionCount: 1 },
    'rainbow-tidy-up': { status: 'complete', currentObjectiveId: null, objectiveStates: {
      'collect-blue-block': 'complete', 'place-blue-block': 'complete',
      'collect-red-block': 'complete', 'place-red-block': 'complete',
      'collect-yellow-block': 'complete', 'place-yellow-block': 'complete',
    }, completionCount: 7 },
  });

  assert.equal(poisoned['rainbow-tidy-up'].status, 'active', 'a repeatable never rests at complete');
  assert.equal(poisoned['rainbow-tidy-up'].currentObjectiveId, 'collect-blue-block');
  assert.equal(poisoned['rainbow-tidy-up'].completionCount, 7, 'lifetime rounds survive the repair');
  assert.equal(poisoned['where-binky'].status, 'complete', 'a one-time quest still completes for good');

  // And it is playable again rather than merely non-crashing.
  const recovered = runFullTidyRound(poisoned);
  assert.equal(recovered['rainbow-tidy-up'].completionCount, 8);
}

{
  // activateQuest on a completed repeatable reopens it; on a completed one-time
  // quest it does nothing.
  const states = normalizeQuestStates({});
  const done = advanceObjective(
    advanceObjective(
      advanceObjective(
        advanceObjective(
          advanceObjective(states, 'where-binky', 'talk-to-leo'),
          'where-binky', 'ask-mia'),
        'where-binky', 'trade-with-sam'),
      'where-binky', 'search-storage'),
    'where-binky', 'return-binky');
  assert.equal(done['where-binky'].status, 'complete');
  assert.equal(activateQuest(done, 'where-binky')['where-binky'].status, 'complete', 'story quests stay finished');
}

{
  // Every quest declares which bucket it belongs to. Without this the Journal
  // cannot separate Story from grind, which is the confusion being fixed.
  for (const definition of QUEST_DEFINITIONS) {
    assert.ok(definition.kind === 'story' || definition.kind === 'activity', `${definition.id} declares a kind`);
    if (definition.repeatable) {
      assert.equal(definition.kind, 'activity', 'a repeatable is never Story content');
    }
  }
  assert.equal(QUEST_DEFINITIONS.find((d) => d.id === 'rainbow-tidy-up')?.kind, 'activity');
  assert.equal(QUEST_DEFINITIONS.find((d) => d.id === 'where-binky')?.kind, 'story');
}

/* ========================================================================== */
/* The board                                                                  */
/* ========================================================================== */

function boardFor(overrides: {
  quests?: QuestStates;
  progression?: Partial<ProgressionState>;
  schedule?: string;
  juiceStock?: number;
  crackerStock?: number;
} = {}): BoardEntry[] {
  return buildQuestBoard({
    quests: overrides.quests ?? createInitialQuests(),
    caper: createInitialCaper(),
    rivalStory: createInitialRivalStory(),
    progression: { ...createInitialProgression(), ...overrides.progression },
    juiceStock: overrides.juiceStock ?? 5,
    crackerStock: overrides.crackerStock ?? 5,
    juiceClubCash: 8,
    juiceClubCustomersServed: 3,
    schedule: overrides.schedule ?? 'morning-play',
  });
}

const find = (entries: BoardEntry[], id: string) => {
  const entry = entries.find((candidate) => candidate.id === id);
  assert.ok(entry, `expected a board entry for ${id}`);
  return entry;
};

{
  // The invariant that was actually broken: nothing actionable may leave the
  // player without a next step, and nothing blocked may leave them without a
  // reason. "Sticker Parade Caper - idle" violated both at once.
  assertEveryActionableEntryGuidesThePlayer(boardFor());
  assertEveryActionableEntryGuidesThePlayer(boardFor({ progression: { trustedHelperPass: true, reputation: 12 } }));
  assertEveryActionableEntryGuidesThePlayer(boardFor({ schedule: 'juice-club' }));
  assertEveryActionableEntryGuidesThePlayer(boardFor({ schedule: 'juice-club', juiceStock: 0, crackerStock: 0 }));
}

{
  // A fresh save: Binky is the main thread, Tidy-Up is gated by it and says so,
  // and the caper explains the pass rather than printing "idle".
  const board = boardFor();

  const binky = find(board, 'where-binky');
  assert.equal(binky.status, 'active');
  assert.equal(binky.section, 'story');
  assert.ok(binky.nextAction?.includes('Talk to Leo'));

  const tidy = find(board, 'rainbow-tidy-up');
  assert.equal(tidy.status, 'story-required', 'a locked activity names the Story blocking it');
  assert.equal(tidy.section, 'activities', 'it is never filed under Story');
  assert.ok(tidy.requirement?.includes('Binky'));

  const caper = find(board, 'sticker-parade-caper');
  assert.equal(caper.status, 'story-required');
  assert.ok(caper.requirement?.includes('Trusted Helper Pass'), 'the caper explains its prerequisite');
  assert.ok(!/idle/i.test(caper.requirement ?? ''), 'no raw enum reaches the player');

  assert.equal(primaryObjective(board)?.id, 'where-binky');
}

{
  // Binky complete: it moves to Completed and states what it opened, rather than
  // being a dead "complete" badge. The caper becomes reachable and says so.
  let quests = createInitialQuests();
  for (const objective of ['talk-to-leo', 'ask-mia', 'trade-with-sam', 'search-storage', 'return-binky']) {
    quests = advanceObjective(quests, 'where-binky', objective);
  }
  quests = activateQuest(quests, 'rainbow-tidy-up');

  const board = boardFor({ quests, progression: { trustedHelperPass: true } });
  const binky = find(board, 'where-binky');
  assert.equal(binky.status, 'complete');
  assert.equal(binky.section, 'completed');
  assert.ok(binky.nextAction?.includes('Rainbow Tidy-Up'), 'a finished quest names what it unlocked');

  const caper = find(board, 'sticker-parade-caper');
  assert.equal(caper.status, 'available');
  assert.ok(caper.nextAction?.includes('board'), 'it says where to go');

  // The main thread moves on rather than pointing back at the finished quest.
  assert.notEqual(primaryObjective(board)?.id, 'where-binky');
}

{
  // Rainbow Tidy-Up must show CURRENT-ROUND progress and label its lifetime
  // total as a lifetime total. The old badge appended "· 7 done" to the status,
  // which read as progress toward finishing a main quest that never finished.
  let quests = activateQuest(createInitialQuests(), 'rainbow-tidy-up');
  quests = runFullTidyRound(quests);
  quests = runFullTidyRound(quests);
  quests = advanceObjective(quests, 'rainbow-tidy-up', 'collect-blue-block');

  const tidy = find(boardFor({ quests }), 'rainbow-tidy-up');
  assert.equal(tidy.status, 'active');
  assert.equal(tidy.section, 'activities');
  assert.deepEqual(
    tidy.roundProgress,
    { done: 1, total: 6, label: '1/6 this round' },
    'progress is per round, not lifetime',
  );
  assert.equal(tidy.lifetime, '2 rounds completed');

  // At the very start of a fresh round it reads as Repeatable, not Active,
  // so it cannot be mistaken for the outstanding main objective.
  let fresh = activateQuest(createInitialQuests(), 'rainbow-tidy-up');
  fresh = runFullTidyRound(fresh);
  const idle = find(boardFor({ quests: fresh }), 'rainbow-tidy-up');
  assert.equal(idle.status, 'repeatable');
  assert.equal(idle.roundProgress?.done, 0);
  assert.equal(idle.lifetime, '1 round completed');
}

{
  // Preview regression: exercise the same store action the station uses. The
  // older test above only advanced a detached QuestStates value, so it could
  // pass while the mounted Journal remained wired to stale store state.
  let quests = activateQuest(createInitialQuests(), 'rainbow-tidy-up');
  quests = advanceObjective(quests, 'rainbow-tidy-up', 'collect-blue-block');
  useGameStore.setState({ quests, inventory: ['blue-block'] });

  assert.equal(useGameStore.getState().completeTidyToy('blue-block'), true);
  const live = find(boardFor({ quests: useGameStore.getState().quests }), 'rainbow-tidy-up');
  assert.deepEqual(live.roundProgress, { done: 2, total: 6, label: '2/6 this round' });
  assert.equal(live.lifetime, undefined, 'current progress is not confused with lifetime rounds');
  useGameStore.getState().resetGame();
}

{
  // Meaningful instructions are newest-first, deduplicated, capped at three,
  // and persisted after their five-second on-screen notice is dismissed.
  const store = useGameStore.getState();
  store.resetGame();
  assert.equal(store.showInstruction({ id: 'one', text: 'First direction', shownAt: 1 }), true);
  assert.equal(useGameStore.getState().showInstruction({ id: 'one', text: 'Repeated noise', shownAt: 2 }), false);
  useGameStore.getState().dismissInstruction();
  useGameStore.getState().showInstruction({ id: 'two', text: 'Second direction', shownAt: 2 });
  useGameStore.getState().showInstruction({ id: 'three', text: 'Third direction', shownAt: 3 });
  useGameStore.getState().showInstruction({ id: 'four', text: 'Newest direction', shownAt: 4 });
  assert.deepEqual(
    useGameStore.getState().recentInstructions.map((entry) => entry.id),
    ['four', 'three', 'two'],
  );
  const saved = serializeGameState(useGameStore.getState());
  assert.deepEqual(
    normalizePersistedGameState(saved).recentInstructions.map((entry) => entry.id),
    ['four', 'three', 'two'],
  );
  useGameStore.getState().resetGame();
}

{
  // The Juice Club has opening hours; that is a cooldown with a stated time, not
  // a lock, and never a silent blank.
  const closed = find(boardFor({ schedule: 'morning-play' }), 'juice-club');
  assert.equal(closed.status, 'cooldown');
  assert.ok(closed.requirement?.includes('12:00'));

  const open = find(boardFor({ schedule: 'juice-club' }), 'juice-club');
  assert.equal(open.status, 'active');
  assert.ok(open.nextAction?.includes('Serve'));

  const empty = find(boardFor({ schedule: 'juice-club', juiceStock: 0, crackerStock: 0 }), 'juice-club');
  assert.equal(empty.status, 'cooldown');
  assert.ok(empty.nextAction?.includes('Restock'), 'an out-of-stock club tells you how to fix it');
}

/* ========================================================================== */
/* Collision and walkability                                                  */
/* ========================================================================== */

{
  // The reported bug: a flat thing that blocks. The sandbox is a 4 x 4 m pad
  // 6 cm tall; it used to sever the playground.
  const sandbox = solid('sandbox');
  assert.ok((sandbox.maxY ?? 1.5) <= STEP_OVER_HEIGHT, 'the sandbox is authored at its real height');
  assert.equal(blocksPlayer(sandbox), false, 'a 6 cm sand pad is walked over');
  assert.ok(isWalkable(vec(12, 5), PLAYER_RADIUS), 'the middle of the sandbox is walkable');
  assert.ok(isWalkable(vec(12, 5), TRICYCLE_RADIUS), 'and on the tricycle too');

  // Crossing the playground north to south no longer requires threading a lane.
  const crossed = resolveMovement(vec(12, 1), vec(12, 9), PLAYER_RADIUS, 0.38);
  assert.ok(crossed.z > 8.5, `expected to cross the sandbox, stopped at z=${crossed.z.toFixed(2)}`);
  assert.ok(Math.abs(crossed.x - 12) < 0.2, 'and without being shoved sideways');
}

{
  // Flat does not mean walkable everywhere: water still stops you, and says so
  // explicitly rather than by claiming to be 1.5 m tall.
  const pond = solid('garden-pond');
  assert.equal(pond.blocksWhenFlat, true);
  assert.equal(blocksPlayer(pond), true);
  assert.ok(!isWalkable(vec(10, -0.2), PLAYER_RADIUS, [], 'garden'), 'the pond centre is not walkable');
}

{
  // The tidy station sat on the classroom rug as a 1.3 m square around a 1.24 m
  // barrel, so the player met an invisible corner while standing on a rug.
  const station = solid('rainbow-tidy-up');
  assert.equal(station.shape, 'circle');
  assert.ok((station.radius ?? 0) <= 0.65, 'the collider matches the visible bin');
  // A point on the rug just off the bin's diagonal is now reachable; it used to
  // be inside the square's corner.
  assert.ok(isWalkable(vec(0.95, -4.95), PLAYER_RADIUS), 'the rug beside the station is walkable');
}

{
  // Every blocking solid must have geometry that explains it. The two seams at
  // z = +/-8 had a 4 m doorway cut into an 8 m span of continuously rendered
  // floor with no wall on either side: 4.85 m of hard stop, twice, invisible.
  const seamWalls = ['art-divider-west', 'art-divider-east', 'storage-divider-west', 'storage-divider-east'];
  for (const id of seamWalls) {
    const wall = solid(id);
    assert.equal(wall.kind, 'wall', `${id} renders as a wall`);
    assert.equal(blocksPlayer(wall), true);
  }

  // The doorways themselves still work, at both radii, in both directions.
  for (const portal of WORLD_PORTALS) {
    for (const radius of [PLAYER_RADIUS, TRICYCLE_RADIUS]) {
      const [px, , pz] = portal.position;
      const from = portal.axis === 'x' ? vec(px - 1.4, pz) : vec(px, pz - 1.4);
      const to = portal.axis === 'x' ? vec(px + 1.4, pz) : vec(px, pz + 1.4);
      let position = from.clone();
      for (let frame = 0; frame < 120; frame += 1) {
        const step = to.clone().sub(position);
        if (step.length() < 0.05) break;
        step.clampLength(0, 0.3);
        position = resolveMovement(position, position.clone().add(step), radius, 0.38);
      }
      assert.ok(
        position.distanceTo(to) < 0.35,
        `${portal.id} is passable at radius ${radius} (stopped ${position.distanceTo(to).toFixed(2)} short)`,
      );
    }
  }
}

{
  // Anti-tunnelling and sliding are protected behaviour and must survive the
  // height-aware change: a tall divider still stops a long single-frame step.
  const rushed = resolveMovement(vec(7.1, 4), vec(12, 4), PLAYER_RADIUS, 0.38);
  assert.ok(rushed.x < 7.4, 'a visible divider cannot be tunnelled in one call');

  const slid = resolveMovement(vec(7.1, 4), vec(9, 2.6), PLAYER_RADIUS, 0.38);
  assert.ok(slid.x < 7.4, 'the wall still blocks');
  assert.ok(slid.z < 4, 'and the player still slides along it');
}

{
  // A blanket guard so the next flat prop cannot reintroduce the bug: anything
  // authored below step height must either be walkable or say why not.
  for (const entry of WORLD_SOLIDS) {
    const top = entry.maxY ?? 1.5;
    if (top <= STEP_OVER_HEIGHT && entry.collision !== false) {
      assert.ok(
        entry.blocksWhenFlat === true || !blocksPlayer(entry),
        `${entry.id} is ${top}m tall and blocks the player without declaring blocksWhenFlat`,
      );
    }
  }
}

/* ========================================================================== */
/* Map                                                                        */
/* ========================================================================== */

{
  const view = buildMapView({
    zone: 'hub',
    progression: createInitialProgression(),
    playerX: 2,
    playerZ: 3,
  });

  // The old map drew three rooms at invented percentages and omitted the two
  // largest. This one is a projection of the world.
  const roomIds = view.rooms.map((room) => room.id).sort();
  assert.deepEqual(roomIds, ['art-room', 'classroom', 'hallway', 'playground', 'storage']);
  assert.ok(view.rooms.every((room) => room.label && room.label !== room.id), 'rooms are named for players');

  assert.equal(view.doors.length, WORLD_PORTALS.length, 'every doorway is drawn');
  assert.ok(view.walls.length > 0, 'walls come from the collision data');

  const player = view.pins.find((pin) => pin.kind === 'player');
  assert.ok(player, 'the map says where you are');
  assert.equal(player?.x, 2);

  // Storage shelves are where Binky hides. Naming them on the map would remove
  // the only search in the game.
  assert.ok(!view.pins.some((pin) => pin.id === 'storage-shelves'), 'secrets stay off the map');

  // Locked routes are shown, with what they need - not hidden, not unexplained.
  const locked = view.pins.find((pin) => pin.kind === 'route-locked');
  assert.ok(locked, 'future districts are visible');
  assert.ok(locked?.detail, 'and state their requirement');

  // The viewBox covers the whole hub.
  assert.ok(view.viewBox.minX <= -15.7 && view.viewBox.width >= 31, 'the whole hub fits');
}

{
  const view = buildMapView({ zone: 'garden', progression: createInitialProgression(), playerX: 0, playerZ: 14 });
  assert.deepEqual(view.rooms.map((room) => room.id), ['garden']);
  assert.equal(view.zoneLabel, 'Garden District');
}

{
  // Pan and zoom stay over the map whatever the input.
  assert.equal(clampZoom(0.1), 1);
  assert.equal(clampZoom(99), 4);
  assert.equal(clampZoom(Number.NaN), 1);
  assert.equal(clampPan(1000, 32, 1), 0, 'at 1x there is nothing to pan');
  assert.ok(Math.abs(clampPan(1000, 32, 2)) <= 8);
  assert.equal(clampPan(Number.NaN, 32, 2), 0);

  const view = buildMapView({ zone: 'hub', progression: createInitialProgression(), playerX: 0, playerZ: 0 });
  const zoomed = visibleViewBox(view, 2, 0, 0);
  assert.ok(Math.abs(zoomed.width - view.viewBox.width / 2) < 0.001, 'zooming halves the visible span');
}


/* ========================================================================== */
/* Time of day + weather                                                      */
/* ========================================================================== */

{
  // The day must actually look different across itself. Before this the sun was
  // the literal vector [10, 20, 10] all day, so 9am and 5pm were identical.
  const morning = skyAtMinute(9 * 60);
  const noon = skyAtMinute(12 * 60);
  const golden = skyAtMinute(17 * 60);

  assert.ok(noon.sunPosition[1] > morning.sunPosition[1], 'the sun climbs toward noon');
  assert.ok(noon.sunPosition[1] > golden.sunPosition[1], 'and falls toward the evening');
  assert.ok(morning.sunPosition[0] < 0 && golden.sunPosition[0] > 0, 'it crosses east to west');
  assert.ok(golden.rayleigh > noon.rayleigh, 'the golden hour scatters more than midday');
  assert.notEqual(morning.sunColor, golden.sunColor, 'and is a different colour');
  assert.ok(noon.sunIntensity > golden.sunIntensity, 'midday is the brightest');

  // Continuity: no visible jump between adjacent minutes anywhere in the day.
  for (let minute = 5 * 60; minute < 23 * 60; minute += 7) {
    const a = skyAtMinute(minute);
    const b = skyAtMinute(minute + 7);
    assert.ok(
      Math.abs(a.sunIntensity - b.sunIntensity) < 0.2,
      `sun intensity jumps at minute ${minute}`,
    );
    assert.ok(
      Math.abs(a.sunPosition[1] - b.sunPosition[1]) < 2.2,
      `sun elevation jumps at minute ${minute}`,
    );
  }

  // Night exists for Story sequences, but the ordinary day never reaches it.
  assert.ok(skyAtMinute(22 * 60).sunPosition[1] < 0, 'night is authored');
  assert.ok(isDaycareHours(10 * 60));
  assert.ok(!isDaycareHours(22 * 60));

  // Lighting is rebuilt on a coarse quantum, not on every 250 ms clock tick.
  assert.equal(lightingMinute(540), 540);
  assert.equal(lightingMinute(541), 542, 'ties round up, as Math.round does');
  assert.equal(lightingMinute(543), 544);
  for (let minute = 540; minute < 1050; minute += 1) {
    const quantised = lightingMinute(minute);
    assert.equal(quantised % 2, 0, 'every quantised minute lands on the grid');
    assert.ok(Math.abs(quantised - minute) <= 1, 'and never drifts more than half a step');
  }
}

{
  // Indoor readability is a hard floor: weather may not darken the room past
  // the point where the player can see what they are doing.
  for (let minute = 9 * 60; minute <= 17 * 60 + 30; minute += 15) {
    for (const kind of ['clear', 'cloudy', 'rain', 'heavy-rain', 'storm'] as WeatherKind[]) {
      const sky = skyFor(minute, kind);
      assert.ok(sky.ambientIntensity >= 0.42, `${kind} at ${minute} keeps the room readable`);
    }
  }

  // Rain is visibly duller than clear at the same moment, without becoming a
  // different time of day.
  const clear = skyFor(12 * 60, 'clear');
  const rain = skyFor(12 * 60, 'rain');
  assert.ok(rain.sunIntensity < clear.sunIntensity, 'rain damps the key light');
  assert.ok(rain.fog !== null && clear.fog === null, 'rain brings its own fog');
  assert.ok(rain.windowIntensity > clear.windowIntensity, 'and the indoor fill picks up the slack');
  assert.deepEqual(rain.sunPosition, clear.sunPosition, 'weather never moves the sun');
}

{
  // Determinism is the property that keeps weather from breaking quests: the
  // same save must see the same weather on the same day, every time.
  for (let day = 1; day <= 40; day += 1) {
    const first = forecastFor(day, 1234);
    for (let repeat = 0; repeat < 5; repeat += 1) {
      assert.equal(forecastFor(day, 1234), first, `day ${day} forecasts the same every call`);
    }
  }
  assert.notEqual(
    Array.from({ length: 20 }, (_, index) => forecastFor(index + 1, 1)).join(),
    Array.from({ length: 20 }, (_, index) => forecastFor(index + 1, 2)).join(),
    'different seeds give different weeks',
  );

  // Only the shipped states can occur; the future ones are authored but inert.
  for (let day = 1; day <= 200; day += 1) {
    assert.ok(ACTIVE_WEATHER.includes(forecastFor(day, 99)), 'no unshipped weather is forecast');
    assert.ok(ACTIVE_WEATHER.includes(secondForecastFor(day, 99)), 'including after a turn');
  }

  // Most days are playable outdoors. A daycare that rained half the time would
  // spend half its playtime inside.
  const sample = Array.from({ length: 400 }, (_, index) => forecastFor(index + 1, 7));
  const wetDays = sample.filter((kind) => isWet(kind)).length;
  assert.ok(wetDays / sample.length < 0.32, `too many wet days: ${wetDays}/${sample.length}`);
  assert.ok(wetDays > 0, 'and it does rain sometimes');
}

{
  // A weather change blends rather than popping, and the blend is derived from
  // the clock so pause, fast-forward and reload all agree.
  let turningDay = -1;
  for (let day = 1; day <= 200; day += 1) {
    if (forecastFor(day, 42) !== secondForecastFor(day, 42)) { turningDay = day; break; }
  }
  assert.ok(turningDay > 0, 'some day turns');

  const before = weatherAt(turningDay, WEATHER_TURN_MINUTE - 30, 42);
  assert.equal(before.blend, 1, 'settled before the turn');
  const during = weatherAt(turningDay, WEATHER_TURN_MINUTE + WEATHER_BLEND_MINUTES / 2, 42);
  assert.ok(during.blend > 0 && during.blend < 1, 'mid-change is a blend');
  const after = weatherAt(turningDay, WEATHER_TURN_MINUTE + WEATHER_BLEND_MINUTES + 5, 42);
  assert.equal(after.blend, 1, 'settled after');
  assert.equal(after.weather, secondForecastFor(turningDay, 42));

  // Same inputs, same answer - no accumulated state to drift.
  assert.deepEqual(weatherAt(turningDay, WEATHER_TURN_MINUTE + 10, 42), weatherAt(turningDay, WEATHER_TURN_MINUTE + 10, 42));

  // The manual HUD toggle still wins, because it is how outdoor behaviour gets
  // tested on demand.
  assert.equal(weatherAt(3, 10 * 60, 42, 'rain').weather, 'rain');
}

{
  // Rain must cost nothing when the quality manager says no particles, and must
  // scale rather than being all-or-nothing.
  assert.equal(RAIN_BUDGET.clear, 0);
  assert.equal(RAIN_BUDGET.cloudy, 0, 'cloudy draws no precipitation');
  assert.ok(RAIN_BUDGET.rain > 0);
  assert.ok(RAIN_BUDGET.storm > RAIN_BUDGET['heavy-rain']);
  assert.ok(RAIN_BUDGET['heavy-rain'] > RAIN_BUDGET.rain);

  // A hostile save cannot break the forecast.
  assert.equal(normalizeWeatherSeed('nonsense'), 0x5eed);
  assert.equal(normalizeWeatherSeed(Number.NaN), 0x5eed);
  assert.equal(normalizeWeatherSeed(-12.7), 12);
}


/* ========================================================================== */
/* Boost + Rainbow tutorial                                                   */
/* ========================================================================== */

{
  // 45 seconds, and still unstackable and unexploitable.
  assert.equal(OPTIONAL_BOOST_DURATION_MS, 45_000, 'the boost lasts long enough to finish a round');

  const store = useGameStore.getState();
  store.resetGame();

  const start = Date.now();
  assert.equal(useGameStore.getState().activateOptionalRewardBoost(start), true, 'the boost starts');
  assert.equal(
    useGameStore.getState().optionalRewardBoostUntil,
    start + OPTIONAL_BOOST_DURATION_MS,
    'the deadline is exactly the authored duration',
  );

  // Re-triggering while live is refused, so the multiplier cannot compound and
  // the timer cannot be extended by mashing the button.
  assert.equal(useGameStore.getState().activateOptionalRewardBoost(start + 1_000), false);
  assert.equal(useGameStore.getState().activateOptionalRewardBoost(start + 44_000), false);
  assert.equal(
    useGameStore.getState().optionalRewardBoostUntil,
    start + OPTIONAL_BOOST_DURATION_MS,
    'a refused re-trigger does not extend the deadline',
  );

  // The multiplier is a constant, not a product: no amount of activation stacks.
  assert.equal(getOptionalRewardMultiplier(start + OPTIONAL_BOOST_DURATION_MS, start + 1_000), 2);
  assert.equal(getOptionalRewardMultiplier(start + OPTIONAL_BOOST_DURATION_MS, start + 46_000), 1, 'and it expires');

  // A reload cancels rather than banks it - the field is not in the save
  // allowlist and is zeroed on load, so reloading is never an advantage.
  const serialised = serializeGameState(useGameStore.getState()) as Record<string, unknown>;
  assert.ok(!('optionalRewardBoostUntil' in serialised), 'the boost is never written to the save');
  assert.equal(
    normalizePersistedGameState({ ...serialised, optionalRewardBoostUntil: start + 10_000_000 })
      .optionalRewardBoostUntil,
    0,
    'a forged save cannot grant a boost',
  );
}

{
  // The tutorial flag must never be handed back to a player who has already
  // ground rounds - that is the difference between a fix and an insult.
  const veteran = normalizePersistedGameState({
    quests: {
      'rainbow-tidy-up': {
        status: 'active',
        currentObjectiveId: 'collect-blue-block',
        objectiveStates: {
          'collect-blue-block': 'active', 'place-blue-block': 'pending',
          'collect-red-block': 'pending', 'place-red-block': 'pending',
          'collect-yellow-block': 'pending', 'place-yellow-block': 'pending',
        },
        completionCount: 4,
      },
    },
  });
  assert.equal(veteran.tidyTutorialSeen, true, 'four completed rounds means the tutorial was seen');

  // A brand-new save still gets it exactly once.
  const beginner = normalizePersistedGameState({});
  assert.equal(beginner.tidyTutorialSeen, false, 'a new player is taught');

  // And an explicit flag survives a round trip.
  const taught = normalizePersistedGameState({ tidyTutorialSeen: true });
  assert.equal(taught.tidyTutorialSeen, true);

  useGameStore.getState().resetGame();
  assert.equal(useGameStore.getState().tidyTutorialSeen, false);
  useGameStore.getState().markTidyTutorialSeen();
  assert.equal(useGameStore.getState().tidyTutorialSeen, true);
  const saved = serializeGameState(useGameStore.getState()) as Record<string, unknown>;
  assert.equal(saved.tidyTutorialSeen, true, 'the flag persists, so it does not return next session');
}


/* ========================================================================== */
/* Living NPCs: social behaviour, ride-ons                                    */
/* ========================================================================== */

const socialContext = (overrides: Partial<SocialContext> = {}): SocialContext => ({
  name: 'Leo',
  now: 100,
  distance: 1.5,
  questActive: false,
  blocked: false,
  allowed: true,
  schedule: 'morning-play',
  friendship: 60,
  ...overrides,
});

{
  resetNpcSocialState();

  // Story always wins over ambience. A child chattering over a quest line is
  // noise, and the old rule got this right - it must survive the rewrite.
  assert.equal(decideSocialAction(socialContext({ questActive: true })).action, 'none');
  assert.equal(decideSocialAction(socialContext({ blocked: true })).action, 'none');
  assert.equal(decideSocialAction(socialContext({ allowed: false })).action, 'none', 'a Tier C child stays quiet');
  assert.equal(decideSocialAction(socialContext({ distance: 30 })).action, 'none', 'and so does a distant one');
}

{
  // THE BUG: cooldowns used to be one module-scope number shared by all eleven
  // children, so the first to greet you silenced the entire daycare. Acting on
  // one child must leave the others able to act.
  resetNpcSocialState();

  let actedFirst: string | null = null;
  for (const name of ['Leo', 'Mia', 'Sam', 'Zoe', 'Eli']) {
    const decision = decideSocialAction(socialContext({ name, now: 100 }));
    if (decision.action !== 'none') {
      commitSocialAction(name, 100, decision);
      actedFirst = name;
      break;
    }
  }
  assert.ok(actedFirst, 'somebody greets the player');

  // Past the short global floor, a DIFFERENT child is free to act. Under the
  // old shared cooldown this was impossible for twelve seconds.
  const later = 100 + GLOBAL_SOCIAL_FLOOR + 0.1;
  const others = ['Leo', 'Mia', 'Sam', 'Zoe', 'Eli', 'Noah', 'Lily'].filter((n) => n !== actedFirst);
  const someoneElseCanAct = others.some((name) => decideSocialAction(socialContext({ name, now: later })).action !== 'none');
  assert.ok(someoneElseCanAct, 'other children are not silenced by one greeting');

  // The child who just acted is quiet for a good while.
  assert.equal(
    decideSocialAction(socialContext({ name: actedFirst!, now: later })).action,
    'none',
    'but the child who spoke does not repeat immediately',
  );
}

{
  // Deterministic: the same child in the same situation behaves the same way,
  // so a report of "she keeps interrupting me" is reproducible.
  resetNpcSocialState();
  const first = decideSocialAction(socialContext({ name: 'Ruby', now: 500 }));
  resetNpcSocialState();
  const second = decideSocialAction(socialContext({ name: 'Ruby', now: 500 }));
  assert.deepEqual(first, second);
}

{
  // Only one child approaches at a time - the player is never swarmed - and an
  // approach implies something to say.
  resetNpcSocialState();
  let approacher: string | null = null;
  for (let tick = 0; tick < 4000 && !approacher; tick += 1) {
    for (const name of ['Leo', 'Mia', 'Sam', 'Zoe', 'Eli', 'Noah', 'Lily', 'Finn']) {
      const decision = decideSocialAction(socialContext({ name, now: 1000 + tick * 3, distance: 5 }));
      if (decision.action === 'approach') {
        assert.ok(decision.message, 'an approach says something');
        approacher = name;
        break;
      }
    }
  }
  assert.ok(approacher, 'children do sometimes come over');
  assert.equal(currentApproacher(1000), approacher, 'and the slot records who');

  // Nobody else may start approaching while that one is en route.
  const blocked = ['Ruby', 'Max', 'Mae'].every(
    (name) => decideSocialAction(socialContext({ name, now: 1005, distance: 5 })).action !== 'approach',
  );
  assert.ok(blocked, 'only one child approaches at a time');

  releaseApproach(approacher!);
  assert.equal(currentApproacher(1005), null, 'and the slot frees when they arrive');
}

{
  // Every reaction a decision can emit must be one the character rig can play.
  const playable = new Set(['wave', 'cheer', 'listen']);
  resetNpcSocialState();
  for (let tick = 0; tick < 600; tick += 1) {
    for (const name of ['Leo', 'Mia', 'Sam']) {
      const decision = decideSocialAction(socialContext({ name, now: tick * 4, distance: 1 + (tick % 5) }));
      if (decision.reaction) assert.ok(playable.has(decision.reaction), `${decision.reaction} is playable`);
      if (decision.action !== 'none') commitSocialAction(name, tick * 4, decision);
    }
  }
}

{
  // Ride-ons. Every authored route waypoint must be somewhere a child can
  // actually stand, so a route can never be drawn through the slide.
  for (const rideable of RIDEABLES) {
    assert.ok(
      isWalkable(vec(rideable.home[0], rideable.home[1]), 0.34),
      `${rideable.id} rests somewhere walkable`,
    );
    assert.ok(
      isWalkable(vec(rideable.approach[0], rideable.approach[1]), 0.34),
      `${rideable.id} can be mounted from its approach point`,
    );
    for (const [x, z] of rideable.route.waypoints) {
      assert.ok(isWalkable(vec(x, z), 0.34), `${rideable.id} route point ${x},${z} is walkable`);
      // A child on a trike is wider than a child. Checking only the walking
      // radius is what allowed a waypoint to sit inside the heist hub's east
      // wall once that hub was built over the old loop.
      assert.ok(
        isWalkable(vec(x, z), TRICYCLE_RADIUS),
        `${rideable.id} route point ${x},${z} fits a rider, not just a walker`,
      );
    }
  }
  assert.ok(RIDEABLES.length >= 2, 'more than one child can ride at once');
}

{
  // A rideable is claimed exclusively, and no child can hold one forever.
  resetRideables();

  const claimed = tryClaimRideable('Leo', [12.4, -1.6], 0);
  assert.ok(claimed, 'a nearby child claims a free trike');
  assert.equal(claimantOf(claimed!.rideableId), 'Leo');

  // Nobody else can take that one.
  const taken = tryClaimRideable('Mia', [12.4, -1.6], 0);
  assert.notEqual(taken?.rideableId, claimed!.rideableId, 'a claimed trike is not re-claimed');

  // Drive the machine: approach -> mount -> ride.
  let target = advanceRide('Leo', 0, false, 1.15);
  assert.equal(target?.mounted, false, 'walking over is not riding');
  advanceRide('Leo', 0.5, true, 1.15);
  target = advanceRide('Leo', 2, false, 1.15);
  assert.equal(target?.mounted, true, 'the child is on the trike');
  assert.ok((target?.speed ?? 0) > 1.15, 'and moves faster than walking pace');
  assert.ok(isRiding('Leo'));

  // Waypoints advance on arrival and loop.
  const seen = new Set<string>();
  for (let step = 0; step < 12; step += 1) {
    const next = advanceRide('Leo', 3 + step, true, 1.15);
    if (next) seen.add(next.position.join(','));
  }
  assert.ok(seen.size > 1, 'the ride follows a route rather than sitting still');

  // The hard limit fires wherever the child is, and the trike comes back.
  advanceRide('Leo', 3 + MAX_RIDE_SECONDS + 1, false, 1.15);
  advanceRide('Leo', 3 + MAX_RIDE_SECONDS + 5, false, 1.15);
  assert.equal(claimantOf(claimed!.rideableId), null, 'no child hoards a trike');
  assert.equal(isRiding('Leo'), false);

  // And they cannot immediately grab it again, so somebody else gets a turn.
  assert.equal(tryClaimRideable('Leo', [12.4, -1.6], 3 + MAX_RIDE_SECONDS + 6), null, 'a rider waits their turn');
  assert.ok(tryClaimRideable('Mia', [12.4, -1.6], 3 + MAX_RIDE_SECONDS + 6), 'somebody else may ride now');

  resetRideables();
  assert.deepEqual(rideableSnapshot(), { claimed: 0, riders: 0, total: RIDEABLES.length });
}

{
  // A child that cannot reach the trike gives it back rather than blocking it.
  resetRideables();
  const state = tryClaimRideable('Zoe', [12.4, -1.6], 0);
  assert.ok(state);
  advanceRide('Zoe', 5, false, 1.15);
  assert.equal(claimantOf(state!.rideableId), 'Zoe', 'still trying at five seconds');
  const abandoned = advanceRide('Zoe', 40, false, 1.15);
  assert.equal(abandoned, null, 'an unreachable trike is released');
  assert.equal(claimantOf(state!.rideableId), null);
  resetRideables();
}


/* ========================================================================== */
/* Drip: catalog, economy gates, anti-forgery                                 */
/* ========================================================================== */

{
  // The catalog must match the authored economy, and REP must be reachable.
  assert.equal(DRIP_CATALOG.length, 24, 'the whole Drop 01 catalog is present');
  const ids = new Set(DRIP_CATALOG.map((item) => item.id));
  assert.equal(ids.size, DRIP_CATALOG.length, 'no duplicate item ids');

  const maxRep = Math.max(...DRIP_CATALOG.map((item) => item.repRequired));
  assert.equal(maxRep, 750);
  assert.ok(
    MAX_REPUTATION >= maxRep,
    `REP ceiling ${MAX_REPUTATION} must reach the catalog's ${maxRep}; at the old cap of 100, `
    + 'three of the four authored tiers and half the catalog were unreachable at any price',
  );

  // Every category the brief names is represented.
  for (const category of ['top', 'bottom', 'shoes', 'hat', 'backpack', 'accessory', 'ride_on'] as const) {
    assert.ok(DRIP_CATALOG.some((item) => item.category === category), `${category} has items`);
  }

  // Not everything costs both. The economy rules are explicit that dual
  // requirements are reserved for stronger status items.
  const moneyOnly = DRIP_CATALOG.filter((item) => item.unlockType === 'money');
  const achievementOnly = DRIP_CATALOG.filter((item) => item.unlockType === 'achievement');
  assert.ok(moneyOnly.length >= 3, 'some items are simply for sale');
  assert.ok(achievementOnly.length >= 5, 'some items cannot be bought at all');
  for (const item of achievementOnly) {
    assert.equal(item.priceCash, 0, `${item.id} is earned, so it has no price`);
    assert.ok(item.achievement, `${item.id} names the achievement that grants it`);
    assert.equal(isPurchasable(item), false);
  }
  for (const item of moneyOnly) {
    assert.equal(item.repRequired, 0, `${item.id} is a starter item and gates on nothing`);
    assert.ok(item.priceCash > 0);
  }

  // Rep tiers name where you are.
  assert.equal(repTierName(0), 'Starter');
  assert.equal(repTierName(120), 'Known Kid');
  assert.equal(repTierName(260), 'Popular Kid');
  assert.equal(repTierName(900), 'DayKare Legend');
}

const NO_EVIDENCE: AchievementEvidence = {
  binkyComplete: false,
  caperComplete: false,
  rainbowRounds: 0,
  gardenRuns: 0,
  juiceCustomersServed: 0,
  artActivities: 0,
  bestFriendship: 0,
};

{
  // Achievements come from evidence, and only from evidence.
  assert.equal(achievementsEarned(NO_EVIDENCE).size, 0, 'a fresh save has earned nothing');

  assert.ok(achievementsEarned({ ...NO_EVIDENCE, binkyComplete: true }).has('binky-complete'));
  assert.ok(achievementsEarned({ ...NO_EVIDENCE, caperComplete: true }).has('sticker-parade-complete'));
  assert.ok(achievementsEarned({ ...NO_EVIDENCE, rainbowRounds: 10 }).has('rainbow-10-rounds'));
  assert.ok(!achievementsEarned({ ...NO_EVIDENCE, rainbowRounds: 9 }).has('rainbow-10-rounds'), 'nine rounds is not ten');
  assert.ok(achievementsEarned({ ...NO_EVIDENCE, juiceCustomersServed: 25 }).has('juice-25-customers'));
  assert.ok(!achievementsEarned({ ...NO_EVIDENCE, juiceCustomersServed: 24 }).has('juice-25-customers'));
  assert.ok(achievementsEarned({ ...NO_EVIDENCE, gardenRuns: 1 }).has('garden-first-milestone'));
  assert.ok(!achievementsEarned({ ...NO_EVIDENCE, gardenRuns: 1 }).has('garden-mastery'), 'one run is not mastery');
  assert.ok(achievementsEarned({ ...NO_EVIDENCE, gardenRuns: 5 }).has('garden-mastery'));
  assert.ok(achievementsEarned({ ...NO_EVIDENCE, bestFriendship: 60 }).has('friend-trusted'));
}

{
  // Purchase gating. canPurchase is the single authority the UI and the store
  // action share, so a button can never offer what the action would refuse.
  const tee = DRIP_CATALOG.find((item) => item.id === 'sunbeam_tee')!;
  const legend = DRIP_CATALOG.find((item) => item.id === 'daykare_legend_scooter')!;
  const cap = DRIP_CATALOG.find((item) => item.id === 'sticker_parade_cap')!;
  const runners = DRIP_CATALOG.find((item) => item.id === 'rainbow_runners')!;
  const none = new Set<never>() as Set<DripAchievement>;
  const empty = new Set<string>();

  assert.ok(canPurchase(tee, { reputation: 0, cash: 4 }, none, empty).ok, 'a starter item needs only its price');
  assert.equal(canPurchase(tee, { reputation: 0, cash: 3 }, none, empty).ok, false, 'and it does need the price');
  assert.match(canPurchase(tee, { reputation: 0, cash: 3 }, none, empty).reason!, /\$4/);

  assert.equal(canPurchase(legend, { reputation: 749, cash: 999 }, none, empty).ok, false, 'one REP short is short');
  assert.ok(canPurchase(legend, { reputation: 750, cash: 60 }, none, empty).ok);

  // An earned-only item can never be bought, at any wealth.
  const richest = canPurchase(cap, { reputation: 999_999, cash: 999_999 }, none, empty);
  assert.equal(richest.ok, false, 'money cannot buy a prestige item');
  assert.equal(richest.reason, cap.unlockDetail, 'and it says how to earn it instead');

  // A dual-gate item needs all three.
  assert.equal(canPurchase(runners, { reputation: 250, cash: 18 }, none, empty).ok, false, 'achievement missing');
  const withRounds = new Set<DripAchievement>(['rainbow-10-rounds']);
  assert.equal(canPurchase(runners, { reputation: 249, cash: 18 }, withRounds, empty).ok, false, 'REP missing');
  assert.equal(canPurchase(runners, { reputation: 250, cash: 17 }, withRounds, empty).ok, false, 'cash missing');
  assert.ok(canPurchase(runners, { reputation: 250, cash: 18 }, withRounds, empty).ok, 'all three met');

  // Owning it stops the offer.
  assert.equal(canPurchase(tee, { reputation: 0, cash: 99 }, none, new Set(['sunbeam_tee'])).ok, false);
}

{
  // THE ANTI-FORGERY PROPERTY. A hand-edited save may not mint prestige items.
  const forged = normalizeDripOwned(
    ['sticker_parade_cap', 'binky_buddy_pack', 'garden_rain_boots', 'friendship_band', 'maker_art_smock'],
    NO_EVIDENCE,
  );
  assert.deepEqual(forged, [], 'editing localStorage grants no achievement item');

  // Nor may it invent items or duplicate them.
  assert.deepEqual(normalizeDripOwned(['not_a_real_item', 42, null], NO_EVIDENCE), []);
  assert.deepEqual(normalizeDripOwned(['sunbeam_tee', 'sunbeam_tee'], NO_EVIDENCE), ['sunbeam_tee']);
  assert.deepEqual(normalizeDripOwned('nonsense', NO_EVIDENCE), []);

  // Purchased items ARE trusted, because cash history is not reconstructible.
  assert.deepEqual(normalizeDripOwned(['sunbeam_tee', 'little_bucket_hat'], NO_EVIDENCE).sort(),
    ['little_bucket_hat', 'sunbeam_tee']);

  // And an earned item is granted even when the save never listed it, so a
  // player who earns one can never lose it to a corrupt save.
  const earnedBack = normalizeDripOwned([], { ...NO_EVIDENCE, binkyComplete: true });
  assert.ok(earnedBack.includes('binky_buddy_pack'), 'evidence grants the item on its own');
}

{
  // Equipping is constrained to owned items in their own slot.
  const owned = ['sunbeam_tee', 'little_bucket_hat'];
  assert.deepEqual(normalizeDripEquipped({ top: 'sunbeam_tee', hat: 'little_bucket_hat' }, owned),
    { top: 'sunbeam_tee', hat: 'little_bucket_hat' });
  assert.deepEqual(normalizeDripEquipped({ top: 'starlight_sneakers' }, owned), {}, 'shoes cannot fill the top slot');
  assert.deepEqual(normalizeDripEquipped({ top: 'playground_hoodie' }, owned), {}, 'an unowned item cannot be worn');
  assert.deepEqual(normalizeDripEquipped('nonsense', owned), {});

  const look = equippedAppearance({ top: 'sunbeam_tee', hat: 'little_bucket_hat' });
  assert.ok(look.top && look.hat, 'equipped items produce colours for the rig');
  assert.equal(equippedAppearance({}).top, undefined, 'and nothing equipped tints nothing');
}

{
  // End to end through the real store: the browser cannot mint currency.
  const store = useGameStore.getState();
  store.resetGame();
  assert.deepEqual(useGameStore.getState().dripOwned, [], 'a new save owns nothing');

  const cash = useGameStore.getState().juiceClubCash;
  assert.ok(cash < 60, 'a new save cannot afford the Legendary item');
  assert.equal(
    useGameStore.getState().purchaseDripItem('daykare_legend_scooter'),
    false,
    'and the store refuses it',
  );
  assert.equal(useGameStore.getState().juiceClubCash, cash, 'a refused purchase costs nothing');
  assert.deepEqual(useGameStore.getState().dripOwned, []);

  // An unknown id is refused rather than crashing.
  assert.equal(useGameStore.getState().purchaseDripItem('free_everything'), false);

  // An affordable one goes through, charges exactly the catalog price, and is
  // equipped so the player can see what they bought.
  useGameStore.setState({ juiceClubCash: 10 });
  assert.equal(useGameStore.getState().purchaseDripItem('sunbeam_tee'), true);
  assert.equal(useGameStore.getState().juiceClubCash, 6, 'charged exactly $4');
  assert.ok(useGameStore.getState().dripOwned.includes('sunbeam_tee'));
  assert.equal(useGameStore.getState().dripEquipped.top, 'sunbeam_tee', 'and worn immediately');

  // Buying it twice does not double-charge or duplicate.
  assert.equal(useGameStore.getState().purchaseDripItem('sunbeam_tee'), false);
  assert.equal(useGameStore.getState().juiceClubCash, 6);

  // Equip/unequip round trip.
  useGameStore.getState().unequipDripCategory('top');
  assert.equal(useGameStore.getState().dripEquipped.top, undefined);
  assert.equal(useGameStore.getState().equipDripItem('sunbeam_tee'), true);
  assert.equal(useGameStore.getState().equipDripItem('playground_hoodie'), false, 'cannot wear what you do not own');

  // Ownership and equipment survive a save round trip.
  const saved = serializeGameState(useGameStore.getState()) as Record<string, unknown>;
  const reloaded = normalizePersistedGameState(saved);
  assert.ok(reloaded.dripOwned.includes('sunbeam_tee'), 'purchases persist');
  assert.equal(reloaded.dripEquipped.top, 'sunbeam_tee', 'so does what you are wearing');

  useGameStore.getState().resetGame();
}

{
  // Area gates: specified, evaluated, and structurally unable to block Story.
  for (const gate of AREA_GATES) {
    assert.equal(gate.coreStoryBlocked, false, `${gate.id} must never gate required Story content`);
  }

  const poor = evaluateAllAreaAccess({
    progression: createInitialProgression(),
    cash: 0,
    quests: createInitialQuests(),
    storyChapter: 1,
    gardenRuns: 0,
  });
  assert.ok(poor.every((area) => !area.unlocked), 'a new save qualifies for none of them');
  assert.ok(poor.every((area) => area.outstanding.length > 0), 'and each says exactly what it needs');

  const rich = evaluateAllAreaAccess({
    progression: { ...createInitialProgression(), reputation: 999, routeUnlocks: ['maker-market'] },
    cash: 999,
    quests: createInitialQuests(),
    storyChapter: 9,
    gardenRuns: 9,
  });
  assert.ok(rich.every((area) => area.unlocked), 'and a fully-progressed save qualifies for all');
}

console.log('overhaul checks passed');
