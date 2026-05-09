# Blade mode & enclosure (advanced geometric features)

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
