importScripts('./earcut.min.js')
const earcutFn = earcut.default

const HALF_N = 24
const HOLE_N = 32
const HOLE_SIDES = 32
const COPPER_THICKNESS = 0.035
const CIRCLE_RES = 128
const DRILL_TOL_SQ = 0.05 * 0.05

// ==================== S-Expression Parser ====================

function parseSExpr(text) {
  let pos = 0
  const len = text.length

  function skipWS() {
    while (pos < len) {
      const ch = text.charCodeAt(pos)
      if (ch <= 32) { pos++; continue }
      break
    }
  }

  function readAtom() {
    if (text[pos] === '"') {
      pos++
      let start = pos
      while (pos < len && text[pos] !== '"') pos++
      const s = text.slice(start, pos)
      if (pos < len) pos++
      return s
    }
    let start = pos
    while (pos < len && text[pos] !== '(' && text[pos] !== ')' && text.charCodeAt(pos) > 32) pos++
    return text.slice(start, pos)
  }

  function readList() {
    pos++
    const items = []
    while (pos < len) {
      skipWS()
      if (pos >= len) break
      if (text[pos] === ')') { pos++; return items }
      if (text[pos] === '(') items.push(readList())
      else items.push(readAtom())
    }
    return items
  }

  skipWS()
  if (pos < len && text[pos] === '(') return readList()
  return null
}

// ==================== S-Expr Helpers ====================

function find(node, name) {
  if (!Array.isArray(node)) return null
  for (const child of node) {
    if (Array.isArray(child) && child[0] === name) return child
  }
  return null
}

function findAll(node, name) {
  if (!Array.isArray(node)) return []
  return node.filter(c => Array.isArray(c) && c[0] === name)
}

function num(node, name) {
  const c = find(node, name)
  return c ? parseFloat(c[1]) : 0
}

function str(node, name) {
  const c = find(node, name)
  return c ? c[1] : ''
}

// ==================== Data Extraction ====================

function extractThickness(tree) {
  const g = find(tree, 'general')
  if (g) { const t = num(g, 'thickness'); if (t > 0) return t }
  return 1.6
}

function extractBoardOutline(tree) {
  // gr_circle
  for (const c of findAll(tree, 'gr_circle')) {
    if (str(c, 'layer') !== 'Edge.Cuts') continue
    const center = find(c, 'center')
    const end = find(c, 'end')
    if (!center || !end) continue
    const cx = parseFloat(center[1]), cy = parseFloat(center[2])
    const ex = parseFloat(end[1]), ey = parseFloat(end[2])
    const r = Math.hypot(ex - cx, ey - cy)
    const pts = []
    for (let i = 0; i < CIRCLE_RES; i++) {
      const a = -i * 2 * Math.PI / CIRCLE_RES
      pts.push([cx + r * Math.cos(a), -(cy + r * Math.sin(a))])
    }
    ensureCCW(pts)
    return pts
  }

  // gr_rect
  for (const c of findAll(tree, 'gr_rect')) {
    if (str(c, 'layer') !== 'Edge.Cuts') continue
    const s = find(c, 'start'), e = find(c, 'end')
    if (!s || !e) continue
    const x1 = parseFloat(s[1]), y1 = parseFloat(s[2])
    const x2 = parseFloat(e[1]), y2 = parseFloat(e[2])
    const pts = [[x1, -y1], [x2, -y1], [x2, -y2], [x1, -y2]]
    ensureCCW(pts)
    return pts
  }

  // gr_line + gr_arc stitching
  const edges = []
  for (const l of findAll(tree, 'gr_line')) {
    if (str(l, 'layer') !== 'Edge.Cuts') continue
    const s = find(l, 'start'), e = find(l, 'end')
    if (!s || !e) continue
    edges.push({
      type: 'line',
      x1: parseFloat(s[1]), y1: parseFloat(s[2]),
      x2: parseFloat(e[1]), y2: parseFloat(e[2])
    })
  }
  for (const a of findAll(tree, 'gr_arc')) {
    if (str(a, 'layer') !== 'Edge.Cuts') continue
    const s = find(a, 'start'), m = find(a, 'mid'), e = find(a, 'end')
    if (!s || !m || !e) continue
    edges.push({
      type: 'arc',
      x1: parseFloat(s[1]), y1: parseFloat(s[2]),
      xm: parseFloat(m[1]), ym: parseFloat(m[2]),
      x2: parseFloat(e[1]), y2: parseFloat(e[2])
    })
  }

  if (!edges.length) return null
  return stitchEdges(edges)
}

function stitchEdges(edges) {
  const used = new Array(edges.length).fill(false)
  const pts = []
  used[0] = true
  const e0 = edges[0]
  if (e0.type === 'line') {
    pts.push([e0.x1, e0.y1])
  } else {
    for (const p of tessellateArc(e0.x1, e0.y1, e0.xm, e0.ym, e0.x2, e0.y2)) pts.push(p)
  }
  let cx = e0.x2, cy = e0.y2

  for (let count = 1; count < edges.length; count++) {
    let bestI = -1, bestD = Infinity, flip = false
    for (let i = 0; i < edges.length; i++) {
      if (used[i]) continue
      const e = edges[i]
      const d1 = (e.x1 - cx) ** 2 + (e.y1 - cy) ** 2
      const d2 = (e.x2 - cx) ** 2 + (e.y2 - cy) ** 2
      if (d1 < bestD) { bestD = d1; bestI = i; flip = false }
      if (d2 < bestD) { bestD = d2; bestI = i; flip = true }
    }
    if (bestI < 0 || bestD > 1) break
    used[bestI] = true
    const e = edges[bestI]
    const sx = flip ? e.x2 : e.x1, sy = flip ? e.y2 : e.y1
    const ex = flip ? e.x1 : e.x2, ey = flip ? e.y1 : e.y2
    if (e.type === 'line') {
      pts.push([sx, sy])
    } else {
      const mid = flip
        ? tessellateArc(sx, sy, e.xm, e.ym, ex, ey)
        : tessellateArc(e.x1, e.y1, e.xm, e.ym, e.x2, e.y2)
      for (const p of mid) pts.push(p)
    }
    cx = ex; cy = ey
  }

  const result = pts.map(([x, y]) => [x, -y])
  ensureCCW(result)
  return result
}

function tessellateArc(x1, y1, xm, ym, x2, y2) {
  const D = 2 * (x1 * (ym - y2) + xm * (y2 - y1) + x2 * (y1 - ym))
  if (Math.abs(D) < 1e-10) return [[x1, y1]]
  const ux = ((x1*x1+y1*y1)*(ym-y2) + (xm*xm+ym*ym)*(y2-y1) + (x2*x2+y2*y2)*(y1-ym)) / D
  const uy = ((x1*x1+y1*y1)*(x2-xm) + (xm*xm+ym*ym)*(x1-x2) + (x2*x2+y2*y2)*(xm-x1)) / D
  const r = Math.hypot(x1 - ux, y1 - uy)
  const a1 = Math.atan2(y1 - uy, x1 - ux)
  const am = Math.atan2(ym - uy, xm - ux)
  const a2 = Math.atan2(y2 - uy, x2 - ux)
  const sweep = computeSweep(a1, am, a2)
  const steps = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 32)))
  const pts = []
  for (let i = 0; i < steps; i++) {
    const a = a1 + sweep * i / steps
    pts.push([ux + r * Math.cos(a), uy + r * Math.sin(a)])
  }
  return pts
}

function computeSweep(a1, am, a2) {
  function norm(a) { return ((a % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI) }
  const n1 = norm(a1), nm = norm(am), n2 = norm(a2)
  function ccwBetween(from, test, to) {
    if (from <= to) return test >= from && test <= to
    return test >= from || test <= to
  }
  if (ccwBetween(n1, nm, n2)) {
    let s = n2 - n1; if (s <= 0) s += 2*Math.PI; return s
  } else {
    let s = n2 - n1; if (s >= 0) s -= 2*Math.PI; return s
  }
}

function extractSegments(tree) {
  const segs = []
  for (const s of findAll(tree, 'segment')) {
    const start = find(s, 'start'), end = find(s, 'end')
    const width = num(s, 'width'), layer = str(s, 'layer')
    if (!start || !end || !layer) continue
    if (layer !== 'F.Cu' && layer !== 'B.Cu') continue
    segs.push({
      x1: parseFloat(start[1]), y1: parseFloat(start[2]),
      x2: parseFloat(end[1]), y2: parseFloat(end[2]),
      width, layer
    })
  }
  return segs
}

function extractDrills(tree) {
  const drills = []
  for (const v of findAll(tree, 'via')) {
    const at = find(v, 'at'), d = num(v, 'drill')
    if (at && d > 0) drills.push({ x: parseFloat(at[1]), y: parseFloat(at[2]), r: d/2 })
  }
  for (const fp of findAll(tree, 'footprint')) {
    const fpAt = find(fp, 'at')
    if (!fpAt) continue
    const fpX = parseFloat(fpAt[1]), fpY = parseFloat(fpAt[2])
    const fpRot = fpAt[3] !== undefined ? parseFloat(fpAt[3]) * Math.PI / 180 : 0
    const cosR = Math.cos(fpRot), sinR = Math.sin(fpRot)

    for (const pad of findAll(fp, 'pad')) {
      if (pad[2] !== 'thru_hole' && pad[2] !== 'np_thru_hole') continue
      const padAt = find(pad, 'at'), drillNode = find(pad, 'drill')
      if (!padAt || !drillNode) continue
      const padX = parseFloat(padAt[1]), padY = parseFloat(padAt[2])
      const dr = parseFloat(drillNode[1]) / 2
      if (isNaN(dr) || dr <= 0) continue
      const wx = fpX + padX * cosR + padY * sinR
      const wy = fpY - padX * sinR + padY * cosR
      drills.push({ x: wx, y: wy, r: dr })
    }
  }
  return drills
}

// ==================== Geometry Helpers ====================

function signedArea(pts) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
  }
  return a
}

function ensureCCW(pts) {
  if (signedArea(pts) < 0) pts.reverse()
}

function pointInPolygon(px, py, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1]
    const xj = poly[j][0], yj = poly[j][1]
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

function makeDrillLookup(drills) {
  const local = drills.map(d => ({ lx: d.x, ly: -d.y, r: d.r }))
  return function(cx, cy) {
    for (const d of local) {
      const dx = d.lx - cx, dy = d.ly - cy
      if (dx*dx + dy*dy < DRILL_TOL_SQ) return d.r
    }
    return 0
  }
}

// ==================== Board Geometry ====================

function buildBoardGeometry(polygon, drills, thickness) {
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

  const triIdx = earcutFn(flat, holeIndices.length ? holeIndices : null, 2)

  const zBot = 0, zTop = thickness
  const nFace = flat.length / 2
  const totalVerts = 2 * nFace + 4 * N + holeRings.reduce((s, h) => s + 4 * h.length, 0)
  const positions = new Float32Array(totalVerts * 3)
  const normals = new Float32Array(totalVerts * 3)
  const indices = []
  let vi = 0

  // Top face
  const topBase = vi
  for (let i = 0; i < nFace; i++) {
    positions[vi*3] = flat[i*2]; positions[vi*3+1] = flat[i*2+1]; positions[vi*3+2] = zTop
    normals[vi*3+2] = 1; vi++
  }
  for (let i = 0; i < triIdx.length; i += 3)
    indices.push(topBase + triIdx[i], topBase + triIdx[i+1], topBase + triIdx[i+2])

  // Bottom face
  const botBase = vi
  for (let i = 0; i < nFace; i++) {
    positions[vi*3] = flat[i*2]; positions[vi*3+1] = flat[i*2+1]; positions[vi*3+2] = zBot
    normals[vi*3+2] = -1; vi++
  }
  for (let i = 0; i < triIdx.length; i += 3)
    indices.push(botBase + triIdx[i], botBase + triIdx[i+2], botBase + triIdx[i+1])

  // Outer side wall
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N
    const [x0, y0] = polygon[i], [x1, y1] = polygon[j]
    const edx = x1 - x0, edy = y1 - y0
    const edL = Math.hypot(edx, edy) || 1
    const onx = edy / edL, ony = -edx / edL
    const a0 = vi, a1 = vi+1, b0 = vi+2, b1 = vi+3
    positions[vi*3]=x0; positions[vi*3+1]=y0; positions[vi*3+2]=zBot; normals[vi*3]=onx; normals[vi*3+1]=ony; vi++
    positions[vi*3]=x0; positions[vi*3+1]=y0; positions[vi*3+2]=zTop; normals[vi*3]=onx; normals[vi*3+1]=ony; vi++
    positions[vi*3]=x1; positions[vi*3+1]=y1; positions[vi*3+2]=zBot; normals[vi*3]=onx; normals[vi*3+1]=ony; vi++
    positions[vi*3]=x1; positions[vi*3+1]=y1; positions[vi*3+2]=zTop; normals[vi*3]=onx; normals[vi*3+1]=ony; vi++
    indices.push(a0, b0, b1, a0, b1, a1)
  }

  // Inner side walls
  for (const hole of holeRings) {
    const hN = hole.length
    for (let i = 0; i < hN; i++) {
      const j = (i + 1) % hN
      const [x0, y0] = hole[i], [x1, y1] = hole[j]
      const edx = x1 - x0, edy = y1 - y0
      const edL = Math.hypot(edx, edy) || 1
      const inx = edy / edL, iny = -edx / edL
      const a0 = vi, a1 = vi+1, b0 = vi+2, b1 = vi+3
      positions[vi*3]=x0; positions[vi*3+1]=y0; positions[vi*3+2]=zBot; normals[vi*3]=inx; normals[vi*3+1]=iny; vi++
      positions[vi*3]=x0; positions[vi*3+1]=y0; positions[vi*3+2]=zTop; normals[vi*3]=inx; normals[vi*3+1]=iny; vi++
      positions[vi*3]=x1; positions[vi*3+1]=y1; positions[vi*3+2]=zBot; normals[vi*3]=inx; normals[vi*3+1]=iny; vi++
      positions[vi*3]=x1; positions[vi*3+1]=y1; positions[vi*3+2]=zTop; normals[vi*3]=inx; normals[vi*3+1]=iny; vi++
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

// ==================== Copper Traces Geometry ====================

function buildTracesGeometry(segments, drills, layer, zBot, zTop, squareEnds) {
  const segs = segments.filter(s => s.layer === layer)
  if (!segs.length) return null

  // Pre-compute free endpoints: an endpoint is free if no other segment shares it
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
          if ((sx1-ox1)**2+(sy1-oy1)**2 < CONN_TOL_SQ || (sx1-ox2)**2+(sy1-oy2)**2 < CONN_TOL_SQ)
            p1Free = false
        }
        if (p2Free) {
          if ((sx2-ox1)**2+(sy2-oy1)**2 < CONN_TOL_SQ || (sx2-ox2)**2+(sy2-oy2)**2 < CONN_TOL_SQ)
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
    const p1x = seg.x1, p1y = -seg.y1
    const p2x = seg.x2, p2y = -seg.y2
    const hw = seg.width / 2
    const dx = p2x - p1x, dy = p2y - p1y
    const theta = Math.atan2(dy, dx)

    const p1Sq = squareEnds && endpointFree[si]?.p1
    const p2Sq = squareEnds && endpointFree[si]?.p2

    // P2 cap (right-side → left-side)
    const outline = []
    if (p2Sq) {
      const ct = Math.cos(theta), st = Math.sin(theta)
      const nx = -st, ny = ct
      const ex = p2x + hw * ct, ey = p2y + hw * st
      outline.push([ex - hw * nx, ey - hw * ny])
      outline.push([ex + hw * nx, ey + hw * ny])
    } else {
      for (let i = 0; i <= HALF_N; i++) {
        const a = theta - Math.PI/2 + Math.PI * i / HALF_N
        outline.push([p2x + hw * Math.cos(a), p2y + hw * Math.sin(a)])
      }
    }
    // P1 cap (left-side → right-side)
    if (p1Sq) {
      const ct = Math.cos(theta), st = Math.sin(theta)
      const nx = -st, ny = ct
      const ex = p1x - hw * ct, ey = p1y - hw * st
      outline.push([ex + hw * nx, ey + hw * ny])
      outline.push([ex - hw * nx, ey - hw * ny])
    } else {
      for (let i = 1; i < HALF_N; i++) {
        const a = theta + Math.PI/2 + Math.PI * i / HALF_N
        outline.push([p1x + hw * Math.cos(a), p1y + hw * Math.sin(a)])
      }
    }

    // Drill holes
    const holes = []
    const d1r = lookupDrill(p1x, p1y)
    if (d1r > 0 && d1r < hw - 0.01) {
      const h = []
      for (let i = 0; i < HOLE_N; i++) {
        const a = -i * 2 * Math.PI / HOLE_N
        h.push([p1x + d1r * Math.cos(a), p1y + d1r * Math.sin(a)])
      }
      holes.push(h)
    }
    const d2r = lookupDrill(p2x, p2y)
    if (d2r > 0 && d2r < hw - 0.01) {
      const h = []
      for (let i = 0; i < HOLE_N; i++) {
        const a = -i * 2 * Math.PI / HOLE_N
        h.push([p2x + d2r * Math.cos(a), p2y + d2r * Math.sin(a)])
      }
      holes.push(h)
    }

    // Earcut
    const flat = []
    const hIdx = []
    for (const [x, y] of outline) flat.push(x, y)
    for (const hole of holes) {
      hIdx.push(flat.length / 2)
      for (const [x, y] of hole) flat.push(x, y)
    }
    const triIdx = earcutFn(flat, hIdx.length ? hIdx : null, 2)

    const nFace = flat.length / 2
    const outN = outline.length
    const sideInner = holes.reduce((s, h) => s + h.length, 0)

    // Emit vertices
    const pos = [], nrm = [], idx = []
    let lvi = 0

    // Top face
    const tB = lvi
    for (let i = 0; i < nFace; i++) {
      pos.push(flat[i*2], flat[i*2+1], zTop); nrm.push(0, 0, 1); lvi++
    }
    for (let i = 0; i < triIdx.length; i += 3)
      idx.push(tB + triIdx[i], tB + triIdx[i+1], tB + triIdx[i+2])

    // Bottom face
    const bB = lvi
    for (let i = 0; i < nFace; i++) {
      pos.push(flat[i*2], flat[i*2+1], zBot); nrm.push(0, 0, -1); lvi++
    }
    for (let i = 0; i < triIdx.length; i += 3)
      idx.push(bB + triIdx[i], bB + triIdx[i+2], bB + triIdx[i+1])

    // Outer side wall
    for (let i = 0; i < outN; i++) {
      const j = (i + 1) % outN
      const [x0, y0] = outline[i], [x1, y1] = outline[j]
      const edx = x1 - x0, edy = y1 - y0
      const edL = Math.hypot(edx, edy) || 1
      const onx = edy / edL, ony = -edx / edL
      const a0 = lvi, a1 = lvi+1, b0 = lvi+2, b1 = lvi+3
      pos.push(x0,y0,zBot); nrm.push(onx,ony,0); lvi++
      pos.push(x0,y0,zTop); nrm.push(onx,ony,0); lvi++
      pos.push(x1,y1,zBot); nrm.push(onx,ony,0); lvi++
      pos.push(x1,y1,zTop); nrm.push(onx,ony,0); lvi++
      idx.push(a0, b0, b1, a0, b1, a1)
    }

    // Inner side walls
    for (const hole of holes) {
      const hN = hole.length
      for (let i = 0; i < hN; i++) {
        const j = (i + 1) % hN
        const [x0, y0] = hole[i], [x1, y1] = hole[j]
        const edx = x1 - x0, edy = y1 - y0
        const edL = Math.hypot(edx, edy) || 1
        const inx = edy / edL, iny = -edx / edL
        const a0 = lvi, a1 = lvi+1, b0 = lvi+2, b1 = lvi+3
        pos.push(x0,y0,zBot); nrm.push(inx,iny,0); lvi++
        pos.push(x0,y0,zTop); nrm.push(inx,iny,0); lvi++
        pos.push(x1,y1,zBot); nrm.push(inx,iny,0); lvi++
        pos.push(x1,y1,zTop); nrm.push(inx,iny,0); lvi++
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

// ==================== Message Handler ====================

let cachedTree = null
let cachedThickness = 0
let cachedPolygon = null
let cachedSegments = null
let cachedDrills = null

function buildBodies(widthOffset, drillOffset, squareEnds) {
  const thickness = cachedThickness
  const polygon = cachedPolygon

  const segments = widthOffset
    ? cachedSegments.map(s => ({ ...s, width: Math.max(0.01, s.width + widthOffset) }))
    : cachedSegments

  const drills = drillOffset
    ? cachedDrills.map(d => ({ ...d, r: Math.max(0.01, d.r + drillOffset / 2) }))
    : cachedDrills

  self.postMessage({ type: 'PROGRESS', message: 'Building 3D geometry…' })
  const bodies = []

  const board = buildBoardGeometry(polygon, drills, thickness)
  if (board) bodies.push(board)

  const fCu = buildTracesGeometry(segments, drills, 'F.Cu', thickness, thickness + COPPER_THICKNESS, squareEnds)
  if (fCu) bodies.push(fCu)

  const bCu = buildTracesGeometry(segments, drills, 'B.Cu', -COPPER_THICKNESS, 0, squareEnds)
  if (bCu) bodies.push(bCu)

  if (!bodies.length) {
    self.postMessage({ type: 'ERROR', message: 'No geometry extracted from PCB file' })
    return
  }

  const transferables = bodies.flatMap(b => [b.positions.buffer, b.normals.buffer, b.indices.buffer])
  self.postMessage({ type: 'RESULT', bodies }, transferables)
}

self.onmessage = ({ data }) => {
  if (data.type === 'REBUILD') {
    if (!cachedTree) return
    try {
      buildBodies(data.widthOffset || 0, data.drillOffset || 0, !!data.squareEnds)
    } catch (err) {
      self.postMessage({ type: 'ERROR', message: String(err) })
    }
    return
  }

  if (data.type !== 'PROCESS') return

  try {
    self.postMessage({ type: 'PROGRESS', message: 'Parsing KiCad PCB…' })
    const tree = parseSExpr(data.text)
    if (!tree || tree[0] !== 'kicad_pcb') {
      self.postMessage({ type: 'ERROR', message: 'Not a valid KiCad PCB file' })
      return
    }

    self.postMessage({ type: 'PROGRESS', message: 'Extracting geometry…' })
    cachedTree = tree
    cachedThickness = extractThickness(tree)
    cachedPolygon = extractBoardOutline(tree)
    cachedSegments = extractSegments(tree)
    cachedDrills = extractDrills(tree)

    if (!cachedPolygon) {
      self.postMessage({ type: 'ERROR', message: 'No board outline found (Edge.Cuts layer)' })
      return
    }

    buildBodies(data.widthOffset || 0, data.drillOffset || 0, !!data.squareEnds)
  } catch (err) {
    self.postMessage({ type: 'ERROR', message: String(err) })
  }
}
