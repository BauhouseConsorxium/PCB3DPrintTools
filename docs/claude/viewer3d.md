# Viewer3D (Three.js)

`Viewer3D.svelte` is used by **both** the PCB tool and the perfboard editor. It has no dependencies on KiCad, file parsing, or the web worker. It takes a `bodies` array and renders meshes with auto-assigned materials based on body names.

**When modifying Viewer3D.svelte:**
- Don't add PCB-tool-specific logic without guarding it (e.g. blade mode should not crash when `rawSegments` is null)
- All props have defaults — the perfboard tool passes `null` / `false` / `[]` for unused features (DRC, silk polylines, blade mode, etc.)
- New props should default to inactive/null so existing consumers don't break
- Test changes in **both** apps: load a KiCad file in the PCB tool AND place some pads in the perfboard tool

## Coordinate system

- KiCad uses Y-down; the worker emits geometry with **local Y = −kicadY** (so up-on-screen = up in 3D)
- Worker emits geometry with Z = thickness direction (board: 0 → thickness, F.Cu: thickness → +0.035, B.Cu: −0.035 → 0)
- Viewer rotates each mesh by `mesh.rotation.x = Math.PI/2` so local Z maps to world Y (vertical)
- `+π/2` (not `−π/2`) puts B.Cu (bottom copper) facing **down** when looking from above
- After rotation: `world_Y = position.y - z * scale.z`. Higher local Z = lower world Y (further down).

## Materials & lighting

Matte materials (low specular, low shininess) — don't use shiny defaults:

```js
copper:    { color: 0xf5c842, specular: 0x221100, shininess: 6  }
board:     { color: 0x27ae60, specular: 0x112211, shininess: 10, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }
component: { color: 0xe0609a, specular: 0x331122, shininess: 10 }
silkscreen: { color: 0xf0f0f0, specular: 0x444444, shininess: 30, side: DoubleSide }
```

`polygonOffset` on the **board** prevents Z-fighting at z=0 (board top vs B.Cu top) and z=boardThickness (board bottom face would coincide with F.Cu bottom annulus rings).

Lighting (don't make ambient too high or it washes out depth):
```js
AmbientLight(0xffffff, 0.6)
DirectionalLight(0xfffbe8, 2.8) at (80, 160, 100)    // sun
DirectionalLight(0xd0e8ff, 0.9) at (-60, 40, -80)    // fill
DirectionalLight(0xffffff, 0.4) at (0, -60, -100)    // back
```

## Body name predicates (matches viewer's auto-assigned materials)

Predicates live in `src/lib/viewer-predicates.js` (imported by both Viewer3D and LayerPanel):
- `isCopper(name)` — `.cu` in lowercase → gold material, scales with copper zScale
- `isPcbBoard(name)` — not copper, not pin housing/base AND (`_pcb` or ends with `pcb`) → green, scales with board zScale
- `isPinHousing(name)` — starts with `Socket_pcb` (not base) → green, no scale, position shifts with copper zScale
- `isPinHousingBase(name)` — starts with `SocketBase_pcb` → green, scales with copper zScale, anchored at board surface
- `isSilkscreen(name)` — `silks` in lowercase
- `isComponent(name)` — none of the above (and not enclosure, jumper)

If you rename or add bodies, update predicates in the file. **The predicate a body matches determines its Z-scale behavior** — this is the most common source of positioning bugs.

Example body names:
- Board: `"PCB"` — `isPcbBoard()` matches via `endsWith('pcb')`
- Front copper traces: `"F.Cu"` — `isCopper()` matches via `includes('.cu')`
- Back copper traces: `"B.Cu"` — same
- Front copper text: `"F.Cu_text"` — also matched by `isCopper()` (contains `.cu`)
- Front silkscreen: `"F.SilkS"` — `isSilkscreen()` matches via `includes('silks')`
- Component bodies (perfboard): `"Component_h0"`, `"Component_d0"` — pink via `isComponent()`
- Pin housing socket: `"Socket_pcb_0"` — green via `isPinHousing()`
- Pin housing base: `"SocketBase_pcb_0"` — green via `isPinHousingBase()`

Silkscreen scales with board (not copper) in `applyBoardScale`. Copper text (`*_text`) matched by `isCopper()` → scales with copper zScale.

### Z-scale classification rules

Each predicate corresponds to a different Z-scale behavior in `applyCopperScale` / `applyBoardScale`:

| Predicate | `scale.z` | Position shift | Anchored at |
|-----------|-----------|---------------|-------------|
| `isPcbBoard` | boardZScale | board bottom fixed | board bottom |
| `isCopper` | copperZScale | board shift + local-Z drift | per-body |
| `isPinHousing` | 1 (no scale) | board shift + copper thickness growth | flush with copper top |
| `isPinHousingBase` | copperZScale | board shift only | board surface (stretches toward housing) |
| `isComponent` | 1 (no scale) | none | fixed |

When creating a new body that sits between the board surface and a copper-scaled body, it must either scale with copper or be positioned to track the copper growth. Classifying it as `isPcbBoard` will leave it fixed while copper-scaled neighbors shift away, creating a visible gap.

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

**Board metrics pitfall:** When computing `boardBottomY`/`boardTop`, use `isPcbBoard(name)` — NOT `!isCopper(name)`. Silkscreen text bodies have tiny bounding boxes (~0.035mm height) that will overwrite board metrics and corrupt all copper Z positioning if matched.

## Svelte 5 reactive patterns

- Wrap `applyState()`, `fitCamera()`, and post-rebuild scaling inside `untrack(() => {…})` in the bodies rebuild `$effect` — prevents visibility/zScale from becoming deps of the rebuild effect and looping
- Keep separate cheap `$effect`s: visibility, copper zScale, board zScale
- `meshMap` is a plain JS object (not `$state`) — effects only re-run on their tracked deps
- Store original copper Y per body in `copperOriginalY[name]` so re-scaling preserves position

## Centering

`fitCamera()` translates every mesh by `-center` of the combined bounding box so the model lands at world origin. Capture all board/copper metrics **after** centering.

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
