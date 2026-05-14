// Cherry MX keyswitch geometry helpers.
//
// The switch has 2 electrical pins + 2 alignment pegs + 1 center mounting
// hole, all asymmetric, so a true 4-state rotation is needed. Default 'N'
// matches the legacy 'h' visual: pin cluster in the north area, alignment
// pegs along the east-west axis at (col±2, row).
//
// R cycle (CW): N → E → S → W → N. This preserves the legacy h→v transition
// (90° CW visually).

// Offsets from switch center in default 'N' orientation, in pitches.
const PINS_DEFAULT = [
  [-1.5, -1],  // pin 1
  [ 1.0, -2],  // pin 2
]
const PEGS_DEFAULT = [
  [-2, 0],
  [ 2, 0],
]

export const KSW_CYCLE_CW = { N: 'E', E: 'S', S: 'W', W: 'N' }

export function normalizeOrientation(o) {
  if (o === 'h' || o == null) return 'N'   // legacy: pins north
  if (o === 'v') return 'E'                // legacy: pins east (CW 90 from N)
  if (o === 'N' || o === 'E' || o === 'S' || o === 'W') return o
  return 'N'
}

// Rotate a (dcol, drow) offset in the default 'N' frame into the supplied
// orientation. CW direction so N→E matches the legacy h→v rotation.
export function rotateVec2D(dc, dr, orientation) {
  switch (normalizeOrientation(orientation)) {
    case 'E': return [-dr,  dc]  // 90° CW
    case 'S': return [-dc, -dr]  // 180°
    case 'W': return [ dr, -dc]  // 270° CW (= 90° CCW)
    case 'N':
    default:  return [ dc,  dr]
  }
}

export function getKswPins(sw) {
  const o = normalizeOrientation(sw.orientation)
  return PINS_DEFAULT.map(([dc, dr]) => {
    const [c, r] = rotateVec2D(dc, dr, o)
    return { col: sw.col + c, row: sw.row + r }
  })
}

export function getKswPegs(sw) {
  const o = normalizeOrientation(sw.orientation)
  return PEGS_DEFAULT.map(([dc, dr]) => {
    const [c, r] = rotateVec2D(dc, dr, o)
    return { col: sw.col + c, row: sw.row + r }
  })
}
