# Shared geometry

## Module: `src/lib/geometry.js`

Pure geometry builder functions extracted from `pcb-worker.js` as ES module exports:

- `signedArea(pts)`, `ensureCCW(pts)`, `pointInPolygon(px, py, poly)`
- `makeDrillLookup(drills)` — tolerance-based spatial lookup, returns drill radius
- `buildBoardGeometry(polygon, drills, thickness)` → `{name:'PCB', positions, normals, indices}`
- `buildTracesGeometry(segments, drills, layer, zBot, zTop, squareEnds)` → body with stadium traces

Uses `import earcut from 'earcut'` (ES module import, not the worker's `importScripts` copy).

**Parallel copies exist:** `pcb-worker.js` has its own copy of these functions (with `earcutFn` from `importScripts`). The worker can't import ES modules. If you fix a geometry bug, update **both** `src/lib/geometry.js` AND `public/pcb-worker.js`. Long term these should be unified, but the worker's classic-script constraint prevents it today.

## Stadium-with-hole per segment (CRITICAL)

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

## Earcut conventions

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
