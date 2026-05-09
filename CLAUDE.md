# PCB 3D Print Tools — Claude Code Guidelines

Detailed docs live in `docs/claude/` — read the file matching the area you're working on. Don't load all of them up front.

| Topic | File |
|-------|------|
| Perfboard editor (workflow, data model, geometry, editor, state, undo, component bodies) | `docs/claude/perfboard.md` |
| PCB tool (KiCad workflow, web worker, parsing, STL export, subtract CSG) | `docs/claude/pcb-tool.md` |
| Shared geometry (stadium-with-hole, board+drills, earcut, drill matching, normals, text rendering) | `docs/claude/geometry.md` |
| Viewer3D (Three.js coords, materials, scaling, camera, variant bodies, body name predicates) | `docs/claude/viewer3d.md` |
| Blade mode & enclosure pattern (advanced 2D-clipping geometry, side-by-side preview) | `docs/claude/blade-and-enclosure.md` |
| Common pitfalls (gotchas with concrete reproductions) | `docs/claude/pitfalls.md` |

## Project layout

```
PCB3DPrintTools/
├── index.html                     Main PCB tool entry point
├── perfboard.html                 Perfboard editor entry point
├── vite.config.js                 Multi-page Vite config (both entry points)
├── public/
│   ├── pcb-worker.js              Classic web worker — KiCad parser + geometry
│   ├── earcut.min.js              Earcut copy for worker (npm auto-copied)
│   └── coi-serviceworker.js       COOP/COEP headers (GitHub Pages WASM)
├── docs/claude/                   Per-topic Claude Code guidelines (see table above)
└── src/
    ├── main.js                    Mount App.svelte (PCB tool)
    ├── perfboard.js               Mount PerfboardApp.svelte (Perfboard tool)
    ├── app.css                    Shared TailwindCSS v4 theme
    ├── App.svelte                 PCB tool — state hub, worker orchestration
    ├── PerfboardApp.svelte        Perfboard tool — state hub, grid editor + 3D preview
    ├── lib/
    │   ├── geometry.js            Shared pure geometry builders (extracted from pcb-worker.js)
    │   ├── perfboard-geometry.js  Perfboard JSON → bodies[] converter
    │   └── enclosure.js           Polygon offset + enclosure body generation
    └── components/
        ├── Viewer3D.svelte        Shared 3D renderer + STL export (used by both apps)
        ├── LayerPanel.svelte      PCB tool only
        ├── InfoPanel.svelte       PCB tool only
        ├── ExportPanel.svelte     PCB tool only
        ├── DrcPanel.svelte        PCB tool only
        ├── FileDropzone.svelte    PCB tool only
        └── perfboard/
            ├── GridEditor.svelte        SVG 2D grid editor with tools
            ├── Toolbar.svelte           Tool selection (select/pad/header/dip/trace/jumper/label/erase) hotkeys 1-7
            ├── BoardSettings.svelte     Grid size, pad/drill/trace dimensions
            └── PerfboardExportPanel.svelte  Z-scale sliders + STL export
```

## Multi-page architecture

The project is a **Vite multi-page app** with two independent entry points:

- `/index.html` → `App.svelte` — the KiCad PCB 3D print tool
- `/perfboard.html` → `PerfboardApp.svelte` — the standalone perfboard editor

Both share `Viewer3D.svelte`, `app.css`, and the `src/lib/` modules. The `vite.config.js` configures both entry points via `build.rollupOptions.input`. Do NOT break this — adding a new entry point requires adding it to that config.

Shared code lives in `src/lib/` and `src/components/Viewer3D.svelte`. App-specific code lives in the root `src/` (app shells) and `src/components/` (PCB-tool-only) or `src/components/perfboard/` (perfboard-only).

## Stack

- Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`, `$bindable`, `untrack`)
- TailwindCSS v4 via `@tailwindcss/vite` — use `@import "tailwindcss"` in app.css
- Three.js v0.184: WebGLRenderer, OrbitControls, STLExporter
- `three-bvh-csg` for subtract export (CSG on full meshes — slow on big inputs, only use sparingly)
- `polygon-clipping` for 2D polygon union/difference (used in blade mode)
- `earcut` (mapbox/earcut npm package, used by main thread and `geometry.js`; an inlined copy is also in `pcb-worker.js`)

## Quick orientation

- **Working on the perfboard editor?** Read `docs/claude/perfboard.md`.
- **Working on KiCad parsing or the worker?** Read `docs/claude/pcb-tool.md`.
- **Touching trace/board geometry, drills, text, or earcut?** Read `docs/claude/geometry.md`.
- **Touching Three.js code (materials, scaling, camera, variant bodies)?** Read `docs/claude/viewer3d.md`.
- **Working on blade mode, enclosure, or any "extrude an outline" feature?** Read `docs/claude/blade-and-enclosure.md`.
- **Hit a weird bug?** Skim `docs/claude/pitfalls.md` first — it's likely been seen before.
