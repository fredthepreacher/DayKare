import assert from 'node:assert/strict';
import {
  TIMING_GRID_PASS_SCORE, TIMING_GRID_ROUNDS, commitTimingGrid, createTimingGridState,
  timingGridPassed, timingGridRound,
} from './heistPlanning';
import {
  NPC_SLIDE_MAX_GAP_SECONDS, NPC_SLIDE_MIN_GAP_SECONDS, SLIDE_HOP_COUNT, SLIDE_TOTAL_SECONDS,
  advanceSlideRide, createNpcSlideSchedule, createSlideRide, npcSlideAllowed, npcSlideGap,
  pickNpcSlideRider, releaseNpcSlideRider, slideRidePosition, stepNpcSlideSchedule,
  type SlidePhase,
} from './slide';
import { REALTORS, STARTER_PROPERTY_ID, STONY_BROOK_PROPERTIES, propertyAction } from './realEstate';
import { useFinalMasterStore } from './finalMasterStore';
import { useStorybookLaneStore } from './storybookLaneStore';
import { useGameStore } from './store';
import { STARTER_HOME_PRICE } from './finalMaster';
import { KID_CAST } from './NPCs';

/**
 * The Wavy slide, the Timing Grid, and Stony Brook property ownership.
 *
 * The ownership cases are the ones worth guarding hardest: a save that
 * loses track of which first-clear reward was taken can end up handing
 * out both, or neither, and neither mistake is visible until a player
 * complains.
 */

/* ---------------------------- Timing Grid ---------------------------- */

{
  const fresh = createTimingGridState();
  assert.equal(timingGridRound(fresh)?.id, TIMING_GRID_ROUNDS[0].id, 'the run starts at the first round');

  // Committing inside the authored window scores; outside it does not.
  const round = TIMING_GRID_ROUNDS[0];
  const inside = commitTimingGrid(fresh, (round.safeFrom + round.safeTo) / 2);
  assert.equal(inside.score, 1, 'a commit inside the safe window is a hit');
  const outside = commitTimingGrid(fresh, round.safeFrom - 0.05);
  assert.equal(outside.score, 0, 'a commit just before the window is a miss');
  assert.deepEqual(outside.results, ['miss'], 'and the miss is recorded for the player to see');

  // Junk input is a miss, never a crash and never a free hit.
  assert.equal(commitTimingGrid(fresh, Number.NaN).score, 0, 'a non-finite commit cannot score');

  // A perfect run, then proof that a finished run refuses more input -
  // otherwise a player could re-judge the last round until it landed.
  let perfect = createTimingGridState();
  for (const step of TIMING_GRID_ROUNDS) perfect = commitTimingGrid(perfect, (step.safeFrom + step.safeTo) / 2);
  assert.equal(perfect.complete, true);
  assert.equal(perfect.score, TIMING_GRID_ROUNDS.length);
  assert.equal(timingGridPassed(perfect), true);
  const afterComplete = commitTimingGrid(perfect, 0.5);
  assert.deepEqual(afterComplete, perfect, 'a finished run ignores further commits');

  // Two hits is short of the pass mark, so practice cannot be scraped.
  let weak = createTimingGridState();
  TIMING_GRID_ROUNDS.forEach((step, index) => {
    weak = commitTimingGrid(weak, index < 2 ? (step.safeFrom + step.safeTo) / 2 : 0);
  });
  assert.equal(weak.score, 2);
  assert.ok(weak.score < TIMING_GRID_PASS_SCORE);
  assert.equal(timingGridPassed(weak), false, 'two of four does not bank the practice score');
}

{
  // The practice reward is XP only, once. Rascal Bucks are the heist's to
  // pay, and a board you can grind would replace the heist entirely.
  useFinalMasterStore.setState({ timingGridComplete: false, timingGridBestScore: null });
  useStorybookLaneStore.setState({ ribbonBucks: 500 });
  useGameStore.setState({ juiceClubCash: 250 });
  const first = useFinalMasterStore.getState().completeTimingGrid(4);
  assert.equal(first, true, 'the first clear pays out');
  assert.equal(useStorybookLaneStore.getState().ribbonBucks, 500, 'and pays no Rascal Bucks');
  assert.equal(useGameStore.getState().juiceClubCash, 250, 'and no cash either - practice is XP only');
  const second = useFinalMasterStore.getState().completeTimingGrid(4);
  assert.equal(second, false, 'a replay pays nothing');
  assert.equal(useStorybookLaneStore.getState().ribbonBucks, 500);
  assert.equal(useGameStore.getState().juiceClubCash, 250);
  assert.equal(useFinalMasterStore.getState().timingGridBestScore, 4);
  useFinalMasterStore.getState().completeTimingGrid(1);
  assert.equal(useFinalMasterStore.getState().timingGridBestScore, 4, 'a worse run does not lower the best');
}

/* ------------------------------- the slide ------------------------------- */

{
  // Stepping the ride at 60 Hz walks every authored phase in order and
  // ends when the authored total says it should.
  const seen: SlidePhase[] = [];
  let ride = createSlideRide();
  let shouts = 0;
  let elapsed = 0;
  while (ride.phase !== 'done' && elapsed < 20) {
    if (seen.at(-1) !== ride.phase) seen.push(ride.phase);
    ride = advanceSlideRide(ride, 1 / 60);
    if (ride.shoutedThisStep) shouts += 1;
    elapsed += 1 / 60;
  }
  assert.deepEqual(seen, ['align', 'climb', 'hop', 'descend', 'skid', 'recover'], 'the ride plays the authored sequence');
  assert.equal(ride.phase, 'done');
  assert.ok(Math.abs(elapsed - SLIDE_TOTAL_SECONDS) < 0.05, `the ride runs its authored length, not ${elapsed.toFixed(2)}s`);
  assert.equal(shouts, 1, '"Wavy!" fires exactly once per ride');
  assert.equal(SLIDE_HOP_COUNT, 2, 'and there are two hops at the top, as authored');
}

{
  // One enormous frame - a stall, a tab regaining focus - must not skip
  // the shout or strand the rider halfway up the ladder.
  let ride = createSlideRide();
  let shouts = 0;
  for (let step = 0; step < 40; step += 1) {
    ride = advanceSlideRide(ride, 1);
    if (ride.shoutedThisStep) shouts += 1;
    if (ride.phase === 'done') break;
  }
  assert.equal(ride.phase, 'done', 'a long frame still finishes the ride');
  assert.equal(shouts, 1, 'and still shouts exactly once');
}

{
  // The descent has to actually descend, and the rider ends up at the
  // foot of the slide rather than back where they started.
  const start: [number, number, number] = [9, 0, 3];
  const top = slideRidePosition({ phase: 'hop', elapsed: 0, shoutedThisStep: false, shouted: false }, start);
  const bottom = slideRidePosition({ phase: 'recover', elapsed: 0, shoutedThisStep: false, shouted: true }, start);
  assert.ok(top[1] > 1.5, 'the top of the tower is above head height');
  assert.ok(bottom[1] < 0.05, 'and the rider finishes on the ground');
  assert.ok(bottom[2] > top[2], 'having travelled down the ramp, away from the tower');
}

{
  // Cadence: a turn comes round inside the authored 25-40 second window.
  for (let seed = 0; seed < 40; seed += 1) {
    const gap = npcSlideGap(seed);
    assert.ok(gap >= NPC_SLIDE_MIN_GAP_SECONDS && gap <= NPC_SLIDE_MAX_GAP_SECONDS, `gap ${gap} is inside the authored window`);
  }

  const cast = ['Mia', 'Noah', 'Leo'];
  let schedule = createNpcSlideSchedule(1);
  assert.equal(schedule.rider, null);
  // Nothing happens before the gap elapses.
  schedule = stepNpcSlideSchedule(schedule, NPC_SLIDE_MIN_GAP_SECONDS - 1, cast, 1);
  assert.equal(schedule.rider, null, 'nobody rides before the gap is up');
  schedule = stepNpcSlideSchedule(schedule, NPC_SLIDE_MAX_GAP_SECONDS, cast, 1);
  assert.ok(schedule.rider, 'and someone takes a turn once it is');
  const firstRider = schedule.rider;

  // One at a time: the timer does not hand the slide to a second child.
  const held = stepNpcSlideSchedule(schedule, 999, cast, 2);
  assert.equal(held.rider, firstRider, 'the slide is never handed to a second child mid-ride');

  // And the next turn prefers somebody else.
  let released = releaseNpcSlideRider(schedule, 2);
  assert.equal(released.rider, null);
  released = stepNpcSlideSchedule(released, 999, cast, 2);
  assert.notEqual(released.rider, firstRider, 'the next turn goes to a different child');

  // With everyone busy the timer resets instead of firing every frame.
  const idle = stepNpcSlideSchedule(createNpcSlideSchedule(3), 999, [], 3);
  assert.equal(idle.rider, null, 'nobody eligible means nobody rides');
  assert.ok(idle.nextInSeconds >= NPC_SLIDE_MIN_GAP_SECONDS, 'and the timer resets rather than retrying every frame');

  // A cast of one still rides rather than sitting the slide out forever.
  assert.equal(pickNpcSlideRider(['Mia'], 'Mia'), 'Mia', 'a single eligible child still gets a turn');
  assert.equal(pickNpcSlideRider([], null), null);
}

{
  // The ride never interrupts what the brief says it must not.
  for (const blocked of ['nap', 'art-time', 'show-and-tell', 'lunch', 'breakfast', 'pickup']) {
    assert.equal(npcSlideAllowed(blocked, false, false), false, `${blocked} is not interrupted for a slide`);
  }
  assert.equal(npcSlideAllowed('outdoor-play', false, false), true, 'free play is fair game');
  assert.equal(npcSlideAllowed('outdoor-play', true, false), false, 'heist companions stay on duty');
  assert.equal(npcSlideAllowed('outdoor-play', false, true), false, 'and a cutscene is never cut into');
}

/* --------------------------- property ownership --------------------------- */

const starter = STONY_BROOK_PROPERTIES.find((property) => property.id === STARTER_PROPERTY_ID)!;

{
  assert.equal(starter.price, STARTER_HOME_PRICE, 'the catalog price is the economy price, not a second number');

  assert.deepEqual(
    propertyAction(starter, { ownedStarterHome: true, homeVoucher: false, rascalBucks: 0 }),
    { kind: 'enter' },
    'an owner is shown the way in, never a second purchase',
  );
  assert.deepEqual(
    propertyAction(starter, { ownedStarterHome: false, homeVoucher: true, rascalBucks: 0 }),
    { kind: 'claim' },
    'a voucher claims the starter home with no balance at all',
  );
  assert.deepEqual(
    propertyAction(starter, { ownedStarterHome: false, homeVoucher: false, rascalBucks: STARTER_HOME_PRICE }),
    { kind: 'buy', price: STARTER_HOME_PRICE },
    'exactly the asking price is enough',
  );
  const short = propertyAction(starter, { ownedStarterHome: false, homeVoucher: false, rascalBucks: STARTER_HOME_PRICE - 1200 });
  assert.equal(short.kind, 'short');
  assert.equal(short.kind === 'short' && short.shortfall, 1200, 'and a short balance reports the gap rather than failing silently');

  const neighbour = STONY_BROOK_PROPERTIES.find((property) => !property.enterable)!;
  assert.equal(
    propertyAction(neighbour, { ownedStarterHome: false, homeVoucher: true, rascalBucks: 999999 }).kind,
    'unavailable',
    'a voucher cannot be spent on a property with no interior behind it',
  );
}

{
  // Two characters with the same name in one game is a bug, not a style
  // choice - friend and mood state is keyed by name.
  const names = new Set([...KID_CAST.map((kid) => kid.name), 'Ms. Harper', 'Mr. Davis', 'Miss Leslie']);
  for (const realtor of REALTORS) {
    assert.equal(names.has(realtor.name), false, `${realtor.name} must not collide with an existing DayKare character`);
  }
  assert.equal(new Set(REALTORS.map((realtor) => realtor.id)).size, REALTORS.length, 'realtor ids are unique');
  for (const realtor of REALTORS) {
    assert.ok(realtor.patrol.length >= 2, `${realtor.name} walks a patrol rather than standing on one spot`);
  }
}

{
  // Buying spends exactly the price; a voucher spends nothing; a short
  // balance is left untouched.
  const setup = (state: { owned: boolean; voucher: boolean; rb: number }) => {
    useFinalMasterStore.setState({ ownedStarterHome: state.owned, homeVoucher: state.voucher });
    useStorybookLaneStore.setState({ ribbonBucks: state.rb });
  };

  setup({ owned: false, voucher: false, rb: STARTER_HOME_PRICE + 3000 });
  assert.equal(useFinalMasterStore.getState().buyStarterHome(), 'purchased');
  assert.equal(useStorybookLaneStore.getState().ribbonBucks, 3000, 'a purchase spends exactly the asking price');
  assert.equal(useFinalMasterStore.getState().ownedStarterHome, true);

  setup({ owned: false, voucher: true, rb: 0 });
  assert.equal(useFinalMasterStore.getState().buyStarterHome(), 'purchased');
  assert.equal(useStorybookLaneStore.getState().ribbonBucks, 0, 'a voucher claim costs nothing');
  assert.equal(useFinalMasterStore.getState().homeVoucher, false, 'and the voucher is spent, not reusable');

  setup({ owned: false, voucher: false, rb: STARTER_HOME_PRICE - 1 });
  assert.equal(useFinalMasterStore.getState().buyStarterHome(), 'insufficient');
  assert.equal(useStorybookLaneStore.getState().ribbonBucks, STARTER_HOME_PRICE - 1, 'a refused purchase changes no balance');
  assert.equal(useFinalMasterStore.getState().ownedStarterHome, false);

  setup({ owned: true, voucher: false, rb: STARTER_HOME_PRICE });
  assert.equal(useFinalMasterStore.getState().buyStarterHome(), 'owned');
  assert.equal(useStorybookLaneStore.getState().ribbonBucks, STARTER_HOME_PRICE, 'an owner is never charged twice');
}

/* ----------------------- ownership migration on load ----------------------- */

{
  const merged = (saved: Record<string, unknown>) => {
    const options = (useFinalMasterStore as unknown as {
      persist: { getOptions: () => { merge?: (p: unknown, c: unknown) => unknown } };
    }).persist.getOptions();
    return options.merge!(saved, useFinalMasterStore.getState()) as ReturnType<typeof useFinalMasterStore.getState>;
  };

  // Already owns a home: kept, surfaced, and no make-good offered.
  const owner = merged({ ownedStarterHome: true, firstHeistComplete: true, firstRewardChoice: 'home', heistStatus: 'complete' });
  assert.equal(owner.ownedStarterHome, true, 'an owned home survives the load');
  assert.equal(owner.homeRewardRecoveryPending, false, 'and nothing extra is offered on top of it');

  // An unused voucher survives so the claim is still available.
  const voucher = merged({ homeVoucher: true, firstRewardChoice: 'home', firstHeistComplete: true, heistStatus: 'complete' });
  assert.equal(voucher.homeVoucher, true, 'an unspent voucher is still claimable after a reload');
  assert.equal(voucher.homeRewardRecoveryPending, false);

  // Took the Rascal Bucks: no free home appears, and a voucher forged
  // onto such a save is dropped rather than honoured.
  const tookRb = merged({ firstRewardChoice: 'rb', firstHeistComplete: true, heistStatus: 'complete', homeVoucher: true });
  assert.equal(tookRb.homeVoucher, false, 'a player who took the RB is not also handed a house');
  assert.equal(tookRb.ownedStarterHome, false);
  assert.equal(tookRb.homeRewardRecoveryPending, false);

  // Legacy save: heist finished, choice never recorded, nothing granted.
  // They are owed one reward, offered once.
  const legacy = merged({ firstHeistComplete: true, heistStatus: 'complete' });
  assert.equal(legacy.homeRewardRecoveryPending, true, 'an unresolved first clear offers the make-good');

  // The pending choice modal is still up: that is not a legacy case, and
  // showing both prompts would let a player take both rewards.
  const pending = merged({ firstHeistComplete: true, heistStatus: 'reward-choice' });
  assert.equal(pending.homeRewardRecoveryPending, false, 'the recovery prompt never runs alongside the real one');

  // A junk choice value is treated as unrecorded rather than trusted.
  const junk = merged({ firstHeistComplete: true, heistStatus: 'complete', firstRewardChoice: 'free-mansion' });
  assert.equal(junk.firstRewardChoice, null);
  assert.equal(junk.homeRewardRecoveryPending, true, 'a corrupted choice falls back to the make-good, not to a free house');

  // Nobody who never finished a heist is offered anything.
  assert.equal(merged({}).homeRewardRecoveryPending, false);

  // Being inside the house is never restored: a reload puts the player
  // back in the world, not in an interior with no way of knowing how
  // they got there.
  assert.equal(merged({ insideHome: true, ownedStarterHome: true }).insideHome, false);
}

{
  // The make-good grants exactly one reward and then stops offering.
  useFinalMasterStore.setState({
    homeRewardRecoveryPending: true, firstRewardChoice: null, ownedStarterHome: false,
    homeVoucher: false, totalHeistRbEarned: 0,
  });
  useStorybookLaneStore.setState({ ribbonBucks: 0 });
  assert.equal(useFinalMasterStore.getState().resolveHomeRewardRecovery('home'), true);
  assert.equal(useFinalMasterStore.getState().homeVoucher, true, 'choosing the home grants the voucher');
  assert.equal(useStorybookLaneStore.getState().ribbonBucks, 0, 'and not the cash as well');
  assert.equal(useFinalMasterStore.getState().homeRewardRecoveryPending, false);
  assert.equal(useFinalMasterStore.getState().resolveHomeRewardRecovery('rb'), false, 'the make-good runs once');
  assert.equal(useStorybookLaneStore.getState().ribbonBucks, 0, 'a second attempt pays nothing');

  // Taking the cash instead pays the wallet and leaves no voucher.
  useFinalMasterStore.setState({ homeRewardRecoveryPending: true, firstRewardChoice: null, homeVoucher: false });
  useStorybookLaneStore.setState({ ribbonBucks: 0 });
  assert.equal(useFinalMasterStore.getState().resolveHomeRewardRecovery('rb'), true);
  assert.ok(useStorybookLaneStore.getState().ribbonBucks > 0, 'choosing the cash pays the wallet');
  assert.equal(useFinalMasterStore.getState().homeVoucher, false, 'and hands out no voucher');

  // The original first-clear choice also refuses to run twice.
  useFinalMasterStore.setState({ heistStatus: 'reward-choice', firstRewardChoice: null, homeVoucher: false });
  assert.equal(useFinalMasterStore.getState().chooseFirstReward('home'), true);
  assert.equal(useFinalMasterStore.getState().chooseFirstReward('rb'), false, 'the first-clear reward is chosen once');
}

console.log('next update checks passed');
