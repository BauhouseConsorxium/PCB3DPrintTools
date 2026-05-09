import earcut from 'earcut'
import { buildBoardGeometry, buildTracesGeometry, HOLE_N } from './geometry.js'

const PAD_CIRCLE_N = 32

function collectPadPositions(doc) {
  const { pitch } = doc.grid
  const positions = []
  const seen = new Set()

  function addPad(col, row) {
    const key = `${col},${row}`
    if (seen.has(key)) return
    seen.add(key)
    positions.push({ x: col * pitch, y: row * pitch })
  }

  for (const pad of doc.pads) addPad(pad.col, pad.row)

  for (const hdr of doc.headers) {
    for (let i = 0; i < hdr.count; i++) {
      const col = hdr.orientation === 'h' ? hdr.col + i : hdr.col
      const row = hdr.orientation === 'v' ? hdr.row + i : hdr.row
      addPad(col, row)
    }
  }

  for (const dip of (doc.dips || [])) {
    const spacing = dip.rowSpacing ?? 3
    for (let i = 0; i < dip.count; i++) {
      if (dip.orientation === 'v') {
        addPad(dip.col, dip.row + i)
        addPad(dip.col + spacing, dip.row + i)
      } else {
        addPad(dip.col + i, dip.row)
        addPad(dip.col + i, dip.row + spacing)
      }
    }
  }

  return positions
}

function buildBoardPolygon(doc) {
  const { cols, rows, pitch } = doc.grid
  const margin = pitch / 2
  const x0 = -margin
  const y0 = margin
  const x1 = (cols - 1) * pitch + margin
  const y1 = -((rows - 1) * pitch + margin)
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
}

function buildPadRingsGeometry(padPositions, drillR, padR, zBot, zTop) {
  if (!padPositions.length) return null

  const allPos = [], allNrm = [], allIdx = []
  let vOff = 0

  for (const { x, y } of padPositions) {
    const gy = -y

    const outerRing = []
    for (let i = 0; i < PAD_CIRCLE_N; i++) {
      const a = i * 2 * Math.PI / PAD_CIRCLE_N
      outerRing.push([x + padR * Math.cos(a), gy + padR * Math.sin(a)])
    }

    const innerRing = []
    for (let i = 0; i < HOLE_N; i++) {
      const a = -i * 2 * Math.PI / HOLE_N
      innerRing.push([x + drillR * Math.cos(a), gy + drillR * Math.sin(a)])
    }

    const flat = []
    const holeIndices = []
    for (const [px, py] of outerRing) flat.push(px, py)
    holeIndices.push(flat.length / 2)
    for (const [px, py] of innerRing) flat.push(px, py)

    const triIdx = earcut(flat, holeIndices, 2)
    const nFace = flat.length / 2

    const pos = [], nrm = [], idx = []
    let lvi = 0

    const tB = lvi
    for (let i = 0; i < nFace; i++) {
      pos.push(flat[i * 2], flat[i * 2 + 1], zTop); nrm.push(0, 0, 1); lvi++
    }
    for (let i = 0; i < triIdx.length; i += 3)
      idx.push(tB + triIdx[i], tB + triIdx[i + 1], tB + triIdx[i + 2])

    const bB = lvi
    for (let i = 0; i < nFace; i++) {
      pos.push(flat[i * 2], flat[i * 2 + 1], zBot); nrm.push(0, 0, -1); lvi++
    }
    for (let i = 0; i < triIdx.length; i += 3)
      idx.push(bB + triIdx[i], bB + triIdx[i + 2], bB + triIdx[i + 1])

    for (let i = 0; i < PAD_CIRCLE_N; i++) {
      const j = (i + 1) % PAD_CIRCLE_N
      const [x0, y0] = outerRing[i], [x1, y1] = outerRing[j]
      const edx = x1 - x0, edy = y1 - y0
      const edL = Math.hypot(edx, edy) || 1
      const onx = edy / edL, ony = -edx / edL
      const a0 = lvi, a1 = lvi + 1, b0 = lvi + 2, b1 = lvi + 3
      pos.push(x0, y0, zBot); nrm.push(onx, ony, 0); lvi++
      pos.push(x0, y0, zTop); nrm.push(onx, ony, 0); lvi++
      pos.push(x1, y1, zBot); nrm.push(onx, ony, 0); lvi++
      pos.push(x1, y1, zTop); nrm.push(onx, ony, 0); lvi++
      idx.push(a0, b0, b1, a0, b1, a1)
    }

    for (let i = 0; i < HOLE_N; i++) {
      const j = (i + 1) % HOLE_N
      const [x0, y0] = innerRing[i], [x1, y1] = innerRing[j]
      const edx = x1 - x0, edy = y1 - y0
      const edL = Math.hypot(edx, edy) || 1
      const inx = edy / edL, iny = -edx / edL
      const a0 = lvi, a1 = lvi + 1, b0 = lvi + 2, b1 = lvi + 3
      pos.push(x0, y0, zBot); nrm.push(inx, iny, 0); lvi++
      pos.push(x0, y0, zTop); nrm.push(inx, iny, 0); lvi++
      pos.push(x1, y1, zBot); nrm.push(inx, iny, 0); lvi++
      pos.push(x1, y1, zTop); nrm.push(inx, iny, 0); lvi++
      idx.push(a0, b0, b1, a0, b1, a1)
    }

    for (let i = 0; i < pos.length; i++) { allPos.push(pos[i]); allNrm.push(nrm[i]) }
    for (const i of idx) allIdx.push(i + vOff)
    vOff += lvi
  }

  if (!allPos.length) return null

  return {
    name: 'Pads_F.Cu',
    positions: new Float32Array(allPos),
    normals: new Float32Array(allNrm),
    indices: new Uint32Array(allIdx)
  }
}

function collectTraceSegments(doc, padPositions) {
  const { pitch } = doc.grid
  const TOL = 0.01
  const segments = []
  for (const trace of doc.traces) {
    const pts = trace.points
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i].col * pitch, ay = pts[i].row * pitch
      const bx = pts[i + 1].col * pitch, by = pts[i + 1].row * pitch
      const dx = bx - ax, dy = by - ay
      const lenSq = dx * dx + dy * dy
      if (lenSq < TOL * TOL) {
        segments.push({ x1: ax, y1: ay, x2: bx, y2: by, width: trace.width, layer: 'F.Cu' })
        continue
      }
      const hits = []
      for (const p of padPositions) {
        const t = ((p.x - ax) * dx + (p.y - ay) * dy) / lenSq
        if (t <= TOL || t >= 1 - TOL) continue
        const px = ax + t * dx, py = ay + t * dy
        const distSq = (px - p.x) ** 2 + (py - p.y) ** 2
        if (distSq < TOL * TOL) hits.push(t)
      }
      if (hits.length === 0) {
        segments.push({ x1: ax, y1: ay, x2: bx, y2: by, width: trace.width, layer: 'F.Cu' })
      } else {
        hits.sort((a, b) => a - b)
        let prevX = ax, prevY = ay
        for (const t of hits) {
          const mx = ax + t * dx, my = ay + t * dy
          segments.push({ x1: prevX, y1: prevY, x2: mx, y2: my, width: trace.width, layer: 'F.Cu' })
          prevX = mx; prevY = my
        }
        segments.push({ x1: prevX, y1: prevY, x2: bx, y2: by, width: trace.width, layer: 'F.Cu' })
      }
    }
  }
  return segments
}

export function buildPerfboardBodies(doc) {
  const boardPoly = buildBoardPolygon(doc)
  const padPositions = collectPadPositions(doc)
  const { boardThickness, copperThickness, drillDiameter, padDiameter } = doc
  const drillR = drillDiameter / 2
  const padR = padDiameter / 2

  const drills = padPositions.map(p => ({ x: p.x, y: p.y, r: drillR }))

  const boardBody = buildBoardGeometry(boardPoly, drills, boardThickness)

  const zBot = -copperThickness
  const zTop = 0
  const padsBody = buildPadRingsGeometry(padPositions, drillR, padR, zBot, zTop)

  const traceSegments = collectTraceSegments(doc, padPositions)
  const tracesBody = traceSegments.length
    ? buildTracesGeometry(traceSegments, drills, 'F.Cu', zBot, zTop, false)
    : null

  return [boardBody, padsBody, tracesBody].filter(Boolean)
}

export function createDefaultDocument() {
  return {
    version: 1,
    name: 'untitled',
    grid: { cols: 10, rows: 8, pitch: 2.54 },
    boardThickness: 1.6,
    copperThickness: 0.035,
    drillDiameter: 1.0,
    padDiameter: 2.0,
    traceWidth: 1.0,
    pads: [],
    headers: [],
    dips: [],
    traces: [],
    jumpers: [],
    annotations: []
  }
}
