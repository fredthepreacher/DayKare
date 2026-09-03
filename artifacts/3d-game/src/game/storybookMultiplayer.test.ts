import assert from 'node:assert/strict';
import { ONLINE_MAX_PLAYERS } from './modeStore';
import { validateNetworkTransform } from './multiplayer';
import {
  ICE_CREAM_RECOVERY_SECONDS,
  STORYBOOK_CLOSE_MINUTE,
  STORYBOOK_OPEN_MINUTE,
  storybookIsOpen,
} from './storybookLaneConfig';
import { normalizeStorybookSave, useStorybookLaneStore } from './storybookLaneStore';
import { useGameStore } from './store';

assert.equal(STORYBOOK_CLOSE_MINUTE - STORYBOOK_OPEN_MINUTE, 120, 'Storybook Lane is open for two game hours, 5:30 PM to 7:30 PM');
assert.equal(STORYBOOK_CLOSE_MINUTE, 19 * 60 + 30, 'and it closes at 7:30 PM');
assert.equal(storybookIsOpen(STORYBOOK_OPEN_MINUTE - 1), false);
assert.equal(storybookIsOpen(STORYBOOK_OPEN_MINUTE), true);
assert.equal(storybookIsOpen(STORYBOOK_CLOSE_MINUTE), false);
assert.equal(ONLINE_MAX_PLAYERS, 20, 'room capacity is configurable at twenty players');

assert.deepEqual(normalizeStorybookSave({ ribbonBucks: -50, ownedItems: ['dog', 'forged', 'dog'], cribTier: 99 }), {
  ribbonBucks: 0,
  ownedItems: ['dog'],
  cribTier: 3,
});

useStorybookLaneStore.setState({ ribbonBucks: 2_500, ownedItems: [], cribTier: 0, sessionScoops: 0, recoveringUntil: 0, lastFlavor: null });
assert.equal(useStorybookLaneStore.getState().purchaseItem('tricycle'), 'purchased');
assert.equal(useStorybookLaneStore.getState().ribbonBucks, 0);
assert.equal(useStorybookLaneStore.getState().purchaseItem('tricycle'), 'owned');
assert.equal(useStorybookLaneStore.getState().purchaseItem('dog'), 'insufficient');
assert.equal(useStorybookLaneStore.getState().ribbonBucks, 0, 'failed and duplicate purchases never make RB negative');

useStorybookLaneStore.setState({ ribbonBucks: 500, ownedItems: [], sessionScoops: 0, recoveringUntil: 0, lastFlavor: null });
const now = 1_000_000;
for (let scoop = 1; scoop <= 7; scoop += 1) {
  assert.equal(useStorybookLaneStore.getState().buyIceCream(now), 'purchased', `scoop ${scoop} is safe`);
}
assert.equal(useStorybookLaneStore.getState().buyIceCream(now), 'sick', 'the eighth scoop triggers the harmless gag');
assert.equal(useStorybookLaneStore.getState().recoveringUntil, now + ICE_CREAM_RECOVERY_SECONDS * 1_000);
assert.equal(useStorybookLaneStore.getState().buyIceCream(now + 1), 'recovering');
useStorybookLaneStore.getState().recover();
assert.equal(useStorybookLaneStore.getState().sessionScoops, 0);

useGameStore.getState().resetGame();
useGameStore.setState((state) => ({
  progression: { ...state.progression, activityRuns: { ...state.progression.activityRuns, 'rainbow-tidy-up': 3 } },
}));
useGameStore.getState().setTimeOfDay(17.5);
assert.equal(useGameStore.getState().enterStorybookLane(), true, 'the prepared route opens at 5:30 PM');
useGameStore.getState().completeZoneTransition();
assert.equal(useGameStore.getState().zone, 'storybook');
// The day cannot be ended early - 6:30 PM is now mid-evening, not closing.
useGameStore.getState().setTimeOfDay(18.5);
assert.equal(useGameStore.getState().finishDay(), false, 'the day does not end before 7:30 PM');
useGameStore.getState().setTimeOfDay(19.5);
assert.equal(useGameStore.getState().finishDay(), true);
assert.equal(useGameStore.getState().zone, 'hub');
assert.equal(useGameStore.getState().timeOfDay, 9);

for (let index = 0; index < ONLINE_MAX_PLAYERS; index += 1) {
  const transform = validateNetworkTransform({
    id: `player-${index}`,
    name: `Kid ${index}`,
    color: '#33cccc',
    zone: index % 2 ? 'garden' : 'hub',
    position: [index, 0, index],
    rotationY: index / 10,
    animation: 'walking',
    hasDog: index % 3 === 0,
    vehicle: index % 4 === 0 ? 'tricycle' : 'none',
    updatedAt: now,
  });
  assert.ok(transform, `player ${index + 1} transform validates`);
  assert.equal(transform.hasDog, index % 3 === 0);
}
assert.equal(validateNetworkTransform({ id: 'bad', position: ['x', 0, 0], zone: 'hub', rotationY: 0 }), null);

console.log('DayKare Storybook Lane and multiplayer tests passed.');
