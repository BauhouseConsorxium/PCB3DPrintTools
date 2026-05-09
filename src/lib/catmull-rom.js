export function catmullRomToCubicBeziers(points, tension = 0.5) {
  if (!points || points.length < 2) return []

  if (points.length === 2) {
    const [a, b] = points
    return [{
      p0: a,
      cp1: { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
      cp2: { x: b.x - (b.x - a.x) / 3, y: b.y - (b.y - a.y) / 3 },
      p3: b
    }]
  }

  const t6 = 6 / tension
  const segments = []

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : { x: 2 * points[0].x - points[1].x, y: 2 * points[0].y - points[1].y }
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = i < points.length - 2 ? points[i + 2] : { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y }

    segments.push({
      p0: p1,
      cp1: { x: p1.x + (p2.x - p0.x) / t6, y: p1.y + (p2.y - p0.y) / t6 },
      cp2: { x: p2.x - (p3.x - p1.x) / t6, y: p2.y - (p3.y - p1.y) / t6 },
      p3: p2
    })
  }

  return segments
}

export function catmullRomSVGPath(points, tension = 0.5) {
  if (!points || points.length < 2) return ''

  const segs = catmullRomToCubicBeziers(points, tension)
  let d = `M${segs[0].p0.x},${segs[0].p0.y}`
  for (const s of segs) {
    d += ` C${s.cp1.x},${s.cp1.y} ${s.cp2.x},${s.cp2.y} ${s.p3.x},${s.p3.y}`
  }
  return d
}

export function sampleCatmullRom(points, segmentsPerSpan = 16, tension = 0.5) {
  if (!points || points.length < 2) return points ? [...points] : []

  const segs = catmullRomToCubicBeziers(points, tension)
  const samples = [{ x: segs[0].p0.x, y: segs[0].p0.y }]

  for (const s of segs) {
    for (let j = 1; j <= segmentsPerSpan; j++) {
      const t = j / segmentsPerSpan
      const u = 1 - t
      samples.push({
        x: u * u * u * s.p0.x + 3 * u * u * t * s.cp1.x + 3 * u * t * t * s.cp2.x + t * t * t * s.p3.x,
        y: u * u * u * s.p0.y + 3 * u * u * t * s.cp1.y + 3 * u * t * t * s.cp2.y + t * t * t * s.p3.y
      })
    }
  }

  return samples
}
