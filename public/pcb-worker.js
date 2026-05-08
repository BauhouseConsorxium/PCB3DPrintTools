importScripts('./earcut.min.js')
const earcutFn = earcut.default

const HALF_N = 24
const HOLE_N = 32
const HOLE_SIDES = 32
const COPPER_THICKNESS = 0.035
const CIRCLE_RES = 128
const DRILL_TOL_SQ = 0.05 * 0.05

// ==================== Hershey Simplex Stroke Font ====================
// Public domain. Each glyph: w = advance width, s = array of polylines.
// Coordinate space: Y 0=baseline, 21=cap height, descenders to -7.
// null within a stroke array means pen-up (start new polyline).

const H = {
  32:{w:16,s:[]},
  33:{w:10,s:[[[5,21],[5,7]],[[5,2],[4,1],[5,0],[6,1],[5,2]]]},
  34:{w:16,s:[[[4,21],[4,14]],[[12,21],[12,14]]]},
  35:{w:21,s:[[[11,25],[4,-7]],[[17,25],[10,-7]],[[4,12],[18,12]],[[3,6],[17,6]]]},
  36:{w:20,s:[[[8,25],[8,-4]],[[12,25],[12,-4]],[[17,18],[15,20],[12,21],[8,21],[5,20],[3,18],[3,16],[4,14],[5,13],[7,12],[13,10],[15,9],[16,8],[17,6],[17,3],[15,1],[12,0],[8,0],[5,1],[3,3]]]},
  37:{w:24,s:[[[21,21],[3,0]],[[8,21],[10,19],[10,17],[9,15],[7,14],[5,14],[3,16],[3,18],[4,20],[6,21],[8,21],[10,20],[13,19],[16,19],[19,20],[21,21]],[[17,7],[15,6],[14,4],[14,2],[16,0],[18,0],[20,1],[21,3],[21,5],[19,7],[17,7]]]},
  38:{w:26,s:[[[23,12],[23,13],[22,14],[21,14],[20,13],[19,11],[17,6],[15,3],[13,1],[11,0],[7,0],[5,1],[4,2],[3,4],[3,6],[4,8],[5,9],[12,13],[13,14],[14,16],[14,18],[13,20],[11,21],[9,20],[8,18],[8,16],[9,13],[11,10],[16,3],[18,1],[20,0],[22,0],[23,1],[23,2]]]},
  39:{w:10,s:[[[5,19],[4,20],[5,21],[6,20],[6,18],[5,16],[4,15]]]},
  40:{w:14,s:[[[11,25],[9,23],[7,20],[5,16],[4,11],[4,7],[5,2],[7,-2],[9,-5],[11,-7]]]},
  41:{w:14,s:[[[3,25],[5,23],[7,20],[9,16],[10,11],[10,7],[9,2],[7,-2],[5,-5],[3,-7]]]},
  42:{w:16,s:[[[8,21],[8,9]],[[3,18],[13,12]],[[13,18],[3,12]]]},
  43:{w:26,s:[[[13,18],[13,0]],[[4,9],[22,9]]]},
  44:{w:10,s:[[[6,1],[5,0],[4,1],[5,2],[6,1],[6,-1],[5,-3],[4,-4]]]},
  45:{w:26,s:[[[4,9],[22,9]]]},
  46:{w:10,s:[[[5,2],[4,1],[5,0],[6,1],[5,2]]]},
  47:{w:22,s:[[[20,25],[2,-7]]]},
  48:{w:20,s:[[[9,21],[6,20],[4,17],[3,12],[3,9],[4,4],[6,1],[9,0],[11,0],[14,1],[16,4],[17,9],[17,12],[16,17],[14,20],[11,21],[9,21]]]},
  49:{w:20,s:[[[6,17],[8,18],[11,21],[11,0]]]},
  50:{w:20,s:[[[4,16],[4,17],[5,19],[6,20],[8,21],[12,21],[14,20],[15,19],[16,17],[16,15],[15,13],[13,10],[3,0],[17,0]]]},
  51:{w:20,s:[[[5,21],[16,21],[10,13],[13,13],[15,12],[16,11],[17,8],[17,6],[16,3],[14,1],[11,0],[8,0],[5,1],[4,2],[3,4]]]},
  52:{w:20,s:[[[13,21],[3,7],[18,7]],[[13,21],[13,0]]]},
  53:{w:20,s:[[[15,21],[5,21],[4,12],[5,13],[8,14],[11,14],[14,13],[16,11],[17,8],[17,6],[16,3],[14,1],[11,0],[8,0],[5,1],[4,2],[3,4]]]},
  54:{w:20,s:[[[16,18],[15,20],[12,21],[10,21],[7,20],[5,17],[4,12],[4,7],[5,3],[7,1],[10,0],[11,0],[14,1],[16,3],[17,6],[17,7],[16,10],[14,12],[11,13],[10,13],[7,12],[5,10],[4,7]]]},
  55:{w:20,s:[[[17,21],[7,0]],[[3,21],[17,21]]]},
  56:{w:20,s:[[[8,21],[5,20],[4,18],[4,16],[5,14],[7,13],[11,12],[14,11],[16,9],[17,7],[17,4],[16,2],[15,1],[12,0],[8,0],[5,1],[4,2],[3,4],[3,7],[4,9],[6,11],[9,12],[13,13],[15,14],[16,16],[16,18],[15,20],[12,21],[8,21]]]},
  57:{w:20,s:[[[16,14],[15,11],[13,9],[10,8],[9,8],[6,9],[4,11],[3,14],[3,15],[4,18],[6,20],[9,21],[10,21],[13,20],[15,18],[16,14],[16,9],[15,4],[13,1],[10,0],[8,0],[5,1],[4,3]]]},
  58:{w:10,s:[[[5,14],[4,13],[5,12],[6,13],[5,14]],[[5,2],[4,1],[5,0],[6,1],[5,2]]]},
  59:{w:10,s:[[[5,14],[4,13],[5,12],[6,13],[5,14]],[[6,1],[5,0],[4,1],[5,2],[6,1],[6,-1],[5,-3],[4,-4]]]},
  60:{w:24,s:[[[20,18],[4,9],[20,0]]]},
  61:{w:26,s:[[[4,12],[22,12]],[[4,6],[22,6]]]},
  62:{w:24,s:[[[4,18],[20,9],[4,0]]]},
  63:{w:18,s:[[[3,16],[3,17],[4,19],[5,20],[7,21],[11,21],[13,20],[14,19],[15,17],[15,15],[14,13],[13,12],[9,10],[9,7]],[[9,2],[8,1],[9,0],[10,1],[9,2]]]},
  64:{w:27,s:[[[18,13],[17,15],[15,16],[12,16],[10,15],[9,14],[8,11],[8,8],[9,6],[11,5],[14,5],[16,6],[17,8]],[[12,16],[10,14],[9,11],[9,8],[10,6],[11,5]],[[18,16],[17,8],[17,6],[19,5],[21,5],[23,7],[24,10],[24,12],[23,15],[22,17],[20,19],[18,20],[15,21],[12,21],[9,20],[7,19],[5,17],[4,15],[3,12],[3,9],[4,6],[5,4],[7,2],[9,1],[12,0],[15,0],[18,1],[20,2],[21,3]],[[19,16],[18,8],[18,6],[19,5]]]},
  65:{w:18,s:[[[9,21],[1,0]],[[9,21],[17,0]],[[4,7],[14,7]]]},
  66:{w:21,s:[[[4,21],[4,0]],[[4,21],[13,21],[16,20],[17,19],[18,17],[18,15],[17,13],[16,12],[13,11]],[[4,11],[13,11],[16,10],[17,9],[18,7],[18,4],[17,2],[16,1],[13,0],[4,0]]]},
  67:{w:21,s:[[[18,16],[17,18],[15,20],[13,21],[9,21],[7,20],[5,18],[4,16],[3,13],[3,8],[4,5],[5,3],[7,1],[9,0],[13,0],[15,1],[17,3],[18,5]]]},
  68:{w:21,s:[[[4,21],[4,0]],[[4,21],[11,21],[14,20],[16,18],[17,16],[18,13],[18,8],[17,5],[16,3],[14,1],[11,0],[4,0]]]},
  69:{w:19,s:[[[4,21],[4,0]],[[4,21],[17,21]],[[4,11],[12,11]],[[4,0],[17,0]]]},
  70:{w:18,s:[[[4,21],[4,0]],[[4,21],[17,21]],[[4,11],[12,11]]]},
  71:{w:21,s:[[[18,16],[17,18],[15,20],[13,21],[9,21],[7,20],[5,18],[4,16],[3,13],[3,8],[4,5],[5,3],[7,1],[9,0],[13,0],[15,1],[17,3],[18,5],[18,8]],[[13,8],[18,8]]]},
  72:{w:22,s:[[[4,21],[4,0]],[[18,21],[18,0]],[[4,11],[18,11]]]},
  73:{w:8,s:[[[4,21],[4,0]]]},
  74:{w:16,s:[[[12,21],[12,5],[11,2],[10,1],[8,0],[6,0],[4,1],[3,2],[2,5],[2,7]]]},
  75:{w:21,s:[[[4,21],[4,0]],[[18,21],[4,7]],[[9,12],[18,0]]]},
  76:{w:17,s:[[[4,21],[4,0]],[[4,0],[16,0]]]},
  77:{w:24,s:[[[4,21],[4,0]],[[4,21],[12,0]],[[20,21],[12,0]],[[20,21],[20,0]]]},
  78:{w:22,s:[[[4,21],[4,0]],[[4,21],[18,0]],[[18,21],[18,0]]]},
  79:{w:22,s:[[[9,21],[7,20],[5,18],[4,16],[3,13],[3,8],[4,5],[5,3],[7,1],[9,0],[13,0],[15,1],[17,3],[18,5],[19,8],[19,13],[18,16],[17,18],[15,20],[13,21],[9,21]]]},
  80:{w:21,s:[[[4,21],[4,0]],[[4,21],[13,21],[16,20],[17,19],[18,17],[18,14],[17,12],[16,11],[13,10],[4,10]]]},
  81:{w:22,s:[[[9,21],[7,20],[5,18],[4,16],[3,13],[3,8],[4,5],[5,3],[7,1],[9,0],[13,0],[15,1],[17,3],[18,5],[19,8],[19,13],[18,16],[17,18],[15,20],[13,21],[9,21]],[[12,4],[18,-2]]]},
  82:{w:21,s:[[[4,21],[4,0]],[[4,21],[13,21],[16,20],[17,19],[18,17],[18,15],[17,13],[16,12],[13,11],[4,11]],[[11,11],[18,0]]]},
  83:{w:20,s:[[[17,18],[15,20],[12,21],[8,21],[5,20],[3,18],[3,16],[4,14],[5,13],[7,12],[13,10],[15,9],[16,8],[17,6],[17,3],[15,1],[12,0],[8,0],[5,1],[3,3]]]},
  84:{w:16,s:[[[8,21],[8,0]],[[1,21],[15,21]]]},
  85:{w:22,s:[[[4,21],[4,6],[5,3],[7,1],[10,0],[12,0],[15,1],[17,3],[18,6],[18,21]]]},
  86:{w:18,s:[[[1,21],[9,0]],[[17,21],[9,0]]]},
  87:{w:24,s:[[[2,21],[7,0]],[[12,21],[7,0]],[[12,21],[17,0]],[[22,21],[17,0]]]},
  88:{w:20,s:[[[3,21],[17,0]],[[17,21],[3,0]]]},
  89:{w:18,s:[[[1,21],[9,11],[9,0]],[[17,21],[9,11]]]},
  90:{w:20,s:[[[17,21],[3,0]],[[3,21],[17,21]],[[3,0],[17,0]]]},
  91:{w:14,s:[[[4,25],[4,-7]],[[5,25],[5,-7]],[[4,25],[11,25]],[[4,-7],[11,-7]]]},
  92:{w:14,s:[[[0,21],[14,-3]]]},
  93:{w:14,s:[[[9,25],[9,-7]],[[10,25],[10,-7]],[[3,25],[10,25]],[[3,-7],[10,-7]]]},
  94:{w:16,s:[[[6,15],[8,18],[10,15]],[[3,12],[8,17],[13,12]]]},
  95:{w:16,s:[[[0,-2],[16,-2]]]},
  96:{w:10,s:[[[6,21],[5,20],[4,18],[4,16],[5,15],[6,16],[5,17]]]},
  97:{w:19,s:[[[15,14],[15,0]],[[15,11],[13,13],[11,14],[8,14],[6,13],[4,11],[3,8],[3,6],[4,3],[6,1],[8,0],[11,0],[13,1],[15,3]]]},
  98:{w:19,s:[[[4,21],[4,0]],[[4,11],[6,13],[8,14],[11,14],[13,13],[15,11],[16,8],[16,6],[15,3],[13,1],[11,0],[8,0],[6,1],[4,3]]]},
  99:{w:18,s:[[[15,11],[13,13],[11,14],[8,14],[6,13],[4,11],[3,8],[3,6],[4,3],[6,1],[8,0],[11,0],[13,1],[15,3]]]},
  100:{w:19,s:[[[15,21],[15,0]],[[15,11],[13,13],[11,14],[8,14],[6,13],[4,11],[3,8],[3,6],[4,3],[6,1],[8,0],[11,0],[13,1],[15,3]]]},
  101:{w:18,s:[[[3,8],[15,8],[15,10],[14,12],[13,13],[11,14],[8,14],[6,13],[4,11],[3,8],[3,6],[4,3],[6,1],[8,0],[11,0],[13,1],[15,3]]]},
  102:{w:12,s:[[[10,21],[8,21],[6,20],[5,17],[5,0]],[[2,14],[9,14]]]},
  103:{w:19,s:[[[15,14],[15,-2],[14,-5],[13,-6],[11,-7],[8,-7],[6,-6]],[[15,11],[13,13],[11,14],[8,14],[6,13],[4,11],[3,8],[3,6],[4,3],[6,1],[8,0],[11,0],[13,1],[15,3]]]},
  104:{w:19,s:[[[4,21],[4,0]],[[4,10],[7,13],[9,14],[12,14],[14,13],[15,10],[15,0]]]},
  105:{w:8,s:[[[3,21],[4,20],[5,21],[4,22],[3,21]],[[4,14],[4,0]]]},
  106:{w:10,s:[[[5,21],[6,20],[7,21],[6,22],[5,21]],[[6,14],[6,-3],[5,-6],[3,-7],[1,-7]]]},
  107:{w:17,s:[[[4,21],[4,0]],[[14,14],[4,4]],[[8,8],[15,0]]]},
  108:{w:8,s:[[[4,21],[4,0]]]},
  109:{w:30,s:[[[4,14],[4,0]],[[4,10],[7,13],[9,14],[12,14],[14,13],[15,10],[15,0]],[[15,10],[18,13],[20,14],[23,14],[25,13],[26,10],[26,0]]]},
  110:{w:19,s:[[[4,14],[4,0]],[[4,10],[7,13],[9,14],[12,14],[14,13],[15,10],[15,0]]]},
  111:{w:19,s:[[[8,14],[6,13],[4,11],[3,8],[3,6],[4,3],[6,1],[8,0],[11,0],[13,1],[15,3],[16,6],[16,8],[15,11],[13,13],[11,14],[8,14]]]},
  112:{w:19,s:[[[4,14],[4,-7]],[[4,11],[6,13],[8,14],[11,14],[13,13],[15,11],[16,8],[16,6],[15,3],[13,1],[11,0],[8,0],[6,1],[4,3]]]},
  113:{w:19,s:[[[15,14],[15,-7]],[[15,11],[13,13],[11,14],[8,14],[6,13],[4,11],[3,8],[3,6],[4,3],[6,1],[8,0],[11,0],[13,1],[15,3]]]},
  114:{w:13,s:[[[4,14],[4,0]],[[4,8],[5,11],[7,13],[9,14],[12,14]]]},
  115:{w:17,s:[[[14,11],[13,13],[10,14],[7,14],[4,13],[3,11],[4,9],[6,8],[11,7],[13,6],[14,4],[14,3],[13,1],[10,0],[7,0],[4,1],[3,3]]]},
  116:{w:12,s:[[[5,21],[5,4],[6,1],[8,0],[10,0]],[[2,14],[9,14]]]},
  117:{w:19,s:[[[4,14],[4,4],[5,1],[7,0],[10,0],[12,1],[15,4]],[[15,14],[15,0]]]},
  118:{w:16,s:[[[2,14],[8,0]],[[14,14],[8,0]]]},
  119:{w:22,s:[[[3,14],[7,0]],[[11,14],[7,0]],[[11,14],[15,0]],[[19,14],[15,0]]]},
  120:{w:17,s:[[[3,14],[14,0]],[[14,14],[3,0]]]},
  121:{w:16,s:[[[2,14],[8,0]],[[14,14],[8,0],[6,-4],[4,-6],[2,-7],[1,-7]]]},
  122:{w:17,s:[[[14,14],[3,0]],[[3,14],[14,14]],[[3,0],[14,0]]]},
  123:{w:14,s:[[[9,25],[7,24],[6,23],[5,21],[5,19],[6,17],[7,16],[8,14],[8,12],[6,10]],[[7,24],[6,22],[6,20],[7,18],[8,17],[9,15],[9,13],[8,11],[4,9],[8,7],[9,5],[9,3],[8,1],[7,0],[6,-2],[6,-4],[7,-6]],[[6,8],[8,6],[8,4],[7,2],[6,1],[5,-1],[5,-3],[6,-5],[7,-6],[9,-7]]]},
  124:{w:8,s:[[[4,25],[4,-7]]]},
  125:{w:14,s:[[[5,25],[7,24],[8,23],[9,21],[9,19],[8,17],[7,16],[6,14],[6,12],[8,10]],[[7,24],[8,22],[8,20],[7,18],[6,17],[5,15],[5,13],[6,11],[10,9],[6,7],[5,5],[5,3],[6,1],[7,0],[8,-2],[8,-4],[7,-6]],[[8,8],[6,6],[6,4],[7,2],[8,1],[9,-1],[9,-3],[8,-5],[7,-6],[5,-7]]]},
  126:{w:24,s:[[[3,6],[3,8],[4,11],[6,12],[8,12],[10,11],[14,8],[16,7],[18,7],[20,8],[21,10]],[[3,8],[4,10],[6,11],[8,11],[10,10],[14,7],[16,6],[18,6],[20,7],[21,10],[21,12]]]},
}

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

// ==================== Text Extraction ====================

const TEXT_LAYERS = new Set(['F.SilkS', 'B.SilkS', 'F.Cu', 'B.Cu'])

function parseEffects(node) {
  const eff = find(node, 'effects')
  if (!eff) return { sizeW: 1, sizeH: 1, thickness: 0.15, bold: false, mirror: false, hJust: 'center', vJust: 'center' }
  const font = find(eff, 'font')
  let sizeW = 1, sizeH = 1, thickness = 0, bold = false
  if (font) {
    const sz = find(font, 'size')
    if (sz) { sizeW = parseFloat(sz[1]) || 1; sizeH = parseFloat(sz[2]) || 1 }
    const th = find(font, 'thickness')
    if (th) thickness = parseFloat(th[1]) || 0
    bold = !!find(font, 'bold')
  }
  if (thickness <= 0) thickness = sizeH * 0.15
  let mirror = false, hJust = 'center', vJust = 'center'
  const just = find(eff, 'justify')
  if (just) {
    for (let i = 1; i < just.length; i++) {
      const v = just[i]
      if (v === 'left') hJust = 'left'
      else if (v === 'right') hJust = 'right'
      else if (v === 'top') vJust = 'top'
      else if (v === 'bottom') vJust = 'bottom'
      else if (v === 'mirror') mirror = true
    }
  }
  return { sizeW, sizeH, thickness, bold, mirror, hJust, vJust }
}

function isHidden(node) {
  const h = find(node, 'hide')
  return h && h[1] === 'yes'
}

function extractTexts(tree) {
  const texts = []

  // gr_text (board-level)
  for (const gt of findAll(tree, 'gr_text')) {
    if (isHidden(gt)) continue
    const layer = str(gt, 'layer')
    if (!TEXT_LAYERS.has(layer)) continue
    const rawText = gt[1]
    if (!rawText) continue
    const at = find(gt, 'at')
    const x = at ? parseFloat(at[1]) : 0
    const y = at ? parseFloat(at[2]) : 0
    const rot = at && at[3] !== undefined ? parseFloat(at[3]) : 0
    const eff = parseEffects(gt)
    texts.push({ text: rawText.replace(/\\n/g, '\n'), x, y, rot, layer, ...eff })
  }

  // footprint text
  for (const fp of findAll(tree, 'footprint')) {
    const fpAt = find(fp, 'at')
    if (!fpAt) continue
    const fpX = parseFloat(fpAt[1]), fpY = parseFloat(fpAt[2])
    const fpRotDeg = fpAt[3] !== undefined ? parseFloat(fpAt[3]) : 0
    const fpRot = fpRotDeg * Math.PI / 180
    const cosR = Math.cos(fpRot), sinR = Math.sin(fpRot)

    // build property map for variable resolution
    const propMap = {}
    for (const prop of findAll(fp, 'property')) {
      if (prop[1] && prop[2]) propMap[prop[1].toUpperCase()] = prop[2]
    }

    // property elements (Reference, Value)
    for (const prop of findAll(fp, 'property')) {
      if (isHidden(prop)) continue
      const layer = str(prop, 'layer')
      if (!TEXT_LAYERS.has(layer)) continue
      const rawText = prop[2]
      if (!rawText) continue
      const at = find(prop, 'at')
      const localX = at ? parseFloat(at[1]) : 0
      const localY = at ? parseFloat(at[2]) : 0
      const localRot = at && at[3] !== undefined ? parseFloat(at[3]) : 0
      const wx = fpX + localX * cosR + localY * sinR
      const wy = fpY - localX * sinR + localY * cosR
      const eff = parseEffects(prop)
      texts.push({ text: rawText.replace(/\\n/g, '\n'), x: wx, y: wy, rot: localRot + fpRotDeg, layer, ...eff })
    }

    // fp_text user
    for (const ft of findAll(fp, 'fp_text')) {
      if (ft[1] !== 'user') continue
      if (isHidden(ft)) continue
      const layer = str(ft, 'layer')
      if (!TEXT_LAYERS.has(layer)) continue
      let rawText = ft[2] || ''
      rawText = rawText.replace(/\$\{(\w+)\}/g, (_, key) => propMap[key.toUpperCase()] || '')
      if (!rawText) continue
      const at = find(ft, 'at')
      const localX = at ? parseFloat(at[1]) : 0
      const localY = at ? parseFloat(at[2]) : 0
      const localRot = at && at[3] !== undefined ? parseFloat(at[3]) : 0
      const wx = fpX + localX * cosR + localY * sinR
      const wy = fpY - localX * sinR + localY * cosR
      const eff = parseEffects(ft)
      texts.push({ text: rawText.replace(/\\n/g, '\n'), x: wx, y: wy, rot: localRot + fpRotDeg, layer, ...eff })
    }
  }

  return texts
}

// ==================== Text to Polylines ====================

function textToPolylines(desc) {
  const CAP_H = 21
  const scaleX = desc.sizeW / CAP_H
  const scaleY = desc.sizeH / CAP_H
  const lineSpacing = desc.sizeH * 1.6
  const lines = desc.text.split('\n')
  const polylines = []

  const lineWidths = lines.map(line => {
    let w = 0
    for (let i = 0; i < line.length; i++) {
      const g = H[line.charCodeAt(i)]
      w += (g ? g.w : 16) * scaleX
    }
    return w
  })

  const totalHeight = (lines.length - 1) * lineSpacing

  let yOff = 0
  if (desc.vJust === 'center') yOff = totalHeight / 2
  else if (desc.vJust === 'bottom') yOff = totalHeight

  const rotRad = desc.rot * Math.PI / 180
  const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad)

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    const lineW = lineWidths[li]

    let cursorX = 0
    if (desc.hJust === 'center') cursorX = -lineW / 2
    else if (desc.hJust === 'right') cursorX = -lineW

    const cursorY = -(yOff - li * lineSpacing)

    for (let ci = 0; ci < line.length; ci++) {
      const code = line.charCodeAt(ci)
      const g = H[code]
      if (!g) { cursorX += 16 * scaleX; continue }

      for (const stroke of g.s) {
        if (stroke.length < 2) continue
        const pts = []
        for (let pi = 0; pi < stroke.length; pi++) {
          let lx = cursorX + stroke[pi][0] * scaleX
          let ly = cursorY - stroke[pi][1] * scaleY
          if (desc.mirror) lx = -lx
          const wx = desc.x + lx * cosR + ly * sinR
          const wy = desc.y - lx * sinR + ly * cosR
          pts.push([wx, -wy])
        }
        polylines.push({ pts, hw: desc.thickness / 2, layer: desc.layer })
      }
      cursorX += g.w * scaleX
    }
  }

  return polylines
}

// ==================== Thick Polyline Geometry ====================

const TEXT_CAP_N = 12

function buildTextGeometry(polylines, bodyName, zBot, zTop) {
  if (!polylines.length) return null

  const allPos = [], allNrm = [], allIdx = []
  let vOff = 0

  for (const { pts, hw } of polylines) {
    if (pts.length < 2) continue

    // Build thick polyline outline: right side (forward) + end cap + left side (backward) + start cap
    const N = pts.length
    const right = [], left = []

    // Segment directions
    const dirs = []
    for (let i = 0; i < N - 1; i++) {
      const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1]
      const len = Math.hypot(dx, dy) || 1e-9
      dirs.push([dx / len, dy / len])
    }

    // Right normal of dir (dx,dy) = (dy, -dx)
    for (let i = 0; i < N; i++) {
      if (i === 0) {
        // first point: use first segment's normal
        right.push([pts[0][0] + dirs[0][1] * hw, pts[0][1] - dirs[0][0] * hw])
        left.push([pts[0][0] - dirs[0][1] * hw, pts[0][1] + dirs[0][0] * hw])
      } else if (i === N - 1) {
        // last point: use last segment's normal
        const d = dirs[N - 2]
        right.push([pts[i][0] + d[1] * hw, pts[i][1] - d[0] * hw])
        left.push([pts[i][0] - d[1] * hw, pts[i][1] + d[0] * hw])
      } else {
        // interior: miter join
        const d0 = dirs[i - 1], d1 = dirs[i]
        const nx0 = d0[1], ny0 = -d0[0]
        const nx1 = d1[1], ny1 = -d1[0]
        const bx = nx0 + nx1, by = ny0 + ny1
        const bLen = Math.hypot(bx, by) || 1e-9
        const bnx = bx / bLen, bny = by / bLen
        const cosHalf = Math.max(0.25, nx0 * bnx + ny0 * bny)
        const dist = hw / cosHalf
        right.push([pts[i][0] + bnx * dist, pts[i][1] + bny * dist])
        left.push([pts[i][0] - bnx * dist, pts[i][1] - bny * dist])
      }
    }

    // Build closed outline: right forward + end cap + left backward + start cap
    const outline = []

    // Right side (forward)
    for (let i = 0; i < N; i++) outline.push(right[i])

    // End cap (semicircle at last point)
    const lastDir = dirs[N - 2]
    const endTheta = Math.atan2(lastDir[1], lastDir[0])
    for (let i = 1; i < TEXT_CAP_N; i++) {
      const a = endTheta - Math.PI / 2 + Math.PI * i / TEXT_CAP_N
      outline.push([pts[N - 1][0] + hw * Math.cos(a), pts[N - 1][1] + hw * Math.sin(a)])
    }

    // Left side (backward)
    for (let i = N - 1; i >= 0; i--) outline.push(left[i])

    // Start cap (semicircle at first point)
    const firstDir = dirs[0]
    const startTheta = Math.atan2(firstDir[1], firstDir[0])
    for (let i = 1; i < TEXT_CAP_N; i++) {
      const a = startTheta + Math.PI / 2 + Math.PI * i / TEXT_CAP_N
      outline.push([pts[0][0] + hw * Math.cos(a), pts[0][1] + hw * Math.sin(a)])
    }

    // Earcut
    const flat = []
    for (const [x, y] of outline) flat.push(x, y)
    const triIdx = earcutFn(flat, null, 2)
    if (!triIdx.length) continue

    const outN = outline.length
    const pos = [], nrm = [], idx = []
    let lvi = 0

    // Top face
    for (let i = 0; i < outN; i++) {
      pos.push(outline[i][0], outline[i][1], zTop)
      nrm.push(0, 0, 1)
      lvi++
    }
    for (const ti of triIdx) idx.push(ti)

    // Bottom face
    const botOff = lvi
    for (let i = 0; i < outN; i++) {
      pos.push(outline[i][0], outline[i][1], zBot)
      nrm.push(0, 0, -1)
      lvi++
    }
    for (let i = 0; i < triIdx.length; i += 3) {
      idx.push(botOff + triIdx[i + 2], botOff + triIdx[i + 1], botOff + triIdx[i])
    }

    // Side walls
    for (let i = 0; i < outN; i++) {
      const j = (i + 1) % outN
      const x0 = outline[i][0], y0 = outline[i][1]
      const x1 = outline[j][0], y1 = outline[j][1]
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

    for (let i = 0; i < pos.length; i++) { allPos.push(pos[i]); allNrm.push(nrm[i]) }
    for (const i of idx) allIdx.push(i + vOff)
    vOff += lvi
  }

  if (!allPos.length) return null

  return {
    name: bodyName,
    positions: new Float32Array(allPos),
    normals: new Float32Array(allNrm),
    indices: new Uint32Array(allIdx)
  }
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
let cachedTextPolylines = null

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

  // Text bodies — group by layer, use thick polyline geometry
  if (cachedTextPolylines && cachedTextPolylines.length) {
    const textByLayer = {}
    for (const pl of cachedTextPolylines) {
      if (!textByLayer[pl.layer]) textByLayer[pl.layer] = []
      textByLayer[pl.layer].push(pl)
    }
    for (const [layer, polys] of Object.entries(textByLayer)) {
      const isFront = layer.startsWith('F.')
      const zBot = isFront ? thickness : -COPPER_THICKNESS
      const zTop = isFront ? thickness + COPPER_THICKNESS : 0
      const bodyName = (layer === 'F.Cu' || layer === 'B.Cu') ? layer + '_text' : layer
      const body = buildTextGeometry(polys, bodyName, zBot, zTop)
      if (body) bodies.push(body)
    }
  }

  if (!bodies.length) {
    self.postMessage({ type: 'ERROR', message: 'No geometry extracted from PCB file' })
    return
  }

  // Pack board polygon as flat Float32Array of [x,y] pairs in KiCad coords (Y-down)
  let polygonBuf = null
  if (cachedPolygon) {
    const flat = new Float32Array(cachedPolygon.length * 2)
    for (let i = 0; i < cachedPolygon.length; i++) {
      flat[i * 2] = cachedPolygon[i][0]
      flat[i * 2 + 1] = -cachedPolygon[i][1]
    }
    polygonBuf = flat
  }

  // Pack raw segment data for per-segment CSG subtraction
  // Each segment: [x1, -y1, x2, -y2, width, layerFlag] (Y-flipped to match geometry coords)
  // layerFlag: 0 = F.Cu, 1 = B.Cu
  let segmentBuf = null
  if (segments && segments.length) {
    const buf = new Float32Array(segments.length * 6)
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i]
      buf[i * 6]     = s.x1
      buf[i * 6 + 1] = -s.y1
      buf[i * 6 + 2] = s.x2
      buf[i * 6 + 3] = -s.y2
      buf[i * 6 + 4] = s.width
      buf[i * 6 + 5] = s.layer === 'F.Cu' ? 0 : 1
    }
    segmentBuf = buf
  }

  const transferables = bodies.flatMap(b => [b.positions.buffer, b.normals.buffer, b.indices.buffer])
  if (polygonBuf) transferables.push(polygonBuf.buffer)
  if (segmentBuf) transferables.push(segmentBuf.buffer)
  self.postMessage({ type: 'RESULT', bodies, polygon: polygonBuf, segments: segmentBuf, thickness }, transferables)
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
    const textDescs = extractTexts(tree)
    cachedTextPolylines = textDescs.flatMap(d => textToPolylines(d))

    if (!cachedPolygon) {
      self.postMessage({ type: 'ERROR', message: 'No board outline found (Edge.Cuts layer)' })
      return
    }

    buildBodies(data.widthOffset || 0, data.drillOffset || 0, !!data.squareEnds)
  } catch (err) {
    self.postMessage({ type: 'ERROR', message: String(err) })
  }
}
