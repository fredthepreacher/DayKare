import assert from 'node:assert/strict';
import { useGameStore } from './store';
import {
  GUMMY_GROWTH_MINUTES, GUMMY_HARVEST_SIZE, GUMMY_SEEDS_PER_PLANTING,
  GUMMY_SEEDS_RETURNED_PER_HARVEST, absoluteGameMinute, cropIsReady,
} from './gardenEconomy';

/**
 * The Gummy Drop loop.
 *
 * Two complaints had one shape between them: planting appeared not to work,
 * and Gummy Drops appeared to regenerate on their own. Both came from the
 * bed costing nothing to plant. Nothing was consumed, so a harvested bed
 * could be refilled forever; and seed packets had a sink (the guided
 * planting activity, 3 a go) but no source at all, so once the starting
 * twelve were gone the guided round silently refused - while the dialogue
 * still said "Seeds planted!" either way.
 */

const inGarden = (seedPackets: number) => {
  useGameStore.getState().resetGame();
  useGameStore.setState((state) => ({
    zone: 'garden',
    zoneTransitioning: false,
    expansion: { ...state.expansion, seedPackets },
  }));
};

const growTheCrop = () => {
  const state = useGameStore.getState();
  const planted = state.gummyCrop.plantedAt ?? 0;
  // Wind the clock to the moment the crop is ready, without touching the crop.
  const day = Math.floor(planted / 1440) + 1;
  const minute = (planted % 1440) + GUMMY_GROWTH_MINUTES;
  useGameStore.setState({
    dayNumber: day + Math.floor(minute / 1440),
    clock: { ...state.clock, minute: minute % 1440 },
  });
};

{
  // Planting spends a seed packet.
  inGarden(4);
  assert.equal(useGameStore.getState().plantGummyDrops(0), 'planted');
  assert.equal(
    useGameStore.getState().expansion.seedPackets,
    4 - GUMMY_SEEDS_PER_PLANTING,
    'planting consumes a seed packet',
  );
  assert.notEqual(useGameStore.getState().gummyCrop.plantedAt, null);

  // A bed already growing cannot be planted again.
  assert.equal(useGameStore.getState().plantGummyDrops(0), 'already-growing');
  assert.equal(useGameStore.getState().expansion.seedPackets, 3, 'and a refused planting spends nothing');
}

{
  // With no seeds, planting refuses and says why - it does not silently
  // pretend to have worked.
  inGarden(0);
  assert.equal(useGameStore.getState().plantGummyDrops(0), 'needs-seeds');
  assert.equal(useGameStore.getState().gummyCrop.plantedAt, null, 'and nothing is planted');
}

{
  // Outside the garden nothing happens at all.
  inGarden(4);
  useGameStore.setState({ zone: 'hub' });
  assert.equal(useGameStore.getState().plantGummyDrops(0), 'wrong-place');
  assert.equal(useGameStore.getState().expansion.seedPackets, 4);
}

{
  // The full loop: plant, wait, harvest, and the bed is empty again.
  inGarden(4);
  useGameStore.getState().plantGummyDrops(0);
  assert.equal(useGameStore.getState().harvestGummyDrops(0), 'not-ready', 'a crop cannot be rushed');
  growTheCrop();
  const now = absoluteGameMinute(useGameStore.getState().dayNumber, useGameStore.getState().clock.minute);
  assert.equal(cropIsReady(useGameStore.getState().gummyCrop, now), true);

  const before = useGameStore.getState().expansion.seedPackets;
  assert.equal(useGameStore.getState().harvestGummyDrops(0), 'harvested');
  assert.equal(useGameStore.getState().gummyCrop.gummyDrops, GUMMY_HARVEST_SIZE);
  assert.equal(useGameStore.getState().gummyCrop.plantedAt, null, 'the bed is empty after a harvest');
  assert.equal(
    useGameStore.getState().expansion.seedPackets,
    before + GUMMY_SEEDS_RETURNED_PER_HARVEST,
    'and the harvest hands seed packets back, so the loop does not dead-end',
  );

  // Harvesting an empty bed yields nothing. This is the "regenerating" bug:
  // the drops must not keep arriving without another planting.
  const dropsAfterHarvest = useGameStore.getState().gummyCrop.gummyDrops;
  assert.equal(useGameStore.getState().harvestGummyDrops(0), 'nothing-planted');
  assert.equal(
    useGameStore.getState().gummyCrop.gummyDrops,
    dropsAfterHarvest,
    'an empty bed cannot be harvested again for free',
  );
}

{
  // A cycle nets +1 packet, so the loop sustains itself - but every crop
  // still costs a seed, so drops are never free.
  inGarden(1);
  for (let cycle = 0; cycle < 3; cycle += 1) {
    assert.equal(useGameStore.getState().plantGummyDrops(0), 'planted', `cycle ${cycle} plants`);
    growTheCrop();
    assert.equal(useGameStore.getState().harvestGummyDrops(0), 'harvested', `cycle ${cycle} harvests`);
  }
  assert.equal(useGameStore.getState().gummyCrop.gummyDrops, GUMMY_HARVEST_SIZE * 3);
  assert.equal(
    useGameStore.getState().expansion.seedPackets,
    1 + 3 * (GUMMY_SEEDS_RETURNED_PER_HARVEST - GUMMY_SEEDS_PER_PLANTING),
    'three cycles leave the player with more seed than they started, but only by working for it',
  );
}

{
  // The two beds are independent, and each costs its own seed.
  inGarden(2);
  assert.equal(useGameStore.getState().plantGummyDrops(0), 'planted');
  assert.equal(useGameStore.getState().plantGummyDrops(1), 'planted');
  assert.equal(useGameStore.getState().expansion.seedPackets, 0, 'two beds cost two packets');
  assert.equal(useGameStore.getState().plantGummyDrops(0), 'already-growing');
}

console.log('garden loop checks passed');
