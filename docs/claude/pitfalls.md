# Common pitfalls

## Geometry

- **Rectangle + separate cap for traces** → visible seams when the cap is an annulus (drill hole). Use stadium-with-hole instead.
- **`computeVertexNormals()` on extruded shapes** → puffy/balloon look; flat tops become rounded. Always provide explicit normals.
- **Standard math rotation for KiCad pads** → wrong side. Use the negated formula in `pcb-tool.md`.
- **`toFixed(2)` or integer-bucket keys for drill ↔ trace matching** → FP edge cases miss matches. Use the tolerance-based linear lookup.
- **Drill bigger than trace width** → annulus would have negative thickness. Clamp effective drill radius to `hw - 0.02` so earcut gets a thin but valid annulus. The hole still appears visually correct. Never skip the hole entirely — traces would cover pad drill holes in 3D.
- **Coplanar faces at z=0 and z=boardThickness** → Z-fighting between board and copper. Add `polygonOffset` on the board material.
- **Per-segment stadiums for text strokes** → visible gaps at joints where stroke segments meet at angles. Use thick polyline geometry with miter joins and semicircle end caps instead.
- **Passing a CCW ring to earcut as a hole** → earcut requires `outer CCW + holes CW`. Polygons from `polygon-clipping` come out in this convention; polygons you build yourself (e.g. via `offsetPoly2D`) are all CCW, so you must reverse hole rings before passing them in. Symptoms: rings get filled with triangles instead of being left open.
- **Stacking 3 separate prisms (floor + walls + shelf) for the enclosure** → coplanar faces at their interfaces cause Z-fighting. Build one watertight body with N face groups (no shared vertices between groups for hard creases).
- **Fixing a geometry bug in only one place** → `buildBoardGeometry` and `buildTracesGeometry` exist in both `src/lib/geometry.js` (ES module, used by perfboard) and `public/pcb-worker.js` (classic worker, used by PCB tool). A fix in one must be mirrored in the other.

## Performance / 2D vs 3D math

- **3D CSG over many small meshes** → O(N²) blowup, page freezes. Use 2D polygon clipping when the operation is fundamentally 2D (extrude after).
- **Single big `polygon-clipping.union(...allPolys)`** → fails on real geometry with FP errors. Snap inputs + tree-merge in small chunks.
- **Using combined copper mesh as CSG cutter in subtract mode** → self-intersecting overlapping stadiums + drill holes produce inverted faces and pillar artifacts. Build individual stadium cutters per segment (no drills) and subtract one by one.

## Three.js / viewer

- **`mesh.rotation` rotating around local origin** when the geometry isn't centred there → flipping `rotation.x` from `+π/2` to `-π/2` teleports vertices by `2 × localCenter` along the swapped axis. Capture `meshBaseZ = position.z` post-centering and set `position.z = -meshBaseZ` in the flipped state to cancel the jump. Symptom: bbox span explodes, camera ends up at z ≈ 250 for a 30 mm board.
- **Symmetric `±offset` shift with mismatched-width meshes** → combined bbox isn't centred. Use each mesh's own width: `boardOffset = -(gap + encWidth)/2`, `encOffset = (gap + boardWidth)/2`.
- **Stale grid after a layout change** → `grid.position.y` is set during the bodies rebuild but doesn't update when a preview-mode toggle shifts meshes. Recompute `sceneBottomY` and reposition the grid inside the preview-mode framing function.
- **Resetting camera on every settings change** → user complaint magnet ("camera always resets"). Only `initialFit()` on file load; preserve orbit on settings sliders and bodies rebuilds. Refit only on view-mode toggles where the layout fundamentally changed.
- **Computing board metrics from `!isCopper(name)` instead of `isPcbBoard(name)`** → silkscreen text bodies (tiny bounding boxes) overwrite `boardBottomY`/`boardTop`, corrupting copper Z positioning for all modes.
- **Body names that don't match Viewer3D predicates** → perfboard bodies must be named `'PCB'`, `'Pads_F.Cu'`, `'F.Cu'` (or similar patterns containing `.cu` / ending with `pcb`) to get correct materials. A body named `'pads'` would get the component material (pink), not copper (gold).
- **Mixing the canonical body's scale rules with a variant's** → e.g. teeth scaling with zScale when they shouldn't. Branch `applyCopperScale` per variant; each variant's body can carry the metadata it needs (e.g. `teethWallTopZ`).
- **Body between board surface and copper-scaled mesh classified as `isPcbBoard`** → gap appears at non-unity copper Z-scale. The board-classified body stays fixed while the copper-scaled neighbor shifts by `copperThickness * (zS - 1)`. Fix: give the bridge body its own predicate with `scale.z = zS` and no copper position offset, so it stretches from the board surface to meet the shifted neighbor. This happened with `SocketBase_pcb` (pin housing base): at `isPcbBoard` it created a visible gap between the board and the shifted `Socket_pcb` housing. Solved by adding `isPinHousingBase` that scales with copper but stays anchored at the board surface. **General rule: when adding a body that bridges a board surface and a copper-positioned body, think about which predicate governs its Z-scale behavior — don't default to `isPcbBoard`.**

## Reactivity

- **Recomputing inside an `$effect` that tracks the same state it writes** → infinite loop. Use `untrack()` for writes, or guard with a fingerprint key + computing-status flag.

## Perfboard-specific

- **Hit testing curved SVG elements with straight-line distance** → jumper wires render as quadratic bezier arcs but `distToSegment` checks the chord. Clicks on the arc's curved portion miss. Sample the bezier into N line segments and check distance to each. SVG render order also matters: jumpers must be the topmost SVG layer so they visually "sit above" the board.
- **Loading old perfboard JSON without `dips`/`jumpers` field** → crashes on `doc.dips.filter(...)` or `doc.jumpers.filter(...)`. Always add `parsed.dips = parsed.dips ?? []` and `parsed.jumpers = parsed.jumpers ?? []` in every load path (file upload, localStorage, example fetch).
- **Traces covering pad drill holes in 3D** → `buildTracesGeometry` only punches drill holes at segment endpoints. If a trace passes through a pad that isn't a waypoint, no hole appears. `collectTraceSegments` in `perfboard-geometry.js` splits segments at intermediate pad positions to fix this. Also, when drill radius ≥ half trace width, clamp the effective hole radius to `hw - 0.02` instead of skipping — skipping would leave the trace covering the pad's drill hole.
- **Copper Z-scale drift** → copper meshes have vertices at local Z that varies by app. PCB tool F.Cu is at local Z ≈ boardThickness; perfboard copper is at local Z ≈ 0. `scale.z > 1` scales around mesh origin, pushing copper away by `localZ * (s-1)`. `applyCopperScale` uses per-body `copperLocalZBottom[name]` (geometry bounding box max Z) for the drift term — NOT `boardHeight`. Using `boardHeight` works for PCB F.Cu (where localZ ≈ boardHeight) but breaks perfboard copper (where localZ ≈ 0, so no drift compensation is needed).
- **Perfboard copper Z convention** → In the viewer, `rotation.x = π/2` maps local Z to world Y with `world_Y = position.y - z * scale.z`. Higher local Z = lower world Y (further down). The board spans z=0 (visual top) to z=thickness (visual bottom). Perfboard copper must be at z=-copperThickness to z=0 (above board surface, like B.Cu in PCB tool), NOT at z=thickness to z=thickness+copperThickness (which puts it below the board).
- **Perfboard component bodies on the wrong side** → on a perfboard, components mount on the side OPPOSITE to the copper. Copper is on top (negative Z direction), so component bodies must be at positive Z (below the board). Pin wires extend from above the housing through the board hole and poke up to the copper side as short solder tails.
