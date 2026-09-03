import assert from 'node:assert/strict';
import {
  ROUTE_PLANNER_MAX_MOVES,
  advanceRoutePlanner,
  createRoutePlannerState,
  leoHeistApproachAllowed,
  routePlannerOptions,
} from './heistPlanning';
import { useFinalMasterStore } from './finalMasterStore';
import { useStorybookLaneStore } from './storybookLaneStore';

/**
 * The Leo -> Miss Leslie bridge and the Route Planner board mini-game.
 *
 * Both shipped without any test coverage, and both are stateful, persisted and
 * time-gated - which is exactly the combination where a reload or a replay
 * quietly does the wrong thing. The acceptance criteria they are written
 * against are the ones the brief names: at most two approaches, the second one
 * delayed, talking to Miss Leslie cancels the rest, and a reload never restarts
 * the sequence.
 */

const reset = () => {
  useFinalMasterStore.setState({
    leoHeistHintCount: 0,
    leoHeistIntroCompleted: false,
    leoHeistNextHintMinute: null,
    leoHeistApproachActive: false,
    leoHeistWaypointActive: false,
    missLeslieHeistIntroduced: false,
    heistStatus: 'idle',
    routePlannerComplete: false,
    routePlannerBestRisk: null,
  });
};

/* -------------------------------------------------------------------------- */
/* Leo approach scheduling                                                    */
/* -------------------------------------------------------------------------- */

{
  // Leo may only interrupt during loose periods. Walking up mid-Art, mid-meal
  // or during nap is the behaviour the brief explicitly rules out.
  for (const schedule of ['morning-play', 'recess', 'pickup', 'juice-club', 'outdoor-play']) {
    assert.equal(leoHeistApproachAllowed(schedule), true, `${schedule} is a free period`);
  }
  for (const schedule of ['art-time', 'breakfast', 'lunch', 'nap', 'show-and-tell']) {
    assert.equal(leoHeistApproachAllowed(schedule), false, `${schedule} must not be interrupted`);
  }
}

{
  // Nothing happens until Leo's own story is finished.
  reset();
  const store = () => useFinalMasterStore.getState();
  assert.equal(store().requestLeoHeistApproach(600, true, false), false, 'no bridge before Leo\'s story ends');
  assert.equal(store().requestLeoHeistApproach(600, false, true), false, 'no bridge during a blocked period');
  assert.equal(store().leoHeistHintCount, 0);
}

{
  // The full happy path: two approaches, no more, with the second one delayed.
  reset();
  const store = () => useFinalMasterStore.getState();

  assert.equal(store().requestLeoHeistApproach(600, true, true), true, 'first approach starts');
  assert.equal(store().leoHeistApproachActive, true);
  // While he is already walking over he cannot be asked again.
  assert.equal(store().requestLeoHeistApproach(600, true, true), false, 'no double approach');

  assert.equal(store().completeLeoHeistHint(600), 1, 'first hint delivered');
  assert.equal(store().leoHeistHintCount, 1);
  assert.equal(store().leoHeistWaypointActive, true, 'the Miss Leslie waypoint appears');
  assert.equal(store().leoHeistIntroCompleted, true, 'the Tablet recap unlocks');

  // The second reminder must NOT come straight after the first.
  assert.equal(store().requestLeoHeistApproach(601, true, true), false, 'second reminder is delayed');
  assert.equal(store().requestLeoHeistApproach(betweenNow(), true, true), false, 'still delayed just before the window');
  function betweenNow() { return (useFinalMasterStore.getState().leoHeistNextHintMinute ?? 0) - 1; }

  const due = store().leoHeistNextHintMinute!;
  assert.ok(due > 600, 'a delay was actually recorded');
  assert.equal(store().requestLeoHeistApproach(due, true, true), true, 'second approach opens once due');
  assert.equal(store().completeLeoHeistHint(due), 2, 'second hint delivered');
  assert.equal(store().leoHeistHintCount, 2);

  // And that is the end of it, forever.
  assert.equal(store().requestLeoHeistApproach(due + 10_000, true, true), false, 'never a third approach');
  assert.equal(store().completeLeoHeistHint(due + 10_000), null, 'and no third hint can be delivered');
  assert.equal(store().leoHeistHintCount, 2, 'the counter is capped at two');
}

{
  // Talking to Miss Leslie first cancels the reminders entirely.
  reset();
  const store = () => useFinalMasterStore.getState();
  assert.equal(store().requestLeoHeistApproach(600, true, true), true);
  assert.equal(store().completeLeoHeistHint(600), 1);

  useFinalMasterStore.setState({ missLeslieHeistIntroduced: true });
  const due = store().leoHeistNextHintMinute ?? 700;
  assert.equal(store().requestLeoHeistApproach(due, true, true), false, 'starting her heist stops reminder two');
  assert.equal(store().leoHeistHintCount, 1, 'and the player is never nagged again');
}

{
  // An active heist also suppresses him, so he cannot interrupt a job.
  reset();
  const store = () => useFinalMasterStore.getState();
  useFinalMasterStore.setState({ heistStatus: 'active' });
  assert.equal(store().requestLeoHeistApproach(600, true, true), false, 'no approach mid-heist');
  useFinalMasterStore.setState({ heistStatus: 'reward-choice' });
  assert.equal(store().requestLeoHeistApproach(600, true, true), false, 'no approach mid reward choice');
}

/* -------------------------------------------------------------------------- */
/* Reload safety                                                              */
/* -------------------------------------------------------------------------- */

{
  // A reload must not restart the sequence, and must not leave Leo frozen
  // mid-walk either. This exercises the store's own merge, which is what runs
  // on a real reload.
  const merged = (saved: Record<string, unknown>) => {
    const options = (useFinalMasterStore as unknown as {
      persist: { getOptions: () => { merge?: (p: unknown, c: unknown) => unknown } };
    }).persist.getOptions();
    return options.merge!(saved, useFinalMasterStore.getState()) as ReturnType<typeof useFinalMasterStore.getState>;
  };

  const midWalk = merged({ leoHeistHintCount: 1, leoHeistApproachActive: true, leoHeistNextHintMinute: 700 });
  assert.equal(midWalk.leoHeistHintCount, 1, 'the hint count survives a reload');
  assert.equal(midWalk.leoHeistApproachActive, false, 'an interrupted approach does not resume as a ghost');
  assert.equal(midWalk.leoHeistNextHintMinute, 700, 'the delay survives too, so reloading cannot skip it');

  // A save that already started her heist keeps the reminders switched off.
  const started = merged({ leoHeistHintCount: 1, missLeslieHeistIntroduced: true, leoHeistWaypointActive: true });
  assert.equal(started.missLeslieHeistIntroduced, true);
  assert.equal(started.leoHeistWaypointActive, false, 'the waypoint clears once she has been met');

  // Forged or corrupt counts are clamped rather than trusted.
  assert.equal(merged({ leoHeistHintCount: 99 }).leoHeistHintCount, 2, 'a forged count cannot exceed the cap');
  assert.equal(merged({ leoHeistHintCount: -5 }).leoHeistHintCount, 0);
  assert.equal(merged({ leoHeistHintCount: 'lots' }).leoHeistHintCount, 0, 'a non-number falls back to zero');

  // Finishing the heist implies she was met, even if the flag was never written.
  assert.equal(merged({ firstHeistComplete: true }).missLeslieHeistIntroduced, true);
  assert.equal(merged({ heistStatus: 'active' }).missLeslieHeistIntroduced, true);
}

/* -------------------------------------------------------------------------- */
/* Route Planner board mini-game                                              */
/* -------------------------------------------------------------------------- */

{
  // A short, clean run reaches the target well inside the move budget.
  let state = createRoutePlannerState();
  assert.deepEqual(state.path, ['start']);
  assert.equal(state.risk, 0);

  for (const node of ['cubbies', 'art-door', 'hall', 'target'] as const) {
    assert.ok(routePlannerOptions(state).includes(node), `${node} is reachable from ${state.path.at(-1)}`);
    state = advanceRoutePlanner(state, node);
  }
  assert.equal(state.complete, true, 'the safe route completes');
  assert.equal(state.failed, false);
  assert.equal(state.risk, 0, 'avoiding the rug and the teacher costs no risk');
  assert.ok(state.moves <= ROUTE_PLANNER_MAX_MOVES, 'and fits the move budget');
}

{
  // The risky route also completes, but carries a cost - that is the choice the
  // mini-game is actually offering.
  let state = createRoutePlannerState();
  for (const node of ['rug', 'patrol', 'hall', 'target'] as const) state = advanceRoutePlanner(state, node);
  assert.equal(state.complete, true);
  assert.equal(state.risk, 3, 'the busy rug and the teacher each add risk');
}

{
  // Illegal moves are refused rather than corrupting the board.
  const start = createRoutePlannerState();
  assert.equal(advanceRoutePlanner(start, 'target'), start, 'you cannot jump straight to the target');
  assert.equal(advanceRoutePlanner(start, 'hall'), start, 'nor skip to a node you are not adjacent to');

  // A finished board is frozen.
  let done = createRoutePlannerState();
  for (const node of ['cubbies', 'art-door', 'hall', 'target'] as const) done = advanceRoutePlanner(done, node);
  assert.equal(advanceRoutePlanner(done, 'target'), done, 'a completed board ignores further input');
}

{
  // Every node the board offers must be one the graph can actually leave, or a
  // player can be dead-ended with moves remaining and no legal option.
  let state = createRoutePlannerState();
  const visited = new Set<string>(['start']);
  const queue = [...routePlannerOptions(state)];
  while (queue.length) {
    const node = queue.shift()!;
    if (visited.has(node)) continue;
    visited.add(node);
    const from = { ...createRoutePlannerState(), path: [node] } as typeof state;
    const options = routePlannerOptions(from);
    assert.ok(node === 'target' || options.length > 0, `${node} is not a dead end`);
    queue.push(...options);
  }
  assert.ok(visited.has('target'), 'the target is reachable from the start');
}

{
  // The reward is a setup advantage and some XP - deliberately NOT a second
  // source of the big heist payouts.
  useFinalMasterStore.setState({ routePlannerComplete: false, routePlannerBestRisk: null });
  const rbBefore = useStorybookLaneStore.getState().ribbonBucks;

  assert.equal(useFinalMasterStore.getState().completeRoutePlanner(0), true, 'first clear is rewarded');
  assert.equal(useStorybookLaneStore.getState().ribbonBucks, rbBefore, 'planning pays no Rascal Bucks');
  assert.equal(useFinalMasterStore.getState().routePlannerComplete, true);
  assert.equal(useFinalMasterStore.getState().routePlannerBestRisk, 0);

  // Replaying cannot farm the reward.
  assert.equal(useFinalMasterStore.getState().completeRoutePlanner(0), false, 'later clears are not re-rewarded');
  assert.equal(useStorybookLaneStore.getState().ribbonBucks, rbBefore);

  // But a better run still improves the recorded best risk, and a worse one
  // does not spoil it.
  useFinalMasterStore.getState().completeRoutePlanner(3);
  assert.equal(useFinalMasterStore.getState().routePlannerBestRisk, 0, 'a worse run cannot worsen the record');
  useFinalMasterStore.setState({ routePlannerBestRisk: 5 });
  useFinalMasterStore.getState().completeRoutePlanner(2);
  assert.equal(useFinalMasterStore.getState().routePlannerBestRisk, 2, 'a better run improves it');

  // Nonsense risk values are clamped rather than stored.
  useFinalMasterStore.setState({ routePlannerBestRisk: null });
  useFinalMasterStore.getState().completeRoutePlanner(Number.NaN);
  assert.equal(useFinalMasterStore.getState().routePlannerBestRisk, 9, 'a non-finite risk is treated as worst case');
}

console.log('heist bridge and route planner checks passed');
