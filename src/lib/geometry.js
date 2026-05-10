import earcut from 'earcut'

export const HALF_N = 24
export const HOLE_N = 32
export const HOLE_SIDES = 32
export const COPPER_THICKNESS = 0.035
export const DRILL_TOL_SQ = 0.05 * 0.05

export function signedArea(pts) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
  }
  return a
}

export function ensureCCW(pts) {
  if (signedArea(pts) < 0) pts.reverse()
}

export function pointInPolygon(px, py, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1]
    const xj = poly[j][0], yj = poly[j][1]
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

export function makeDrillLookup(drills) {
  const local = drills.map(d => ({ lx: d.x, ly: -d.y, r: d.r }))
  return function(cx, cy) {
    for (const d of local) {
      const dx = d.lx - cx, dy = d.ly - cy
      if (dx * dx + dy * dy < DRILL_TOL_SQ) return d.r
    }
    return 0
  }
}

export function buildBoardGeometry(polygon, drills, thickness) {
  const N = polygon.length
  if (N < 3) return null

  const flat = []
  const holeIndices = []
  for (const [x, y] of polygon) flat.push(x, y)

  const drillsLocal = drills.map(d => ({ lx: d.x, ly: -d.y, r: d.r }))
  const holeRings = []
  for (const d of drillsLocal) {
    if (!pointInPolygon(d.lx, d.ly, polygon)) continue
    const hole = []
    for (let i = 0; i < HOLE_SIDES; i++) {
      const a = -i * 2 * Math.PI / HOLE_SIDES
      hole.push([d.lx + d.r * Math.cos(a), d.ly + d.r * Math.sin(a)])
    }
    holeRings.push(hole)
    holeIndices.push(flat.length / 2)
    for (const [x, y] of hole) flat.push(x, y)
  }

  const triIdx = earcut(flat, holeIndices.length ? holeIndices : null, 2)

  const zBot = 0, zTop = thickness
  const nFace = flat.length / 2
  const totalVerts = 2 * nFace + 4 * N + holeRings.reduce((s, h) => s + 4 * h.length, 0)
  const positions = new Float32Array(totalVerts * 3)
  const normals = new Float32Array(totalVerts * 3)
  const indices = []
  let vi = 0

  const topBase = vi
  for (let i = 0; i < nFace; i++) {
    positions[vi * 3] = flat[i * 2]; positions[vi * 3 + 1] = flat[i * 2 + 1]; positions[vi * 3 + 2] = zTop
    normals[vi * 3 + 2] = 1; vi++
  }
  for (let i = 0; i < triIdx.length; i += 3)
    indices.push(topBase + triIdx[i], topBase + triIdx[i + 1], topBase + triIdx[i + 2])

  const botBase = vi
  for (let i = 0; i < nFace; i++) {
    positions[vi * 3] = flat[i * 2]; positions[vi * 3 + 1] = flat[i * 2 + 1]; positions[vi * 3 + 2] = zBot
    normals[vi * 3 + 2] = -1; vi++
  }
  for (let i = 0; i < triIdx.length; i += 3)
    indices.push(botBase + triIdx[i], botBase + triIdx[i + 2], botBase + triIdx[i + 1])

  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N
    const [x0, y0] = polygon[i], [x1, y1] = polygon[j]
    const edx = x1 - x0, edy = y1 - y0
    const edL = Math.hypot(edx, edy) || 1
    const onx = edy / edL, ony = -edx / edL
    const a0 = vi, a1 = vi + 1, b0 = vi + 2, b1 = vi + 3
    positions[vi * 3] = x0; positions[vi * 3 + 1] = y0; positions[vi * 3 + 2] = zBot; normals[vi * 3] = onx; normals[vi * 3 + 1] = ony; vi++
    positions[vi * 3] = x0; positions[vi * 3 + 1] = y0; positions[vi * 3 + 2] = zTop; normals[vi * 3] = onx; normals[vi * 3 + 1] = ony; vi++
    positions[vi * 3] = x1; positions[vi * 3 + 1] = y1; positions[vi * 3 + 2] = zBot; normals[vi * 3] = onx; normals[vi * 3 + 1] = ony; vi++
    positions[vi * 3] = x1; positions[vi * 3 + 1] = y1; positions[vi * 3 + 2] = zTop; normals[vi * 3] = onx; normals[vi * 3 + 1] = ony; vi++
    indices.push(a0, b0, b1, a0, b1, a1)
  }

  for (const hole of holeRings) {
    const hN = hole.length
    for (let i = 0; i < hN; i++) {
      const j = (i + 1) % hN
      const [x0, y0] = hole[i], [x1, y1] = hole[j]
      const edx = x1 - x0, edy = y1 - y0
      const edL = Math.hypot(edx, edy) || 1
      const inx = edy / edL, iny = -edx / edL
      const a0 = vi, a1 = vi + 1, b0 = vi + 2, b1 = vi + 3
      positions[vi * 3] = x0; positions[vi * 3 + 1] = y0; positions[vi * 3 + 2] = zBot; normals[vi * 3] = inx; normals[vi * 3 + 1] = iny; vi++
      positions[vi * 3] = x0; positions[vi * 3 + 1] = y0; positions[vi * 3 + 2] = zTop; normals[vi * 3] = inx; normals[vi * 3 + 1] = iny; vi++
      positions[vi * 3] = x1; positions[vi * 3 + 1] = y1; positions[vi * 3 + 2] = zBot; normals[vi * 3] = inx; normals[vi * 3 + 1] = iny; vi++
      positions[vi * 3] = x1; positions[vi * 3 + 1] = y1; positions[vi * 3 + 2] = zTop; normals[vi * 3] = inx; normals[vi * 3 + 1] = iny; vi++
      indices.push(a0, b0, b1, a0, b1, a1)
    }
  }

  return {
    name: 'PCB',
    positions: positions.slice(0, vi * 3),
    normals: normals.slice(0, vi * 3),
    indices: new Uint32Array(indices)
  }
}

export function buildTracesGeometry(segments, drills, layer, zBot, zTop, squareEnds) {
  const segs = segments.filter(s => s.layer === layer)
  if (!segs.length) return null

  const endpointFree = []
  if (squareEnds) {
    const CONN_TOL_SQ = 0.05 * 0.05
    for (let si = 0; si < segs.length; si++) {
      const s = segs[si]
      let p1Free = true, p2Free = true
      for (let oi = 0; oi < segs.length; oi++) {
        if (oi === si) continue
        const o = segs[oi]
        const ox1 = o.x1, oy1 = -o.y1, ox2 = o.x2, oy2 = -o.y2
        const sx1 = s.x1, sy1 = -s.y1, sx2 = s.x2, sy2 = -s.y2
        if (p1Free) {
          if ((sx1 - ox1) ** 2 + (sy1 - oy1) ** 2 < CONN_TOL_SQ || (sx1 - ox2) ** 2 + (sy1 - oy2) ** 2 < CONN_TOL_SQ)
            p1Free = false
        }
        if (p2Free) {
          if ((sx2 - ox1) ** 2 + (sy2 - oy1) ** 2 < CONN_TOL_SQ || (sx2 - ox2) ** 2 + (sy2 - oy2) ** 2 < CONN_TOL_SQ)
            p2Free = false
        }
      }
      endpointFree.push({ p1: p1Free, p2: p2Free })
    }
  }

  const lookupDrill = makeDrillLookup(drills)
  const allPos = [], allNrm = [], allIdx = []
  let vOff = 0

  for (let si = 0; si < segs.length; si++) {
    const seg = segs[si]
    let p1x = seg.x1, p1y = -seg.y1
    let p2x = seg.x2, p2y = -seg.y2
    const hw = seg.width / 2
    let dx = p2x - p1x, dy = p2y - p1y
    let segLenSq = dx * dx + dy * dy
    const theta = Math.atan2(dy, dx)

    const p1Sq = squareEnds && endpointFree[si]?.p1
    const p2Sq = squareEnds && endpointFree[si]?.p2

    let trimP1 = false, trimP2 = false
    const segLen = Math.sqrt(segLenSq)
    if (segLen > 1e-4) {
      const ux = dx / segLen, uy = dy / segLen
      const origP1x = p1x, origP1y = p1y
      let tStart = 0, tEnd = segLen
      for (const d of drills) {
        const dlx = d.x, dly = -d.y
        const vx = dlx - origP1x, vy = dly - origP1y
        const projT = vx * ux + vy * uy
        const perpSq = vx * vx + vy * vy - projT * projT
        const perpDistSq = Math.max(0, perpSq)
        const Rsq = d.r * d.r - perpDistSq
        if (Rsq <= 0) continue
        const R = Math.sqrt(Rsq) + 0.02
        const cutStart = projT - R
        const cutEnd = projT + R
        if (cutStart <= tStart && cutEnd > tStart) tStart = cutEnd
        if (cutEnd >= tEnd && cutStart < tEnd) tEnd = cutStart
      }
      if (tStart >= tEnd) continue
      if (tStart > 0) {
        p1x = origP1x + ux * tStart; p1y = origP1y + uy * tStart
        trimP1 = true
      }
      if (tEnd < segLen) {
        p2x = origP1x + ux * tEnd; p2y = origP1y + uy * tEnd
        trimP2 = true
      }
      dx = p2x - p1x; dy = p2y - p1y
      segLenSq = dx * dx + dy * dy
    }

    const outline = []
    if (p2Sq && !trimP2) {
      const ct = Math.cos(theta), st = Math.sin(theta)
      const nx = -st, ny = ct
      const ex = p2x + hw * ct, ey = p2y + hw * st
      outline.push([ex - hw * nx, ey - hw * ny])
      outline.push([ex + hw * nx, ey + hw * ny])
    } else if (trimP2) {
      const ct = Math.cos(theta), st = Math.sin(theta)
      const nx = -st, ny = ct
      outline.push([p2x - hw * nx, p2y - hw * ny])
      outline.push([p2x + hw * nx, p2y + hw * ny])
    } else {
      for (let i = 0; i <= HALF_N; i++) {
        const a = theta - Math.PI / 2 + Math.PI * i / HALF_N
        outline.push([p2x + hw * Math.cos(a), p2y + hw * Math.sin(a)])
      }
    }
    if (p1Sq && !trimP1) {
      const ct = Math.cos(theta), st = Math.sin(theta)
      const nx = -st, ny = ct
      const ex = p1x - hw * ct, ey = p1y - hw * st
      outline.push([ex + hw * nx, ey + hw * ny])
      outline.push([ex - hw * nx, ey - hw * ny])
    } else if (trimP1) {
      const ct = Math.cos(theta), st = Math.sin(theta)
      const nx = -st, ny = ct
      outline.push([p1x + hw * nx, p1y + hw * ny])
      outline.push([p1x - hw * nx, p1y - hw * ny])
    } else {
      for (let i = 1; i < HALF_N; i++) {
        const a = theta + Math.PI / 2 + Math.PI * i / HALF_N
        outline.push([p1x + hw * Math.cos(a), p1y + hw * Math.sin(a)])
      }
    }

    const holes = []
    for (const d of drills) {
      const dlx = d.x, dly = -d.y
      let dist
      if (segLenSq < 1e-8) {
        dist = Math.hypot(dlx - p1x, dly - p1y)
      } else {
        const t = Math.max(0, Math.min(1, ((dlx - p1x) * dx + (dly - p1y) * dy) / segLenSq))
        dist = Math.hypot(dlx - (p1x + t * dx), dly - (p1y + t * dy))
      }
      if (dist >= hw) continue
      if (d.r >= hw) continue
      const hr = Math.min(d.r, hw - dist - 0.02)
      if (hr > 0.05) {
        const h = []
        for (let i = 0; i < HOLE_N; i++) {
          const a = -i * 2 * Math.PI / HOLE_N
          h.push([dlx + hr * Math.cos(a), dly + hr * Math.sin(a)])
        }
        holes.push(h)
      }
    }

    const flat = []
    const hIdx = []
    for (const [x, y] of outline) flat.push(x, y)
    for (const hole of holes) {
      hIdx.push(flat.length / 2)
      for (const [x, y] of hole) flat.push(x, y)
    }
    const triIdx = earcut(flat, hIdx.length ? hIdx : null, 2)

    const nFace = flat.length / 2
    const outN = outline.length

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

    for (let i = 0; i < outN; i++) {
      const j = (i + 1) % outN
      const [x0, y0] = outline[i], [x1, y1] = outline[j]
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

    for (const hole of holes) {
      const hN = hole.length
      for (let i = 0; i < hN; i++) {
        const j = (i + 1) % hN
        const [x0, y0] = hole[i], [x1, y1] = hole[j]
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
    }

    for (let i = 0; i < pos.length; i++) { allPos.push(pos[i]); allNrm.push(nrm[i]) }
    for (const i of idx) allIdx.push(i + vOff)
    vOff += lvi
  }

  if (!allPos.length) return null

  return {
    name: layer,
    positions: new Float32Array(allPos),
    normals: new Float32Array(allNrm),
    indices: new Uint32Array(allIdx)
  }
}
