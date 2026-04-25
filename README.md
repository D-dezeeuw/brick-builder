# Brick Builder

A web-based 3D editor for procedurally-generated LEGO-style creations. Every brick is built from parametric geometry (no imported meshes), rendered with realistic plastic shading, shareable via a URL, and live-editable with friends through Supabase Realtime.

**Live demo:** <https://d-dezeeuw.github.io/brick-builder/>

## Features

- **Procedural catalog.** ~40 shapes generated at runtime from a discriminated-union spec — bricks, plates, tiles, round pieces, 45° slopes, cheese slopes, jumpers. Authentic bottom detail (hollow anti-stud tubes for ≥2×2, centreline pins for 1-wide strips). Add a shape by appending one row to [`packages/shared/src/catalog.ts`](packages/shared/src/catalog.ts).
- **Instanced rendering.** One `InstancedMesh` per (shape, color, transparent) bucket, matrices packed into a single attribute. 10k bricks typically render in ~50 draw calls.
- **Plastic shader.** `MeshPhysicalMaterial` with clearcoat, sheen, and an Oren-Nayar diffuse patch injected via `onBeforeCompile` at medium+. Studio HDRI with rotation / visible-background / blur / brightness controls. Tone-mapping picker (ACES Filmic / AgX / Khronos Neutral / Linear). 4 quality presets and independent toggles for AO (N8AO), Bloom, SMAA, and post-process Depth of Field (Ultra only).
- **GPU path-traced render mode.** Top-bar render toggle swaps the rasterizer for `@react-three/gpu-pathtracer`. Includes shaped-area key light, contact-shadow emissive floor, denoise (À-Trous EAW / Bilateral / NLM), Physical-Camera depth of field with focus tracking the orbit target, ACES/AgX tone-mapping passthrough, configurable bounces (1–8) and resolution (50/75/100%). Camera moves below threshold no longer reset accumulation. **Convergence-based early-stop** monitors a centre-window RMS delta and freezes the tracer once samples stop changing the picture; **pose-keyed LRU cache** of converged outputs makes re-entering render mode at a previously-converged pose instant. Frustum culling + chunked geometry merging + studless LOD for distant chunks let it scale to 10k+ bricks.
- **Persistence.** Versioned schema with runtime validation. Autosave to localStorage, sharable lz-string URL hash, JSON + PNG export (render-to-target, with native share sheet on mobile so screenshots land in Photos), JSON import via picker or drag-drop. Editor **settings** (lighting, tonemap, quality, PT knobs, baseplate colour, etc.) survive reload via a separate persistence layer.
- **Multiplayer rooms.** Supabase Postgres + Realtime. **Start room** or **Join room** by 8-char code or share link, password-gate optional, room popover collapses copy / change-password / leave behind a single chip. Live-sync brick placements, deletions, edits, title changes, and baseplate growth. No custom server.
- **Mobile-first input.** Tap-and-drag to position the ghost, release to commit; orbit-release is distinguished from a real tap by a 10px drag threshold. Build / Erase / Hand mode toggle. Top bar collapses non-primary actions behind a kebab below 768px; the render toggle stays one tap away. Long-press text-selection suppressed app-wide.

## Keyboard shortcuts

| Key                    | Action                         |
| ---------------------- | ------------------------------ |
| Tap / left-click       | Place the selected brick       |
| Right-click            | Remove a brick                 |
| `R`                    | Rotate the ghost               |
| `Q` / `E`              | Lower / raise target layer     |
| `1` – `9`              | Select a recent shape (hotbar) |
| `B` / `X` / `H`        | Build / erase / hand mode      |
| `⌘ / Ctrl + Z`         | Undo                           |
| `⌘ / Ctrl + Shift + Z` | Redo                           |
| `?`                    | Show help modal                |
| Drag                   | Orbit camera                   |
| Hold `Space` + drag    | Pan                            |
| Middle-drag            | Pan                            |
| Scroll wheel           | Zoom                           |
| Two-finger touch       | Pan + pinch zoom               |

## Tech stack

- **Client:** React 18 + Vite 6 + TypeScript (strict). React-three-fiber 8, drei, `@react-three/postprocessing`, `@react-three/gpu-pathtracer`. Zustand for state.
- **Multiplayer:** Supabase (Postgres + Realtime + RLS).
- **Hosting:** GitHub Pages (auto-deploys from `main` via the [`static.yml`](.github/workflows/static.yml) workflow). `netlify.toml` is still in the repo as a fallback config but is not the production target.
- **Monorepo:** pnpm workspaces. `apps/web` (the editor), `apps/server` (placeholder — unused now that Supabase replaced the planned Fastify + y-websocket stack), `packages/shared` (brick spec, catalog, schema).

## Quick start

```bash
# Requires Node 20+ and pnpm 9+
pnpm install
pnpm --filter @brick/web dev   # http://localhost:5173
```

The web app needs a Supabase project for multiplayer. Copy
[`apps/web/.env`](apps/web/.env) and point it at your project, then apply
every SQL migration in [`supabase/migrations/`](supabase/migrations/) in
order via the Supabase SQL editor. Without these, solo editing still
works — only room features are disabled.

```bash
pnpm typecheck       # all workspaces
pnpm build           # production build
pnpm format          # prettier write
pnpm lint            # eslint (flat config)
```

## Bundle / performance

- **Lazy boundaries:** the Supabase client, multiplayer subsystem, admin panel, settings modal, chat panel, exporters, post-processing chain, and path-tracer modules all load on demand. A solo first paint downloads ~330 KB gzipped of JS; multiplayer / admin / PT modes pay their own ~50–200 KB on first use.
- **Path-tracer scaling:** chunked geometry merging (16-stud chunks) collapses 10k bricks into ~10–200 merged meshes, BVH builds off-thread on a worker. Studless LOD swap above 800mm camera distance.
- **WebGL probes** dispose their throwaway context up front so the live R3F context isn't evicted on browsers with tight context caps (Safari / iOS).

## Project layout

```
blockeditor/
├── apps/
│   ├── web/                  # Vite + R3F editor — the app
│   │   └── src/
│   │       ├── bricks/       # Geometry builders + material + instanced renderer
│   │       ├── scene/        # Three.js scene: baseplate, cursor, lighting, postfx, pathtracer
│   │       ├── state/        # zustand store, commands, persistence, captureBus
│   │       ├── multiplayer/  # Supabase client + room sync/writes/router (lazy)
│   │       └── ui/           # DOM UI: sidebar, top bar, help modal, hotbar, toasts
│   └── server/               # Placeholder Fastify app (unused in the Supabase architecture)
├── packages/
│   └── shared/               # Shape catalog, dimensions, schema, URL codec
├── supabase/migrations/      # SQL migrations — apply manually in the Supabase SQL editor
└── .github/workflows/        # CI (typecheck/build) + Pages deploy
```

## Phase roadmap (all complete)

| #   | Scope                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 0   | Monorepo + CI + Pages deploy + hello-cube                                                                                                                                                                                                                                                                                                                                                        |
| 1   | 1×1 brick MVP, baseplate, multi-layer stacking, 3D collision, mobile input                                                                                                                                                                                                                                                                                                                       |
| 2   | 40-shape procedural catalog with anti-studs, categorised browser, rotation fix, undo/redo, hotkeys, auto-expanding baseplate, growable instance buckets, warm cache                                                                                                                                                                                                                              |
| 3   | `MeshPhysicalMaterial` + clearcoat + sheen, studio HDRI, ACES tone mapping, quality presets, lighting sliders, N8AO + Bloom + SMAA (toggleable), per-instance jitter, 64-sample GPU path tracer                                                                                                                                                                                                  |
| 4   | Versioned schema, editable title + stats, localStorage autosave, lz-string URL share, JSON + PNG export (render-to-target), JSON import (picker + drag-drop)                                                                                                                                                                                                                                     |
| 5   | Live multiplayer via Supabase Postgres + Realtime, `?r=<id>` URLs, bidirectional sync with echo dedup, room-aware Share button                                                                                                                                                                                                                                                                   |
| 6   | Onboarding + `?` help modal, scene error boundary, WebGL 2 fallback, visible hotbar, this README                                                                                                                                                                                                                                                                                                 |
| 7   | Path-tracer polish: shaped-area light, emissive floor, denoise, Physical-Camera DoF, AgX / Neutral tonemap, HDRI controls, baseplate palette, convergence early-stop, pose-keyed cache, frustum + chunked merging + LOD, async BVH worker, studless transparent bricks, mobile share sheet |
| 8   | Bundle splitting (multiplayer / supabase / admin / settings lazy), settings persistence, top-bar render toggle, room actions popover, raster DoF at Ultra, damping-stable PT accumulation                                                                                                  |

### Deferred

- Presence cursors (Supabase Realtime Presence on the same channel).
- Auth-gated rooms beyond the room password — today anyone with the room id + password can edit.
- Brick-move sync — the editor doesn't have a move action yet.
- Wall-tolerance inset on brick geometry (decorative; not blocking any feature).
- SSGI — the `realism-effects` library hasn't cut a stable release in years; revisit when a maintained option lands.
- Screen-space reflections — limited fidelity for stud-density scenes; IBL covers the common case.
- Curved slopes (Tier 3 stretch from the catalog — dispatcher has the stub).

## Deploy

GitHub Actions (`.github/workflows/static.yml`) builds `@brick/web` with
`VITE_BASE_PATH=/brick-builder/` on every push to `main` and publishes to
GitHub Pages. SPA fallback for the `?r=<id>` room routes is handled by the
hash-free URL convention. The Supabase connection is baked into the client
via `apps/web/.env` — the anon key is safe to commit (RLS gates access).

## Contributing

Small, focused PRs welcome. When adding a feature:

- Favour editing existing files over creating new ones.
- New brick shapes: one row in [`packages/shared/src/catalog.ts`](packages/shared/src/catalog.ts); the dispatcher does the rest.
- New multiplayer mutations: extend both the applier in
  [`apps/web/src/multiplayer/roomSync.ts`](apps/web/src/multiplayer/roomSync.ts)
  and the diff in
  [`apps/web/src/multiplayer/roomWrites.ts`](apps/web/src/multiplayer/roomWrites.ts).
- Run `pnpm typecheck && pnpm build` before pushing; CI enforces both.

## Credits

Brick dimensions sourced from [Brick Owl](https://www.brickowl.com/us/help/stud-dimensions), [bartneck.de](https://www.bartneck.de/2019/04/21/lego-brick-dimensions-and-measurements/), [Bricking Ohio](https://www.brickingohio.com/blog/lego-geometry-101), and [GrabCAD](https://grabcad.com/tutorials/lego-01-basic-dimensions-bricks-explained). Top-30 shape ranking from [Brick Architect](https://brickarchitect.com/parts/most-common). HDRI from [pmndrs/assets](https://github.com/pmndrs/assets) (CC0).

LEGO® is a trademark of the LEGO Group, which does not sponsor, authorize, or endorse this project.
