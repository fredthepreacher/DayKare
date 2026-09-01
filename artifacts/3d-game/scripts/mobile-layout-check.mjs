/**
 * Mobile touch-control layout check, against a real built page.
 *
 * Written because moving Sprint and Crouch to the right thumb put them into a
 * band already occupied by Center Camera and the interaction button - and in
 * landscape the first attempt landed directly on Center Camera. Reasoning about
 * `bottom: 84px` in a stylesheet did not catch that; measuring the rendered
 * rectangles did, immediately.
 *
 * Playwright is deliberately NOT a dependency of this repo. Adding it would make
 * every CI install pull browser binaries, which is a real cost for a check that
 * runs occasionally; install it ad hoc when you want to run this:
 *
 *   pnpm add -D playwright -w        # and PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 in CI
 *   pnpm --filter @workspace/3d-game build
 *   (cd artifacts/3d-game/dist/public && python3 -m http.server 8099 &)
 *   URL=http://127.0.0.1:8099/ node artifacts/3d-game/scripts/mobile-layout-check.mjs
 *
 * Exits non-zero on any overlap, so it can gate a build when it is run.
 */

import { chromium, devices } from 'playwright';

const URL = process.env.URL ?? 'http://127.0.0.1:8099/';
const SELECTORS = [
  '.daykare-touch-movement', '.daykare-touch-actions',
  '.daykare-touch-recenter', '.daykare-touch-interact',
  '.daykare-hud-left', '.daykare-hud-right',
];

function overlaps(a, b) {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

const results = [];
for (const [label, profile] of [
  ['iPhone 13 portrait', devices['iPhone 13']],
  ['iPhone 13 landscape', devices['iPhone 13 landscape']],
  ['Pixel 5 portrait', devices['Pixel 5']],
]) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ ...profile });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(9000);

  // Try to get into gameplay so the touch UI mounts.
  for (const name of ['Story', 'Play', 'Continue', 'New Game', 'Start']) {
    const btn = page.getByRole('button', { name: new RegExp(name, 'i') }).first();
    if (await btn.count() && await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(3500);
    }
  }
  await page.waitForTimeout(6000);

  const rects = await page.evaluate((sels) => {
    const out = {};
    for (const s of sels) {
      const el = document.querySelector(s);
      if (!el) { out[s] = null; continue; }
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out[s] = { left: r.left, top: r.top, right: r.right, bottom: r.bottom,
                 w: r.width, h: r.height, display: cs.display, visible: r.width > 0 && r.height > 0 };
    }
    return out;
  }, SELECTORS);

  const present = Object.entries(rects).filter(([, r]) => r && r.visible);
  const collisions = [];
  for (let i = 0; i < present.length; i += 1) {
    for (let j = i + 1; j < present.length; j += 1) {
      if (overlaps(present[i][1], present[j][1])) collisions.push(`${present[i][0]} x ${present[j][0]}`);
    }
  }
  const actions = rects['.daykare-touch-actions'];
  results.push({ label, viewport: page.viewportSize(), present: present.map(([s]) => s),
                 actions, collisions, errors: errors.slice(0, 3) });
  await browser.close();
}

for (const r of results) {
  console.log(`\n=== ${r.label} (${r.viewport.width}x${r.viewport.height}) ===`);
  console.log('  mounted:', r.present.length ? r.present.join(', ') : '(none - stayed on front end)');
  if (r.actions) {
    console.log(`  sprint/crouch cluster: ${Math.round(r.actions.w)}x${Math.round(r.actions.h)} at right=${Math.round(r.viewport.width - r.actions.right)}px bottom=${Math.round(r.viewport.height - r.actions.bottom)}px`);
    console.log(`  on right half: ${r.actions.left > r.viewport.width / 2}`);
  } else {
    console.log('  sprint/crouch cluster: not mounted');
  }
  console.log('  overlaps:', r.collisions.length ? r.collisions.join(' | ') : 'none');
  if (r.errors.length) console.log('  page errors:', r.errors.join(' | '));
}

const failed = results.filter((r) => r.collisions.length > 0);
if (failed.length) {
  console.error(`\nFAIL: ${failed.length} viewport(s) have overlapping touch controls.`);
  process.exit(1);
}
const missing = results.filter((r) => !r.actions);
if (missing.length === results.length) {
  console.error('\nFAIL: the sprint/crouch cluster never mounted on any viewport.');
  process.exit(1);
}
console.log('\nOK: no overlapping touch controls on any tested viewport.');
