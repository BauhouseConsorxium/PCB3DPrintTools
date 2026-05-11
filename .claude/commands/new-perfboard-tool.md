# Add a new perfboard tool

Add a new component/drawing tool to the perfboard editor, following the exact
pattern established by pad, header, DIP, capacitor, jumper, etc.

Use the argument as the tool name (e.g. `/new-perfboard-tool resistor`).

---

## Checklist — touch every file in this order

### 1. `src/lib/perfboard-geometry.js`

**Data in the doc schema** — add the new array to `createDefaultDocument()`:
```js
myTools: [],
```

**Pad positions** — in `collectPadPositions`, add a loop that calls `addPad(col, row)`
for every hole the tool occupches. Called by both geometry and 2D rendering.

**3D body** — in `buildComponentBodies`, add a loop over `doc.myTools`.
- Use `cylGeom(cx, cy, r, zBot, zTop, n)` for upright cylinders.
- Use `cylGeomDisc(cx, cy, cz, r, ht, axisIsX, n)` for flat discs on edge.
- Use `boxGeomRaw(cx, cy, hw, hd, zBot, zTop)` for rectangular boxes.
- Combine parts with `mergeGeoms(name, geoms[])`.
- Name bodies `Component_mytool{i}` — the `isComponent()` predicate picks this up
  automatically (name contains no `.cu`, `PCB`, or other reserved strings).
- Pin wires typically: `zBot = -1.5` (solder tail), `zTop` = top of body.
- Board component side is at `z = boardThickness`; bodies sit above that.

**Axis orientation for `cylGeomDisc`**:
- `axisIsX = true`  → disc in YZ plane, face visible along X (use for 'v' leads)
- `axisIsX = false` → disc in XZ plane, face visible along Y (use for 'h' leads)

### 2. `src/components/perfboard/Toolbar.svelte`

Add entry to the `tools` array:
```js
{ id: 'mytool', label: 'MyTool', icon: 'mytool', key: '<next-free-digit>' },
```

Add SVG icon case in the `{#if tool.icon === ...}` chain. Use `viewBox="0 0 20 20"`,
`fill="none"`, `stroke="currentColor"`, `stroke-width="1.5"`.

### 3. `src/components/perfboard/GridEditor.svelte`

Touch these locations **in order** — each is a targeted insertion:

| Location | What to add |
|---|---|
| Props destructuring (top of `<script>`) | `onAddMyTool = () => {}`, `onUpdateMyTool = () => {}` |
| State declarations | `let myToolStart = $state(null)`, `let myToolPreview = $state(null)`, `let editingMyTool = $state(null)` |
| `findElementAt` (after DIP block) | Hit-test all pad positions owned by the tool |
| `handlePointerDown` (after DIP block) | Close `editingMyTool`; handle `activeTool === 'mytool'` two-click placement |
| `handlePointerMove` | Update `myToolPreview` when `myToolStart` is set |
| `findElementsInRect` (after DIP block) | Include the tool's pad positions |
| `cancelDrawing` (after DIP block) | Reset `myToolStart` and `myToolPreview` |
| `toolHotkeys` map | `"<key>": "mytool"` |
| `handleKeydown` Escape chain | `if (editingMyTool) { editingMyTool = null; return }` |
| `handleDblClick` (after DIP block, before header block) | Open `editingMyTool` popup |
| After `applyDipEdit` / before `applyCurveEdit` | `applyMyToolEdit`, `closeMyToolEdit`, `handleMyToolEditKeydown` |
| `allPadPositions` `$derived.by` | Push all pad coords for the tool |
| SVG template — before `<!-- Pads -->` | Render bodies + pads + preview ghost |
| Ghost cursor condition | Add `activeTool === 'mytool' && !myToolStart` |
| Drag ghost block | Render displaced pads for selected instances |
| After `{#if editingDip}` popup | `{#if editingMyTool}` popup div (absolute positioned) |

**Two-click placement pattern** (copy from DIP/cap):
```js
} else if (activeTool === 'mytool') {
  if (!myToolStart) {
    myToolStart = { col, row }
  } else {
    const dc = col - myToolStart.col
    const dr = row - myToolStart.row
    const orientation = Math.abs(dc) >= Math.abs(dr) ? 'h' : 'v'
    onAddMyTool(myToolStart.col, myToolStart.row, orientation)
    myToolStart = null
    myToolPreview = null
  }
}
```

**Editing popup pattern** (copy from DIP):
```svelte
{#if editingMyTool}
  <div class="absolute bg-surface-1 rounded-lg border-2 border-black shadow-[4px_4px_0_black] z-10 p-1.5 flex flex-col gap-1.5"
       style="left: {editingMyTool.left}px; top: {editingMyTool.top}px"
       onfocusout={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) closeMyToolEdit() }}>
    <!-- inputs that call applyMyToolEdit() on change -->
    <div class="flex gap-1">
      <button ... onclick={() => { editingMyTool = { ...editingMyTool, variant: 'a' }; applyMyToolEdit() }}>A</button>
      <button ... onclick={() => { editingMyTool = { ...editingMyTool, variant: 'b' }; applyMyToolEdit() }}>B</button>
    </div>
  </div>
{/if}
```

**SVG color conventions**:
- Pad fill: `#d4a534` (gold), selected: `#fbbf24`
- Pad halo (selected): `rgba(255,255,255,0.45)`
- Drill hole: `#1a1a2e`
- Body fill: `rgba(40,40,60,0.8)`, selected: `rgba(251,191,36,0.15)`
- Body stroke: `rgba(255,255,255,0.25)`, selected: `#fbbf24`
- Symbol lines: `rgba(180,220,255,0.85)`, selected: `#fbbf24`

### 4. `src/PerfboardApp.svelte`

| What | Where |
|---|---|
| `addMyTool(col, row, orientation)` | After `addDip`. Pattern: `pushUndo(); doc.myTools = [...(doc.myTools \|\| []), { id: crypto.randomUUID(), col, row, orientation, variant: 'default' }]` |
| `updateMyTool(id, variant, label)` | After `addMyTool`. Pattern: find, mutate, reassign array. |
| `moveSelected` inner loop | Find by id, `col += dc; row += dr; continue` |
| `moveSelected` trailing reassigns | Add `doc.myTools = [...(doc.myTools \|\| [])]` |
| `rotateSelected` inner loop | Toggle `orientation 'h' ↔ 'v'`, continue |
| `rotateSelected` trailing reassigns | Add `doc.myTools = [...]` |
| `removeElement` | Add `.filter(x => x.id !== id)` for myTools |
| `handleKeydown` bulk delete | Add `doc.myTools = (doc.myTools \|\| []).filter(c => !idSet.has(c.id))` |
| `applyParsedDoc` | Add `parsed.myTools = parsed.myTools ?? []` |
| GridEditor props | Add `onAddMyTool={addMyTool}` and `onUpdateMyTool={updateMyTool}` |
| Board info display | Add `\| MyTools: {(doc.myTools \|\| []).length}` |

---

## Common pitfalls

- **Y-flip**: in 3D geometry, `y = -(row * pitch)`. In SVG, `y = row * pitch` (no flip).
- **Axis confusion for `cylGeomDisc`**: the axis arg is the THIN axis (the direction you look
  *through* to see the circle). For 'h' leads → thin axis = Y → `axisIsX = false`.
- **`isComponent()` predicate**: body name must NOT contain `.cu`, `PCB`, or `F.Cu`.
  Use `Component_<toolname>{i}` and it works automatically.
- **Svelte reactivity**: always reassign the array (`doc.myTools = [...doc.myTools]`)
  after mutating an element — mutation alone doesn't trigger `$derived`.
- **applyParsedDoc**: always add `parsed.myTools = parsed.myTools ?? []` or old saved
  files will error when the geometry builder iterates the missing array.
- **Hit testing in findElementAt**: must match exactly the same grid positions as
  `collectPadPositions` uses, or erase/select will miss the component.
