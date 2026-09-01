# DayKare

A stylized 3D open-world daycare game. You play a toddler in a living daycare — exploring, running errands and quests, building reputation, running the Juice Club, and pulling off supervised, family-friendly capers.

The current feature branch also contains Storybook Lane, a 5:30–6:30 PM social
neighborhood, and an optional authenticated 20-player friends room. Setup and
architecture are documented in [`docs/STORYBOOK_MULTIPLAYER.md`](docs/STORYBOOK_MULTIPLAYER.md).

The playable game is a browser 3D app (React + Vite + Three.js) with browser-side persistence. It needs no database, no API server and no multiplayer server to run.

## Quick start

Requires Node 22+ and pnpm 10+ (`corepack enable` will provide pnpm).

```bash
pnpm install --frozen-lockfile

# run the game
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/3d-game run dev
```

`BASE_PATH` is **required** — it decides every asset URL in the build, and a wrong value fails silently at runtime, so a missing one fails loudly at build time. Use `/` for a root deployment. `PORT` is optional and only affects the dev and preview servers (default `5173`); a production build serves nothing, so it does not need one.

## Checks

```bash
pnpm run typecheck                                                # all packages
pnpm --filter @workspace/3d-game run test                         # foundation + audio + cloud sync suites
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/3d-game run build  # production build

# browser regression suite — needs a `chromium` on PATH and the dev server running
DAYKARE_TEST_URL=http://127.0.0.1:5173/ pnpm --filter @workspace/3d-game run test:browser
```

The browser suite renders through SwiftShader and asserts on captured frame counts and elapsed sampling time, so it needs a reasonably fast machine. On a slow or throttled runner it fails on those timing assertions even when nothing is wrong with the game — and the assertion it stops at varies between runs. Treat a red browser suite as a prompt to look, not as proof of a defect, until those thresholds are made frame-budget aware.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and every push to `main`.

- **Verify** (blocking) — frozen-lockfile install, typecheck, foundation and audio tests, production build. Runs on **both Ubuntu and Windows**. The Windows job is not decorative: three separate Linux-only bugs shipped in this repository (a `sh -c` preinstall hook, 79 overrides that pruned every non-Linux binary, and two modules whose names differed only in case), and none of them could fail on a Linux runner.
- **Browser smoke** (informational, `continue-on-error`) — the SwiftShader suite. It does not block merges while its timing assertions remain environment-sensitive.

## Repository layout

pnpm workspace monorepo.

| Path | Package | What it is |
|---|---|---|
| `artifacts/3d-game` | `@workspace/3d-game` | **The game.** Everything that matters lives here. |
| `artifacts/daykare-playtime` | `@workspace/daykare-playtime` | A separate 2D design-system artifact. Not part of the playable game. |
| `artifacts/mockup-sandbox` | `@workspace/mockup-sandbox` | UI mockup scratch space. |
| `artifacts/api-server` | `@workspace/api-server` | Express skeleton (one health route). **Not used by the game.** |
| `lib/db` | `@workspace/db` | Drizzle schema scaffold. **Not used by the game.** |
| `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` | | OpenAPI/Zod/codegen scaffold. **Not used by the game.** |
| `lib/cloud-sync` | `@workspace/cloud-sync` | Supabase adapter plus the pure sync logic (hashing, conflict rules, migration state machine, settings split). Pure parts are unit-tested without a network. |
| `scripts` | `@workspace/scripts` | Workspace helper scripts. |

Inside `artifacts/3d-game/src/game/`:

- `store.ts` — Story Mode state and the persisted save
- `modeStore.ts` — the Story ⇄ Online boundary and the Online preview state
- `world.ts`, `navigation.ts` — collision, walkability, routing
- `NPCs.tsx`, `npcActivities.ts`, `teacherInterventions.ts`, `activitySessions.ts` — living-daycare behaviour
- `TouchControls.tsx`, `touchInput.ts`, `cameraRig.ts`, `cameraInput.ts` — mobile multitouch and camera
- `storyProgression.ts` — story chapters, caper state machine, district progress
- `settingsStore.ts` — account-synced vs device-local settings
- `cloudSync.ts` — cloud sync orchestration; started after first paint, never on the frame path
- `foundations.test.ts`, `audio.test.ts`, `cloudSync.test.ts` — deterministic test suites

## Cloud sync (Phase 3)

Optional. DayKare is fully playable with no account and no configuration — that is the default, not a degraded mode.

```bash
# .env.local (never commit real values)
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

Both are required together; setting only one logs an error and falls back to local-only. `SUPABASE_SERVICE_ROLE_KEY` must **never** be set in a Vite/client environment — it belongs to server-side code only, arriving in Phase 7.

Behaviour:

- **Anonymous by default.** No email, no birth date, no name, no social login. A guardian-controlled identity can be attached later to the *same* auth user, so linking never moves, replaces or duplicates a save.
- **Optimistic concurrency, never last-write-wins.** Each write carries the revision it expects. If another device moved the save on, the write is refused and a conflict is reported — nothing is overwritten and nothing is auto-merged.
- **Migration keeps the local save.** Validate → back up → upload → verify by reading back → mark migrated. The local copy is retained, not deleted. Migration is idempotent via a stored token, so a refresh mid-migration cannot duplicate anything.
- **Failure is not fatal.** No config, no network, no session, a rejected write — all end with the game running on its local save.
- **Zero cost when unused.** `@supabase/supabase-js` is dynamically imported and is not in the entry chunk.

Database schema, RLS and functions live in `supabase/migrations/`. Apply with `supabase db push` against a project you own.

Use **separate Supabase projects for production and preview**. Preview deployments must never write to production player data.

## Settings

Split by what they belong to, and neither belongs in a progression save:

- **Account-synced** (`daykare-account-settings`, and the `account_settings` table) — reduced motion, high contrast, larger text, captions. These follow the player to a new device.
- **Device-local** (`daykare-device-settings`) — graphics quality, render scale, camera and touch sensitivity, audio toggle, HUD safe-area offset. Meaningless or harmful on different hardware, so never synced.

The four accessibility flags previously lived inside the Online preview store, which meant a Story-only player's accessibility choices were filed under "online". They are lifted out automatically on first load; the legacy Online save is read, never modified.

## Saves

Two separate `localStorage` namespaces, and they must stay separate:

- **Story Mode** → `daykare-save`. Written by `store.ts` through an explicit allow-list (`serializeGameState`), versioned by `PROGRESSION_VERSION` in `progression.ts`, with `migrate()` / `normalizePersistedGameState()` repairing older or malformed saves rather than discarding them.
- **DayKare Online preview** → `daykare-online-preview`. Written by `modeStore.ts`.

Online writes must never touch the Story save. When changing anything persisted, bump `PROGRESSION_VERSION` and extend the normalizer — never silently drop player progress.

DayKare Multiplayer is a real optional Supabase Realtime friends room. When its
public environment values or migration are absent, the lobby disables Join and
says exactly what is missing; it never substitutes fake remote players. See
[`docs/STORYBOOK_MULTIPLAYER.md`](docs/STORYBOOK_MULTIPLAYER.md) for setup and
authority boundaries.

## Deployment

The client is a static build: `pnpm --filter @workspace/3d-game run build` emits to `artifacts/3d-game/dist/public`.

A host needs:

- build command: `pnpm --filter @workspace/3d-game run build`
- output directory: `artifacts/3d-game/dist/public`
- environment: `BASE_PATH=/` for a root deploy
- SPA rewrite: `/*` → `/index.html`

`vercel.json` at the repo root encodes exactly this: install command, build command, output directory and the SPA rewrite. Vercel's filesystem handler runs before rewrites, so real files (assets, textures) are served directly and only unmatched routes fall through to `index.html`.

The same values are still recorded in the `.replit-artifact/artifact.toml` files. Those can be deleted once the Vercel setup is proven.

## Resilience

Two failure modes are handled explicitly, because both are things a player can hit through no fault of their own:

- **A missing texture does not blank the game.** `SuppliedArtwork` wraps every piece of artwork in an error boundary. A failed load logs the file name and drops that one item (or its blank backing board), leaving the rest of the daycare intact. Before this, one absent PNG replaced the entire front end with an error card.
- **WebGL failure shows a real screen.** `probeWebGL()` runs before the canvas mounts; if the browser cannot give us a context, the player gets an explanatory DayKare screen with a retry rather than a raw crash. Context loss — common on phones after backgrounding or under memory pressure — is caught and recovered from, with the canvas left mounted so the browser can restore it.

When you add a system that loads assets at runtime, give it a defined failure mode. "It will always be there" stops being true the moment assets move off the bundle.

## Conventions

- `main` is the source of truth; do feature work on a branch and open a PR.
- `main` is protected: changes land through pull requests, and CI must be green.
- Don't rewrite or squash published history.
- Preserve gameplay first. Infrastructure changes should not alter what the player experiences.
