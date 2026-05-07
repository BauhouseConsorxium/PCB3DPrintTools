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

export function buildEnclosureBody(boardPoly, params) {
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

      const a0 = vi, a1 = vi + 1, b0 = vi + 2, b1 = vi + 3
      positions.push(x0, y0, z0); normals.push(nx, ny, 0); vi++
      positions.push(x0, y0, z1); normals.push(nx, ny, 0); vi++
      positions.push(x1, y1, z0); normals.push(nx, ny, 0); vi++
      positions.push(x1, y1, z1); normals.push(nx, ny, 0); vi++
      indices.push(a0, b0, b1, a0, b1, a1)
    }
  }

  // 1. Outer bottom
  addFace(outerOuter, [], zBot, -1)
  // 2. Outer side wall
  addSideWall(outerOuter, zBot, zWallTop, false)
  // 3. Wall top (ring with inner hole)
  addFace(outerOuter, [outerInner], zWallTop, 1)
  // 4. Wall inner step
  addSideWall(outerInner, zShelfTop, zWallTop, true)
  // 5. Shelf top (ring with shelf-inner hole)
  addFace(outerInner, [shelfInner], zShelfTop, 1)
  // 6. Shelf inner step
  addSideWall(shelfInner, zFloorTop, zShelfTop, true)
  // 7. Floor top
  addFace(shelfInner, [], zFloorTop, 1)

  return {
    name: 'Enclosure',
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  }
}
