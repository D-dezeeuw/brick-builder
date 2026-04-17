# Block Editor — Requirements

A web-based, videogame-feeling 3D editor for building creations from procedurally generated LEGO-style bricks, with realistic plastic shading, URL sharing, and real-time collaborative editing.

## Vision

Open the app and be building within seconds. Pick a brick from a sidebar, snap it onto a baseplate, see it rendered like real ABS plastic. Share a URL and a friend joins the same canvas live. No install, no account required for the basic flow.

## Users & primary jobs

- **Solo builder** — opens the editor, builds a creation, shares a URL snapshot.
- **Co-builders** — join a room via URL, build together in real time.
- **Returning builder** — refreshes mid-build, autosave restores exactly where they left off.

## Non-functional requirements

- **Performance**
  - 60 fps at 2,000 placed bricks on mid-range laptop (2020+ Intel iGPU or better)
  - ≥45 fps at 10,000 bricks on M-series Mac / discrete GPU
  - First meaningful paint < 2 s on 10 Mbps broadband
  - Input-to-placement latency < 50 ms (perceived instant)
- **Multiplayer**
  - P95 remote-edit visibility < 250 ms same-continent
  - Offline edits merge without data loss on reconnect (CRDT)
  - Rooms support ≥ 8 concurrent editors without degradation
- **Reliability**
  - Autosave every ≤ 500 ms of idle
  - Refresh / crash never loses > 1 placement
  - Server persists rooms across restarts
- **Compatibility**
  - Evergreen desktop browsers (Chrome / Firefox / Safari, last 2 versions)
  - WebGL 2 required; graceful message if unavailable
  - Mobile (touch) = nice-to-have, Phase 7

## Functional — MVP (Phases 1–2)

- Place, rotate (90° around Y), and delete bricks
- Brick catalog ≥ 12 shapes: 1×1, 1×2, 1×3, 1×4, 1×6, 1×8, 2×2, 2×3, 2×4, 2×6, 2×8, 2×10 — plus plate variants
- Grid snap to stud positions; stacking resolves current build layer automatically
- Auto-expanding baseplate (grows in 16-stud chunks when building near edges)
- Undo / redo (≥ 50 ops deep)
- 16-color classic LEGO palette
- Right sidebar: brick catalog grouped by category
- Top bar: editable creation title + live stats (brick count, bounding dimensions)
- Orbit / pan / zoom camera with clamped limits
- Keyboard: `R` rotate, `Ctrl+Z/Y` undo/redo, `Del` delete, `Q/E` layer change, `1–9` recent bricks

## Functional — v1 (Phases 3–6)

- Realistic ABS plastic shading (MeshPhysicalMaterial + HDRI + post-FX)
- Authentic brick geometry: studs with recessed tops, anti-studs / tubes on bottom, 0.2 mm tolerance gap
- 10,000+ bricks performant via `InstancedMesh` per (shape, color) + LOD
- Geometry cache: warm top ~20 shapes at startup, generate rest on demand
- URL share: LZ-compressed creation in URL hash → opens as read-only snapshot or "fork to room"
- localStorage autosave
- Export: JSON download, PNG screenshot
- Import: paste JSON or drag-drop file
- Real-time multiplayer rooms at `/r/:roomId` (Yjs over WebSocket)
- Presence: remote user cursors with name + color tag

## Out of scope (for now)

- Minifigures, Technic parts, curved bricks, stickers, decals
- Official LEGO IP assets, textures, or branding
- Step-by-step build-instruction export
- User accounts, authentication, creation gallery / social features
- Physics simulation (gravity, collisions beyond placement)
- Native mobile apps

## Constraints & principles

- **Procedural everything**: no imported brick meshes; geometry is code, keyed by dimensions
- **Integer-LU placement math**: internal coords in LEGO units (1 LU = 0.8 mm); convert to mm only at render
- **Client-authoritative + CRDT**: no custom server conflict resolution; Yjs handles merges
- **No LEGO IP**: we describe geometry, never use trademarks or official color names in user-facing copy where avoidable

## Open questions (answer during sprints)

- Brick thumbnail strategy: live mini-canvases vs pre-rendered sprites? (decide Phase 2)
- Environment map: ship our own HDRI vs use `drei` preset? (decide Phase 4)
- Room permissions: open rooms only, or optional passcode? (decide Phase 6)
- Deployment target: Fly.io vs Render vs self-host? (decide Phase 7)

## Source references (LEGO dimensions)

- [Stud Dimensions Guide — Brick Owl](https://www.brickowl.com/us/help/stud-dimensions)
- [LEGO Brick Dimensions — Bartneck](https://www.bartneck.de/2019/04/21/lego-brick-dimensions-and-measurements/)
- [Lego Geometry 101 — Bricking Ohio](https://www.brickingohio.com/blog/lego-geometry-101)
- [LEGO Basic Dimensions — GrabCAD](https://grabcad.com/tutorials/lego-01-basic-dimensions-bricks-explained)
