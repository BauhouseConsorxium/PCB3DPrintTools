import earcut from 'earcut'
import polygonClipping from 'polygon-clipping'
import { buildBoardGeometry, buildTracesGeometry, buildPolygonsWithDrills, HOLE_N } from './geometry.js'
import { sampleCatmullRom, sampleCatmullRomWithWidth } from './catmull-rom.js'
import { computeRoundedCorners, computeSubdivisionRounding, sampleRoundedPath, computeTeardrops } from './round-trace.js'
import { enumerateConductorNodes } from './perfboard-topology.js'

const PAD_CIRCLE_N = 32

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
    if (trace.type === 'roundtrace' || trace.type === 'freetrace') {
      const pathSegs = (trace.type === 'freetrace' || trace.mode === 'subdivision')
        ? computeSubdivisionRounding(trace.points, trace.radius ?? 1.0, trace.passes ?? 2, pitch)
        : computeRoundedCorners(trace.points, trace.radius ?? 1.0, pitch)
      const samples = sampleRoundedPath(pathSegs, 12)
      for (let i = 0; i < samples.length - 1; i++) {
        const ax = samples[i].x, ay = samples[i].y
        const bx = samples[i + 1].x, by = samples[i + 1].y
        const dx = bx - ax, dy = by - ay
        const lenSq = dx * dx + dy * dy
        if (lenSq < TOL * TOL) continue
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
      continue
    }

    if (trace.type === 'curve') {
      const ew1 = trace.endWidth ?? trace.width
      const ew2 = trace.endWidth2 ?? ew1
      if (ew1 > trace.width || ew2 > trace.width) continue

      const pts = trace.points.map(p => ({ x: p.col * pitch, y: p.row * pitch }))
      const samples = sampleCatmullRom(pts, 32, trace.tension ?? 0.5)
      const rawPairs = []
      for (let i = 0; i < samples.length - 1; i++) {
        rawPairs.push({ ax: samples[i].x, ay: samples[i].y, bx: samples[i + 1].x, by: samples[i + 1].y })
      }

      for (const pair of rawPairs) {
        const { ax, ay, bx, by } = pair
        const segWidth = trace.width
        const dx = bx - ax, dy = by - ay
        const lenSq = dx * dx + dy * dy
        if (lenSq < TOL * TOL) {
          segments.push({ x1: ax, y1: ay, x2: bx, y2: by, width: segWidth, layer: 'F.Cu' })
          continue
        }
        segments.push({ x1: ax, y1: ay, x2: bx, y2: by, width: segWidth, layer: 'F.Cu' })
      }
      continue
    }

    const rawPairs = []
    for (let i = 0; i < trace.points.length - 1; i++) {
      rawPairs.push({
        ax: trace.points[i].col * pitch, ay: trace.points[i].row * pitch,
        bx: trace.points[i + 1].col * pitch, by: trace.points[i + 1].row * pitch
      })
    }

    for (const pair of rawPairs) {
      const { ax, ay, bx, by } = pair
      const segWidth = trace.width
      const dx = bx - ax, dy = by - ay
      const lenSq = dx * dx + dy * dy
      if (lenSq < TOL * TOL) {
        segments.push({ x1: ax, y1: ay, x2: bx, y2: by, width: segWidth, layer: 'F.Cu' })
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
        segments.push({ x1: ax, y1: ay, x2: bx, y2: by, width: segWidth, layer: 'F.Cu' })
      } else {
        hits.sort((a, b) => a - b)
        let prevX = ax, prevY = ay
        for (const t of hits) {
          const mx = ax + t * dx, my = ay + t * dy
          segments.push({ x1: prevX, y1: prevY, x2: mx, y2: my, width: segWidth, layer: 'F.Cu' })
          prevX = mx; prevY = my
        }
        segments.push({ x1: prevX, y1: prevY, x2: bx, y2: by, width: segWidth, layer: 'F.Cu' })
      }
    }
  }
  return segments
}

const ENDPOINT_CIRCLE_N = 32

function buildCurveOutline(samples) {
  const left = [], right = []
  for (let i = 0; i < samples.length; i++) {
    const prev = samples[Math.max(0, i - 1)]
    const next = samples[Math.min(samples.length - 1, i + 1)]
    let tx = next.x - prev.x, ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    tx /= len; ty /= len
    const nx = -ty, ny = tx
    const hw = samples[i].w / 2
    left.push([samples[i].x + nx * hw, -(samples[i].y + ny * hw)])
    right.push([samples[i].x - nx * hw, -(samples[i].y - ny * hw)])
  }
  const first = samples[0], last = samples[samples.length - 1]
  const outline = []

  for (let i = 0; i < left.length; i++) outline.push(left[i])

  const er = last.w / 2
  const lastGy = -last.y
  for (let i = 1; i < ENDPOINT_CIRCLE_N; i++) {
    const prevPt = left[left.length - 1]
    const nextPt = right[right.length - 1]
    const startAngle = Math.atan2(prevPt[1] - lastGy, prevPt[0] - last.x)
    const endAngle = Math.atan2(nextPt[1] - lastGy, nextPt[0] - last.x)
    let sweep = endAngle - startAngle
    if (sweep > Math.PI) sweep -= 2 * Math.PI
    if (sweep < -Math.PI) sweep += 2 * Math.PI
    const a = startAngle + sweep * i / ENDPOINT_CIRCLE_N
    outline.push([last.x + er * Math.cos(a), lastGy + er * Math.sin(a)])
  }

  for (let i = right.length - 1; i >= 0; i--) outline.push(right[i])

  const sr = first.w / 2
  const firstGy = -first.y
  {
    const prevPt = right[0]
    const nextPt = left[0]
    const startAngle = Math.atan2(prevPt[1] - firstGy, prevPt[0] - first.x)
    const endAngle = Math.atan2(nextPt[1] - firstGy, nextPt[0] - first.x)
    let sweep = endAngle - startAngle
    if (sweep > Math.PI) sweep -= 2 * Math.PI
    if (sweep < -Math.PI) sweep += 2 * Math.PI
    for (let i = 1; i < ENDPOINT_CIRCLE_N; i++) {
      const a = startAngle + sweep * i / ENDPOINT_CIRCLE_N
      outline.push([first.x + sr * Math.cos(a), firstGy + sr * Math.sin(a)])
    }
  }

  const endpointCircles = []
  for (const pt of [first, last]) {
    const r = pt.w / 2
    const gy = -pt.y
    const circle = []
    for (let i = 0; i < ENDPOINT_CIRCLE_N; i++) {
      const a = i * 2 * Math.PI / ENDPOINT_CIRCLE_N
      circle.push([pt.x + r * Math.cos(a), gy + r * Math.sin(a)])
    }
    endpointCircles.push(circle)
  }

  return { outline, endpointCircles }
}

function pointInPolygonLocal(px, py, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1]
    const xj = poly[j][0], yj = poly[j][1]
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

// Removed buildPolygonsWithDrills to use the one from geometry.js

function buildCurveTraceGeometry(doc, drills, zBot, zTop) {
  const { pitch } = doc.grid
  const curveTraces = doc.traces.filter(t => {
    if (t.type !== 'curve') return false
    const ew1 = t.endWidth ?? t.width
    const ew2 = t.endWidth2 ?? ew1
    return ew1 > t.width || ew2 > t.width
  })
  if (!curveTraces.length) return null

  const shapes = []
  for (const trace of curveTraces) {
    const pts = trace.points.map(p => ({ x: p.col * pitch, y: p.row * pitch }))
    const ew1 = trace.endWidth ?? trace.width
    const ew2 = trace.endWidth2 ?? ew1
    const tn = trace.tension ?? 0.5
    const samples = sampleCatmullRomWithWidth(pts, trace.width, ew1, 32, tn, trace.taperDistance ?? 0, ew2)
    const { outline, endpointCircles } = buildCurveOutline(samples)
    shapes.push(outline, ...endpointCircles)
  }

  return buildPolygonsWithDrills(shapes, drills, 'CurveTraces_F.Cu', zBot, zTop)
}

function cylGeom(cx, cy, r, zBot, zTop, n = 20) {
  const pos = [], nrm = [], idx = []
  let v = 0

  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * Math.PI
    const a1 = ((i + 1) / n) * 2 * Math.PI
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
    const nx0 = Math.cos(a0), ny0 = Math.sin(a0)
    const nx1 = Math.cos(a1), ny1 = Math.sin(a1)
    pos.push(x0, y0, zBot, x0, y0, zTop, x1, y1, zTop, x1, y1, zBot)
    nrm.push(nx0, ny0, 0, nx0, ny0, 0, nx1, ny1, 0, nx1, ny1, 0)
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3)
    v += 4
  }

  const tc = v; pos.push(cx, cy, zTop); nrm.push(0, 0, 1); v++
  const tr = v
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI
    pos.push(cx + r * Math.cos(a), cy + r * Math.sin(a), zTop); nrm.push(0, 0, 1); v++
  }
  for (let i = 0; i < n; i++) idx.push(tc, tr + i, tr + (i + 1) % n)

  const bc = v; pos.push(cx, cy, zBot); nrm.push(0, 0, -1); v++
  const br = v
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI
    pos.push(cx + r * Math.cos(a), cy + r * Math.sin(a), zBot); nrm.push(0, 0, -1); v++
  }
  for (let i = 0; i < n; i++) idx.push(bc, br + (i + 1) % n, br + i)

  return { pos, nrm, idx }
}

// Flat disc standing on edge, axis horizontal.
// axisIsX=true  → disc face perpendicular to X (use when leads run in X, i.e. 'h' orientation)
// axisIsX=false → disc face perpendicular to Y (use when leads run in Y, i.e. 'v' orientation)
// cz = Z of disc centre, r = disc radius, ht = half-thickness along axis
function cylGeomDisc(cx, cy, cz, r, ht, axisIsX, n = 20) {
  const pos = [], nrm = [], idx = []
  let v = 0

  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * Math.PI
    const a1 = ((i + 1) / n) * 2 * Math.PI
    // curved surface coords depend on which axis the disc is perpendicular to
    let x0, y0, z0, x1, y1, z1, nx0, ny0, nz0, nx1, ny1, nz1
    if (axisIsX) {
      // disc in YZ plane, axis along X
      y0 = cy + r * Math.cos(a0); z0 = cz + r * Math.sin(a0)
      y1 = cy + r * Math.cos(a1); z1 = cz + r * Math.sin(a1)
      x0 = cx - ht; x1 = cx + ht
      nx0 = 0; ny0 = Math.cos(a0); nz0 = Math.sin(a0)
      nx1 = 0; ny1 = Math.cos(a1); nz1 = Math.sin(a1)
      pos.push(x0, y0, z0,  x1, y0, z0,  x1, y1, z1,  x0, y1, z1)
      nrm.push(nx0, ny0, nz0,  nx0, ny0, nz0,  nx1, ny1, nz1,  nx1, ny1, nz1)
    } else {
      // disc in XZ plane, axis along Y
      x0 = cx + r * Math.cos(a0); z0 = cz + r * Math.sin(a0)
      x1 = cx + r * Math.cos(a1); z1 = cz + r * Math.sin(a1)
      y0 = cy - ht; y1 = cy + ht
      nx0 = Math.cos(a0); ny0 = 0; nz0 = Math.sin(a0)
      nx1 = Math.cos(a1); ny1 = 0; nz1 = Math.sin(a1)
      pos.push(x0, y0, z0,  x0, y1, z0,  x1, y1, z1,  x1, y0, z1)
      nrm.push(nx0, ny0, nz0,  nx0, ny0, nz0,  nx1, ny1, nz1,  nx1, ny1, nz1)
    }
    idx.push(v, v + 1, v + 2,  v, v + 2, v + 3)
    v += 4
  }

  // Two flat cap faces
  for (const sign of [-1, 1]) {
    const fc = v
    if (axisIsX) {
      pos.push(cx + sign * ht, cy, cz); nrm.push(sign, 0, 0); v++
      const fr = v
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI
        pos.push(cx + sign * ht, cy + r * Math.cos(a), cz + r * Math.sin(a))
        nrm.push(sign, 0, 0); v++
      }
      if (sign > 0) for (let i = 0; i < n; i++) idx.push(fc, fr + i, fr + (i + 1) % n)
      else          for (let i = 0; i < n; i++) idx.push(fc, fr + (i + 1) % n, fr + i)
    } else {
      pos.push(cx, cy + sign * ht, cz); nrm.push(0, sign, 0); v++
      const fr = v
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI
        pos.push(cx + r * Math.cos(a), cy + sign * ht, cz + r * Math.sin(a))
        nrm.push(0, sign, 0); v++
      }
      if (sign > 0) for (let i = 0; i < n; i++) idx.push(fc, fr + i, fr + (i + 1) % n)
      else          for (let i = 0; i < n; i++) idx.push(fc, fr + (i + 1) % n, fr + i)
    }
  }

  return { pos, nrm, idx }
}

function boxGeomRaw(cx, cy, hw, hd, zBot, zTop) {
  const x0 = cx - hw, x1 = cx + hw
  const y0 = cy - hd, y1 = cy + hd
  const pos = [], nrm = [], idx = []
  let v = 0

  function quad(ax, ay, az, bx, by, bz, cx2, cy2, cz, dx, dy, dz, nx, ny, nz) {
    pos.push(ax, ay, az, bx, by, bz, cx2, cy2, cz, dx, dy, dz)
    nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz)
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3)
    v += 4
  }

  quad(x0, y0, zTop, x1, y0, zTop, x1, y1, zTop, x0, y1, zTop, 0, 0, 1)
  quad(x0, y1, zBot, x1, y1, zBot, x1, y0, zBot, x0, y0, zBot, 0, 0, -1)
  quad(x0, y0, zBot, x1, y0, zBot, x1, y0, zTop, x0, y0, zTop, 0, -1, 0)
  quad(x0, y1, zTop, x1, y1, zTop, x1, y1, zBot, x0, y1, zBot, 0, 1, 0)
  quad(x0, y0, zBot, x0, y0, zTop, x0, y1, zTop, x0, y1, zBot, -1, 0, 0)
  quad(x1, y0, zTop, x1, y0, zBot, x1, y1, zBot, x1, y1, zTop, 1, 0, 0)

  return { pos, nrm, idx }
}

function mergeGeoms(name, geoms) {
  const allPos = [], allNrm = [], allIdx = []
  let vOff = 0
  for (const g of geoms) {
    for (const x of g.pos) allPos.push(x)
    for (const x of g.nrm) allNrm.push(x)
    for (const i of g.idx) allIdx.push(i + vOff)
    vOff += g.pos.length / 3
  }
  return {
    name,
    positions: new Float32Array(allPos),
    normals: new Float32Array(allNrm),
    indices: new Uint32Array(allIdx)
  }
}

function buildCompoundBody(name, boxes) {
  const allPos = [], allNrm = [], allIdx = []
  let vOff = 0

  for (const { cx, cy, hw, hd, zBot, zTop } of boxes) {
    const x0 = cx - hw, x1 = cx + hw
    const y0 = cy - hd, y1 = cy + hd

    function quad(ax, ay, az, bx, by, bz, cx2, cy2, cz, dx, dy, dz, nx, ny, nz) {
      allPos.push(ax, ay, az, bx, by, bz, cx2, cy2, cz, dx, dy, dz)
      allNrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz)
      allIdx.push(vOff, vOff + 1, vOff + 2, vOff, vOff + 2, vOff + 3)
      vOff += 4
    }

    quad(x0, y0, zTop, x1, y0, zTop, x1, y1, zTop, x0, y1, zTop, 0, 0, 1)
    quad(x0, y1, zBot, x1, y1, zBot, x1, y0, zBot, x0, y0, zBot, 0, 0, -1)
    quad(x0, y0, zBot, x1, y0, zBot, x1, y0, zTop, x0, y0, zTop, 0, -1, 0)
    quad(x0, y1, zTop, x1, y1, zTop, x1, y1, zBot, x0, y1, zBot, 0, 1, 0)
    quad(x0, y0, zBot, x0, y0, zTop, x0, y1, zTop, x0, y1, zBot, -1, 0, 0)
    quad(x1, y0, zTop, x1, y0, zBot, x1, y1, zBot, x1, y1, zTop, 1, 0, 0)
  }

  return {
    name,
    positions: new Float32Array(allPos),
    normals: new Float32Array(allNrm),
    indices: new Uint32Array(allIdx)
  }
}

function buildComponentBodies(doc) {
  const { pitch } = doc.grid
  const boardThickness = doc.boardThickness
  const bodies = []

  const HOUSING_H = 2.5
  const PIN_ABOVE = 2.5
  const PIN_BELOW = 6.0
  const PIN_HW = 0.32

  for (let hi = 0; hi < doc.headers.length; hi++) {
    const h = doc.headers[hi]
    const isH = h.orientation === 'h'
    const len = (h.count - 1) * pitch

    const cx = isH ? h.col * pitch + len / 2 : h.col * pitch
    const cy = isH ? -(h.row * pitch) : -(h.row * pitch + len / 2)
    const hw = isH ? (len + pitch) / 2 : pitch / 2
    const hd = isH ? pitch / 2 : (len + pitch) / 2

    const hBot = boardThickness
    const boxes = [{ cx, cy, hw, hd, zBot: hBot, zTop: hBot + HOUSING_H }]

    for (let i = 0; i < h.count; i++) {
      const px = isH ? (h.col + i) * pitch : h.col * pitch
      const py = isH ? -(h.row * pitch) : -((h.row + i) * pitch)
      boxes.push({
        cx: px, cy: py, hw: PIN_HW, hd: PIN_HW,
        zBot: -PIN_ABOVE,
        zTop: hBot + HOUSING_H + PIN_BELOW
      })
    }

    bodies.push(buildCompoundBody(`Component_h${hi}`, boxes))
  }

  const DIP_PIN_W = 0.5
  const DIP_PIN_T = 0.25
  const DIP_SOLDER = 1.5

  for (let di = 0; di < (doc.dips || []).length; di++) {
    const d = (doc.dips || [])[di]
    const spacing = d.rowSpacing ?? 3
    const isH = d.orientation === 'h'
    const pinLen = (d.count - 1) * pitch
    const spanLen = spacing * pitch
    const isSocket = d.socket ?? false

    const cx = isH ? d.col * pitch + pinLen / 2 : d.col * pitch + spanLen / 2
    const cy = isH ? -(d.row * pitch + spanLen / 2) : -(d.row * pitch + pinLen / 2)

    const pinHw = DIP_PIN_W / 2
    const pinHt = DIP_PIN_T / 2
    const boxes = []

    if (isSocket) {
      const sH = 4.0
      const sWall = 1.2
      const sOvh = 0.8
      const dBot = boardThickness + 0.2

      const row1 = isH ? -(d.row * pitch) : cx - spanLen / 2
      const row2 = isH ? -((d.row + spacing) * pitch) : cx + spanLen / 2
      const lenHw = pinLen / 2 + sOvh

      if (isH) {
        boxes.push(
          { cx, cy: row1, hw: lenHw, hd: sWall / 2, zBot: dBot, zTop: dBot + sH },
          { cx, cy: row2, hw: lenHw, hd: sWall / 2, zBot: dBot, zTop: dBot + sH },
          {
            cx: cx - lenHw + sWall / 2, cy, hw: sWall / 2,
            hd: spanLen / 2 - sWall / 2, zBot: dBot, zTop: dBot + sH
          },
          {
            cx: cx + lenHw - sWall / 2, cy, hw: sWall / 2,
            hd: spanLen / 2 - sWall / 2, zBot: dBot, zTop: dBot + sH
          },
          { cx, cy, hw: lenHw, hd: spanLen / 2, zBot: dBot, zTop: dBot + 0.5 }
        )
      } else {
        boxes.push(
          { cx: row1, cy, hw: sWall / 2, hd: lenHw, zBot: dBot, zTop: dBot + sH },
          { cx: row2, cy, hw: sWall / 2, hd: lenHw, zBot: dBot, zTop: dBot + sH },
          {
            cx, cy: cy + lenHw - sWall / 2, hw: spanLen / 2 - sWall / 2,
            hd: sWall / 2, zBot: dBot, zTop: dBot + sH
          },
          {
            cx, cy: cy - lenHw + sWall / 2, hw: spanLen / 2 - sWall / 2,
            hd: sWall / 2, zBot: dBot, zTop: dBot + sH
          },
          { cx, cy, hw: spanLen / 2, hd: lenHw, zBot: dBot, zTop: dBot + 0.5 }
        )
      }

      for (let i = 0; i < d.count; i++) {
        let p1x, p1y, p2x, p2y
        if (isH) {
          p1x = (d.col + i) * pitch; p1y = row1
          p2x = (d.col + i) * pitch; p2y = row2
        } else {
          p1x = row1; p1y = -((d.row + i) * pitch)
          p2x = row2; p2y = -((d.row + i) * pitch)
        }
        boxes.push(
          {
            cx: p1x, cy: p1y, hw: pinHw, hd: pinHw,
            zBot: -DIP_SOLDER, zTop: dBot + sH
          },
          {
            cx: p2x, cy: p2y, hw: pinHw, hd: pinHw,
            zBot: -DIP_SOLDER, zTop: dBot + sH
          }
        )
      }
    } else {
      const bodySpan = spanLen - pitch / 2
      const bodyH = 3.3
      const dBot = boardThickness + 0.5
      const bodyHw = isH ? pinLen / 2 + 1.0 : bodySpan / 2
      const bodyHd = isH ? bodySpan / 2 : pinLen / 2 + 1.0
      const legZ0 = dBot
      const legZ1 = dBot + DIP_PIN_T

      boxes.push({ cx, cy, hw: bodyHw, hd: bodyHd, zBot: dBot, zTop: dBot + bodyH })

      for (let i = 0; i < d.count; i++) {
        let p1x, p1y, p2x, p2y
        if (isH) {
          p1x = (d.col + i) * pitch; p1y = -(d.row * pitch)
          p2x = (d.col + i) * pitch; p2y = -((d.row + spacing) * pitch)

          const edge1 = cy + bodyHd
          boxes.push(
            {
              cx: p1x, cy: (edge1 + p1y) / 2, hw: pinHw,
              hd: (p1y - edge1) / 2 + pinHt, zBot: legZ0, zTop: legZ1
            },
            {
              cx: p1x, cy: p1y, hw: pinHw, hd: pinHt,
              zBot: -DIP_SOLDER, zTop: legZ1
            }
          )
          const edge2 = cy - bodyHd
          boxes.push(
            {
              cx: p2x, cy: (edge2 + p2y) / 2, hw: pinHw,
              hd: (edge2 - p2y) / 2 + pinHt, zBot: legZ0, zTop: legZ1
            },
            {
              cx: p2x, cy: p2y, hw: pinHw, hd: pinHt,
              zBot: -DIP_SOLDER, zTop: legZ1
            }
          )
        } else {
          p1x = d.col * pitch; p1y = -((d.row + i) * pitch)
          p2x = (d.col + spacing) * pitch; p2y = -((d.row + i) * pitch)

          const edge1 = cx - bodyHw
          boxes.push(
            {
              cx: (edge1 + p1x) / 2, cy: p1y,
              hw: (edge1 - p1x) / 2 + pinHt, hd: pinHw, zBot: legZ0, zTop: legZ1
            },
            {
              cx: p1x, cy: p1y, hw: pinHt, hd: pinHw,
              zBot: -DIP_SOLDER, zTop: legZ1
            }
          )
          const edge2 = cx + bodyHw
          boxes.push(
            {
              cx: (edge2 + p2x) / 2, cy: p2y,
              hw: (p2x - edge2) / 2 + pinHt, hd: pinHw, zBot: legZ0, zTop: legZ1
            },
            {
              cx: p2x, cy: p2y, hw: pinHt, hd: pinHw,
              zBot: -DIP_SOLDER, zTop: legZ1
            }
          )
        }
      }
    }

    bodies.push(buildCompoundBody(`Component_d${di}`, boxes))
  }

  const CAP_SOLDER = 1.5
  const CAP_PIN_HW = 0.25

  for (let ci = 0; ci < (doc.capacitors || []).length; ci++) {
    const cap = (doc.capacitors || [])[ci]
    const p1x = cap.col * pitch
    const p1y = -(cap.row * pitch)
    const p2x = cap.orientation === 'h' ? (cap.col + 1) * pitch : cap.col * pitch
    const p2y = cap.orientation === 'h' ? p1y : -((cap.row + 1) * pitch)
    const midX = (p1x + p2x) / 2
    const midY = (p1y + p2y) / 2
    const geoms = []

    if ((cap.type ?? 'ceramic') === 'electrolytic') {
      const elytBot = boardThickness + 0.3
      const elytTop = elytBot + 8.0
      const elytR = 2.2

      // Main cylinder body
      geoms.push(cylGeom(midX, midY, elytR, elytBot, elytTop, 24))

      // Negative stripe: a raised ridge on the - (pin 2) side of the cylinder.
      // It's a thin partial-arc slice sitting just inside the cylinder wall.
      const stripeH = 1.4
      const stripeN = 8
      const stripeStart = cap.orientation === 'h' ? -Math.PI * 0.28 : Math.PI * 0.72
      const stripeEnd   = cap.orientation === 'h' ?  Math.PI * 0.28 : Math.PI * 1.28
      const sZBot = elytTop - stripeH, sZTop = elytTop + 0.05
      const stripeR = elytR - 0.05
      const sPos = [], sNrm = [], sIdx = []
      let sv = 0
      for (let i = 0; i < stripeN; i++) {
        const a0 = stripeStart + (i / stripeN) * (stripeEnd - stripeStart)
        const a1 = stripeStart + ((i + 1) / stripeN) * (stripeEnd - stripeStart)
        const x0 = midX + stripeR * Math.cos(a0), y0 = midY + stripeR * Math.sin(a0)
        const x1 = midX + stripeR * Math.cos(a1), y1 = midY + stripeR * Math.sin(a1)
        const nx0 = Math.cos(a0), ny0 = Math.sin(a0)
        const nx1 = Math.cos(a1), ny1 = Math.sin(a1)
        sPos.push(x0, y0, sZBot, x0, y0, sZTop, x1, y1, sZTop, x1, y1, sZBot)
        sNrm.push(nx0, ny0, 0, nx0, ny0, 0, nx1, ny1, 0, nx1, ny1, 0)
        sIdx.push(sv, sv + 1, sv + 2, sv, sv + 2, sv + 3)
        sv += 4
      }
      // Top face of stripe
      const stc = sv; sPos.push(midX, midY, sZTop); sNrm.push(0, 0, 1); sv++
      for (let i = 0; i < stripeN; i++) {
        const a = stripeStart + (i / stripeN) * (stripeEnd - stripeStart)
        sPos.push(midX + stripeR * Math.cos(a), midY + stripeR * Math.sin(a), sZTop)
        sNrm.push(0, 0, 1); sv++
      }
      for (let i = 0; i < stripeN - 1; i++) sIdx.push(stc, stc + 1 + i, stc + 2 + i)
      geoms.push({ pos: sPos, nrm: sNrm, idx: sIdx })

      // Vent cross on top cap (+/- markings hinted by a cross groove on top)
      const crossW = 0.2, crossL = elytR * 0.7, zCross = elytTop
      geoms.push(boxGeomRaw(midX, midY, crossW, crossL, zCross - 0.25, zCross + 0.15))
      geoms.push(boxGeomRaw(midX, midY, crossL, crossW, zCross - 0.25, zCross + 0.15))

      // Pin wires
      geoms.push(boxGeomRaw(p1x, p1y, CAP_PIN_HW, CAP_PIN_HW, -CAP_SOLDER, elytTop))
      geoms.push(boxGeomRaw(p2x, p2y, CAP_PIN_HW, CAP_PIN_HW, -CAP_SOLDER, elytTop))
    } else {
      // Ceramic disc cap: flat disc standing on edge between the two leads.
      // The disc face is perpendicular to the lead direction.
      const cerR = 2.5                            // disc radius (5mm diameter)
      const cerHT = 0.65                          // half-thickness (~1.3mm thick disc)
      const cerCZ = boardThickness + 0.4 + cerR  // disc centre Z: bottom edge just above board

      geoms.push(cylGeomDisc(midX, midY, cerCZ, cerR, cerHT, cap.orientation === 'v', 20))

      // Lead wires rising from under the board up to the disc bottom edge
      const leadTop = boardThickness + 0.4
      geoms.push(boxGeomRaw(p1x, p1y, CAP_PIN_HW, CAP_PIN_HW, -CAP_SOLDER, leadTop))
      geoms.push(boxGeomRaw(p2x, p2y, CAP_PIN_HW, CAP_PIN_HW, -CAP_SOLDER, leadTop))
    }

    bodies.push(mergeGeoms(`Component_cap${ci}`, geoms))
  }

  return bodies
}

function buildTeardropGeometry(doc, padPositions, drills, zBot, zTop) {
  const { pitch } = doc.grid
  const padR = doc.padDiameter / 2
  const shapes = []

  for (const trace of doc.traces) {
    if (trace.type !== 'roundtrace' || !trace.teardrop) continue
    const teardrops = computeTeardrops(
      trace.points, trace.width, pitch, padPositions, padR,
      trace.tdHPercent ?? 50, trace.tdVPercent ?? 90
    )
    for (const td of teardrops) {
      if (td.outline.length < 3) continue
      const flatShape = td.outline.map(p => [p.x, -p.y])
      shapes.push(flatShape)
    }
  }

  if (!shapes.length) return null
  return buildPolygonsWithDrills(shapes, drills, 'Teardrops_F.Cu', zBot, zTop)
}

export function buildPerfboardBodies(doc) {
  const boardPoly = buildBoardPolygon(doc)
  const padPositions = enumerateConductorNodes(doc)
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

  const curveTracesBody = buildCurveTraceGeometry(doc, drills, zBot, zTop)
  const teardropBody = buildTeardropGeometry(doc, padPositions, drills, zBot, zTop)

  const componentBodies = buildComponentBodies(doc)
  return [boardBody, padsBody, tracesBody, curveTracesBody, teardropBody, ...componentBodies].filter(Boolean)
}

export function createDefaultDocument() {
  return {
    version: 1,
    name: 'untitled',
    grid: { cols: 14, rows: 14, pitch: 2.54 },
    boardThickness: 1.6,
    copperThickness: 0.035,
    drillDiameter: 1.0,
    padDiameter: 2.0,
    traceWidth: 0.5,
    curveEndWidth: 2.0,
    curveEndWidth2: 2.0,
    curveTaperDistance: 3.5,
    roundTraceRadius: 1.0,
    roundTraceMode: 'arc',
    roundTracePasses: 2,
    roundTraceTeardrop: false,
    roundTraceTdHPercent: 50,
    roundTraceTdVPercent: 90,
    pads: [],
    headers: [],
    dips: [],
    capacitors: [],
    traces: [],
    jumpers: [],
    joints: [],
    annotations: []
  }
}
