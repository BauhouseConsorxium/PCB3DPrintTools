// Perfboard module components.
//
// A "module" is a multi-pin component (dev board, breakout, etc.) that the
// editor treats as a single editable entity. One instance = one entry in
// doc.modules. Move/rotate/delete operate on the whole module at once.
//
// Variant data lives here; the editor handles placement, hit-test, rendering.
//
// To add a new module variant:
//   1. Add a MODULE_VARIANTS entry with pin labels + dimensions.
//   2. Add an SVG icon clause in Toolbar.svelte keyed on the variant icon.

export const MODULE_VARIANTS = {
  esp32s3: {
    id: 'esp32s3',
    label: 'ESP32 S3',
    description: 'ESP32-S3 DevKitC 1',
    icon: 'esp32s3',
    key: 'E',
    title: 'ESP32 S3',
    titleColor: '#00f0ff',
    pinsPerRow: 22,
    rowGap: 9,
    pinLabels: {
      left: ['3V3','3V3','RST','GPIO4','GPIO5','GPIO6','GPIO7','GPIO15','GPIO16','GPIO17','GPIO18','GPIO8','GPIO3','GPIO46','GPIO9','GPIO10','GPIO11','GPIO12','GPIO13','GPIO14','5V','GND'],
      right: ['GND','GPIO43','GPIO44','GPIO1','GPIO2','GPIO42','GPIO41','GPIO40','GPIO39','GPIO38','GPIO37','GPIO36','GPIO35','GPIO0','GPIO45','GPIO48','GPIO47','GPIO21','GPIO20','GPIO19','GND','GND'],
    },
    // PCB body color in the 2D editor
    bodyFill: 'rgba(20,20,40,0.85)',
    bodyStroke: 'rgba(120,180,255,0.4)',
    // 3D dimensions (mm)
    pcbThicknessMm: 1.6,
    headerHeightMm: 8.5,
    // ESP32-WROOM module on PCB top (centered along pin direction, offset to one end)
    chipSizeMm: { w: 18, d: 25.5, h: 3.2 },
    chipOffsetMm: -10, // shift along pin-axis from PCB center toward "antenna" end
    // USB connector (small box at opposite end)
    usbSizeMm: { w: 9, d: 7, h: 3 },
    usbOffsetMm: 23,
  },
  esp32devkit: {
    id: 'esp32devkit',
    label: 'ESP32 Dev',
    description: 'ESP32 DevKit V1 / NodeMCU-32 (30-pin, ESP-WROOM-32)',
    icon: 'esp32devkit',
    key: 'D',
    title: 'ESP32 Dev',
    titleColor: '#00f0ff',
    pinsPerRow: 15,
    rowGap: 9,
    pinLabels: {
      left: ['EN','GPIO36','GPIO39','GPIO34','GPIO35','GPIO32','GPIO33','GPIO25','GPIO26','GPIO27','GPIO14','GPIO12','GPIO13','GND','VIN'],
      right: ['GPIO23','GPIO22','GPIO1','GPIO3','GPIO21','GPIO19','GPIO18','GPIO5','GPIO17','GPIO16','GPIO4','GPIO0','GPIO2','GPIO15','3V3'],
    },
    bodyFill: 'rgba(20,20,40,0.85)',
    bodyStroke: 'rgba(120,180,255,0.4)',
    pcbThicknessMm: 1.6,
    headerHeightMm: 8.5,
    chipSizeMm: { w: 18, d: 25.5, h: 3.2 },
    chipOffsetMm: -7,
    usbSizeMm: { w: 9, d: 7, h: 3 },
    usbOffsetMm: 16,
  },
  ads1115: {
    id: 'ads1115',
    label: 'ADS1115',
    description: 'Adafruit ADS1115 16-bit I2C ADC + PGA breakout (single-row)',
    icon: 'ads1115',
    key: 'A',
    title: 'ADS1115',
    titleColor: '#00f0ff',
    // singleRow modules have one pin column on the "left" edge and a PCB
    // body that extends `bodyExtent` pitches outward. `pinLabels.right` is
    // omitted and the second header / row is skipped during build.
    singleRow: true,
    pinsPerRow: 10,
    bodyExtent: 6,
    pinLabels: {
      left: ['VDD','GND','SCL','SDA','ADDR','ALRT','A0','A1','A2','A3'],
    },
    // Adafruit ADS1115 ships on a bright blue PCB
    bodyFill: 'rgba(35,75,170,0.85)',
    bodyStroke: 'rgba(140,180,240,0.55)',
    pcbThicknessMm: 1.6,
    headerHeightMm: 8.5,
    // ADS1115 in TSSOP-10 — small chip on the breakout
    chipSizeMm: { w: 4, d: 5, h: 1 },
    chipOffsetMm: 0,
    // no USB on this breakout
  },
}

export const MODULE_VARIANT_LIST = Object.values(MODULE_VARIANTS)

export function isModuleVariant(id) {
  return id in MODULE_VARIANTS
}

export function getVariant(idOrModule) {
  if (typeof idOrModule === 'string') return MODULE_VARIANTS[idOrModule]
  return MODULE_VARIANTS[idOrModule?.variant]
}

// Distance (in pitches) from the left pin row to the far edge of the PCB
// body. For dual-row modules this equals `rowGap` (the second row sits on
// the far edge). For single-row modules `bodyExtent` controls how far the
// PCB extends past the lone pin column.
export function getBodyExtent(v) {
  return v.singleRow ? (v.bodyExtent ?? 6) : v.rowGap
}

// Pin positions for a placed module instance (anchored at module.col/row,
// rotated by module.orientation: 'v' = pins run vertically, 'h' = horizontally).
// Single-row modules emit only the left column.
export function getModulePinPositions(module) {
  const v = getVariant(module)
  if (!v) return []
  const { pinsPerRow } = v
  const extent = getBodyExtent(v)
  const pins = []
  for (let i = 0; i < pinsPerRow; i++) {
    if (module.orientation === 'v') {
      pins.push({ col: module.col, row: module.row + i, label: v.pinLabels.left[i], side: 'left', index: i })
      if (!v.singleRow) {
        pins.push({ col: module.col + extent, row: module.row + i, label: v.pinLabels.right[i], side: 'right', index: i })
      }
    } else {
      pins.push({ col: module.col + i, row: module.row, label: v.pinLabels.left[i], side: 'left', index: i })
      if (!v.singleRow) {
        pins.push({ col: module.col + i, row: module.row + extent, label: v.pinLabels.right[i], side: 'right', index: i })
      }
    }
  }
  return pins
}

// Body bounding box in grid coords (pitches), oriented per module.orientation.
export function getModuleBounds(module) {
  const v = getVariant(module)
  if (!v) return null
  const { pinsPerRow } = v
  const extent = getBodyExtent(v)
  const pad = 0.4
  if (module.orientation === 'v') {
    return {
      col1: module.col - pad,
      row1: module.row - pad,
      col2: module.col + extent + pad,
      row2: module.row + (pinsPerRow - 1) + pad,
    }
  }
  return {
    col1: module.col - pad,
    row1: module.row - pad,
    col2: module.col + (pinsPerRow - 1) + pad,
    row2: module.row + extent + pad,
  }
}

// Color for a pin label (power/ground/gpio).
const POWER_LABELS = new Set(['3V3', '5V', 'VIN', 'RST', 'EN'])
export function labelColor(label) {
  if (label === 'GND') return '#f0f0f0'
  if (POWER_LABELS.has(label)) return '#ff2d95'
  return '#ff6bcb'
}
