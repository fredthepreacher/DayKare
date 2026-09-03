import assert from 'node:assert/strict';
import * as THREE from 'three';
import { useGameStore } from './store';
import { useFinalMasterStore } from './finalMasterStore';
import {
  GARAGE_THEMES, HOME_THEMES, garageTheme, homeTheme, nextGarageTheme, nextHomeTheme,
} from './interiorThemes';
import {
  RALLY_CONFIGS, RALLY_MAX_MISSES, createRally, moveRallyPaddle, rallyCleared, stepRally,
  type RallyConfig, type RallyState,
} from './rallyGame';
import {
  NEIGHBORHOOD_ACTIVITIES, NEIGHBORHOOD_SPOT_IDS, activityCompletedBy, activityProgress,
  activitySpots,
} from './neighborhood';
import { DRIP_CATALOG, achievementsEarned, normalizeDripOwned, type AchievementEvidence } from './drip';
import { HERO_OUTFIT_HEISTS } from './finalMasterStore';
import { PLAYER_RADIUS, TENNIS_APPROACH, TENNIS_COURT, WORLD_SOLIDS, isWalkable } from './world';

/**
 * The Master Implementation Prompt: interior themes, the two rally minigames,
 * the open-world neighbourhood activities, and the earned hero outfit.
 */

const NO_EVIDENCE: AchievementEvidence = {
  binkyComplete: false,
  caperComplete: false,
  rainbowRounds: 0,
  gardenRuns: 0,
  juiceCustomersServed: 0,
  artActivities: 0,
  bestFriendship: 0,
  heistsCompleted: 0,
};

/* ------------------------------ themes ------------------------------ */

{
  assert.ok(HOME_THEMES.length >= 2, 'the house has more than one look to choose between');
  assert.ok(GARAGE_THEMES.length >= 2, 'so does the garage');

  // Cycling must be a closed ring: every index reachable, and it comes home.
  const homeSeen = new Set<number>();
  let index = 0;
  for (let i = 0; i < HOME_THEMES.length; i += 1) { homeSeen.add(index); index = nextHomeTheme(index); }
  assert.equal(homeSeen.size, HOME_THEMES.length, 'cycling the house theme reaches every palette');
  assert.equal(index, 0, 'and wraps back to the first');

  const garageSeen = new Set<number>();
  index = 0;
  for (let i = 0; i < GARAGE_THEMES.length; i += 1) { garageSeen.add(index); index = nextGarageTheme(index); }
  assert.equal(garageSeen.size, GARAGE_THEMES.length, 'cycling the garage theme reaches every palette');

  // A forged or stale save index must resolve to a real palette, not undefined
  // colours that would render the interior black.
  for (const bad of [-4, 1.7, 99, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.ok(homeTheme(bad as number)?.wallGround, `home theme survives a save index of ${bad}`);
    assert.ok(garageTheme(bad as number)?.wall, `garage theme survives a save index of ${bad}`);
  }

  // Palettes must be distinguishable, or the switch does nothing visible.
  const homeWalls = new Set(HOME_THEMES.map((theme) => theme.wallGround));
  assert.equal(homeWalls.size, HOME_THEMES.length, 'each house palette repaints the walls');
  const garageWalls = new Set(GARAGE_THEMES.map((theme) => theme.wall));
  assert.equal(garageWalls.size, GARAGE_THEMES.length, 'each garage palette repaints the walls');
}

{
  // The switches persist through the store, so a repaint survives a reload.
  useFinalMasterStore.setState({ homeThemeIndex: 0, garageThemeIndex: 0 });
  const home = useFinalMasterStore.getState().cycleHomeTheme();
  assert.equal(home, nextHomeTheme(0), 'the switch advances one step');
  assert.equal(useFinalMasterStore.getState().homeThemeIndex, home, 'and stores where it landed');
  const garage = useFinalMasterStore.getState().cycleGarageTheme();
  assert.equal(useFinalMasterStore.getState().garageThemeIndex, garage, 'the garage switch stores too');
  assert.notEqual(useFinalMasterStore.getState().homeThemeIndex, 0, 'the two switches are independent');
}

/* ------------------------------- rally ------------------------------- */

/** Plays a rally with a paddle that tracks the ball, i.e. a competent player. */
function playTracking(config: RallyConfig, seconds: number) {
  let state = createRally();
  const delta = 1 / 60;
  for (let elapsed = 0; elapsed < seconds && !state.over; elapsed += delta) {
    const axis = Math.max(-1, Math.min(1, (state.ballX - state.paddleX) * 12));
    state = moveRallyPaddle(state, axis, delta);
    state = stepRally(state, config, delta);
  }
  return state;
}

/** Plays with a paddle that never moves off centre. */
function playIdle(config: RallyConfig, seconds: number) {
  let state = createRally();
  const delta = 1 / 60;
  for (let elapsed = 0; elapsed < seconds && !state.over; elapsed += delta) {
    state = stepRally(state, config, delta);
  }
  return state;
}

// Three lives, so one fumble is not the end of a run.
assert.equal(RALLY_MAX_MISSES, 3, 'a rally gives the player three misses');

for (const config of Object.values(RALLY_CONFIGS)) {
  const tracked = playTracking(config, 90);
  assert.ok(
    rallyCleared(tracked, config),
    `${config.id}: a player who tracks the ball reaches the target rally of ${config.targetRally}`,
  );

  const idle = playIdle(config, 90);
  assert.ok(idle.over, `${config.id}: a player who never moves eventually loses`);
  assert.equal(idle.misses, RALLY_MAX_MISSES, `${config.id}: the run ends on the third miss, not sooner`);
  assert.ok(
    !rallyCleared(idle, config),
    `${config.id}: standing still does not bank the reward`,
  );

  // The ball must stay on the court however the caller abuses the clock.
  let jittered: RallyState = createRally();
  for (let i = 0; i < 400 && !jittered.over; i += 1) {
    jittered = moveRallyPaddle(jittered, Number.NaN, 0.016);
    jittered = stepRally(jittered, config, i % 7 === 0 ? Number.NaN : 0.4);
    assert.ok(jittered.ballX >= -1.0001 && jittered.ballX <= 1.0001, `${config.id}: the ball stays on the court`);
    assert.ok(jittered.paddleX >= -1.0001 && jittered.paddleX <= 1.0001, `${config.id}: the paddle stays on the court`);
  }

  // A finished rally is frozen: extra steps cannot inflate the score.
  const done = playIdle(config, 90);
  const after = stepRally(moveRallyPaddle(done, 1, 0.5), config, 0.5);
  assert.deepEqual(
    [after.rally, after.bestRally, after.misses],
    [done.rally, done.bestRally, done.misses],
    `${config.id}: stepping past the end changes nothing`,
  );
}

{
  // XP is paid for improving, not for replaying - otherwise the minigame is an
  // XP faucet you hold down.
  useFinalMasterStore.setState({ rallyBest: {} });
  const before = useGameStore.getState().progression.experience;
  assert.equal(useFinalMasterStore.getState().recordRallyResult('ping-pong', 5, 30), true, 'a first result banks');
  const afterFirst = useGameStore.getState().progression.experience;
  assert.ok(afterFirst > before, 'and pays XP');
  assert.equal(useFinalMasterStore.getState().recordRallyResult('ping-pong', 5, 30), false, 'matching your best pays nothing');
  assert.equal(useFinalMasterStore.getState().recordRallyResult('ping-pong', 3, 30), false, 'nor does a worse run');
  assert.equal(useGameStore.getState().progression.experience, afterFirst, 'the XP total held still');
  assert.equal(useFinalMasterStore.getState().recordRallyResult('ping-pong', 6, 30), true, 'beating it pays again');
  assert.equal(useFinalMasterStore.getState().rallyBest['ping-pong'], 6, 'the best is the best, not the last');
  // A forged best cannot be negative or fractional.
  useFinalMasterStore.getState().recordRallyResult('tennis', 4.9, 40);
  assert.equal(useFinalMasterStore.getState().rallyBest.tennis, 4, 'a fractional result is floored');
}

{
  // The tennis court must be somewhere a player can actually stand next to.
  const [ax, , az] = TENNIS_APPROACH;
  assert.ok(isWalkable(new THREE.Vector3(ax, 0, az), PLAYER_RADIUS, [], 'storybook'), 'the tennis approach is reachable on foot');
  assert.ok(
    ax >= TENNIS_COURT.minX - 3 && ax <= TENNIS_COURT.maxX + 3
    && az >= TENNIS_COURT.minZ - 3 && az <= TENNIS_COURT.maxZ + 3,
    'and it is beside the court rather than across the lane',
  );
  const net = WORLD_SOLIDS.filter((solid) => solid.zone === 'storybook' && solid.id.startsWith('sb-tennis-'));
  assert.ok(net.length >= 5, 'the net and its four posts are solid, so the court is a real object');
  // The approach must not be standing inside one of them.
  for (const solid of net) {
    const inside = ax > solid.minX - PLAYER_RADIUS && ax < solid.maxX + PLAYER_RADIUS
      && az > solid.minZ - PLAYER_RADIUS && az < solid.maxZ + PLAYER_RADIUS;
    assert.ok(!inside, `the walk-up spot is clear of ${solid.id}`);
  }
}

/* --------------------------- neighbourhood --------------------------- */

{
  const spots = activitySpots();
  assert.ok(spots.length >= 8, 'the lane has a real amount to do out in the open');
  assert.equal(new Set(NEIGHBORHOOD_SPOT_IDS).size, NEIGHBORHOOD_SPOT_IDS.length, 'spot ids are unique');

  for (const { activity, spot } of spots) {
    const [x, , z] = spot.position;
    assert.ok(isWalkable(new THREE.Vector3(x, 0, z), PLAYER_RADIUS, [], 'storybook'), `${spot.id} stands where a player can reach it`);
    // And not inside a wall, bench, lamp post or parked car.
    const blocked = WORLD_SOLIDS.some((solid) => solid.zone === 'storybook'
      && x > solid.minX - PLAYER_RADIUS && x < solid.maxX + PLAYER_RADIUS
      && z > solid.minZ - PLAYER_RADIUS && z < solid.maxZ + PLAYER_RADIUS);
    assert.ok(!blocked, `${spot.id} is not buried inside ${activity.label} scenery`);
  }

  // Spots must not overlap each other, or two prompts fight over one keypress.
  for (let i = 0; i < spots.length; i += 1) {
    for (let j = i + 1; j < spots.length; j += 1) {
      const a = spots[i].spot.position;
      const b = spots[j].spot.position;
      const distance = Math.hypot(a[0] - b[0], a[2] - b[2]);
      assert.ok(distance > 1.6, `${spots[i].spot.id} and ${spots[j].spot.id} are ${distance.toFixed(2)}m apart`);
    }
  }
}

{
  // Rewards land once, on the visit that finishes an activity.
  for (const activity of NEIGHBORHOOD_ACTIVITIES) {
    const ids = activity.spots.map((spot) => spot.id);
    const partial = ids.slice(0, -1);
    assert.equal(activityProgress(activity, partial).complete, false, `${activity.id} is not done early`);
    assert.equal(activityCompletedBy(ids[ids.length - 1], partial)?.id, activity.id, `${activity.id} completes on its last spot`);
    for (const early of partial) {
      assert.equal(activityCompletedBy(early, partial.slice(0, -1)), null, `${early} does not complete ${activity.id} on its own`);
    }
  }
  assert.equal(activityCompletedBy('not-a-real-spot', []), null, 'an unknown spot completes nothing');
}

{
  const activity = NEIGHBORHOOD_ACTIVITIES[0];
  useFinalMasterStore.setState({ neighborhoodDone: [] });
  const before = useGameStore.getState().progression;
  const beforeXp = before.experience;
  const beforeRep = before.reputation;

  for (const spot of activity.spots) {
    assert.equal(useFinalMasterStore.getState().completeNeighborhoodSpot(spot.id), 'done', `${spot.id} records`);
  }
  const afterXp = useGameStore.getState().progression.experience;
  assert.ok(afterXp > beforeXp, 'finishing the activity pays XP');
  assert.ok(useGameStore.getState().progression.reputation >= beforeRep, 'and reputation');

  // Revisiting a finished spot must not pay a second time.
  assert.equal(useFinalMasterStore.getState().completeNeighborhoodSpot(activity.spots[0].id), 'already', 'a repeat visit is refused');
  assert.equal(useGameStore.getState().progression.experience, afterXp, 'and pays nothing');
  assert.equal(useFinalMasterStore.getState().completeNeighborhoodSpot('forged-spot'), 'unknown', 'a forged spot id is refused');
  assert.ok(!useFinalMasterStore.getState().neighborhoodDone.includes('forged-spot'), 'and never enters the save');
}

/* ---------------------------- hero outfit ---------------------------- */

{
  const heroItems = DRIP_CATALOG.filter((item) => item.achievement === 'heist-milestone');
  assert.ok(heroItems.length >= 1, 'the heist reward outfit exists in the catalog');
  for (const item of heroItems) {
    assert.equal(item.unlockType, 'achievement', `${item.id} is earned, never listed for sale`);
    assert.equal(item.priceCash, 0, `${item.id} has no price to pay`);
    assert.equal(item.prestige, true, `${item.id} is marked prestige so grant paths refuse it`);
  }

  // Not earned before a heist; earned after one; and never purchasable.
  assert.equal(achievementsEarned(NO_EVIDENCE).has('heist-milestone'), false, 'no heist, no suit');
  const earned = achievementsEarned({ ...NO_EVIDENCE, heistsCompleted: HERO_OUTFIT_HEISTS });
  assert.equal(earned.has('heist-milestone'), true, 'one finished heist earns it');

  // A forged save cannot grant it, and a real one cannot lose it.
  const forged = normalizeDripOwned(heroItems.map((item) => item.id), NO_EVIDENCE);
  for (const item of heroItems) {
    assert.ok(!forged.includes(item.id), `${item.id} cannot be granted by editing the save`);
  }
  const rebuilt = normalizeDripOwned([], { ...NO_EVIDENCE, heistsCompleted: HERO_OUTFIT_HEISTS });
  for (const item of heroItems) {
    assert.ok(rebuilt.includes(item.id), `${item.id} comes back for a player who earned it`);
  }

  // And it cannot be bought through the shop's cosmetic grant path.
  useGameStore.setState({ dripOwned: [] });
  useGameStore.getState().grantMonetizationCosmetics(heroItems.map((item) => item.id));
  for (const item of heroItems) {
    assert.ok(!useGameStore.getState().dripOwned.includes(item.id), `${item.id} is not for sale`);
  }
}

{
  // The award fires once, off the back of a real heist clear.
  useGameStore.setState({ dripOwned: [] });
  useFinalMasterStore.setState({
    heroOutfitUnlocked: false, firstHeistComplete: false, heistsCompleted: 0,
    heistStatus: 'reward-choice', firstRewardChoice: null,
  });
  assert.equal(useFinalMasterStore.getState().claimHeroOutfit(), false, 'nothing to claim before a heist');

  useFinalMasterStore.setState({ heistsCompleted: 1 });
  assert.equal(useFinalMasterStore.getState().chooseFirstReward('rb'), true, 'the first clear is booked');
  assert.equal(useFinalMasterStore.getState().heroOutfitUnlocked, true, 'and the suit is unlocked by it');
  const heroIds = DRIP_CATALOG.filter((item) => item.achievement === 'heist-milestone').map((item) => item.id);
  for (const id of heroIds) {
    assert.ok(useGameStore.getState().dripOwned.includes(id), `${id} is in the wardrobe, ready at the closet`);
  }
  assert.equal(useFinalMasterStore.getState().claimHeroOutfit(), false, 'and it is only ever awarded once');
}

console.log('masterPrompt.test.ts OK');
