import earcut from 'earcut'

function snap(v) { return Math.round(v * 1000) / 1000 }

export function parseBoardPoly(arr) {
  if (!arr || arr.length < 6) return null
  const pts = []
  for (let i = 0; i < arr.length; i += 2) pts.push([snap(arr[i]), snap(-arr[i + 1])])
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
  }
  if (area < 0) pts.reverse()
  pts.push([pts[0][0], pts[0][1]])
  return pts
}

export function offsetPoly2D(closedRing, r) {
  const N = closedRing.length - 1
  const out = []
  for (let i = 0; i < N; i++) {
    const prev = closedRing[(i - 1 + N) % N]
    const curr = closedRing[i]
    const next = closedRing[(i + 1) % N]
    const e1x = curr[0] - prev[0], e1y = curr[1] - prev[1]
    const e1L = Math.hypot(e1x, e1y) || 1
    const e2x = next[0] - curr[0], e2y = next[1] - curr[1]
    const e2L = Math.hypot(e2x, e2y) || 1
    const n1x = e1y / e1L, n1y = -e1x / e1L
    const n2x = e2y / e2L, n2y = -e2x / e2L
    const bx = n1x + n2x, by = n1y + n2y
    const bL = Math.hypot(bx, by) || 1
    const bnx = bx / bL, bny = by / bL
    const cosHalf = Math.max(0.1, n1x * bnx + n1y * bny)
    const dist = r / cosHalf
    out.push([curr[0] + bnx * dist, curr[1] + bny * dist])
  }
  out.push([out[0][0], out[0][1]])
  return out
}

function ringVerts(ring) {
  return ring.slice(0, -1)
}

function lerp2(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function projectPointOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) return 0
  return ((px - ax) * dx + (py - ay) * dy) / len2
}

function findClosestPointOnRing(ring, x, y) {
  const verts = ringVerts(ring)
  const N = verts.length
  let bestDist = Infinity, bestPt = [x, y]
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N
    const t = Math.max(0, Math.min(1, projectPointOnSegment(x, y, verts[i][0], verts[i][1], verts[j][0], verts[j][1])))
    const px = verts[i][0] + (verts[j][0] - verts[i][0]) * t
    const py = verts[i][1] + (verts[j][1] - verts[i][1]) * t
    const d = Math.hypot(px - x, py - y)
    if (d < bestDist) { bestDist = d; bestPt = [px, py] }
  }
  return bestPt
}

export function buildEnclosureBody(boardPoly, params, cutouts = []) {
  const { wallThickness, clearance, floorThickness, wallHeight, shelfDepth, shelfHeight } = params

  const outerOuter = offsetPoly2D(boardPoly, clearance + wallThickness)
  const outerInner = offsetPoly2D(boardPoly, clearance)
  const shelfInner = offsetPoly2D(boardPoly, clearance - shelfDepth)

  const zShelfTop = 0
  const zFloorTop = -shelfHeight
  const zBot = -(floorThickness + shelfHeight)
  const zWallTop = wallHeight

  const positions = []
  const normals = []
  const indices = []
  let vi = 0

  function addFace(outerRing, holeRings, z, nz) {
    const flat = []
    const holeIdx = []
    let count = 0
    const overts = ringVerts(outerRing)
    for (const [x, y] of overts) { flat.push(x, y); count++ }
    for (const hole of holeRings) {
      holeIdx.push(count)
      const hverts = ringVerts(hole)
      for (let i = hverts.length - 1; i >= 0; i--) {
        flat.push(hverts[i][0], hverts[i][1]); count++
      }
    }

    const triIdx = earcut(flat, holeIdx.length ? holeIdx : null, 2)
    const base = vi
    for (let i = 0; i < count; i++) {
      positions.push(flat[i * 2], flat[i * 2 + 1], z)
      normals.push(0, 0, nz)
      vi++
    }
    if (nz > 0) {
      for (let i = 0; i < triIdx.length; i += 3)
        indices.push(base + triIdx[i], base + triIdx[i + 1], base + triIdx[i + 2])
    } else {
      for (let i = 0; i < triIdx.length; i += 3)
        indices.push(base + triIdx[i], base + triIdx[i + 2], base + triIdx[i + 1])
    }
  }

  function emitQuad(x0, y0, x1, y1, z0, z1, nx, ny, nz) {
    const a0 = vi, a1 = vi + 1, b0 = vi + 2, b1 = vi + 3
    positions.push(x0, y0, z0); normals.push(nx, ny, nz); vi++
    positions.push(x0, y0, z1); normals.push(nx, ny, nz); vi++
    positions.push(x1, y1, z0); normals.push(nx, ny, nz); vi++
    positions.push(x1, y1, z1); normals.push(nx, ny, nz); vi++
    indices.push(a0, b0, b1, a0, b1, a1)
  }

  function addSideWall(ring, z0, z1, inward) {
    const verts = ringVerts(ring)
    const N = verts.length
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N
      const [x0, y0] = verts[i], [x1, y1] = verts[j]
      const edx = x1 - x0, edy = y1 - y0
      const edL = Math.hypot(edx, edy) || 1
      let nx = edy / edL, ny = -edx / edL
      if (inward) { nx = -nx; ny = -ny }
      emitQuad(x0, y0, x1, y1, z0, z1, nx, ny, 0)
    }
  }

  function segmentCutoutIntervals(verts, segI, segJ, cuts) {
    const [ax, ay] = verts[segI], [bx, by] = verts[segJ]
    const edx = bx - ax, edy = by - ay
    const segLen = Math.hypot(edx, edy)
    if (segLen < 1e-9) return []

    const nx = edy / segLen, ny = -edx / segLen

    const intervals = []
    for (const c of cuts) {
      const midX = (c.p0[0] + c.p1[0]) / 2, midY = (c.p0[1] + c.p1[1]) / 2
      const perpDist = Math.abs((midX - ax) * nx + (midY - ay) * ny)
      if (perpDist > wallThickness + clearance + 2) continue

      const t0 = projectPointOnSegment(c.p0[0], c.p0[1], ax, ay, bx, by)
      const t1 = projectPointOnSegment(c.p1[0], c.p1[1], ax, ay, bx, by)
      const tMin = Math.max(0, Math.min(t0, t1))
      const tMax = Math.min(1, Math.max(t0, t1))
      if (tMax - tMin > 1e-6) {
        intervals.push({ tMin, tMax, zBottom: c.zBottom })
      }
    }
    intervals.sort((a, b) => a.tMin - b.tMin)
    return intervals
  }

  function addSideWallWithCutouts(ring, z0, z1, inward, cuts, slotTop) {
    if (!cuts.length) { addSideWall(ring, z0, z1, inward); return }
    const verts = ringVerts(ring)
    const N = verts.length
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N
      const [ax, ay] = verts[i], [bx, by] = verts[j]
      const edx = bx - ax, edy = by - ay
      const edL = Math.hypot(edx, edy) || 1
      let nx = edy / edL, ny = -edx / edL
      if (inward) { nx = -nx; ny = -ny }

      const intervals = segmentCutoutIntervals(verts, i, j, cuts)
      if (!intervals.length) {
        emitQuad(ax, ay, bx, by, z0, z1, nx, ny, 0)
        continue
      }

      let cursor = 0
      for (const iv of intervals) {
        const slotZ = Math.max(z0, iv.zBottom)
        const effectiveTop = slotTop ?? z1
        if (iv.tMin > cursor + 1e-6) {
          const la = lerp2([ax, ay], [bx, by], cursor)
          const lb = lerp2([ax, ay], [bx, by], iv.tMin)
          emitQuad(la[0], la[1], lb[0], lb[1], z0, z1, nx, ny, 0)
        }
        if (slotZ > z0 + 1e-6) {
          const la = lerp2([ax, ay], [bx, by], iv.tMin)
          const lb = lerp2([ax, ay], [bx, by], iv.tMax)
          emitQuad(la[0], la[1], lb[0], lb[1], z0, slotZ, nx, ny, 0)
        }
        cursor = iv.tMax
      }
      if (cursor < 1 - 1e-6) {
        const la = lerp2([ax, ay], [bx, by], cursor)
        emitQuad(la[0], la[1], bx, by, z0, z1, nx, ny, 0)
      }
    }
  }

  function insertNotches(ring, innerRing, cuts) {
    if (!cuts.length) return ring
    const verts = ringVerts(ring)
    const N = verts.length
    const result = []

    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N
      result.push([verts[i][0], verts[i][1]])

      const intervals = segmentCutoutIntervals(verts, i, j, cuts)
      if (!intervals.length) continue

      const [ax, ay] = verts[i], [bx, by] = verts[j]
      for (const iv of intervals) {
        const pOuter0 = lerp2([ax, ay], [bx, by], iv.tMin)
        const pOuter1 = lerp2([ax, ay], [bx, by], iv.tMax)
        const pInner0 = findClosestPointOnRing(innerRing, pOuter0[0], pOuter0[1])
        const pInner1 = findClosestPointOnRing(innerRing, pOuter1[0], pOuter1[1])
        const overshoot = 0.15
        const dx0 = pInner0[0] - pOuter0[0], dy0 = pInner0[1] - pOuter0[1]
        const d0 = Math.hypot(dx0, dy0) || 1
        const dx1 = pInner1[0] - pOuter1[0], dy1 = pInner1[1] - pOuter1[1]
        const d1 = Math.hypot(dx1, dy1) || 1
        const pOver0 = [pInner0[0] + (dx0 / d0) * overshoot, pInner0[1] + (dy0 / d0) * overshoot]
        const pOver1 = [pInner1[0] + (dx1 / d1) * overshoot, pInner1[1] + (dy1 / d1) * overshoot]
        result.push(pOuter0, pOver0, pOver1, pOuter1)
      }
    }
    result.push([result[0][0], result[0][1]])
    return result
  }

  function addSlotTunnelCaps(cuts) {
    for (const c of cuts) {
      const outerL = findClosestPointOnRing(outerOuter, c.p0[0], c.p0[1])
      const outerR = findClosestPointOnRing(outerOuter, c.p1[0], c.p1[1])
      const innerL = findClosestPointOnRing(shelfInner, c.p0[0], c.p0[1])
      const innerR = findClosestPointOnRing(shelfInner, c.p1[0], c.p1[1])
      const slotZ = c.zBottom

      // slot floor
      const fb = vi
      positions.push(outerL[0], outerL[1], slotZ); normals.push(0, 0, 1); vi++
      positions.push(outerR[0], outerR[1], slotZ); normals.push(0, 0, 1); vi++
      positions.push(innerR[0], innerR[1], slotZ); normals.push(0, 0, 1); vi++
      positions.push(innerL[0], innerL[1], slotZ); normals.push(0, 0, 1); vi++
      indices.push(fb, fb + 1, fb + 2, fb, fb + 2, fb + 3)

      // slot left side wall
      const dx = innerL[0] - outerL[0], dy = innerL[1] - outerL[1]
      const sLen = Math.hypot(dx, dy) || 1
      const snx = dy / sLen, sny = -dx / sLen

      const sl = vi
      positions.push(outerL[0], outerL[1], slotZ); normals.push(snx, sny, 0); vi++
      positions.push(outerL[0], outerL[1], zWallTop); normals.push(snx, sny, 0); vi++
      positions.push(innerL[0], innerL[1], slotZ); normals.push(snx, sny, 0); vi++
      positions.push(innerL[0], innerL[1], zWallTop); normals.push(snx, sny, 0); vi++
      indices.push(sl, sl + 2, sl + 3, sl, sl + 3, sl + 1)

      // slot right side wall
      const sr = vi
      positions.push(outerR[0], outerR[1], slotZ); normals.push(-snx, -sny, 0); vi++
      positions.push(outerR[0], outerR[1], zWallTop); normals.push(-snx, -sny, 0); vi++
      positions.push(innerR[0], innerR[1], slotZ); normals.push(-snx, -sny, 0); vi++
      positions.push(innerR[0], innerR[1], zWallTop); normals.push(-snx, -sny, 0); vi++
      indices.push(sr, sr + 1, sr + 3, sr, sr + 3, sr + 2)
    }
  }

  const processedCuts = cutouts.map(c => ({
    ...c,
    p0: [c.cx - c.dx, c.cy - c.dy],
    p1: [c.cx + c.dx, c.cy + c.dy],
  }))

  // 1. Outer bottom
  addFace(outerOuter, [], zBot, -1)
  // 2. Outer side wall (with cutouts)
  addSideWallWithCutouts(outerOuter, zBot, zWallTop, false, processedCuts, zWallTop)
  // 3. Wall top (ring with inner hole, notched for cutouts)
  addFace(insertNotches(outerOuter, outerInner, processedCuts), [outerInner], zWallTop, 1)
  // 4. Wall inner step (with cutouts)
  addSideWallWithCutouts(outerInner, zShelfTop, zWallTop, true, processedCuts, zWallTop)
  // 5. Shelf top (ring with shelf-inner hole, notched for cutouts)
  addFace(insertNotches(outerInner, shelfInner, processedCuts), [shelfInner], zShelfTop, 1)
  // 6. Shelf inner step (with cutouts)
  addSideWallWithCutouts(shelfInner, zFloorTop, zShelfTop, true, processedCuts, zShelfTop)
  // 7. Floor top
  addFace(shelfInner, [], zFloorTop, 1)
  // 8. Slot tunnel caps
  if (processedCuts.length) addSlotTunnelCaps(processedCuts)

  return {
    name: 'Enclosure',
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  }
}
