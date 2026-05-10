const { PI, sin, cos, acos, atan2, sqrt, min, max, hypot, abs } = Math

function normalize(x, y) {
  const len = hypot(x, y)
  if (len < 1e-10) return { x: 0, y: 0 }
  return { x: x / len, y: y / len }
}

function dot(ax, ay, bx, by) {
  return ax * bx + ay * by
}

function cross2D(ax, ay, bx, by) {
  return ax * by - ay * bx
}

/**
 * Compute rounded corners for a polyline using circular arc fillets.
 * Adapts the KiCad Round Tracks native arc algorithm.
 *
 * @param {Array<{col, row}>} points - Grid waypoints
 * @param {number} radius - Max rounding radius in mm (tangent distance for 90° bend)
 * @param {number} pitch - Grid pitch in mm
 * @returns {Array<{type: 'line'|'arc', ...}>} Path segments
 */
export function computeRoundedCorners(points, radius, pitch) {
  if (points.length < 2) return []

  const pts = points.map(p => ({ x: p.col * pitch, y: p.row * pitch }))

  if (pts.length === 2) {
    return [{ type: 'line', x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y }]
  }

  const RADIUS = radius / (sin(PI / 4) + 1)

  const segments = []
  const shortenStart = new Array(pts.length - 1).fill(0)
  const shortenEnd = new Array(pts.length - 1).fill(0)
  const arcs = []

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], curr = pts[i], next = pts[i + 1]
    const d1 = normalize(prev.x - curr.x, prev.y - curr.y)
    const d2 = normalize(next.x - curr.x, next.y - curr.y)

    const dotVal = dot(d1.x, d1.y, d2.x, d2.y)
    const clampedDot = max(-1, min(1, dotVal))
    const angle = acos(clampedDot)

    if (angle < 0.01 || angle > PI - 0.01) {
      arcs.push(null)
      continue
    }

    const halfAngle = angle / 2
    const segLen1 = hypot(prev.x - curr.x, prev.y - curr.y)
    const segLen2 = hypot(next.x - curr.x, next.y - curr.y)
    const shortest = min(segLen1, segLen2)

    const f = sin(halfAngle) + 1
    const shortenAmount = min(RADIUS * f, shortest * 0.5)

    const t1x = curr.x + shortenAmount * d1.x
    const t1y = curr.y + shortenAmount * d1.y
    const t2x = curr.x + shortenAmount * d2.x
    const t2y = curr.y + shortenAmount * d2.y

    const theta = PI / 2 - halfAngle
    const mf = 1 / (2 * cos(theta) + 2)
    const mx = curr.x * (1 - 2 * mf) + t1x * mf + t2x * mf
    const my = curr.y * (1 - 2 * mf) + t1y * mf + t2y * mf

    const arcRadius = circumRadius(t1x, t1y, mx, my, t2x, t2y)

    const crossVal = cross2D(
      curr.x - prev.x, curr.y - prev.y,
      next.x - curr.x, next.y - curr.y
    )
    const sweepFlag = crossVal > 0 ? 1 : 0

    shortenEnd[i - 1] = max(shortenEnd[i - 1], shortenAmount)
    shortenStart[i] = max(shortenStart[i], shortenAmount)

    arcs.push({ t1x, t1y, t2x, t2y, mx, my, r: arcRadius, sweepFlag })
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i].x, ay = pts[i].y
    const bx = pts[i + 1].x, by = pts[i + 1].y
    const segLen = hypot(bx - ax, by - ay)

    if (segLen < 1e-6) continue

    const dx = (bx - ax) / segLen, dy = (by - ay) / segLen
    const startOff = shortenStart[i]
    const endOff = shortenEnd[i]

    const sx = ax + dx * startOff
    const sy = ay + dy * startOff
    const ex = bx - dx * endOff
    const ey = by - dy * endOff

    if (hypot(ex - sx, ey - sy) > 1e-4) {
      segments.push({ type: 'line', x1: sx, y1: sy, x2: ex, y2: ey })
    }

    if (i < arcs.length && arcs[i]) {
      const arc = arcs[i]
      segments.push({
        type: 'arc',
        x1: arc.t1x, y1: arc.t1y,
        x2: arc.t2x, y2: arc.t2y,
        mx: arc.mx, my: arc.my,
        r: arc.r,
        sweepFlag: arc.sweepFlag
      })
    }
  }

  return segments
}

/**
 * Compute subdivision-based rounding (iterative corner cutting).
 * Each pass shortens segments at corners and adds connecting chords.
 */
export function computeSubdivisionRounding(points, radius, passes, pitch) {
  if (points.length < 2) return []

  let pts = points.map(p => ({ x: p.col * pitch, y: p.row * pitch }))

  if (pts.length === 2) {
    return [{ type: 'line', x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y }]
  }

  const RADIUS = radius / (sin(PI / 4) + 1)

  for (let pass = 0; pass < passes; pass++) {
    if (pts.length < 3) break
    const newPts = [pts[0]]

    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[i - 1], curr = pts[i], next = pts[i + 1]
      const d1 = normalize(prev.x - curr.x, prev.y - curr.y)
      const d2 = normalize(next.x - curr.x, next.y - curr.y)

      const dotVal = dot(d1.x, d1.y, d2.x, d2.y)
      const clampedDot = max(-1, min(1, dotVal))
      const angle = acos(clampedDot)

      if (angle < 0.01 || angle > PI - 0.01) {
        newPts.push(curr)
        continue
      }

      const halfAngle = angle / 2
      const segLen1 = hypot(prev.x - curr.x, prev.y - curr.y)
      const segLen2 = hypot(next.x - curr.x, next.y - curr.y)
      const shortest = min(segLen1, segLen2)

      const theta = PI / 2 - halfAngle
      const f = 1 / (2 * cos(theta) + 2)
      const shortenAmount = min(RADIUS, shortest * f)

      const t1x = curr.x + shortenAmount * d1.x
      const t1y = curr.y + shortenAmount * d1.y
      const t2x = curr.x + shortenAmount * d2.x
      const t2y = curr.y + shortenAmount * d2.y

      newPts.push({ x: t1x, y: t1y })
      newPts.push({ x: t2x, y: t2y })
    }

    newPts.push(pts[pts.length - 1])
    pts = newPts
  }

  const segments = []
  for (let i = 0; i < pts.length - 1; i++) {
    segments.push({ type: 'line', x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y })
  }
  return segments
}

/**
 * Convert path segments to SVG path `d` attribute.
 */
export function roundedPathToSVG(pathSegments) {
  if (pathSegments.length === 0) return ''

  let d = ''
  let lastX = null, lastY = null

  for (const seg of pathSegments) {
    if (seg.type === 'line') {
      if (lastX === null || abs(seg.x1 - lastX) > 0.001 || abs(seg.y1 - lastY) > 0.001) {
        d += `M${seg.x1} ${seg.y1}`
      }
      d += `L${seg.x2} ${seg.y2}`
      lastX = seg.x2; lastY = seg.y2
    } else if (seg.type === 'arc') {
      if (lastX === null || abs(seg.x1 - lastX) > 0.001 || abs(seg.y1 - lastY) > 0.001) {
        d += `M${seg.x1} ${seg.y1}`
      }
      d += `A${seg.r} ${seg.r} 0 0 ${seg.sweepFlag} ${seg.x2} ${seg.y2}`
      lastX = seg.x2; lastY = seg.y2
    }
  }

  return d
}

/**
 * Sample rounded path into discrete points for 3D geometry generation.
 * Arcs are subdivided into small straight segments.
 */
export function sampleRoundedPath(pathSegments, samplesPerArc = 12) {
  if (pathSegments.length === 0) return []

  const points = []

  for (const seg of pathSegments) {
    if (seg.type === 'line') {
      if (points.length === 0 || hypot(seg.x1 - points[points.length - 1].x, seg.y1 - points[points.length - 1].y) > 0.001) {
        points.push({ x: seg.x1, y: seg.y1 })
      }
      points.push({ x: seg.x2, y: seg.y2 })
    } else if (seg.type === 'arc') {
      if (points.length === 0 || hypot(seg.x1 - points[points.length - 1].x, seg.y1 - points[points.length - 1].y) > 0.001) {
        points.push({ x: seg.x1, y: seg.y1 })
      }

      const { cx, cy } = circumCenter(seg.x1, seg.y1, seg.mx, seg.my, seg.x2, seg.y2)
      const startAngle = atan2(seg.y1 - cy, seg.x1 - cx)
      let endAngle = atan2(seg.y2 - cy, seg.x2 - cx)

      let sweep = endAngle - startAngle
      if (seg.sweepFlag === 1) {
        if (sweep > 0) sweep -= 2 * PI
      } else {
        if (sweep < 0) sweep += 2 * PI
      }

      const n = max(3, Math.round(abs(sweep) / (PI / 2) * samplesPerArc))
      for (let i = 1; i <= n; i++) {
        const t = i / n
        const a = startAngle + sweep * t
        points.push({ x: cx + seg.r * cos(a), y: cy + seg.r * sin(a) })
      }
    }
  }

  return points
}

function circumRadius(x1, y1, x2, y2, x3, y3) {
  const a = hypot(x2 - x1, y2 - y1)
  const b = hypot(x3 - x2, y3 - y2)
  const c = hypot(x1 - x3, y1 - y3)
  const s = (a + b + c) / 2
  const area = sqrt(max(0, s * (s - a) * (s - b) * (s - c)))
  if (area < 1e-10) return 1e6
  return (a * b * c) / (4 * area)
}

function circumCenter(x1, y1, x2, y2, x3, y3) {
  const ax = x1, ay = y1
  const bx = x2, by = y2
  const cx = x3, cy = y3
  const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
  if (abs(D) < 1e-10) return { cx: (x1 + x3) / 2, cy: (y1 + y3) / 2 }
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D
  return { cx: ux, cy: uy }
}
