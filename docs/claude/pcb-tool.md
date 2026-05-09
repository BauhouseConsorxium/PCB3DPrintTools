# PCB tool (KiCad → 3D print)

The whole tool exists to support the copper-tape PCB fabrication trick:

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
