import assert from 'node:assert/strict';
import {
  CLOCK_VERSION,
  DAY_END_MINUTE,
  DAY_START_MINUTE,
  GAME_MINUTES_PER_REAL_SECOND,
  SCHEDULE_BLOCKS,
  advanceClock,
  blockForMinute,
  createClockState,
  dayProgress,
  formatClock,
  minuteToTimeOfDay,
  normalizeClockState,
  pauseClock,
  resumeClock,
  scheduleIdForMinute,
  serializeClockState,
  setTimeScale,
  startNextDay,
  timeOfDayPhase,
  timeOfDayToMinute,
} from './gameClock';
import {
  QUALITY_PRESETS,
  allPresetSettings,
  applyAdaptiveDegradation,
  assertPreservesGameplay,
  effectivePixelRatio,
  recommendPreset,
  resolvePreset,
  settingsForPreset,
} from './qualityManager';
import {
  advanceLogicalPosition,
  assignTiers,
  capabilitiesForTier,
  resolveNpcTier,
  summarizeTiers,
  tierIntervalMs,
} from './npcTiers';

/** Advance by a number of real seconds in `steps` equal slices. */
const runFor = (clock: ReturnType<typeof createClockState>, realSeconds: number, steps: number) => {
  let current = clock;
  const crossed: string[] = [];
  const slice = realSeconds / steps;
  for (let i = 0; i < steps; i += 1) {
    const tick = advanceClock(current, slice);
    current = tick.clock;
    for (const block of tick.crossed) crossed.push(block.id);
  }
  return { clock: current, crossed };
};

// --- the rate --------------------------------------------------------------

// The whole pacing promise: one game hour every two real minutes.
{
  const start = createClockState(1, DAY_START_MINUTE);
  const { clock } = runFor(start, 120, 480); // 2 real minutes
  assert.ok(
    Math.abs((clock.minute - DAY_START_MINUTE) - 60) < 1e-6,
    `2 real minutes must be exactly 1 game hour, got ${clock.minute - DAY_START_MINUTE} game minutes`,
  );
}
assert.equal(GAME_MINUTES_PER_REAL_SECOND * 60, 30, 'the base rate is 30x real time');

// A full 9:00-17:30 day is 8.5 game hours, so 17 real minutes at 1x.
{
  const { clock } = runFor(createClockState(1, DAY_START_MINUTE), 17 * 60, 2040);
  assert.ok(clock.minute >= DAY_END_MINUTE - 1e-6, 'the daycare day takes 17 real minutes at 1x');
}

// --- frame rate must not change game time ----------------------------------
//
// The property that makes the clock trustworthy: the same wall-clock interval
// produces the same game minute whether the device rendered it in 30 steps or
// 300. A player on a cheap phone gets the same morning as one on a desktop.
{
  const seconds = 100;
  // Real frame intervals: 33ms, 16.7ms, 6.9ms.
  const at30 = runFor(createClockState(), seconds, 30 * seconds).clock.minute;
  const at60 = runFor(createClockState(), seconds, 60 * seconds).clock.minute;
  const at144 = runFor(createClockState(), seconds, 144 * seconds).clock.minute;
  assert.ok(Math.abs(at30 - at60) < 1e-6, '30 FPS and 60 FPS reach the same game minute');
  assert.ok(Math.abs(at60 - at144) < 1e-6, '60 FPS and 144 FPS reach the same game minute');
  assert.ok(Math.abs((at30 - DAY_START_MINUTE) - 50) < 1e-6, '100 real seconds is 50 game minutes at any frame rate');
  // And one big step matches many small ones, once the per-tick cap allows it.
  const single = advanceClock(createClockState(), seconds, seconds).clock.minute;
  assert.ok(Math.abs(single - at60) < 1e-6, 'one large tick equals many small ticks over the same interval');
}

// The per-tick cap itself: a tab that was backgrounded for an hour must not
// fast-forward the whole day the moment it returns. Time it did not spend
// playing is not time it gets to keep.
{
  const capped = advanceClock(createClockState(), 3600);
  assert.ok(
    capped.advancedMinutes <= GAME_MINUTES_PER_REAL_SECOND * 1 + 1e-9,
    'an enormous delta is capped to a single second of real time, not replayed in full',
  );
}

// --- pause -----------------------------------------------------------------

// Pausing stops time...
{
  const paused = pauseClock(createClockState(), 'dialogue');
  const tick = advanceClock(paused, 600, 600);
  assert.equal(tick.advancedMinutes, 0, 'a paused clock advances nothing');
  assert.equal(tick.clock.minute, DAY_START_MINUTE, 'and its minute is unchanged');
  assert.deepEqual(tick.crossed, [], 'and it crosses no boundaries');
}
// ...and resuming does NOT repay it. No catch-up, ever.
{
  let clock = createClockState();
  clock = runFor(clock, 60, 60).clock;             // 1 real minute -> 30 game minutes
  const beforePause = clock.minute;
  assert.ok(Math.abs(beforePause - (DAY_START_MINUTE + 30)) < 1e-6, 'a real minute is half a game hour');

  clock = pauseClock(clock, 'journal');
  clock = runFor(clock, 600, 600).clock;           // ten real minutes, paused
  assert.equal(clock.minute, beforePause, 'no time accrues while paused');

  clock = resumeClock(clock);
  clock = runFor(clock, 60, 60).clock;             // one more real minute
  assert.ok(
    Math.abs(clock.minute - (beforePause + 30)) < 1e-6,
    'resuming continues from where it stopped - it never pays back the pause',
  );
}
assert.equal(pauseClock(createClockState(), 'menu').pauseReason, 'menu', 'a pause records why');
assert.equal(resumeClock(pauseClock(createClockState(), 'menu')).pauseReason, null, 'resuming clears the reason');

// --- fast forward ----------------------------------------------------------
{
  const base = createClockState();
  const minutesOver = (scale: 1 | 2 | 4) =>
    runFor(setTimeScale(base, scale), 60, 60).clock.minute - DAY_START_MINUTE;
  const oneX = minutesOver(1);
  const twoX = minutesOver(2);
  const fourX = minutesOver(4);
  assert.ok(Math.abs(oneX - 30) < 1e-6, '1x gives 30 game minutes per real minute');
  assert.ok(Math.abs(twoX - oneX * 2) < 1e-6, '2x is exactly twice 1x');
  assert.ok(Math.abs(fourX - oneX * 4) < 1e-6, '4x is exactly four times 1x');
  assert.ok(Math.abs(fourX - 120) < 1e-6, '4x turns one real minute into two game hours');
}
assert.equal(setTimeScale(createClockState(), 3 as unknown as 1).timeScale, 1, 'an unsupported scale is refused');
assert.equal(setTimeScale(createClockState(), 8 as unknown as 1).timeScale, 1, 'no uncontrolled debug acceleration');

// --- schedule boundaries ---------------------------------------------------

// A boundary fires exactly once, however slowly it is approached.
{
  const artTime = SCHEDULE_BLOCKS.find((b) => b.id === 'art-time')!;
  const justBefore = artTime.startMinute - 0.4;
  let clock = { ...createClockState(1, justBefore), lastBoundaryMinute: DAY_START_MINUTE };
  const seen: string[] = [];
  for (let i = 0; i < 200; i += 1) {
    const tick = advanceClock(clock, 1);
    clock = tick.clock;
    for (const b of tick.crossed) seen.push(b.id);
  }
  assert.equal(
    seen.filter((id) => id === 'art-time').length,
    1,
    'crossing a boundary announces it exactly once, not once per tick',
  );
}

// Fast-forward across several boundaries in ONE tick reports each once, in order.
{
  const clock = { ...createClockState(1, DAY_START_MINUTE), lastBoundaryMinute: DAY_START_MINUTE, timeScale: 4 as const };
  // 17:30 is 510 game minutes away; at 4x that is 255 real seconds. One tick.
  const tick = advanceClock(clock, 600, 600);
  assert.deepEqual(
    tick.crossed.map((b) => b.id),
    ['morning-play', 'show-and-tell', 'art-time', 'lunch', 'juice-club', 'nap', 'recess', 'outdoor-play', 'pickup'],
    'a single tick spanning the day reports every boundary once, in order',
  );
  assert.ok(tick.reachedDayEnd, 'and reports that the day ended');
}

// Reloading mid-day does not replay the boundaries already lived through.
{
  const midAfternoon = 14 * 60;
  const restored = normalizeClockState(undefined, midAfternoon / 60, 3);
  assert.equal(restored.dayIndex, 3, 'the day survives');
  assert.equal(restored.minute, midAfternoon, 'the minute survives');
  const tick = advanceClock(restored, 1);
  assert.deepEqual(tick.crossed, [], 'resuming at 14:00 does not re-announce morning, art time or juice club');
}

// --- day end ---------------------------------------------------------------
{
  const tick = advanceClock(createClockState(1, DAY_END_MINUTE - 0.1), 600, 600);
  assert.equal(tick.clock.minute, DAY_END_MINUTE, 'the clock holds at the end of the day');
  assert.ok(tick.reachedDayEnd, 'and says so');
  const next = startNextDay(tick.clock);
  assert.equal(next.dayIndex, 2, 'starting the next day increments the day');
  assert.equal(next.minute, DAY_START_MINUTE, 'and returns to the start of the daycare day');
  assert.equal(next.lastBoundaryMinute, DAY_START_MINUTE, 'and re-arms every boundary for the new day');
}

// --- persistence and migration ---------------------------------------------
{
  let clock = createClockState(2, 11 * 60);
  clock = setTimeScale(pauseClock(clock, 'dialogue'), 4);
  const restored = normalizeClockState(serializeClockState(clock), 9, 1);
  assert.equal(restored.minute, 11 * 60, 'the logical minute round-trips');
  assert.equal(restored.dayIndex, 2, 'the day round-trips');
  assert.equal(restored.version, CLOCK_VERSION, 'the clock schema version is recorded');
  assert.equal(restored.timeScale, 1, 'a save never loads still running at 4x');
  assert.equal(restored.paused, false, 'and never loads frozen - the reason for the pause is long gone');
}
// A save that predates the clock entirely.
{
  const preClock = normalizeClockState(undefined, 13.5, 5);
  assert.equal(preClock.minute, 13.5 * 60, 'a pre-clock save migrates from its timeOfDay');
  assert.equal(preClock.dayIndex, 5, 'and keeps its day');
  assert.equal(scheduleIdForMinute(preClock.minute), 'recess', 'and lands in the right block');
}
assert.equal(normalizeClockState('nonsense', 9, 1).minute, DAY_START_MINUTE, 'a corrupt clock falls back rather than throwing');
assert.equal(normalizeClockState({ minute: 99999 }, 9, 1).minute, DAY_END_MINUTE, 'an out-of-range minute is clamped, not trusted');
assert.equal(normalizeClockState({ minute: -5 }, 9, 1).minute, DAY_START_MINUTE, 'a negative minute is clamped too');

// --- conversions and display ------------------------------------------------
assert.equal(timeOfDayToMinute(12.5), 750, 'fractional hours convert to minutes');
assert.equal(minuteToTimeOfDay(750), 12.5, 'and back again');
assert.equal(formatClock(9 * 60), '9:00 AM', 'morning formats readably');
assert.equal(formatClock(12 * 60), '12:00 PM', 'noon is 12 PM, not 0 PM');
assert.equal(formatClock(13 * 60 + 5), '1:05 PM', 'afternoon formats readably');
assert.equal(dayProgress(DAY_START_MINUTE), 0, 'the day starts at 0 progress');
assert.equal(dayProgress(DAY_END_MINUTE), 1, 'and ends at 1');

// Every block boundary agrees with the schedule lookup the game already used.
assert.equal(scheduleIdForMinute(9 * 60), 'breakfast');
assert.equal(scheduleIdForMinute(9 * 60 + 15), 'morning-play');
assert.equal(scheduleIdForMinute(10 * 60 + 15), 'show-and-tell');
assert.equal(scheduleIdForMinute(10 * 60 + 30), 'art-time', 'art time starts at 10:30, as it always did');
assert.equal(scheduleIdForMinute(11 * 60 + 45), 'lunch');
assert.equal(scheduleIdForMinute(12 * 60), 'juice-club', 'juice club starts at noon, as it always did');
assert.equal(scheduleIdForMinute(13 * 60), 'nap');
assert.equal(scheduleIdForMinute(13 * 60 + 30), 'recess');
assert.equal(scheduleIdForMinute(14 * 60), 'outdoor-play');
assert.equal(scheduleIdForMinute(15 * 60 + 30), 'pickup');
assert.equal(scheduleIdForMinute(DAY_END_MINUTE), 'pickup', 'the last block owns the end of the day');
assert.equal(blockForMinute(12 * 60).label, 'Juice Club', 'blocks carry a player-facing label');

// Time-of-day phases, for lighting and music to read later.
assert.equal(timeOfDayPhase(9 * 60), 'morning');
assert.equal(timeOfDayPhase(12 * 60), 'midday');
assert.equal(timeOfDayPhase(14 * 60), 'afternoon');
assert.equal(timeOfDayPhase(16 * 60), 'late-afternoon');
assert.equal(timeOfDayPhase(17 * 60), 'evening');

// --- quality presets --------------------------------------------------------

// THE rule: no preset may remove a mechanic.
for (const [name, settings] of Object.entries(allPresetSettings())) {
  const problems = assertPreservesGameplay(settings);
  assert.deepEqual(problems, [], `preset ${name} must not remove gameplay: ${problems.join('; ')}`);
}
// Including after the adaptive step down, which is where it would slip.
for (const [name, settings] of Object.entries(allPresetSettings())) {
  const problems = assertPreservesGameplay(applyAdaptiveDegradation(settings, true));
  assert.deepEqual(problems, [], `degraded preset ${name} must still not remove gameplay: ${problems.join('; ')}`);
}

// Cost rises monotonically with the preset. If it does not, the names lie.
{
  const low = settingsForPreset('low');
  const medium = settingsForPreset('medium');
  const high = settingsForPreset('high');
  const ultra = settingsForPreset('ultra');
  assert.ok(low.maxPixelRatio <= medium.maxPixelRatio, 'medium renders at least as sharply as low');
  assert.ok(medium.npcAnimationDistance <= high.npcAnimationDistance, 'high animates NPCs at least as far as medium');
  assert.ok(high.maxFullySimulatedNpcs <= ultra.maxFullySimulatedNpcs, 'ultra simulates at least as many NPCs as high');
  assert.equal(low.shadows, false, 'low turns shadows off');
  assert.equal(high.shadows, true, 'high keeps them');
  assert.ok(low.distantNpcIntervalMs >= high.distantNpcIntervalMs, 'low updates distant NPCs less often');
}

// Auto resolves by device, and leans cautious on phones - a phone that starts
// High and collapses to Low is a worse first impression than one that climbs.
{
  const phone = { pixelRatio: 3, cores: 6, memoryGb: 4, touch: true, maxViewportEdge: 844 };
  const weakPhone = { pixelRatio: 2, cores: 4, memoryGb: 2, touch: true, maxViewportEdge: 667 };
  const desktop = { pixelRatio: 2, cores: 12, memoryGb: 32, touch: false, maxViewportEdge: 2560 };
  assert.equal(recommendPreset(phone), 'medium', 'a capable phone starts at medium, not high');
  assert.equal(recommendPreset(weakPhone), 'low', 'a weak phone starts at low');
  assert.equal(recommendPreset(desktop), 'ultra', 'a strong desktop starts at ultra');
  assert.equal(resolvePreset('auto', phone), 'medium', 'auto resolves to a concrete preset');
  assert.equal(resolvePreset('high', phone), 'high', 'an explicit choice is never overridden by the device');
}
assert.equal(effectivePixelRatio(settingsForPreset('ultra'), 1), 1, 'we never render above the display ratio');
assert.equal(effectivePixelRatio(settingsForPreset('low'), 3), 1, 'low caps a 3x display at 1x');
assert.ok(QUALITY_PRESETS.includes('auto'), 'auto is offered');

// Degrading reduces cost without touching the player's chosen preset.
{
  const high = settingsForPreset('high');
  const degraded = applyAdaptiveDegradation(high, false);
  assert.deepEqual(degraded, high, 'no degradation means no change at all');
  const reduced = applyAdaptiveDegradation(high, true);
  assert.ok(reduced.maxPixelRatio <= high.maxPixelRatio, 'degrading lowers resolution');
  assert.equal(reduced.shadows, false, 'degrading drops shadows');
  assert.ok(reduced.maxFullySimulatedNpcs <= high.maxFullySimulatedNpcs, 'degrading narrows the simulation budget');
}

// --- NPC tiers --------------------------------------------------------------

const tierSettings = { animationDistance: 20, simulationDistance: 40, maxFullySimulatedNpcs: 4 };

assert.equal(
  resolveNpcTier({ distance: 5, visible: true, engaged: false, animationDistance: 20, simulationDistance: 40 }),
  'A', 'near and visible is fully simulated');
assert.equal(
  resolveNpcTier({ distance: 5, visible: false, engaged: false, animationDistance: 20, simulationDistance: 40 }),
  'B', 'near but out of view drops to reduced cadence');
assert.equal(
  resolveNpcTier({ distance: 60, visible: true, engaged: false, animationDistance: 20, simulationDistance: 40 }),
  'C', 'beyond the simulation radius is logical only, even if technically on screen');

// Engagement always wins. Downgrading the character you are talking to reads as
// a bug, and there are only ever a handful of them.
assert.equal(
  resolveNpcTier({ distance: 500, visible: false, engaged: true, animationDistance: 20, simulationDistance: 40 }),
  'A', 'an NPC interacting with the player is Tier A at any distance');

// The budget is what saves Morning Circle: everyone is close, so distance alone
// would put the whole cast in Tier A on a phone.
{
  const crowd = Array.from({ length: 12 }, (_, i) => ({
    id: `kid-${i}`, distance: i + 1, visible: true, engaged: false,
  }));
  const tiered = assignTiers(crowd, tierSettings);
  const counts = summarizeTiers(tiered);
  assert.equal(counts.A, 4, 'only the budgeted number stay fully simulated');
  assert.equal(counts.A + counts.B + counts.C, 12, 'and nobody is dropped from the cast');
  const tierA = tiered.filter((n) => n.tier === 'A').map((n) => n.id);
  assert.deepEqual(tierA, ['kid-0', 'kid-1', 'kid-2', 'kid-3'], 'the nearest keep Tier A');
}
// Engaged NPCs are exempt from the budget rather than competing for it.
{
  const crowd = [
    { id: 'talking', distance: 30, visible: false, engaged: true },
    ...Array.from({ length: 8 }, (_, i) => ({ id: `kid-${i}`, distance: i + 1, visible: true, engaged: false })),
  ];
  const tiered = assignTiers(crowd, tierSettings);
  assert.equal(tiered.find((n) => n.id === 'talking')!.tier, 'A', 'the NPC being talked to stays Tier A');
  assert.equal(
    tiered.filter((n) => n.tier === 'A' && !n.engaged).length,
    4,
    'and does not consume one of the budgeted slots',
  );
}

// Every tier keeps the bookkeeping the world depends on. Shared activity
// sessions only advance when participants report arrival, so an NPC culled out
// of reporting would stall a session for everyone - including the player
// standing next to it.
for (const tier of ['A', 'B', 'C'] as const) {
  const caps = capabilitiesForTier(tier);
  assert.equal(caps.simulatesSchedule, true, `tier ${tier} still follows the schedule`);
  assert.equal(caps.reportsArrival, true, `tier ${tier} still reports arrival, or it would stall shared sessions`);
}
assert.equal(capabilitiesForTier('C').animation, false, 'tier C stops paying for animation');
assert.equal(capabilitiesForTier('C').pathfinding, false, 'and for pathfinding');
assert.equal(capabilitiesForTier('A').socialReactions, true, 'tier A reacts socially');

// Cadence rises as the tier falls, and nothing ever stops entirely.
{
  assert.equal(tierIntervalMs('A', 120), 0, 'tier A runs every frame');
  assert.ok(tierIntervalMs('B', 120) > 0, 'tier B is throttled');
  assert.ok(tierIntervalMs('C', 120) > tierIntervalMs('B', 120), 'tier C is throttled further');
  assert.ok(tierIntervalMs('C', 120) <= 1000, 'but never so far that it looks frozen');
}

// A distant NPC still walks - it is neither teleported nor frozen.
{
  const start: [number, number, number] = [0, 0, 0];
  const target: [number, number, number] = [10, 0, 0];
  const mid = advanceLogicalPosition(start, target, 2, 1);
  assert.ok(mid[0] > 0 && mid[0] < 10, 'a distant NPC moves toward its destination rather than snapping there');
  assert.equal(mid[1], 0, 'and stays on the ground');
  const arrived = advanceLogicalPosition(start, target, 100, 1);
  assert.deepEqual(arrived, [10, 0, 0], 'and arrives exactly, without overshooting');
  assert.deepEqual(
    advanceLogicalPosition(target, target, 5, 1), [10, 0, 0],
    'an NPC already at its destination stays put',
  );
}

console.log('clock, quality and NPC tier tests passed');

// Padding, because a continuously running clock lands on every minute and the
// previous formatter rendered 9:05 as "9:5". It was invisible only because time
// used to move in half hours.
assert.equal(formatClock(9 * 60 + 1), '9:01 AM', 'single-digit minutes are padded');
assert.equal(formatClock(9 * 60 + 5), '9:05 AM', 'and so are five-past minutes');
assert.equal(formatClock(16 * 60 + 9), '4:09 PM', 'in the afternoon too');

// --- reserved 4E metadata ---------------------------------------------------
//
// musicContext and lightingProfile carry real values and are read by nothing.
// A comment cannot enforce that, so this does: it scans the game source and
// fails if any file outside gameClock.ts and this test starts consuming them.
//
// The point is not to forbid the work. It is to make sure that when the
// soundtrack or a lighting cycle IS built, it happens in the phase where its
// behaviour gets designed and tested - rather than arriving as a quiet
// one-line follow-up to the clock.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RESERVED_FIELDS = ['musicContext', 'lightingProfile'] as const;
const ALLOWED_FILES = ['gameClock.ts', 'clock.test.ts'];

const gameDir = dirname(fileURLToPath(import.meta.url));
const sourceRoot = dirname(gameDir); // .../src

const walk = (dir: string): string[] => readdirSync(dir).flatMap((entry) => {
  const full = join(dir, entry);
  if (statSync(full).isDirectory()) return walk(full);
  return /\.(ts|tsx)$/.test(entry) ? [full] : [];
});

for (const field of RESERVED_FIELDS) {
  const consumers = walk(sourceRoot).filter((file) => {
    if (ALLOWED_FILES.includes(file.split(/[\\/]/).pop()!)) return false;
    return readFileSync(file, 'utf8').includes(field);
  });
  assert.deepEqual(
    consumers.map((f) => f.replace(sourceRoot, 'src')),
    [],
    `${field} is reserved 4E metadata and must stay inert; wire it in the phase that designs it, not as a follow-up to the clock`,
  );
}

// The table stays complete, so the later phase inherits a described schedule
// rather than four blocks and a gap.
for (const block of SCHEDULE_BLOCKS) {
  assert.ok(block.musicContext, `${block.id} declares its musical intent for 4E`);
  assert.ok(block.lightingProfile, `${block.id} declares its lighting intent for 4E`);
}
