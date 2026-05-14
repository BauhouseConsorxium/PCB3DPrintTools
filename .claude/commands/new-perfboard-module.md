# Add a new perfboard module from a pinout screenshot

Add a new dev-board/module variant (ESP32, Arduino Nano, RP2040 Pico, etc.) to
the perfboard editor by reading a pinout diagram image the user pasted.

The user will provide a screenshot of a pinout (e.g. mischianti, circuits4you,
random-nerd-tutorials style) and you should extract the data and register the
module so the user can click-place it as a single component.

This skill assumes the **module system** introduced in `src/lib/perfboard-modules.js`
already exists. The module appears as one editable entity in the editor (move,
rotate with `R`, delete as a unit). Adding a new variant should require edits
in **only two files**.

Use `$ARGUMENTS` as a hint for the module name/id if the user typed one
(e.g. `/new-perfboard-module rp2040-pico`); otherwise infer the id from the
board name in the image.

---

## Step 1 — Read the image carefully

Before writing any code, extract these from the image and write them down in
your reply so the user can correct you before you edit files:

1. **Board name** (e.g. "ESP32 S3 DevKitC 1", "Raspberry Pi Pico", "Arduino Nano")
2. **Module variant id** (kebab-case, no spaces — e.g. `rp2040pico`, `arduinonano`)
3. **Hotkey letter** — a single letter not already taken. Check
   `src/components/perfboard/GridEditor.svelte` `toolHotkeys` map AND the
   existing `MODULE_VARIANTS` keys. Common letters already used:
   `1-9 0 J F R H K E D`. Don't pick those.
4. **Pin count per row** (count the through-holes on ONE side, not total)
5. **Row gap** in pitches — distance between the two pin rows:
   - Breadboard-friendly DOIT-style boards: usually **9** (22.86mm / 0.9")
   - Wider boards (some ESP32 DevKitC v4, RP2040 Pico): **8** (20.32mm)
   - Very wide industrial boards: **10** (25.4mm / 1")
6. **Left column labels** (top→bottom) — use the **primary** name only
   (e.g. "GPIO12", not "Touch5 / ADC2_5 / RTC GPIO12 / GPIO12"). Power/ground
   pins keep their special names: `3V3`, `5V`, `VIN`, `GND`, `RST`, `EN`, `RUN`.
7. **Right column labels** (top→bottom) — same rule.
8. **USB position**: which end of the board? Top (smaller row) or bottom
   (larger row)? This sets the sign of `usbOffsetMm`.
9. **Module chip position**: where on the PCB is the main shield/can? Usually
   opposite end from USB.

If anything is unclear from the image (overlapping labels, cropped sides,
unreadable text), **ask the user** before guessing.

## Step 2 — Pick body & 3D dimensions

Most ESP32-family boards share these defaults (don't change unless the board
is unusually small/large):

```js
pcbThicknessMm: 1.6,
headerHeightMm: 8.5,         // female socket housing
chipSizeMm: { w: 18, d: 25.5, h: 3.2 },   // ESP-WROOM-32 / ESP32-S3-WROOM
usbSizeMm:  { w: 9, d: 7, h: 3 },
```

For RP2040 Pico, Arduino Nano, etc. the chip is smaller (~12×17×1.5mm).
Eyeball it from the image — these are visual lo-fi only.

`chipOffsetMm` and `usbOffsetMm` are in millimeters, along the pin axis,
measured from the PCB centre. Sign convention:
- **Negative** → toward smaller row (top of module in screen view)
- **Positive** → toward larger row (bottom of module)

Rule of thumb for a board with `pinsPerRow = N`: the PCB half-length is
roughly `(N-1) * 2.54 / 2 + 1`. Place USB about 1-2 mm inside that, chip a
similar amount toward the other end.

## Step 3 — Touch `src/lib/perfboard-modules.js`

Add an entry to the `MODULE_VARIANTS` object:

```js
yourvariant: {
  id: 'yourvariant',
  label: 'Short Label',                      // shown on the toolbar button
  description: 'Full board name + variant',  // tooltip / docs
  icon: 'yourvariant',                       // matches Toolbar #if clause
  key: 'X',                                  // hotkey letter
  title: 'Title On Board',                   // rendered above the module in 2D
  titleColor: '#00f0ff',                     // cyan is standard for module title
  pinsPerRow: N,
  rowGap: 9,                                 // pitches
  pinLabels: {
    left:  ['EN','GPIO36',...,'VIN'],        // top→bottom, length === pinsPerRow
    right: ['GPIO23',...,'3V3'],
  },
  bodyFill: 'rgba(20,20,40,0.85)',
  bodyStroke: 'rgba(120,180,255,0.4)',
  pcbThicknessMm: 1.6,
  headerHeightMm: 8.5,
  chipSizeMm: { w: 18, d: 25.5, h: 3.2 },
  chipOffsetMm: -7,                          // toward top
  usbSizeMm: { w: 9, d: 7, h: 3 },
  usbOffsetMm: 16,                           // toward bottom
},
```

**Verify `left.length === right.length === pinsPerRow`** before you save. The
topology code adds one conductor node per label and will misalign pins if the
arrays differ.

If the board introduces a new power-pin label name (e.g. `RUN`, `VBUS`, `VSYS`,
`AREF`), add it to the `POWER_LABELS` set in the same file so the label
renders red instead of pink.

## Step 4 — Touch `src/components/perfboard/Toolbar.svelte`

Add an icon clause in the `{#if tool.icon === ...}` chain, keyed on the same
icon name you used in the registry. Use `viewBox="0 0 20 20"`, `fill="none"`,
`stroke="currentColor"`, `stroke-width="1.5"` (inherited from the parent svg).

Standard icon recipe — module body + chip can + side pins:

```svelte
{:else if tool.icon === 'yourvariant'}
  <rect x="6" y="3" width="8" height="14" rx="0.5" />
  <!-- Chip shield -->
  <rect x="7.5" y="4" width="5" height="6" fill="currentColor" stroke="none" opacity="0.5" />
  <!-- Side pins (3 dashes per side — visual hint, count doesn't have to match) -->
  <line x1="3" y1="6"  x2="6"  y2="6"  stroke-linecap="round" />
  <line x1="3" y1="10" x2="6"  y2="10" stroke-linecap="round" />
  <line x1="3" y1="14" x2="6"  y2="14" stroke-linecap="round" />
  <line x1="14" y1="6"  x2="17" y2="6"  stroke-linecap="round" />
  <line x1="14" y1="10" x2="17" y2="10" stroke-linecap="round" />
  <line x1="14" y1="14" x2="17" y2="14" stroke-linecap="round" />
```

Optional accents:
- Boards with **external antenna** (e.g. ESP32-S3): add a U-shape at the top
  `<path d="M8 3 L8 1.5 L12 1.5 L12 3" fill="none" stroke-linecap="round" />`
- Boards with visible **USB connector** (e.g. ESP32 DevKit V1): small box at
  bottom `<rect x="8.5" y="14.5" width="3" height="1.5" fill="currentColor" stroke="none" opacity="0.4" />`

## Step 5 — Verify

That's it — `GridEditor.svelte`, `PerfboardApp.svelte`, `perfboard-topology.js`,
and `perfboard-geometry.js` do **not** need changes. The new module:
- Shows up in the Toolbar automatically (via `MODULE_VARIANT_LIST`)
- Gets a hotkey automatically (via `MODULE_VARIANT_LIST` flatMap in `toolHotkeys`)
- Has hover ghost preview from `getModuleBounds` + `getModulePinPositions`
- Renders pin pads, labels, body outline, title, USB notch in the 2D editor
- Renders female headers + PCB + chip can + USB connector in 3D
- Behaves like a single component for move/rotate/delete/bulk-select

Run `npx vite build` once to confirm no syntax errors, then tell the user
to click the new tool button (or press the hotkey) and place the module.

---

## Common pitfalls

- **Label array length mismatch**: if `pinLabels.left.length !== pinsPerRow`,
  the topology will create nodes for pins that don't exist visually. Always
  double-check the count.
- **Hotkey collision**: search `toolHotkeys` + every `MODULE_VARIANTS[*].key`
  before picking a letter. The runtime will silently overwrite collisions and
  one of the tools will become unreachable.
- **Pin label normalisation**: pinout diagrams crowd many alternate functions
  on each pin (Touch / ADC / RTC / SPI / etc.). Use only the **primary** GPIO
  name. Users can add free annotations later if they want SPI/I2C overlays.
- **Don't add the variant to `applySessionDoc`** — it migrates `doc.modules`
  as a whole already; per-variant fields are read at render time from the
  registry, not stored in the doc.
- **The image is the source of truth** — count pins on the image, don't trust
  pin-count claims from your training data. The same chip ships on boards
  with 30, 36, 38, and 40 pin variants.

ARGUMENTS: $ARGUMENTS
