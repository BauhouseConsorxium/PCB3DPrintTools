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

export function sampleCatmullRomWithWidth(points, traceWidth, endWidth, segmentsPerSpan = 16, tension = 0.5, taperDistance = 0) {
  if (!points || points.length < 2) return []

  const segs = catmullRomToCubicBeziers(points, tension)
  const samples = [{ x: segs[0].p0.x, y: segs[0].p0.y }]

  for (let si = 0; si < segs.length; si++) {
    const s = segs[si]
    for (let j = 1; j <= segmentsPerSpan; j++) {
      const t = j / segmentsPerSpan
      const u = 1 - t
      samples.push({
        x: u * u * u * s.p0.x + 3 * u * u * t * s.cp1.x + 3 * u * t * t * s.cp2.x + t * t * t * s.p3.x,
        y: u * u * u * s.p0.y + 3 * u * u * t * s.cp1.y + 3 * u * t * t * s.cp2.y + t * t * t * s.p3.y,
      })
    }
  }

  const cumLen = [0]
  for (let i = 1; i < samples.length; i++) {
    cumLen.push(cumLen[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y))
  }
  const totalLen = cumLen[cumLen.length - 1]
  const td = taperDistance > 0 ? taperDistance : totalLen * 0.5

  for (let i = 0; i < samples.length; i++) {
    const dStart = cumLen[i]
    const dEnd = totalLen - cumLen[i]
    let w = traceWidth
    if (dStart < td) {
      const f = dStart / td
      const ct = Math.cos(Math.PI / 2 * f)
      w = traceWidth + (endWidth - traceWidth) * ct * ct
    }
    if (dEnd < td) {
      const f = dEnd / td
      const ct = Math.cos(Math.PI / 2 * f)
      const wEnd = traceWidth + (endWidth - traceWidth) * ct * ct
      w = Math.max(w, wEnd)
    }
    samples[i].w = w
  }

  return samples
}

export function variableWidthOutlinePath(points, traceWidth, endWidth, segmentsPerSpan = 32, tension = 0.5, taperDistance = 0) {
  if (!points || points.length < 2) return ''

  const samples = sampleCatmullRomWithWidth(points, traceWidth, endWidth, segmentsPerSpan, tension, taperDistance)
  const left = [], right = []

  for (let i = 0; i < samples.length; i++) {
    const prev = samples[Math.max(0, i - 1)]
    const next = samples[Math.min(samples.length - 1, i + 1)]
    let tx = next.x - prev.x, ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    tx /= len; ty /= len
    const nx = -ty, ny = tx
    const hw = samples[i].w / 2
    left.push({ x: samples[i].x + nx * hw, y: samples[i].y + ny * hw })
    right.push({ x: samples[i].x - nx * hw, y: samples[i].y - ny * hw })
  }

  // Closed outline: left side forward, semicircle end cap, right side backward, semicircle start cap
  const last = samples[samples.length - 1]
  const first = samples[0]

  let d = `M${left[0].x},${left[0].y}`
  for (let i = 1; i < left.length; i++) d += ` L${left[i].x},${left[i].y}`

  // End cap (semicircle)
  const ehw = last.w / 2
  d += ` A${ehw},${ehw} 0 0 1 ${right[right.length - 1].x},${right[right.length - 1].y}`

  for (let i = right.length - 2; i >= 0; i--) d += ` L${right[i].x},${right[i].y}`

  // Start cap (semicircle)
  const shw = first.w / 2
  d += ` A${shw},${shw} 0 0 1 ${left[0].x},${left[0].y}`

  d += ' Z'
  return d
}
