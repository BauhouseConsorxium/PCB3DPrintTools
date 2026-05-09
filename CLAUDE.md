# PCB 3D Print Tools — Claude Code Guidelines

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
            ├── Toolbar.svelte           Tool selection (select/pad/header/dip/trace/jumper/label/erase) with hotkeys 1-7
            ├── BoardSettings.svelte     Grid size, pad/drill/trace dimensions
            └── PerfboardExportPanel.svelte  Z-scale sliders + STL export
```

## Multi-page architecture

The project is a **Vite multi-page app** with two independent entry points:

- `/index.html` → `App.svelte` — the KiCad PCB 3D print tool
- `/perfboard.html` → `PerfboardApp.svelte` — the standalone perfboard editor

Both share `Viewer3D.svelte`, `app.css`, and the `src/lib/` modules. The `vite.config.js` configures both entry points via `build.rollupOptions.input`. Do NOT break this — adding a new entry point requires adding it to that config.

Shared code lives in `src/lib/` and `src/components/Viewer3D.svelte`. App-specific code lives in the root `src/` (app shells) and `src/components/` (PCB-tool-only) or `src/components/perfboard/` (perfboard-only).

## Workflow context — copper tape PCB trick

The whole tool exists to support this fabrication method:

1. Design PCB in KiCad → save `.kicad_pcb`
2. Load into PCB 3D Print Tools (drag & drop)
3. **Copper Z-scale** — extrude the copper traces tall enough to form raised channels (default 8×, real copper = 0.035 mm)
4. **Board Z-scale** — adjust board thickness for desired print sturdiness (default 1×)
5. Export **merged STL** — board + raised copper traces baked into a single solid
6. 3D print, press copper tape into channels, solder components on top

Trace modes (UI: `traceMode` state):
- `raise` (default) — solid stadium-shaped copper traces extruded above the board
- `subtract` — traces preview as carved channels (CSG subtraction at export)
- `blade` — thin walls following the trace outline; printed walls slice copper tape pressed onto them along the trace path

Design decisions that follow:
- Export always produces a **merged** STL (copper + board fused) — not separate files
- Board bottom stays fixed when scaling so the part sits flat on the print bed
- Preview mode shows uniform grey solid (slicer view)
- Blade mode generates an alternate body set named `F.Cu_blade` / `B.Cu_blade` (sibling to the solid `F.Cu`/`B.Cu`); the viewer toggles which variant is visible based on `traceMode`. These blade bodies are filtered out of `LayerPanel`/`InfoPanel`/`ExportPanel` lists in `App.svelte` (via `visibleBodies`) so they don't appear as separate layers.

## Perfboard editor — workflow context

The perfboard tool targets the same copper-tape fabrication method but skips KiCad entirely. Users design directly on a 2.54mm grid:

1. Open `/perfboard.html`
2. Set grid size (cols × rows) and dimensions (pad/drill/trace sizes)
3. Place pads on grid intersections (toggle on click)
4. Place header strips (click-drag for multi-pin headers)
5. Route traces between points (click waypoints, double-click to finish, Manhattan routing)
6. Add jumper wires where traces would cross (component-side wire, not copper)
7. Switch to 3D Preview tab → see raised copper pads and traces
8. Adjust copper Z-scale for print depth
9. Export STL → same raised-channel output as the PCB tool (jumpers excluded — they're physical wire)
10. Save/load via localStorage or JSON file

### Perfboard data model

```js
{
  version: 1,
  name: "my-perfboard",
  grid: { cols: 10, rows: 8, pitch: 2.54 },
  boardThickness: 1.6,
  copperThickness: 0.035,
  drillDiameter: 1.0,       // mm — converted to radius in geometry
  padDiameter: 2.0,         // mm — converted to radius in geometry
  traceWidth: 1.0,          // mm
  pads: [{ id, col, row, label? }],
  headers: [{ id, col, row, count, orientation: "h"|"v", labels?: string[] }],
  dips: [{ id, col, row, count, orientation: "h"|"v", rowSpacing: 3, label? }],
  traces: [{ id, points: [{col, row}], width }],
  jumpers: [{ id, col1, row1, col2, row2 }]
}
```

Grid coords are half-integer col/row (0-based, snapped to 0.5 increments for half-pitch placement). World positions = `col * pitch`, `row * pitch`. The geometry converter Y-flips during conversion (`row → -row * pitch`), matching the existing Y-down → Y-up convention.

### Perfboard body naming

- Board: `'PCB'` — green material via `isPcbBoard()`
- Pad rings: `'Pads_F.Cu'` — contains `.cu`, gold copper material via `isCopper()`
- Traces: `'F.Cu'` — standard copper name

These names are chosen to trigger the correct Viewer3D material predicates. If you add new body types, ensure the name matches an existing predicate or add a new one to **both** `Viewer3D.svelte` and `LayerPanel.svelte`.

### Perfboard geometry pipeline (`src/lib/perfboard-geometry.js`)

`buildPerfboardBodies(doc)` runs on the **main thread** (no worker needed — perfboards are small):

1. `buildBoardPolygon(doc)` → rectangular CCW polygon with half-pitch margin
2. `collectPadPositions(doc)` → deduped pad positions from pads + expanded headers
3. `buildBoardGeometry(polygon, drills, thickness)` → board body with drill holes (from `geometry.js`)
4. `buildPadRingsGeometry(positions, drillR, padR, zBot, zTop)` → annular copper rings per pad
5. `collectTraceSegments(doc, padPositions)` → splits segments at intermediate pad positions so every pad gets a drill hole
6. `buildTracesGeometry(segments, drills, layer, zBot, zTop)` → stadium copper traces (from `geometry.js`)

Pad rings are structurally identical to board geometry: outer circle CCW + inner circle CW hole → earcut → extrude. All pads batched into a single body.

### Perfboard SVG grid editor (`GridEditor.svelte`)

- SVG-based with `viewBox` pan/zoom (wheel = zoom around cursor, shift+drag or middle-drag = pan)
- Grid snap: half-pitch (`Math.round(x / pitch * 2) / 2`) via `svg.getScreenCTM().inverse()` — grid dots render at full and half-pitch
- Tool system: `activeTool` state drives click/move handlers (default: `'select'`)
  - `'pad'` — click to toggle pad at intersection (hotkey: 1). Double-click in select mode to edit pad label.
  - `'header'` — click start → drag direction → click to place multi-pin header (hotkey: 2). Double-click in select mode to edit per-pin labels.
  - `'dip'` — click start → drag direction → click to place DIP IC package, 2 rows with 3-pitch spacing (hotkey: 3). Requires count ≥ 2. Double-click in select mode to edit IC label.
  - `'trace'` — click waypoints → double-click to finish; L-shaped Manhattan routing per click (hotkey: 4)
  - `'jumper'` — click start → click end → creates component-side wire (2D only, no 3D geometry) (hotkey: 5)
  - `'label'` — click to place text annotation (hotkey: 6)
  - `'select'` — click to select, shift+click to toggle multi-select, drag empty area for rubber band selection, Delete to remove all selected
  - `'erase'` — click to remove (hotkey: 7)
- Right-click or Escape cancels in-progress trace/header/dip/jumper; Escape with no drawing in progress switches to select tool
- Double-click editing: pads show single label input; headers show per-pin label list (Enter advances to next pin); DIPs show IC label input; jumpers show color picker; annotations show text+color editor
- Multi-select: `selectedIds` array (not single `selectedId`), shift+click toggles, rubber band drag selects enclosed elements, drag-move and delete operate on full selection as single undo step
- Hit testing: pads/headers/DIPs use exact grid match; traces and jumpers use proximity-based `distToSegment` with bezier curve sampling (jumpers render as quadratic bezier arcs)
- Selection highlight: amber fill (`#fbbf24`) with semi-transparent white border (`rgba(255,255,255,0.45)`)

### PerfboardApp state management

All state lives in `PerfboardApp.svelte` as `$state` runes (same pattern as `App.svelte`). The `doc` object is mutated by tool callbacks. `perfboardBodies` is `$derived` from `buildPerfboardBodies(doc)` — recomputes automatically on any doc change.

Save/load: localStorage (5 named slots) + JSON file download/upload. No preset system (unlike the PCB tool).

### Undo/redo system

Snapshot-based: `pushUndo()` deep-clones the entire `doc` via `JSON.parse(JSON.stringify(doc))` before each mutation. Max 50 entries. `Cmd/Ctrl+Z` to undo, `Cmd/Ctrl+Shift+Z` or `Cmd/Ctrl+Y` to redo. Deduplication via JSON.stringify comparison prevents no-op entries. Settings inputs capture undo snapshot on `onfocus` (one undo step per focus session). Undo/redo buttons in the header bar.

## Shared geometry module (`src/lib/geometry.js`)

Pure geometry builder functions extracted from `pcb-worker.js` as ES module exports:

- `signedArea(pts)`, `ensureCCW(pts)`, `pointInPolygon(px, py, poly)`
- `makeDrillLookup(drills)` — tolerance-based spatial lookup, returns drill radius
- `buildBoardGeometry(polygon, drills, thickness)` → `{name:'PCB', positions, normals, indices}`
- `buildTracesGeometry(segments, drills, layer, zBot, zTop, squareEnds)` → body with stadium traces

Uses `import earcut from 'earcut'` (ES module import, not the worker's `importScripts` copy).

**Parallel copies exist:** `pcb-worker.js` has its own copy of these functions (with `earcutFn` from `importScripts`). The worker can't import ES modules. If you fix a geometry bug, update **both** `src/lib/geometry.js` AND `public/pcb-worker.js`. Long term these should be unified, but the worker's classic-script constraint prevents it today.

## Stack

- Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`, `$bindable`, `untrack`)
- TailwindCSS v4 via `@tailwindcss/vite` — use `@import "tailwindcss"` in app.css
- Three.js v0.184: WebGLRenderer, OrbitControls, STLExporter
- `three-bvh-csg` for subtract export (CSG on full meshes — slow on big inputs, only use sparingly)
- `polygon-clipping` for 2D polygon union/difference (used in blade mode — see below)
- `earcut` (mapbox/earcut npm package, used by main thread and `geometry.js`; an inlined copy is also in `pcb-worker.js`)

## Web Worker

- Classic worker: `new Worker(import.meta.env.BASE_URL + 'pcb-worker.js')`, **no** `type:'module'`
- Worker receives `.kicad_pcb` text via `postMessage({ type:'PROCESS', text })`
- Posts back `{ type:'RESULT', bodies: [{name, positions, normals, indices}], polygon, segments, thickness }`
  - `polygon`: `Float32Array` of board outline `[x,y]` pairs (Y-flipped to geometry coords)
  - `segments`: `Float32Array` of raw trace segments, 6 floats each `[x1, -y1, x2, -y2, width, layerFlag]` (0=F.Cu, 1=B.Cu) — used for per-segment CSG cutters in subtract export
  - `thickness`: board thickness in mm
- Send typed arrays as transferables: `Float32Array`, `Uint32Array`

## KiCad PCB parsing (in worker)

- S-expression parser is hand-rolled, recursive descent — atoms returned as strings, `parseFloat` at use sites
- Body outline (`Edge.Cuts`): chain `gr_line` + `gr_arc` segments, greedy nearest-endpoint stitching
- Arc: `gr_arc (start)(mid)(end)` → use circumcenter, then sweep angle, ensuring it passes through `mid`
- Traces: `(segment (start)(end)(width)(layer "F.Cu"|"B.Cu"))`
- Drills: top-level `(via (at)(drill))` AND nested `(footprint (at fpx fpy [rot]) (pad "n" thru_hole|np_thru_hole … (at padx pady [padrot]) (drill r|oval rx ry)))`
- Text: `gr_text` (board-level), `property "Reference"|"Value"` (footprint-level), `fp_text user` (footprint user text)

### KiCad rotation gotcha

KiCad's rotation in `(at x y rot)` is **negated** vs. standard math 2D rotation (the file uses Y-down). Correct pad-to-world transform:

```js
const cosR = Math.cos(rot), sinR = Math.sin(rot)
const wx = fpX + padX * cosR + padY * sinR     // note + on padY*sinR
const wy = fpY - padX * sinR + padY * cosR     // note − on padX*sinR
```

If you use the standard formula (`wx = fpX + padX*cosR - padY*sinR`), pads in rotated footprints land on the wrong side — drills won't match trace endpoints.

## Geometry: stadium-with-hole per segment (CRITICAL)

Each copper segment is **one** stadium (pill) prism with optional drill holes — **not** rectangle + separate cap. The single-piece approach avoids visible seams between body and cap, and fully covers L-bend junctions.

For each segment in `buildTracesGeometry`:
1. Build CCW stadium profile: P2 end-cap (angles −π/2 → +π/2), then P1 start-cap interior points (angles π/2 → 3π/2)
2. If a drill sits at an endpoint AND `drillR < traceHw - 0.01`, add a CW circle hole there
3. Earcut the (profile + holes) → top/bottom face triangles
4. Side walls: outer (stadium boundary, outward radial normals) + inner per drill hole (inward radial normals)

Resolution constants:
```js
const HALF_N = 24    // semicircle resolution per stadium endpoint
const HOLE_N = 32    // drill hole resolution (copper)
const HOLE_SIDES = 32 // drill hole resolution (board)
```

`HALF_N = 8` is too coarse — visible polygon edges. 24 looks smooth.

## Board geometry with drill holes

`buildBoardGeometry(polygon, drills, thickness)` uses earcut for top/bottom faces (CCW outer + CW drill holes), plus outer side wall + inner side walls per drill. All explicit normals.

## Text rendering (Hershey Simplex stroke font)

Text elements (reference designators, values, board annotations) are rendered as raised 3D geometry using a Hershey Simplex stroke font embedded in the worker as constant `H`.

**Font data format:**
```js
const H = {
  32: { w: 16, s: [] },  // space — w = advance width, s = array of polyline strokes
  65: { w: 18, s: [[[9,21],[1,0]], [[9,21],[17,0]], [[4,7],[14,7]]] },  // A
}
```
Coordinate space: Y 0=baseline, 21=cap height. Each stroke is an array of `[x,y]` points forming a polyline.

**Pipeline:**
1. `extractTexts(tree)` → array of text descriptors `{ text, x, y, rot, sizeW, sizeH, thickness, layer, mirror, hJust, vJust }`
   - Parses `gr_text`, footprint `property`, and `fp_text user`
   - Resolves `${REFERENCE}` variables by looking up the footprint's Reference property
   - Skips `(hide yes)` and fabrication layers (F.Fab, B.Fab)
   - Handles multiline text (`\n` in KiCad strings)
2. `textToPolylines(desc)` → array of `{ pts: [[x,y],...], hw, layer }` — one polyline per character stroke, world-transformed
3. `buildTextGeometry(polylines, bodyName, zBot, zTop)` → body with thick polyline geometry

**Thick polyline geometry (NOT individual stadium segments):**

Each stroke is rendered as a **single closed outline** with miter joins at interior vertices and semicircle caps at endpoints. This avoids visible gaps between segments at stroke joints.

Algorithm per polyline:
1. Compute segment directions and right normals
2. Interior vertices: bisector (miter) join with `cosHalf` clamped to `0.25` to limit spike length
3. Endpoints: semicircle cap with `TEXT_CAP_N = 12` points
4. Outline = right side forward + end cap + left side backward + start cap
5. Earcut triangulates the closed outline → top/bottom faces + side walls

**Why not per-segment stadiums for text:** Individual stadium prisms per stroke segment leave visible gaps at joints where two segments meet at an angle. The thick polyline approach creates one continuous outline per stroke, producing smooth letter shapes.

**Body naming:**
- Silkscreen text: `"F.SilkS"`, `"B.SilkS"` — new layer bodies
- Copper text: `"F.Cu_text"`, `"B.Cu_text"` — `_text` suffix avoids collision with trace bodies

**Viewer integration:**
- `isSilkscreen(name)` predicate: matches `'silks'` in lowercase
- Silkscreen material: `{ color: 0xf0f0f0, specular: 0x444444, shininess: 30, side: DoubleSide }`
- Silkscreen scales with board (not copper) in `applyBoardScale`
- Copper text (`*_text`) matched by `isCopper()` → scales with copper zScale
- LayerPanel groups silkscreen as its own category with white color dot

**Board metrics pitfall:** When computing `boardBottomY`/`boardTop`, use `isPcbBoard(name)` — NOT `!isCopper(name)`. Silkscreen text bodies have tiny bounding boxes (~0.035mm height) that will overwrite board metrics and corrupt all copper Z positioning if matched.

## Explicit normals everywhere (NO computeVertexNormals)

Every body returns `normals: new Float32Array(...)` with per-vertex normals so the viewer skips `computeVertexNormals()`. This avoids:
- Puffy/balloon-look on extruded shapes (`computeVertexNormals` averages across hard edges)
- Dark artifacts at overlapping/self-intersecting geometry

Conventions:
- Top face: `(0, 0, 1)`
- Bottom face: `(0, 0, -1)`
- Outer side wall: outward radial = `(onx, ony, 0)` per vertex
- Inner hole wall: inward radial = `((cx-px)/r, (cy-py)/r, 0)`

**Duplicate perimeter vertices** so face/wall meet at a hard crease. Each profile point appears twice: once with `(0,0,±1)` for the face, once with the radial normal for the wall.

## Earcut (inlined in worker)

Adapted from mapbox/earcut (BSD-2-Clause). Convention:
- Outer ring: **CCW** in math/Y-up convention (`signedArea > 0`)
- Holes: **CW** (`signedArea < 0`)

Generate hole circles with `a = -i * 2π / HOLE_N` (decreasing angle = CW from above).

After Y-flip (local Y = −kicadY), check outer polygon direction with `signedArea` and reverse if needed to ensure CCW.

## Drill ↔ trace endpoint matching

Use **tolerance-based linear lookup**, not bucket keying:

```js
const DRILL_TOL_SQ = 0.05 * 0.05   // 0.05 mm tolerance, squared
function lookupDrillR(cx, cy) {
  for (const d of drillList) {
    const dx = d.lx - cx, dy = d.ly - cy
    if (dx*dx + dy*dy < DRILL_TOL_SQ) return d.r
  }
  return 0
}
```

**Why not integer keys** (`Math.round(x*100)` or `toFixed(2)`): two values that should match can fall in different buckets at half-boundaries. Concrete example: `104.775 + 2.54 = 107.31500000000001` (FP drift), and `Math.round(-10731.5) = -10731` while `Math.round(-10731.500000000002) = -10732` — different keys for what should be the same point. Linear scan is O(N×M) but fine for typical PCB sizes (<100 drills × ~1000 endpoints).

## Three.js coordinate system

- KiCad uses Y-down; the worker emits geometry with **local Y = −kicadY** (so up-on-screen = up in 3D)
- Worker emits geometry with Z = thickness direction (board: 0 → thickness, F.Cu: thickness → +0.035, B.Cu: −0.035 → 0)
- Viewer rotates each mesh by `mesh.rotation.x = Math.PI/2` so local Z maps to world Y (vertical)
- `+π/2` (not `−π/2`) puts B.Cu (bottom copper) facing **down** when looking from above

## Materials & lighting

Matte materials (low specular, low shininess) — don't use shiny defaults:

```js
copper:    { color: 0xf5c842, specular: 0x221100, shininess: 6  }
board:     { color: 0x27ae60, specular: 0x112211, shininess: 10, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }
component: { color: 0xe0609a, specular: 0x331122, shininess: 10 }
```

`polygonOffset` on the **board** prevents Z-fighting at z=0 (board top vs B.Cu top) and z=boardThickness (board bottom face would coincide with F.Cu bottom annulus rings).

Lighting (don't make ambient too high or it washes out depth):
```js
AmbientLight(0xffffff, 0.6)
DirectionalLight(0xfffbe8, 2.8) at (80, 160, 100)    // sun
DirectionalLight(0xd0e8ff, 0.9) at (-60, 40, -80)    // fill
DirectionalLight(0xffffff, 0.4) at (0, -60, -100)    // back
```

## Board Z-scaling (keep bottom fixed)

```js
// After fitCamera(), capture once:
boardOriginalPosY = boardMesh.position.y
boardBottomY      = worldBox.min.y    // stays fixed
boardTop          = worldBox.max.y    // at scale=1
copperOriginalY[name] = copperMesh.position.y

// On scale change:
board.scale.z      = bS
board.position.y   = boardBottomY + (boardOriginalPosY - boardBottomY) * bS
copper.scale.z     = zS
copper.position.y  = copperOriginalY[name] + boardHeight * (bS - 1) + copperLocalZBottom[name] * (zS - 1)
grid.position.y    = boardBottomY - 0.05
```

**Pitfall 1**: `boardHalfHeight * (scale-1)` is wrong for copper offset — it ignores the board's position shift. Use full `boardHeight * (scale-1)`.

**Pitfall 2**: Copper meshes have vertices at varying local Z depending on the app. PCB F.Cu is at local Z ≈ boardThickness; perfboard copper is at local Z ≈ 0. When `scale.z > 1`, vertices scale around the mesh origin by `localZ * (s-1)`. Use per-body `copperLocalZBottom[name]` (geometry bounding box max Z) — NOT `boardHeight`. Using `boardHeight` works for PCB F.Cu but breaks perfboard copper (localZ ≈ 0 needs zero compensation).

## Viewer3D as shared component

`Viewer3D.svelte` is used by **both** the PCB tool and the perfboard editor. It has no dependencies on KiCad, file parsing, or the web worker. It takes a `bodies` array and renders meshes with auto-assigned materials based on body names.

**When modifying Viewer3D.svelte:**
- Don't add PCB-tool-specific logic without guarding it (e.g. blade mode should not crash when `rawSegments` is null)
- All props have defaults — the perfboard tool passes `null` / `false` / `[]` for unused features (DRC, silk polylines, blade mode, etc.)
- New props should default to inactive/null so existing consumers don't break
- Test changes in **both** apps: load a KiCad file in the PCB tool AND place some pads in the perfboard tool

## Svelte 5 reactive patterns in Viewer3D

- Wrap `applyState()`, `fitCamera()`, and post-rebuild scaling inside `untrack(() => {…})` in the bodies rebuild `$effect` — prevents visibility/zScale from becoming deps of the rebuild effect and looping
- Keep separate cheap `$effect`s: visibility, copper zScale, board zScale
- `meshMap` is a plain JS object (not `$state`) — effects only re-run on their tracked deps
- Store original copper Y per body in `copperOriginalY[name]` so re-scaling preserves position

## STL export

- `STLExporter.parse(group, { binary: true })` returns a `DataView` — use `.buffer` for `Blob`
- Clone meshes and `applyMatrix4(mesh.matrixWorld)` before exporting so scale/rotation/position are baked in
- Filter by `mesh.visible` to respect layer toggles
- For merged copper+board print: pass `null` filter so all visible meshes are merged
- Filename: `{originalName}_{target}_3dprint_{YYYYMMDD-HHMMSS}.stl`

### Subtract mode CSG export (CRITICAL)

Subtract mode carves trace channels into the board using `three-bvh-csg`. **Do NOT use the combined copper mesh as the CSG cutter.** It has two fatal issues:

1. **Self-intersecting geometry**: All trace stadiums for a layer are merged into one mesh. Where stadiums overlap at junctions, the mesh self-intersects. `three-bvh-csg` produces garbage (inverted faces, missing geometry) with self-intersecting brushes.
2. **Drill holes create pillars**: Copper stadiums have drill holes punched through them. When subtracted from the board, the hole region is "outside" the cutter — leaving un-subtracted pillars of board material (mushroom shapes in slicer view).

**Correct approach: per-segment CSG subtraction.**

The worker sends raw segment data (`segments` field in RESULT) as a flat `Float32Array`. At export time, `doSubtractExport` builds individual stadium cutters per segment:

1. For each segment, `buildStadiumCutterGeo(p1x, p1y, p2x, p2y, hw, zBot, zTop)` creates a clean watertight stadium prism (no drill holes, no overlap with other segments)
2. The cutter's transform (rotation, scale, position) is copied from the existing copper mesh (already positioned for subtract mode)
3. Each cutter is subtracted from the board individually via `evaluator.evaluate(base, cutter, SUBTRACTION)`
4. Failed segments are skipped with a console warning (not fatal)

This is O(N) CSG operations but each cutter is small and non-self-intersecting. For typical PCBs (<100 segments), it completes in seconds.

**PIERCE offset:** `cutter.position.y += 0.01` shifts the cutter up so its top face is above the board surface. This avoids coplanar face degeneracy in CSG. Must be `<< copperHeight × zScale` or the cutter exits the board volume entirely.

## Centering

`fitCamera()` translates every mesh by `-center` of the combined bounding box so the model lands at world origin. Capture all board/copper metrics **after** centering.

## Body naming (matches viewer's name predicates)

- Board: `"PCB"` — `isPcbBoard()` matches via `endsWith('pcb')`
- Front copper traces: `"F.Cu"` — `isCopper()` matches via `includes('.cu')`
- Back copper traces: `"B.Cu"` — same
- Front copper text: `"F.Cu_text"` — also matched by `isCopper()` (contains `.cu`)
- Back copper text: `"B.Cu_text"` — same
- Front silkscreen: `"F.SilkS"` — `isSilkscreen()` matches via `includes('silks')`
- Back silkscreen: `"B.SilkS"` — same

Predicates in `Viewer3D.svelte` AND `LayerPanel.svelte` (duplicated):
- `isCopper(name)` — `.cu` in lowercase
- `isPcbBoard(name)` — not copper AND (`_pcb` or ends with `pcb`)
- `isSilkscreen(name)` — `silks` in lowercase
- `isComponent(name)` — none of the above (and not enclosure)

If you rename or add bodies, update predicates in **both** files.

## Blade mode (and saw teeth) — architecture

Blade mode (and its teeth add-on) lives entirely in the **main thread** (`App.svelte` → `computeBladeBodies`). The worker only sends the raw segment list (`bladeSrc`); the main thread does 2D polygon math and emits ready-to-render bodies.

**Pipeline:**
1. **Per-segment stadium polygons** (2D rings of `[x, y]` points) for outer-edge, inner-edge, and centerline widths
2. **`polygon-clipping.union(...polys)`** for outer and inner sets → multipolygons
3. **`polygon-clipping.difference(outer, inner)`** → wall band (multipolygon with outer + holes)
4. **earcut** triangulates the band (top/bottom) — extruded to 3D walls
5. **(optional) Saw teeth**: another union at centerline width → walk the perimeter at fixed pitch → emit triangular prism teeth as a **separate** `*_blade_teeth` body

**Don't try 3D CSG (three-bvh-csg) for blade mode** — sequential pairwise CSG of N stadium prisms is O(N²) and froze the page on real PCBs. 2D polygon union via `polygon-clipping` is orders of magnitude faster.

### polygon-clipping FP gotchas

The library is fast but trips on certain edge cases (`Error: Unable to complete output ring…`). Two mitigations layered together:

1. **Snap input coordinates** to a 0.001 mm grid: `v => Math.round(v*1000)/1000`. Eliminates FP drift in inputs.
2. **Tree-merge in chunks of ~8**, never `union(...everythingAtOnce)`. Drift accumulates in a single big union; chunk merging keeps each step small. If a chunk fails, fall back to pairwise within the chunk and skip individual segments that still fail. The blade still renders even if a couple of segments fail.

```js
async function mergeAll(polys) {
  let level = polys.slice()
  while (level.length > 1) {
    const next = []
    for (let i = 0; i < level.length; i += 8) {
      const chunk = level.slice(i, i + 8)
      try { next.push(polygonClipping.union(...chunk)) }
      catch { /* fall back to pairwise, skip failures */ }
    }
    level = next
    await new Promise(r => setTimeout(r, 0))   // yield UI between levels
  }
  return level[0] || []
}
```

## Generative outline-derived bodies (enclosure pattern)

The enclosure (and any future "extrude an offset of the board outline" feature — bezel, mask, jig, fixture) follows a different shape than the blade pattern. Capture this as a checklist before adding the next one.

**Source data: emit the polygon, not just segments.**
The worker packs `polygon` (board's `Edge.Cuts` ring) as a flat `Float32Array` of `[x, y]` pairs in KiCad coords (Y-down) and includes it in `RESULT` alongside `bladeSrc`. Add the buffer to the transferables list.

**Main-thread parser: snap, Y-flip, force CCW.**

```js
function parseBoardPoly(arr) {
  if (!arr || arr.length < 6) return null
  const pts = []
  for (let i = 0; i < arr.length; i += 2) pts.push([snap(arr[i]), snap(-arr[i + 1])])
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
  }
  if (area < 0) pts.reverse()       // force CCW (math convention)
  pts.push([pts[0][0], pts[0][1]])  // close ring (first == last)
  return pts
}
```

CCW is critical because `offsetPoly2D`'s right-perp normal assumes CCW = outward.

**Polygon offset: bisector method (cheap, fine for typical PCBs).**
For inflate (`r > 0`) or deflate (`r < 0`) of a closed CCW ring:

```js
function offsetPoly2D(closedRing, r) {
  const N = closedRing.length - 1
  const out = []
  for (let i = 0; i < N; i++) {
    const prev = closedRing[(i - 1 + N) % N]
    const curr = closedRing[i]
    const next = closedRing[(i + 1) % N]
    // right-perp of edge = outward for CCW
    const e1 = [curr[0]-prev[0], curr[1]-prev[1]]; const e1L = Math.hypot(...e1) || 1
    const e2 = [next[0]-curr[0], next[1]-curr[1]]; const e2L = Math.hypot(...e2) || 1
    const n1 = [e1[1]/e1L, -e1[0]/e1L]
    const n2 = [e2[1]/e2L, -e2[0]/e2L]
    const b = [n1[0]+n2[0], n1[1]+n2[1]]; const bL = Math.hypot(...b) || 1
    const bn = [b[0]/bL, b[1]/bL]
    const cosHalf = Math.max(0.1, n1[0]*bn[0] + n1[1]*bn[1])  // clamp for acute corners
    const dist = r / cosHalf
    out.push([curr[0] + bn[0]*dist, curr[1] + bn[1]*dist])
  }
  out.push([out[0][0], out[0][1]])
  return out
}
```

Self-intersects on sharp concave corners with large offsets — out of scope for normal PCBs. If you need robustness for arbitrary outlines, fall back to the stadium-union approach (same as blade) using one stadium per edge.

**earcut requires outer CCW + holes CW.**

This bit gotcha'd the enclosure for an evening. `polygon-clipping` returns rings in `outer CCW + holes CW` form, so blade code passes them through directly. **Polygons you generate from `offsetPoly2D` are all CCW.** When you pass an inner ring as a *hole* to earcut, you must reverse it first, or earcut fills the hole with triangles instead of leaving it open:

```js
for (const hole of holes) {
  holeIdx.push(count)
  const hverts = ringVerts(hole)
  for (let i = hverts.length - 1; i >= 0; i--) {  // ← reverse here
    flat.push(hverts[i][0], hverts[i][1])
    count++
  }
}
```

Symptoms when forgotten: enclosure renders as a solid block fully covering the board, no visible cavity; STL export is also solid.

**Build a single watertight body from face groups, not stacked prisms.**

Stacking 3 separate prisms (floor, outer wall, shelf) leaves coplanar faces at their interfaces → Z-fighting. Build one mesh with N face groups instead. The enclosure has 7:

1. outer bottom (full footprint, −Z normal)
2. outer side wall (outerOuter ring, outward)
3. wall top (outerOuter with outerInner hole, +Z)
4. wall inner step (outerInner, vertical, inward)
5. shelf top (outerInner with shelfInner hole, +Z)
6. shelf inner step (shelfInner, vertical, inward)
7. floor top (shelfInner footprint, +Z)

Each face group emits its own vertex range with per-face flat normals. No vertex sharing between groups → hard creases at corners, no normal interpolation artefacts.

**Side-wall winding works for both ascending and descending Z.**

For a CCW ring with right-perp = outward:

```js
// Standard quad winding — works for z0 < z1 (outer wall going up) AND
// z0 > z1 (inner step going down) AND with inward=true (normal flipped).
idx.push(v_a0, v_b0, v_b1, v_a0, v_b1, v_a1)
```

Verified by cross product: the triangle's geometric normal always matches the written normal, regardless of z direction or inward/outward, when the ring is CCW. Don't second-guess and flip windings.

**Local-coords Z layout decides the alignment.**

Convention used: `local Z = 0` is the surface where the **board rests** (shelf top in the enclosure). The board's worker geometry has `z = 0` at its bottom. By making the enclosure's shelf top also at `z = 0`, the two meshes share the same world Y at that plane after centering — no per-mesh repositioning needed at construction.

Layout for an enclosure with floor thickness `fT`, shelf height `sH`, total height `H`:

```js
const zShelfTop = 0
const zFloorTop = -sH
const zBot      = -(fT + sH)
const zWallTop  = H - sH
```

## Alternate-presentation toggles (preview modes)

The `enclosureSideBySide` toggle is a different beast from a variant body — it doesn't generate new geometry, it just re-presents the same mesh. Pattern:

1. **Capture base positions post-centering.** All meshes share the same `position` after `applyCenterToMeshes` (each starts at `(0,0,0)` and gets the same `pcbWorldCenter` subtracted). Capture once per rebuild:

```js
const anyMesh = Object.values(meshMap)[0]
meshBaseX = anyMesh ? anyMesh.position.x : 0
meshBaseY = anyMesh ? anyMesh.position.y : 0
meshBaseZ = anyMesh ? anyMesh.position.z : 0
```

2. **One presentation function** (`applyEnclosurePresentation(side)`) handles the toggle's effect on every mesh: rotation, position, material. Reverts to base values when the toggle goes off.

3. **Dedicated `$effect` reacting only to the toggle** — don't tangle this into the bodies-rebuild effect:

```js
$effect(() => {
  const side = enclosureSideBySide
  untrack(() => {
    applyEnclosurePresentation(side)
    fitForSideBySide()
  })
})
```

4. **Re-call it from the bodies-rebuild effect too** so a fresh rebuild (e.g. enclosure params changed) honours the current toggle state.

### `mesh.rotation` rotates around local origin, not geometry center

This bit the enclosure for an hour. `mesh.rotation.x = -π/2` rotates the geometry around the mesh's **local origin** (`(0, 0, 0)` in the mesh's coord frame), not around the geometry's bounding-box centre. KiCad-derived geometry has vertices at local Y ≈ -130 (the board's centre in KiCad coords), far from local origin.

Switching from `+π/2` to `-π/2` swaps how local Y maps to world Z (was `world Z = local Y`, becomes `world Z = -local Y`). For a vertex at local Y = -130, that's a **260 mm jump** in world Z, blowing up the bounding box by an order of magnitude and pushing the camera to z ≈ 250.

Fix: capture `meshBaseZ = position.z` post-centering, and set `position.z = -meshBaseZ` when the rotation flips. The base value already encodes `-pcbWorldCenter.z` (= the local Y centre with sign), so negating it cancels the flip.

The same pitfall applies to any axis. If you ever rotate a mesh whose geometry isn't centred on its local origin, expect to compensate position on the swapped axis.

### Symmetric layout uses both meshes' bbox widths

A naïve symmetric shift (board at `−offset`, enclosure at `+offset` for the same `offset`) is **not** centred when the two meshes have different widths. The enclosure is wider than the board by `2 × (clearance + wallThickness)`, so the combined bbox drifts by half that.

Use each mesh's own width:

```js
const gap = 2
const totalW = boardWidthX + gap + enclosureWidthX
const boardOffset = -(gap + enclosureWidthX) / 2  // = -(totalW/2 - boardWidthX/2)
const encOffset   =  (gap + boardWidthX) / 2      // = +(totalW/2 - encWidth/2)
```

Capture both widths from `Box3.setFromObject(mesh)` during the rebuild metric pass.

### Bottom alignment uses `boardBottomY` as the anchor

After flipping rotation, the enclosure's lowest world Y rarely matches the board's pinned screen-bottom (`boardBottomY`). To make both pieces sit on the same grid plane, shift the enclosure (NOT the board — that would tangle with `applyBoardScale`'s pin logic):

```js
if (mesh.geometry.boundingBox === null) mesh.geometry.computeBoundingBox()
const zBot = mesh.geometry.boundingBox.min.z
mesh.position.y = boardBottomY - zBot
```

### Repin the grid on every layout change

`grid.position.y = sceneBottomY - 0.05` is set once during the bodies rebuild, but side-by-side mode shifts the enclosure to a new world Y. Recompute `sceneBottomY = box.min.y` and reposition the grid inside `fitForSideBySide` (or any preview-mode framing function). Otherwise both pieces float above a stale grid.

## Camera lifecycle for view-mode toggles

- **File load** → `initialFit()` (resets orbit + distance to default top-isometric).
- **Bodies rebuild** (enclosure toggle, blade params, trace-width offset) → `applyCenterToMeshes()` only; **do not refit** the camera. User's orbit/zoom is preserved.
- **View-mode toggle** (side-by-side) → dedicated refit (`fitForSideBySide`) that resets to a known angle so the layout reads correctly regardless of where the user had orbited. Side-by-side is a "preview mode"; resetting orbit on the toggle is expected behaviour.
- **Settings sliders** (slider drag) → never touch the camera.

The `hasInitialFit` flag distinguishes "first non-empty rebuild" from "subsequent rebuilds":

```js
if (!hasInitialFit) {
  initialFit()         // computes pcbWorldCenter, sets camera.position
  hasInitialFit = true
}
applyCenterToMeshes()  // every rebuild — uses the stored pcbWorldCenter
```

Reset `hasInitialFit = false` when bodies become empty (file unload) so the next file gets fresh framing.

## Variant bodies (alternate visualisations of a logical layer)

A logical copper layer (`F.Cu`) can have multiple geometry variants. Convention used here:

- `F.Cu` / `B.Cu` — the canonical solid trace bodies (used by raise/subtract modes)
- `F.Cu_blade` / `B.Cu_blade` — wall band for blade mode
- `F.Cu_blade_teeth` / `B.Cu_blade_teeth` — saw teeth on top of the blade wall

**Rules for adding variants:**

1. **Naming:** suffix the canonical name (`F.Cu_<variant>`). Update `isBlade()` (or add a new predicate) in `Viewer3D.svelte`.
2. **Filter from layer panel:** in `App.svelte`, `visibleBodies` strips variant suffixes so the LayerPanel/InfoPanel/ExportPanel show one logical row per layer. The Viewer3D still receives the full `bodies` array.
3. **Visibility mirroring:** in Viewer3D's visibility effect, variant meshes inherit visibility from their solid twin via `copperVisible(name)` (regex-strips the suffix and checks `vis[solidName]`). Toggling F.Cu off in LayerPanel hides ALL its variants.
4. **Active-variant gating:** `activeForMode(name)` decides which variant is visible based on `traceMode`. In blade mode, only `*_blade*` meshes are visible; otherwise only the canonical `F.Cu`/`B.Cu`.

## Per-body custom scaling rules

Default copper meshes get `mesh.scale.z = zScale` so wall height tracks the user's "Copper Z-scale" slider. **Some variants need different scaling** — e.g. saw teeth must keep a constant physical height while the wall under them grows.

The pattern:

1. The body carries a metadata field on the body object (e.g. `teethWallTopZ`) — a worker-coords Z value of the surface this body should "ride on".
2. The Viewer3D rebuild captures this into a `teethWallTopZ` map keyed by mesh name.
3. `applyCopperScale` branches on `isBladeTeeth(name)`: sets `mesh.scale.z = 1` (no scale) and shifts `position.y` by `-wallTopZ * (zS - 1)` so the local-z=wallTopZ vertex lands at the same world-y as the (scaled) wall's top.

```js
if (isBladeTeeth(name)) {
  mesh.scale.z = 1
  mesh.position.y =
    (copperOriginalY[name] ?? 0)
    + boardHeight * (bS - 1)
    - (teethWallTopZ[name] ?? 0) * (zS - 1)
  continue
}
```

Math derivation: vertex world-y = `-local_z * scale.z + position.y` (after `rotation.x = π/2`). Setting tooth-base world-y equal to scaled-wall-top world-y gives the formula above.

## Lazy / reactive recompute pattern

For expensive derived state (blade geometry can take seconds), don't recompute on every parameter change inside the hot effect. Instead, capture the **input fingerprint** as a string and bail if unchanged:

```js
let lastBladeKey = null
$effect(() => {
  if (traceMode !== "blade" || !bladeSrc) return
  const key = `${bladeThickness}|${bladeDirection}|${bladeTeeth}|${bladeToothPitch}|${bladeToothHeight}`
  if (key === lastBladeKey && bladeStatus === "ready") return
  if (bladeStatus === "computing") return   // already in flight
  lastBladeKey = key
  computeBladeBodies()                       // async; not awaited
})
```

Two guard clauses prevent both no-op recomputes (key matches) and overlapping computes (still running).

## Common pitfalls

- **Rectangle + separate cap for traces** → visible seams when the cap is an annulus (drill hole). Use stadium-with-hole instead.
- **`computeVertexNormals()` on extruded shapes** → puffy/balloon look; flat tops become rounded. Always provide explicit normals.
- **Standard math rotation for KiCad pads** → wrong side. Use the negated formula above.
- **`toFixed(2)` or integer-bucket keys for drill ↔ trace matching** → FP edge cases miss matches. Use the tolerance-based linear lookup.
- **Drill bigger than trace width** → annulus would have negative thickness. Clamp effective drill radius to `hw - 0.02` so earcut gets a thin but valid annulus. The hole still appears visually correct. Never skip the hole entirely — traces would cover pad drill holes in 3D.
- **Coplanar faces at z=0 and z=boardThickness** → Z-fighting between board and copper. Add `polygonOffset` on the board material.
- **3D CSG over many small meshes** → O(N²) blowup, page freezes. Use 2D polygon clipping when the operation is fundamentally 2D (extrude after).
- **Single big `polygon-clipping.union(...allPolys)`** → fails on real geometry with FP errors. Snap inputs + tree-merge in small chunks.
- **Recomputing inside an `$effect` that tracks the same state it writes** → infinite loop. Use `untrack()` for writes, or guard with a fingerprint key + computing-status flag.
- **Mixing the canonical body's scale rules with a variant's** → e.g. teeth scaling with zScale when they shouldn't. Branch `applyCopperScale` per variant; each variant's body can carry the metadata it needs (e.g. `teethWallTopZ`).
- **Passing a CCW ring to earcut as a hole** → earcut requires `outer CCW + holes CW`. Polygons from `polygon-clipping` come out in this convention; polygons you build yourself (e.g. via `offsetPoly2D`) are all CCW, so you must reverse hole rings before passing them in. Symptoms: rings get filled with triangles instead of being left open.
- **`mesh.rotation` rotating around local origin** when the geometry isn't centred there → flipping `rotation.x` from `+π/2` to `-π/2` teleports vertices by `2 × localCenter` along the swapped axis. Capture `meshBaseZ = position.z` post-centering and set `position.z = -meshBaseZ` in the flipped state to cancel the jump. Symptom: bbox span explodes, camera ends up at z ≈ 250 for a 30 mm board.
- **Symmetric `±offset` shift with mismatched-width meshes** → combined bbox isn't centred. Use each mesh's own width: `boardOffset = -(gap + encWidth)/2`, `encOffset = (gap + boardWidth)/2`.
- **Stale grid after a layout change** → `grid.position.y` is set during the bodies rebuild but doesn't update when a preview-mode toggle shifts meshes. Recompute `sceneBottomY` and reposition the grid inside the preview-mode framing function.
- **Resetting camera on every settings change** → user complaint magnet ("camera always resets"). Only `initialFit()` on file load; preserve orbit on settings sliders and bodies rebuilds. Refit only on view-mode toggles where the layout fundamentally changed.
- **Stacking 3 separate prisms (floor + walls + shelf) for the enclosure** → coplanar faces at their interfaces cause Z-fighting. Build one watertight body with N face groups (no shared vertices between groups for hard creases).
- **Using combined copper mesh as CSG cutter in subtract mode** → self-intersecting overlapping stadiums + drill holes produce inverted faces and pillar artifacts. Build individual stadium cutters per segment (no drills) and subtract one by one.
- **Per-segment stadiums for text strokes** → visible gaps at joints where stroke segments meet at angles. Use thick polyline geometry with miter joins and semicircle end caps instead.
- **Computing board metrics from `!isCopper(name)` instead of `isPcbBoard(name)`** → silkscreen text bodies (tiny bounding boxes) overwrite `boardBottomY`/`boardTop`, corrupting copper Z positioning for all modes.
- **Fixing a geometry bug in only one place** → `buildBoardGeometry` and `buildTracesGeometry` exist in both `src/lib/geometry.js` (ES module, used by perfboard) and `public/pcb-worker.js` (classic worker, used by PCB tool). A fix in one must be mirrored in the other.
- **Body names that don't match Viewer3D predicates** → perfboard bodies must be named `'PCB'`, `'Pads_F.Cu'`, `'F.Cu'` (or similar patterns containing `.cu` / ending with `pcb`) to get correct materials. A body named `'pads'` would get the component material (pink), not copper (gold).
- **Hit testing curved SVG elements with straight-line distance** → jumper wires render as quadratic bezier arcs but `distToSegment` checks the chord. Clicks on the arc's curved portion miss. Sample the bezier into N line segments and check distance to each. SVG render order also matters: jumpers must be the topmost SVG layer so they visually "sit above" the board.
- **Loading old perfboard JSON without `dips`/`jumpers` field** → crashes on `doc.dips.filter(...)` or `doc.jumpers.filter(...)`. Always add `parsed.dips = parsed.dips ?? []` and `parsed.jumpers = parsed.jumpers ?? []` in every load path (file upload, localStorage, example fetch).
- **Traces covering pad drill holes in 3D** → `buildTracesGeometry` only punches drill holes at segment endpoints. If a trace passes through a pad that isn't a waypoint, no hole appears. `collectTraceSegments` in `perfboard-geometry.js` splits segments at intermediate pad positions to fix this. Also, when drill radius ≥ half trace width, clamp the effective hole radius to `hw - 0.02` instead of skipping — skipping would leave the trace covering the pad's drill hole.
- **Copper Z-scale drift** → copper meshes have vertices at local Z that varies by app. PCB tool F.Cu is at local Z ≈ boardThickness; perfboard copper is at local Z ≈ 0. `scale.z > 1` scales around mesh origin, pushing copper away by `localZ * (s-1)`. `applyCopperScale` uses per-body `copperLocalZBottom[name]` (geometry bounding box max Z) for the drift term — NOT `boardHeight`. Using `boardHeight` works for PCB F.Cu (where localZ ≈ boardHeight) but breaks perfboard copper (where localZ ≈ 0, so no drift compensation is needed).
- **Perfboard copper Z convention** → In the viewer, `rotation.x = π/2` maps local Z to world Y with `world_Y = position.y - z * scale.z`. Higher local Z = lower world Y (further down). The board spans z=0 (visual top) to z=thickness (visual bottom). Perfboard copper must be at z=-copperThickness to z=0 (above board surface, like B.Cu in PCB tool), NOT at z=thickness to z=thickness+copperThickness (which puts it below the board).

