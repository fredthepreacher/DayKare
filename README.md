# DayKare

A stylized 3D open-world daycare game. You play a toddler in a living daycare — exploring, running errands and quests, building reputation, running the Juice Club, and pulling off supervised, family-friendly capers.

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
pnpm --filter @workspace/3d-game run test                         # foundation + audio suites
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
| `scripts` | `@workspace/scripts` | Workspace helper scripts. |

Inside `artifacts/3d-game/src/game/`:

- `store.ts` — Story Mode state and the persisted save
- `modeStore.ts` — the Story ⇄ Online boundary and the Online preview state
- `world.ts`, `navigation.ts` — collision, walkability, routing
- `NPCs.tsx`, `npcActivities.ts`, `teacherInterventions.ts`, `activitySessions.ts` — living-daycare behaviour
- `TouchControls.tsx`, `touchInput.ts`, `cameraRig.ts`, `cameraInput.ts` — mobile multitouch and camera
- `storyProgression.ts` — story chapters, caper state machine, district progress
- `foundations.test.ts`, `audio.test.ts` — deterministic test suites

## Saves

Two separate `localStorage` namespaces, and they must stay separate:

- **Story Mode** → `daykare-save`. Written by `store.ts` through an explicit allow-list (`serializeGameState`), versioned by `PROGRESSION_VERSION` in `progression.ts`, with `migrate()` / `normalizePersistedGameState()` repairing older or malformed saves rather than discarding them.
- **DayKare Online preview** → `daykare-online-preview`. Written by `modeStore.ts`.

Online writes must never touch the Story save. When changing anything persisted, bump `PROGRESSION_VERSION` and extend the normalizer — never silently drop player progress.

DayKare Online is currently a **truthful local preview**: it says plainly that it is not connected, and it does not fake other players. Keep it that way until a real authoritative server exists.

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
