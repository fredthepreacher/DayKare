import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  HOME_BASEMENT_Y, HOME_BASEMENT_LANDING, HOME_SPAWN, HOME_UPPER_LANDING, HOME_UPPER_Y,
  PLAYER_RADIUS, STONY_BROOK_DOOR_RETURN, STORYBOOK_SPAWN, groundHeightAt, isWalkable,
  type GameZone,
} from './world';
import { CAFETERIA_SEATS } from './DaycareRoutineWorld';
import { HEIST_BOARD_APPROACH, MISS_LESLIE_POSITION } from './FinalMasterWorld';
import { SLIDE_QUEUE_POINT } from './slide';

/**
 * Connected-reachability audit.
 *
 * A point being walkable says only that the player would not be inside a
 * wall if they were teleported there. It says nothing about whether they
 * can get there on foot, which is the property that actually matters and
 * the one that a per-point check cannot see: a sealed room is walkable
 * throughout and reachable from nowhere.
 *
 * So this floods the zone from the spawn and asserts that every place the
 * game sends the player is in the flooded set.
 */

const STEP = 0.25;

function floodFrom(seed: readonly [number, number, number], zone: GameZone, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  const key = (x: number, z: number) => `${x},${z}`;
  const snap = (value: number) => Math.round(value / STEP);
  const probe = new THREE.Vector3();
  const walkable = (gx: number, gz: number) => {
    probe.set(gx * STEP, 0, gz * STEP);
    if (probe.x < bounds.minX || probe.x > bounds.maxX || probe.z < bounds.minZ || probe.z > bounds.maxZ) return false;
    return isWalkable(probe, PLAYER_RADIUS, [], zone);
  };
  const start: [number, number] = [snap(seed[0]), snap(seed[2])];
  assert.ok(walkable(start[0], start[1]), `${zone} flood seed ${seed.join(',')} must itself be walkable`);
  const seen = new Set<string>([key(...start)]);
  const queue: [number, number][] = [start];
  while (queue.length) {
    const [gx, gz] = queue.pop() as [number, number];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = gx + dx;
      const nz = gz + dz;
      const id = key(nx, nz);
      if (seen.has(id) || !walkable(nx, nz)) continue;
      seen.add(id);
      queue.push([nx, nz]);
    }
  }
  return {
    size: seen.size,
    /** How many flooded cells fall inside an X band, in square metres. */
    areaBetween(minX: number, maxX: number) {
      let cells = 0;
      for (const id of seen) {
        const x = Number(id.split(',')[0]) * STEP;
        if (x >= minX && x <= maxX) cells += 1;
      }
      return cells * STEP * STEP;
    },
    /** True when the target, or a cell within one step of it, was flooded. */
    reaches(target: readonly number[]) {
      const tx = snap(target[0]);
      const tz = snap(target[2]);
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          if (seen.has(key(tx + dx, tz + dz))) return true;
        }
      }
      return false;
    },
  };
}

/* ------------------------------- the hub ------------------------------- */

const hub = floodFrom([0, 0, 0], 'hub', { minX: -17, maxX: 17, minZ: -17, maxZ: 17 });

const HUB_TARGETS: [string, readonly number[]][] = [
  ['cafeteria entrance', [-12, 0, 11.4]],
  ...CAFETERIA_SEATS.map((seat) => [`cafeteria ${seat.id}`, seat.position] as [string, readonly number[]]),
  ['Miss Leslie', MISS_LESLIE_POSITION],
  ['Heist Board', HEIST_BOARD_APPROACH],
  // Both practice minigames are played at the board, so the board's own
  // approach is the station both of them need.
  ['heist planning desk', [10.2, 0, 9.7]],
  ['Tech Market', [9.3, 0, 13.4]],
  ['Wavy slide queue', SLIDE_QUEUE_POINT],
  // The route gates are solids you stand in front of, so the target is
  // the approach rather than the gate itself.
  ['Storybook Lane gate approach', [-14.2, 0, -11.9]],
  ['Garden District gate approach', [14.2, 0, -11.9]],
  ['binky storage', [-12.8, 0, 13.2]],
];

for (const [label, target] of HUB_TARGETS) {
  assert.ok(hub.reaches(target), `${label} must be reachable on foot from the classroom, not merely stand-able`);
}

/* ---------------------------- Storybook Lane ---------------------------- */

const lane = floodFrom(STORYBOOK_SPAWN, 'storybook', { minX: -23, maxX: 23, minZ: -23, maxZ: 23 });

assert.ok(lane.reaches(STONY_BROOK_DOOR_RETURN), 'the front door of the owned home must be reachable from the Stony Brook entrance');
assert.ok(lane.reaches([-13, 0, -6.5]), 'the front walkway must be walkable, not blocked by the hedges');
assert.ok(lane.reaches([-6.4, 0, -4.6]), 'Mr. Brooks must be reachable on his patrol');
assert.ok(lane.reaches([5.6, 0, -3.6]), 'Ms. Hartwell must be reachable on her patrol');
assert.ok(!lane.reaches([-13, 0, -14]), 'and the solid mansion shell is not something to walk into');

/* ------------------------------ the home ------------------------------ */

const home = floodFrom(HOME_SPAWN, 'home', { minX: -27, maxX: 19, minZ: -9, maxZ: 9 });

const HOME_TARGETS: [string, readonly number[]][] = [
  ['entry', HOME_SPAWN],
  ['front door', [-1, 0, 7.4]],
  ['living room', [-7, 0, 4]],
  ['kitchen', [-6.5, 0, -5]],
  ['dining area', [-1.4, 0, -1.4]],
  ['bathroom 1', [-1, 0, -5.5]],
  ['up-stairs corridor', [4, 0, 0]],
  ['upstairs landing', HOME_UPPER_LANDING],
  ['upstairs hall', [7.4, 0, 5]],
  ['primary bedroom', [13, 0, 5.2]],
  ['flex room', [13.4, 0, -1]],
  ['bathroom 2', [13.4, 0, -5.4]],
  ['down-stairs corridor', [-12, 0, 0]],
  ['basement landing', HOME_BASEMENT_LANDING],
  ['rec room', [-18, 0, 3]],
  ['storage nook', [-24, 0, 0]],
];

for (const [label, target] of HOME_TARGETS) {
  assert.ok(home.reaches(target), `${label} must be reachable on foot from the front door — every floor of a bought house has to be walkable`);
}

// The three storeys are laid out end to end rather than stacked, so a
// regression that walls off a wing shows up as a collapse in that wing's
// reachable floor area, which a single point check would never notice.
// A wall dropped in the wrong place halves one of these long before it
// makes any named target unreachable.
const basementArea = home.areaBetween(-27, -14);
const groundArea = home.areaBetween(-10, 2);
const upperArea = home.areaBetween(6, 19);
assert.ok(basementArea > 90, `the basement should offer real floor space, not ${basementArea.toFixed(0)} m2`);
assert.ok(groundArea > 86, `the ground floor should offer real floor space, not ${groundArea.toFixed(0)} m2`);
assert.ok(upperArea > 88, `the upper floor should offer real floor space, not ${upperArea.toFixed(0)} m2`);

// The shell has to be sealed. The front doorway is a gap in the south
// wall filled by the door solid; without it the player simply walks out
// of their house into empty space, and no target assertion would notice.
assert.ok(!home.reaches([-1, 0, 8]), 'the front door seals its own doorway - without a solid there the player stands out in the gap');
assert.ok(!home.reaches([4, 0, 6]), 'the dead space beside the stair corridor stays sealed off');
assert.ok(!home.reaches([-20, 0, 8]), 'and so does the space behind the basement wall');

/* ------------------------- stairs are continuous ------------------------- */

assert.equal(groundHeightAt(-20, 'home'), HOME_BASEMENT_Y, 'the basement floor sits below the ground floor');
assert.equal(groundHeightAt(-1, 'home'), 0, 'the ground floor is the zero datum');
assert.equal(groundHeightAt(13, 'home'), HOME_UPPER_Y, 'the upper floor sits above it');
assert.equal(groundHeightAt(-12, 'home'), HOME_BASEMENT_Y / 2, 'the basement stair is a straight ramp');
assert.equal(groundHeightAt(4, 'home'), HOME_UPPER_Y / 2, 'and so is the upper stair');
assert.equal(groundHeightAt(4, 'hub'), 0, 'every other zone is flat, and pays nothing for the home having stairs');

// No step in the ramp is tall enough to read as a ledge, at any X.
let previous = groundHeightAt(-27, 'home');
for (let x = -27; x <= 19; x += 0.1) {
  const height = groundHeightAt(x, 'home');
  assert.ok(Math.abs(height - previous) < 0.14, `the floor height jumps ${Math.abs(height - previous).toFixed(2)} m at x=${x.toFixed(1)}`);
  previous = height;
}

console.log('reachability audit passed');
