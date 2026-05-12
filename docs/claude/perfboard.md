# Perfboard editor

The perfboard tool targets the same copper-tape fabrication method as the PCB tool but skips KiCad entirely. Users design directly on a 2.54mm grid:

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

## Data model

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
  headers: [{ id, col, row, count, orientation: "h"|"v", labels?: string[], female?: boolean }],
  dips: [{ id, col, row, count, orientation: "h"|"v", rowSpacing: 3, label?, socket? }],
  traces: [{ id, points: [{col, row}], width }],
  jumpers: [{ id, col1, row1, col2, row2 }]
}
```

Grid coords are half-integer col/row (0-based, snapped to 0.5 increments for half-pitch placement). World positions = `col * pitch`, `row * pitch`. The geometry converter Y-flips during conversion (`row → -row * pitch`), matching the existing Y-down → Y-up convention.

## Body naming

- Board: `'PCB'` — green material via `isPcbBoard()`
- Pad rings: `'Pads_F.Cu'` — contains `.cu`, gold copper material via `isCopper()`
- Traces: `'F.Cu'` — standard copper name
- Component bodies: `'Component_h{i}'`, `'Component_d{i}'` — pink via `isComponent()`
- Pin housing socket: `'Socket_pcb_{i}'` — green via `isPinHousing()`, shifts with copper Z-scale
- Pin housing base: `'SocketBase_pcb_{i}'` — green via `isPinHousingBase()`, scales with copper Z-scale, anchored at board surface

These names are chosen to trigger the correct Viewer3D material predicates and Z-scale behavior. If you add new body types, ensure the name matches an existing predicate or add a new one to `src/lib/viewer-predicates.js`. **The predicate determines Z-scale positioning** — see the Z-scale classification table in `docs/claude/viewer3d.md`.

## Geometry pipeline (`src/lib/perfboard-geometry.js`)

`buildPerfboardBodies(doc)` runs on the **main thread** (no worker needed — perfboards are small):

1. `buildBoardPolygon(doc)` → rectangular CCW polygon with half-pitch margin
2. `collectPadPositions(doc)` → deduped pad positions from pads + expanded headers + DIPs
3. `buildBoardGeometry(polygon, drills, thickness)` → board body with drill holes (from `geometry.js`)
4. `buildPadRingsGeometry(positions, drillR, padR, zBot, zTop)` → annular copper rings per pad
5. `collectTraceSegments(doc, padPositions)` → splits segments at intermediate pad positions so every pad gets a drill hole
6. `buildTracesGeometry(segments, drills, layer, zBot, zTop)` → stadium copper traces (from `geometry.js`)
7. `buildComponentBodies(doc)` → lo-fi 3D component bodies (headers, DIP ICs, IC sockets)

Pad rings are structurally identical to board geometry: outer circle CCW + inner circle CW hole → earcut → extrude. All pads batched into a single body.

## SVG grid editor (`GridEditor.svelte`)

- SVG-based with `viewBox` pan/zoom (wheel = zoom around cursor, shift+drag or middle-drag = pan)
- Grid snap: half-pitch (`Math.round(x / pitch * 2) / 2`) via `svg.getScreenCTM().inverse()` — grid dots render at full and half-pitch
- Tool system: `activeTool` state drives click/move handlers (default: `'select'`)
  - `'pad'` — click to toggle pad at intersection (hotkey: 1). Double-click in select mode to edit pad label.
  - `'header'` — click start → drag direction → click to place multi-pin header (hotkey: 2). Double-click in select mode to edit per-pin labels.
  - `'dip'` — click start → drag direction → click to place DIP IC package, 2 rows with 3-pitch spacing (hotkey: 3). Requires count ≥ 2. Double-click in select mode opens a popup with IC label input + DIP IC / IC Socket toggle (changes apply live, no Enter required).
  - `'trace'` — click waypoints → double-click to finish; L-shaped Manhattan routing per click (hotkey: 4)
  - `'jumper'` — click start → click end → creates component-side wire (2D only, no 3D geometry) (hotkey: 5)
  - `'label'` — click to place text annotation (hotkey: 6)
  - `'select'` — click to select, shift+click to toggle multi-select, drag empty area for rubber band selection, Delete to remove all selected, R to rotate
  - `'erase'` — click to remove (hotkey: 7)
- Right-click or Escape cancels in-progress trace/header/dip/jumper; Escape with no drawing in progress switches to select tool
- Double-click editing: pads show single label input; headers show per-pin label list (Enter advances to next pin); DIPs show IC label input + socket toggle; jumpers show color picker; annotations show text+color editor
- Multi-select: `selectedIds` array (not single `selectedId`), shift+click toggles, rubber band drag selects enclosed elements, drag-move and delete operate on full selection as single undo step
- Hit testing: pads/headers/DIPs use exact grid match; traces and jumpers use proximity-based `distToSegment` with bezier curve sampling (jumpers render as quadratic bezier arcs)
- Selection highlight: amber fill (`#fbbf24`) with semi-transparent white border (`rgba(255,255,255,0.45)`)
- Jumpers render as solid lines (no dasharray)

## State management (`PerfboardApp.svelte`)

All state lives in `PerfboardApp.svelte` as `$state` runes (same pattern as `App.svelte`). The `doc` object is mutated by tool callbacks. `perfboardBodies` is `$derived` from `buildPerfboardBodies(doc)` — recomputes automatically on any doc change.

Save/load: localStorage (5 named slots) + JSON file download/upload. No preset system (unlike the PCB tool).

## Undo/redo

Snapshot-based: `pushUndo()` deep-clones the entire `doc` via `JSON.parse(JSON.stringify(doc))` before each mutation. Max 50 entries. `Cmd/Ctrl+Z` to undo, `Cmd/Ctrl+Shift+Z` or `Cmd/Ctrl+Y` to redo. Deduplication via JSON.stringify comparison prevents no-op entries. Settings inputs capture undo snapshot on `onfocus` (one undo step per focus session). Undo/redo buttons in the header bar.

## Component bodies (3D preview)

Lo-fi 3D representations of components live below the board on the component side, with pin wires poking up through the drill holes to the copper side.

**Pin Header**: plastic housing (2.54mm × 2.54mm × 2.5mm) below the board + 0.64mm square pin wires. Solder tail above board: 2.5mm. Connection pins below housing: 6.0mm.

**DIP IC** (`socket: false`): solid rectangular body (~6.35mm wide × 3.3mm tall, lifted 0.5mm above board surface — meaning below board in component-side convention) with L-shaped pins (0.5mm × 0.25mm horizontal legs from body sides bending down to vertical legs through the board).

**IC Socket** (`socket: true`): two long walls centered directly on the pin rows + two short end walls + thin floor + straight vertical pins through the wall. Open top for inserting an IC. Walls AT pin row positions so pins connect through them.

All component bodies use a compound-box approach: `buildCompoundBody(name, [{cx, cy, hw, hd, zBot, zTop}, ...])` merges multiple boxes into one mesh. Each component is a separate body with a unique name (`Component_h{i}`, `Component_d{i}`) so meshMap keying doesn't collide.

Component bodies do NOT scale with copper Z-scale (`isCopper()` returns false for component names). They're not included in the canonical print, but appear in STL export — toggle visibility before exporting if you don't want them.
