/**
 * Simulation-cost benchmark for the gameplay overhaul.
 *
 * Deliberately measures WORK DONE rather than reporting tier counts or an FPS
 * number from a container with no GPU. Frame rate here would be a number about
 * this machine; pathfinding calls per simulated second is a number about the
 * game, and it is the one that changes when the tier logic changes.
 *
 * Run: node scripts/overhaul-bench.mjs
 */

const { tierIntervalMs, resolveNpcTier, assignTiers, capabilitiesForTier } = await import('../src/game/npcTiers.ts');
const { skyFor, skyAtMinute, lightingMinute } = await import('../src/game/timeOfDay.ts');
const { weatherAt, forecastFor, RAIN_BUDGET } = await import('../src/game/weather.ts');
const { decideSocialAction, commitSocialAction, resetNpcSocialState } = await import('../src/game/npcSocial.ts');
const { tryClaimRideable, advanceRide, resetRideables } = await import('../src/game/rideables.ts');
const { buildQuestBoard } = await import('../src/game/questBoard.ts');
const { createInitialQuests } = await import('../src/game/quests.ts');
const { createInitialProgression } = await import('../src/game/progression.ts');
const { createInitialCaper, createInitialRivalStory } = await import('../src/game/storyProgression.ts');
const { buildMapView } = await import('../src/game/worldMap.ts');

const FPS = 60;
const SECONDS = 20;
const FRAMES = FPS * SECONDS;

function time(label, iterations, fn) {
  // Warm up so we measure steady state rather than first-call JIT.
  for (let i = 0; i < Math.min(2000, iterations); i += 1) fn(i);
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i += 1) fn(i);
  const nanos = Number(process.hrtime.bigint() - start);
  const perCall = nanos / iterations / 1000; // microseconds
  console.log(`  ${label.padEnd(46)} ${perCall.toFixed(3)} us/call   (${iterations.toLocaleString()} calls)`);
  return perCall;
}

console.log('\nDayKare overhaul - simulation cost\n' + '='.repeat(62));

/* -------------------------------------------------------------------------- */
console.log('\nNPC pathfinding budget (calls per simulated second)');
console.log('-'.repeat(62));

// 13 hub NPCs: 11 children + 2 teachers. Distances chosen to span the tiers the
// way a real hub does - a few near the player, most across the room.
const CAST = Array.from({ length: 13 }, (_, index) => ({
  id: index < 11 ? `kid-${index}` : `teacher-${index}`,
  isTeacher: index >= 11,
  distance: 1.5 + index * 2.6,
  visible: true,
  engaged: false,
}));

const PRESETS = {
  low: { animationDistance: 12, simulationDistance: 26, maxFullySimulatedNpcs: 6, distantNpcIntervalMs: 200 },
  medium: { animationDistance: 18, simulationDistance: 36, maxFullySimulatedNpcs: 9, distantNpcIntervalMs: 120 },
  high: { animationDistance: 26, simulationDistance: 50, maxFullySimulatedNpcs: 14, distantNpcIntervalMs: 80 },
};

for (const [preset, settings] of Object.entries(PRESETS)) {
  const tiered = assignTiers(
    CAST.map((npc) => ({ ...npc })),
    settings,
  );

  // Before: teachers were exempt from tiering entirely, so both pathfound every
  // frame at any distance. Children were tiered.
  let before = 0;
  let after = 0;
  const lastPath = new Map();

  for (let frame = 0; frame < FRAMES; frame += 1) {
    const nowMs = (frame / FPS) * 1000;
    for (const npc of tiered) {
      // assignTiers returns fresh objects carrying only the fields it knows
      // about, so the marker has to come off the id rather than the input.
      const isTeacher = npc.id.startsWith('teacher-');
      // BEFORE
      if (isTeacher) {
        before += 1; // every frame, unconditionally
      } else {
        const interval = tierIntervalMs(npc.tier, settings.distantNpcIntervalMs);
        const key = `b:${npc.id}`;
        if (interval === 0 || nowMs - (lastPath.get(key) ?? -1e9) >= interval) {
          lastPath.set(key, nowMs);
          before += 1;
        }
      }

      // AFTER: everyone is tiered, teachers included.
      if (capabilitiesForTier(npc.tier).pathfinding) {
        const interval = tierIntervalMs(npc.tier, settings.distantNpcIntervalMs);
        const key = `a:${npc.id}`;
        if (interval === 0 || nowMs - (lastPath.get(key) ?? -1e9) >= interval) {
          lastPath.set(key, nowMs);
          after += 1;
        }
      }
    }
  }

  const beforeRate = before / SECONDS;
  const afterRate = after / SECONDS;
  const saved = beforeRate === 0 ? 0 : ((beforeRate - afterRate) / beforeRate) * 100;
  const counts = tiered.reduce((acc, npc) => ({ ...acc, [npc.tier]: (acc[npc.tier] ?? 0) + 1 }), {});
  console.log(
    `  ${preset.padEnd(8)} tiers A/B/C = ${counts.A ?? 0}/${counts.B ?? 0}/${counts.C ?? 0}   ` +
    `before ${beforeRate.toFixed(0).padStart(4)}/s   after ${afterRate.toFixed(0).padStart(4)}/s   ` +
    `-${saved.toFixed(1)}%`,
  );
}

/* -------------------------------------------------------------------------- */
console.log('\nNew per-call costs');
console.log('-'.repeat(62));

time('skyAtMinute (lighting keyframe lerp)', 200_000, (i) => skyAtMinute(540 + (i % 510)));
time('skyFor (lighting + weather grade)', 200_000, (i) => skyFor(540 + (i % 510), i % 2 ? 'rain' : 'clear'));
time('weatherAt (forecast + blend)', 200_000, (i) => weatherAt(1 + (i % 30), 540 + (i % 510), 1234));
time('forecastFor (hash only)', 500_000, (i) => forecastFor(i % 400, 7));

resetNpcSocialState();
time('decideSocialAction (per child per frame)', 200_000, (i) => decideSocialAction({
  name: `kid-${i % 11}`,
  now: i / FPS,
  distance: 1 + (i % 7),
  questActive: false,
  blocked: false,
  allowed: true,
  schedule: 'morning-play',
  friendship: 40,
}));

resetRideables();
tryClaimRideable('bench', [12.4, -1.6], 0);
time('advanceRide (per rider per frame)', 200_000, (i) => advanceRide('bench', 2 + i / FPS, i % 90 === 0, 1.15));
resetRideables();

const boardInput = {
  quests: createInitialQuests(),
  caper: createInitialCaper(),
  rivalStory: createInitialRivalStory(),
  progression: createInitialProgression(),
  juiceStock: 5,
  crackerStock: 5,
  juiceClubCash: 8,
  juiceClubCustomersServed: 3,
  schedule: 'morning-play',
};
time('buildQuestBoard (Journal open only)', 50_000, () => buildQuestBoard(boardInput));
time('buildMapView (Journal map tab only)', 20_000, () => buildMapView({
  zone: 'hub',
  progression: boardInput.progression,
  playerX: 2,
  playerZ: 3,
}));

/* -------------------------------------------------------------------------- */
console.log('\nPer-frame cost of the always-on additions');
console.log('-'.repeat(62));

// The clock ticks 4x/second; lighting is quantised so it is rebuilt far less
// often than that. This is the whole reason the quantum exists.
const rebuildsPerGameHour = 60 / 2;
console.log(`  lighting rebuilds per game hour                 ${rebuildsPerGameHour} (2-minute quantum)`);
console.log(`  lighting rebuilds per REAL minute at 1x         ${(rebuildsPerGameHour / 2).toFixed(0)}`);

// Social decisions run per child per frame, but only while settled.
const socialPerFrame = 11;
const socialCost = time('  (social x11 per frame)', 100_000, (i) => decideSocialAction({
  name: `kid-${i % 11}`,
  now: i / FPS,
  distance: 12,
  questActive: false,
  blocked: false,
  allowed: true,
  schedule: 'morning-play',
  friendship: 40,
}));
console.log(`  social cost per frame (11 children)             ${(socialCost * socialPerFrame).toFixed(2)} us`);
console.log(`  as a share of a 16.7 ms frame                   ${((socialCost * socialPerFrame) / 16_667 * 100).toFixed(3)}%`);

console.log('\nRain particle budget (instances, one draw call)');
console.log('-'.repeat(62));
for (const [kind, budget] of Object.entries(RAIN_BUDGET)) {
  if (budget === 0) continue;
  const low = Math.round(budget * 0.45);
  const medium = Math.round(budget * 0.7);
  console.log(`  ${kind.padEnd(12)} low ${String(low).padStart(4)}   medium ${String(medium).padStart(4)}   high ${String(budget).padStart(4)}`);
}
console.log('  particles:false (Low preset / adaptive)        0 instances, component unmounted');

console.log('');
