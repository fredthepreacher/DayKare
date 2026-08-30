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

`PORT` and `BASE_PATH` are **required** — the Vite config throws if either is missing, so that a deploy can never silently pick the wrong base path.

## Checks

```bash
pnpm run typecheck                                                # all packages
pnpm --filter @workspace/3d-game run test                         # foundation + audio suites
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/3d-game run build  # production build

# browser regression suite — needs a `chromium` on PATH and the dev server running
DAYKARE_TEST_URL=http://127.0.0.1:5173/ pnpm --filter @workspace/3d-game run test:browser
```

The browser suite renders through SwiftShader and asserts on captured frame counts, so it needs a reasonably fast machine. On a slow or heavily throttled runner it can fail on frame-count assertions even when nothing is wrong with the game.

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
- environment: `PORT` and `BASE_PATH` (use `BASE_PATH=/` for a root deploy)
- SPA rewrite: `/*` → `/index.html`

These values are also recorded in the `.replit-artifact/artifact.toml` files, which are kept until the Vercel configuration replaces them.

## Conventions

- `main` is the source of truth; do feature work on a branch and open a PR.
- Don't rewrite or squash published history.
- Preserve gameplay first. Infrastructure changes should not alter what the player experiences.
