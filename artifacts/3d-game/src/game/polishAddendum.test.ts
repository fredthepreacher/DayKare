import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { WINDOW_ART_CLEARANCE, WINDOW_OPENINGS, buildWall, windowOpeningsResolve } from './windows';
import { PLAYER_RADIUS, WORLD_SOLIDS, isWalkable } from './world';
import {
  LEGACY_CARE_COIN_TO_RASCAL_BUCKS, MONETIZATION_CATALOG, formatProductPrice,
} from './monetization';
import { useMonetizationStore } from './monetizationStore';
import { useStorybookLaneStore } from './storybookLaneStore';
import { useGameStore } from './store';
import { CAPER_HEIST_RB, RASCAL_BUCKS_PER_GEM } from './finalMaster';
import { useFinalMasterStore } from './finalMasterStore';
import { homeTierName, ownershipSummary } from './ownership';
import {
  NPC_SLIDE_FREE_PLAY_MAX_GAP_SECONDS, NPC_SLIDE_MIN_GAP_SECONDS, npcSlideGap, npcSlideIsFreePlay,
} from './slide';
import { STORYBOOK_CLOSE_HOLD_SECONDS, STORYBOOK_CLOSE_MINUTE, storybookIsOpen } from './storybookLaneConfig';
import { DAY_END_MINUTE } from './gameClock';

/**
 * The screenshot-grounded polish pass: real windows, the retired Care Coin,
 * the caper's payout, and the ownership summary.
 */

/* ------------------------------- windows ------------------------------- */

{
  assert.equal(windowOpeningsResolve(), true, 'every window is cut into a wall that exists');

  const wall = WORLD_SOLIDS.find((solid) => solid.id === 'main-north-wall')!;
  const { segments, panes } = buildWall(wall, 3);
  const openings = WINDOW_OPENINGS.filter((opening) => opening.solidId === wall.id);
  assert.equal(panes.length, openings.length, 'every opening gets a pane');

  // The wall is a hole punched through, not a panel stuck on: no segment
  // spans an opening at glass height.
  for (const opening of openings) {
    const glassY = opening.sill + opening.height / 2;
    const covering = segments.filter((segment) => {
      const [x, y] = segment.position;
      const halfW = segment.size[0] / 2;
      const halfH = segment.size[1] / 2;
      return Math.abs(x - opening.along) < halfW - 0.01 && Math.abs(y - glassY) < halfH - 0.01;
    });
    assert.equal(covering.length, 0, `nothing fills the opening at ${opening.along} on ${wall.id}`);
  }

  // Sill and lintel are still there, so the hole is a window and not a
  // doorway you could walk through visually.
  const belowSill = segments.some((segment) => segment.position[1] < openings[0].sill);
  const aboveHead = segments.some((segment) => segment.position[1] > openings[0].sill + openings[0].height);
  assert.ok(belowSill, 'a sill runs under the glass');
  assert.ok(aboveHead, 'and a lintel over it');

  // The collider is untouched. You can see through a window; you still
  // cannot walk through one.
  const inTheWindow = new THREE.Vector3(openings[0].along, 0, (wall.minZ + wall.maxZ) / 2);
  assert.equal(isWalkable(inTheWindow, PLAYER_RADIUS), false, 'the window keeps the wall solid');

  // No opening may be cut out from behind a piece of wall art. This is the
  // defect the first cut of the window work shipped: two hallway windows were
  // punched through the wall the attendance chart and the props board hang on,
  // so those frames were left overhanging a hole and read as floating in
  // mid-air. The mounts are scanned out of the source, so a new piece of art
  // hung over a window fails here too.
  const artSource = ['HubDetails.tsx', 'Interactables.tsx', 'Garden.tsx']
    .map((file) => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'))
    .join('\n');
  const MOUNT = /surfaceAnchor=\{\{([^}]*)\}\}[^>]*?size=\{\[([^\]]*)\]\}/g;
  const mounts: { solidId: string; along: number; width: number }[] = [];
  for (const match of artSource.matchAll(MOUNT)) {
    const solidId = /solidId:\s*'([^']+)'/.exec(match[1])?.[1];
    const face = /face:\s*'([^']+)'/.exec(match[1])?.[1];
    const along = Number(/along:\s*(-?[\d.]+)/.exec(match[1])?.[1] ?? Number.NaN);
    const width = Number(match[2].split(',')[0]);
    if (!solidId || face === 'top' || !Number.isFinite(along) || !Number.isFinite(width)) continue;
    mounts.push({ solidId, along, width });
  }
  assert.ok(mounts.length >= 8, 'the artwork scan found the mounts it is meant to check');
  assert.ok(
    mounts.some((mount) => mount.solidId === 'west-boundary'),
    'and it sees the hallway wall in particular',
  );

  for (const mount of mounts) {
    for (const opening of WINDOW_OPENINGS.filter((item) => item.solidId === mount.solidId)) {
      const gap = Math.max(
        opening.along - opening.width / 2 - (mount.along + mount.width / 2),
        mount.along - mount.width / 2 - (opening.along + opening.width / 2),
      );
      assert.ok(
        gap >= WINDOW_ART_CLEARANCE,
        `a window on ${mount.solidId} at ${opening.along} leaves only ${gap.toFixed(2)} m beside the art at ${mount.along}`,
      );
    }
  }

  // A wall with no openings is one piece, so the common case pays nothing.
  const plain = WORLD_SOLIDS.find((solid) => solid.id === 'hall-divider-north')!;
  const plainBuild = buildWall(plain, 3);
  assert.equal(plainBuild.segments.length, 1);
  assert.equal(plainBuild.panes.length, 0);
  assert.equal(plainBuild.segments[0].size[1], 3, 'and it is full height');
}

/* ------------------------------- economy ------------------------------- */

{
  // Care Coins are gone from everything the player can see or spend.
  assert.equal(
    MONETIZATION_CATALOG.some((product) => (product.currency as string) === 'care_coins'),
    false,
    'no product is still priced in Care Coins',
  );
  const earned = MONETIZATION_CATALOG.find((product) => product.currency === 'rascal_bucks')!;
  assert.ok(earned, 'the everyday tier is priced in Rascal Bucks');
  assert.ok(formatProductPrice(earned).endsWith('RB'), 'and says so');

  // A legacy save's Care Coins are converted rather than stranded, once.
  const options = (useMonetizationStore as unknown as {
    persist: { getOptions: () => { merge?: (p: unknown, c: unknown) => unknown } };
  }).persist.getOptions();
  useStorybookLaneStore.setState({ ribbonBucks: 0 });
  const migrated = options.merge!({ careCoins: 22, careGems: 3 }, useMonetizationStore.getState()) as {
    legacyCareCoinsMigrated: boolean;
    careGems: number;
  };
  assert.equal(
    useStorybookLaneStore.getState().ribbonBucks,
    22 * LEGACY_CARE_COIN_TO_RASCAL_BUCKS,
    'a legacy Care Coin balance becomes Rascal Bucks',
  );
  assert.equal(migrated.careGems, 3, 'and Care Gems are untouched');
  assert.equal(migrated.legacyCareCoinsMigrated, true);

  // Loading the migrated save again pays nothing more.
  options.merge!({ careCoins: 22, careGems: 3, legacyCareCoinsMigrated: true }, useMonetizationStore.getState());
  assert.equal(
    useStorybookLaneStore.getState().ribbonBucks,
    22 * LEGACY_CARE_COIN_TO_RASCAL_BUCKS,
    'the conversion runs once, not on every load',
  );

  // A save with no Care Coins at all still loads.
  assert.doesNotThrow(() => options.merge!({}, useMonetizationStore.getState()));

  // And nothing the player can read still names the retired currency.
  const shopStrings = [
    ...MONETIZATION_CATALOG.map((product) => `${product.name} ${product.description}`),
    ...MONETIZATION_CATALOG.map((product) => formatProductPrice(product)),
  ].join(' ');
  assert.equal(/care coin/i.test(shopStrings), false, 'no shop copy still mentions Care Coins');
}

{
  // 10,000 Rascal Bucks buys exactly one Care Gem, and only if you have them.
  useFinalMasterStore.setState({ gems: 0 });
  useStorybookLaneStore.setState({ ribbonBucks: RASCAL_BUCKS_PER_GEM - 1 });
  assert.equal(useFinalMasterStore.getState().convertRbToGem(), false, 'a short balance cannot trade');
  assert.equal(useStorybookLaneStore.getState().ribbonBucks, RASCAL_BUCKS_PER_GEM - 1, 'and nothing is spent');
  assert.equal(useFinalMasterStore.getState().gems, 0);

  useStorybookLaneStore.setState({ ribbonBucks: RASCAL_BUCKS_PER_GEM + 250 });
  assert.equal(useFinalMasterStore.getState().convertRbToGem(), true);
  assert.equal(useStorybookLaneStore.getState().ribbonBucks, 250, 'the trade spends exactly the asking price');
  assert.equal(useFinalMasterStore.getState().gems, 1, 'and mints exactly one gem');

  // A second attempt on the remainder is refused, so a double tap cannot
  // produce two gems from one balance.
  assert.equal(useFinalMasterStore.getState().convertRbToGem(), false);
  assert.equal(useFinalMasterStore.getState().gems, 1);
}

/* ----------------------------- the caper --------------------------------- */

{
  assert.equal(CAPER_HEIST_RB, 2_500, 'the second heist pays the authored amount');

  useGameStore.getState().resetGame();
  useStorybookLaneStore.setState({ ribbonBucks: 0 });
  const game = useGameStore.getState();
  // Drive the caper to its last step, then complete it.
  useGameStore.setState((state) => ({
    caper: {
      ...state.caper,
      step: 'celebrate',
      scouted: true,
      teacherApproved: true,
      patrolObserved: true,
      setupReady: true,
      retrieved: true,
      retrieval: 'parade-banner',
    },
  }));
  const advanced = game.advanceCaper();
  assert.equal(advanced, true, 'the caper completes');
  assert.equal(useGameStore.getState().caper.step, 'complete');
  assert.equal(
    useStorybookLaneStore.getState().ribbonBucks,
    CAPER_HEIST_RB,
    'finishing the caper pays its Rascal Bucks',
  );

  // Advancing again from a completed caper is a no-op, so a reload or a
  // stray input cannot pay twice.
  useGameStore.getState().advanceCaper();
  assert.equal(
    useStorybookLaneStore.getState().ribbonBucks,
    CAPER_HEIST_RB,
    'and a completed caper never pays again',
  );
}

/* --------------------------- Stony Brook hours --------------------------- */

{
  assert.equal(STORYBOOK_CLOSE_MINUTE, 19 * 60 + 45, 'after-hours runs to 7:45 PM');
  assert.equal(DAY_END_MINUTE, STORYBOOK_CLOSE_MINUTE, 'and the day clock reaches it');
  assert.equal(storybookIsOpen(19 * 60 + 44), true, 'one minute before close is still open');
  assert.equal(storybookIsOpen(19 * 60 + 45), false, 'closing time is closed');
  assert.equal(storybookIsOpen(19 * 60 + 35), true, '7:35 PM used to be past closing and is not any more');
  assert.equal(storybookIsOpen(18 * 60 + 45), true, '6:45 PM used to be after hours and is not any more');
  assert.ok(
    STORYBOOK_CLOSE_HOLD_SECONDS >= 10 && STORYBOOK_CLOSE_HOLD_SECONDS <= 25,
    'closing holds for a readable beat before the day turns over',
  );
}

/* ------------------------------ slide cadence ---------------------------- */

{
  for (const schedule of ['outdoor-play', 'recess', 'morning-play']) {
    assert.equal(npcSlideIsFreePlay(schedule), true, `${schedule} is free play`);
  }
  assert.equal(npcSlideIsFreePlay('nap'), false);
  for (let seed = 0; seed < 30; seed += 1) {
    const free = npcSlideGap(seed, true);
    const normal = npcSlideGap(seed, false);
    assert.ok(free <= NPC_SLIDE_FREE_PLAY_MAX_GAP_SECONDS, 'free-play turns come round inside their window');
    assert.ok(free < NPC_SLIDE_MIN_GAP_SECONDS, 'and sooner than the rest of the day');
    assert.ok(normal >= NPC_SLIDE_MIN_GAP_SECONDS);
  }
}

/* ---------------------------- ownership summary -------------------------- */

{
  assert.equal(homeTierName(0), 'Starter Home', 'a tier number is never shown to the player');
  assert.equal(homeTierName(1), 'Comfy Home');
  assert.notEqual(homeTierName(0), homeTierName(2));

  const empty = ownershipSummary({
    ownedStarterHome: false, homeVoucher: false, cribTier: 0, laneItems: [],
    dripOwned: [], dripEquipped: {}, fishingRods: [], tokens: 0, gems: 0, rascalBucks: 0,
  });
  for (const category of empty) {
    assert.equal(category.entries.length, 0, `${category.title} starts empty`);
    assert.ok(category.emptyLabel.length > 0, `${category.title} says so rather than showing nothing`);
  }

  const owner = ownershipSummary({
    ownedStarterHome: true, homeVoucher: false, cribTier: 1,
    laneItems: ['dog', 'tricycle', 'crib'],
    dripOwned: [], dripEquipped: {}, fishingRods: ['purple'],
    tokens: 4, gems: 2, rascalBucks: 1200,
  });
  const byId = Object.fromEntries(owner.map((category) => [category.id, category]));
  assert.equal(byId.property.entries[0].label, 'Wavy Manor');
  assert.ok(byId.property.entries[0].detail.includes('Comfy Home'), 'the home shows its tier by name');
  assert.equal(byId.pets.entries.length, 1, 'an owned dog shows up as owned');
  assert.equal(byId.rides.entries.length, 1, 'and so does the tricycle');
  assert.equal(byId.furnishings.entries.length, 1);
  assert.equal(byId.gear.entries.length, 1, 'gear is read from the expansion state, not a second list');

  // A voucher is surfaced too, so an entitled player is not told they own
  // nothing.
  const entitled = ownershipSummary({
    ownedStarterHome: false, homeVoucher: true, cribTier: 0, laneItems: [],
    dripOwned: [], dripEquipped: {}, fishingRods: [], tokens: 0, gems: 0, rascalBucks: 0,
  });
  assert.equal(entitled[0].entries.length, 1, 'an unclaimed voucher is shown as something the player has');
}

console.log('polish addendum checks passed');
