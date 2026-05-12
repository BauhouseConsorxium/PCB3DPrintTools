import { sampleCatmullRom } from './catmull-rom.js'
import {
  computeRoundedCorners,
  computeSubdivisionRounding,
  sampleRoundedPath,
} from './round-trace.js'
import { enumerateConductorNodes, nodeKey } from './perfboard-topology.js'

const NET_COLORS = [
  '#ff6bcb',
  '#00f0ff',
  '#a855f7',
  '#a3e635',
  '#fbbf24',
  '#7df9ff',
  '#c084fc',
  '#84cc16',
  '#fb923c',
  '#22d3ee',
  '#f472b6',
  '#facc15',
  '#34d399',
  '#60a5fa',
]

const UNCONNECTED_COLOR = '#f5c842'

class DSU {
  constructor() {
    this.parent = new Map()
  }
  add(k) {
    if (!this.parent.has(k)) this.parent.set(k, k)
  }
  find(k) {
    this.add(k)
    let r = k
    while (this.parent.get(r) !== r) r = this.parent.get(r)
    let cur = k
    while (this.parent.get(cur) !== r) {
      const next = this.parent.get(cur)
      this.parent.set(cur, r)
      cur = next
    }
    return r
  }
  union(a, b) {
    const ra = this.find(a), rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }
}

function sampleTraceMM(trace, pitch) {
  if (trace.type === 'roundtrace') {
    const pathSegs = trace.mode === 'subdivision'
      ? computeSubdivisionRounding(trace.points, trace.radius ?? 1.0, trace.passes ?? 2, pitch)
      : computeRoundedCorners(trace.points, trace.radius ?? 1.0, pitch)
    return sampleRoundedPath(pathSegs, 12)
  }
  if (trace.type === 'curve') {
    const pts = trace.points.map(p => ({ x: p.col * pitch, y: p.row * pitch }))
    return sampleCatmullRom(pts, 16, trace.tension ?? 0.5)
  }
  return trace.points.map(p => ({ x: p.col * pitch, y: p.row * pitch }))
}

function jointHitsCurvePath(samples, jx, jy, tolSq) {
  for (let i = 0; i < samples.length - 1; i++) {
    const ax = samples[i].x, ay = samples[i].y
    const bx = samples[i + 1].x, by = samples[i + 1].y
    const dx = bx - ax, dy = by - ay
    const lenSq = dx * dx + dy * dy
    if (lenSq < 1e-6) {
      const d2 = (jx - ax) ** 2 + (jy - ay) ** 2
      if (d2 < tolSq) return true
      continue
    }
    let t = ((jx - ax) * dx + (jy - ay) * dy) / lenSq
    if (t < 0) t = 0
    else if (t > 1) t = 1
    const cx = ax + t * dx, cy = ay + t * dy
    const d2 = (cx - jx) ** 2 + (cy - jy) ** 2
    if (d2 < tolSq) return true
  }
  return false
}

export function computeNets(doc) {
  const pads = enumerateConductorNodes(doc)
  const padSet = new Set(pads.map(p => p.key))
  const pitch = doc.grid?.pitch ?? 2.54

  const jointSet = new Set()
  for (const jt of doc.joints ?? []) jointSet.add(nodeKey(jt.col, jt.row))

  const dsu = new DSU()
  for (const p of pads) dsu.add(p.key)
  for (const k of jointSet) dsu.add(k)

  const connectorSet = padSet.size === 0 && jointSet.size === 0
    ? padSet
    : new Set([...padSet, ...jointSet])

  const jointPositions = []
  for (const k of jointSet) {
    const ci = k.indexOf(',')
    const jc = Number(k.slice(0, ci))
    const jr = Number(k.slice(ci + 1))
    jointPositions.push({ key: k, x: jc * pitch, y: jr * pitch })
  }
  const curveJointTolSq = (pitch * 0.3) * (pitch * 0.3)

  for (const trace of doc.traces ?? []) {
    if (!trace.points || trace.points.length === 0) continue
    const tk0 = nodeKey(trace.points[0].col, trace.points[0].row)
    dsu.add(tk0)
    for (let i = 1; i < trace.points.length; i++) {
      const tk = nodeKey(trace.points[i].col, trace.points[i].row)
      dsu.add(tk)
      dsu.union(tk0, tk)
    }
    if (!trace.type) {
      for (let i = 0; i < trace.points.length - 1; i++) {
        const a = trace.points[i], b = trace.points[i + 1]
        const dx = b.col - a.col, dy = b.row - a.row
        const lenSq = dx * dx + dy * dy
        if (lenSq < 1e-6) continue
        for (const k of connectorSet) {
          const ci = k.indexOf(',')
          const pc = Number(k.slice(0, ci))
          const pr = Number(k.slice(ci + 1))
          const t = ((pc - a.col) * dx + (pr - a.row) * dy) / lenSq
          if (t <= 1e-3 || t >= 1 - 1e-3) continue
          const cx = a.col + t * dx, cy = a.row + t * dy
          const d2 = (cx - pc) ** 2 + (cy - pr) ** 2
          if (d2 < 1e-4) dsu.union(tk0, k)
        }
      }
    } else if (jointPositions.length > 0) {
      const samples = sampleTraceMM(trace, pitch)
      for (const j of jointPositions) {
        if (jointHitsCurvePath(samples, j.x, j.y, curveJointTolSq)) {
          dsu.union(tk0, j.key)
        }
      }
    }
  }

  for (const j of doc.jumpers ?? []) {
    const k1 = nodeKey(j.col1, j.row1)
    const k2 = nodeKey(j.col2, j.row2)
    dsu.add(k1)
    dsu.add(k2)
    dsu.union(k1, k2)
  }

  const rootMembers = new Map()
  for (const p of pads) {
    const r = dsu.find(p.key)
    if (!rootMembers.has(r)) rootMembers.set(r, [])
    rootMembers.get(r).push(p)
  }
  for (const trace of doc.traces ?? []) {
    if (!trace.points || trace.points.length === 0) continue
    const tk = nodeKey(trace.points[0].col, trace.points[0].row)
    const r = dsu.find(tk)
    if (!rootMembers.has(r)) rootMembers.set(r, [])
  }

  const rootIds = [...rootMembers.keys()].sort()
  const netIdByRoot = new Map()
  const netName = new Map()
  const netColor = new Map()
  const netPadCount = new Map()
  const colorByName = new Map()
  let nextColorIdx = 0
  let autoIdx = 1
  rootIds.forEach((root, idx) => {
    const id = idx
    netIdByRoot.set(root, id)
    const members = rootMembers.get(root).slice().sort(
      (a, b) => a.col - b.col || a.row - b.row,
    )
    netPadCount.set(id, members.length)
    const labeled = members.find(p => p.label && p.label.trim())
    const name = labeled ? labeled.label.trim() : `N${autoIdx++}`
    netName.set(id, name)
    if (!colorByName.has(name)) {
      colorByName.set(name, NET_COLORS[nextColorIdx % NET_COLORS.length])
      nextColorIdx++
    }
    netColor.set(id, colorByName.get(name))
  })

  const padNetId = new Map()
  for (const p of pads) padNetId.set(p.key, netIdByRoot.get(dsu.find(p.key)))

  const traceNetId = new Map()
  for (const trace of doc.traces ?? []) {
    if (!trace.points || trace.points.length === 0) continue
    const tk = nodeKey(trace.points[0].col, trace.points[0].row)
    traceNetId.set(trace.id, netIdByRoot.get(dsu.find(tk)))
  }

  const netPadKeys = new Map()
  for (const [key, id] of padNetId) {
    if (!netPadKeys.has(id)) netPadKeys.set(id, new Set())
    netPadKeys.get(id).add(key)
  }
  const netTraceIds = new Map()
  for (const [traceId, id] of traceNetId) {
    if (!netTraceIds.has(id)) netTraceIds.set(id, new Set())
    netTraceIds.get(id).add(traceId)
  }

  for (const k of jointSet) {
    if (!padNetId.has(k)) padNetId.set(k, netIdByRoot.get(dsu.find(k)))
  }

  return {
    pads,
    padNetId,
    traceNetId,
    netName,
    netColor,
    netPadCount,
    netPadKeys,
    netTraceIds,
    unconnectedColor: UNCONNECTED_COLOR,
    netCount: rootIds.length,
  }
}

export function traceColor(nets, traceId) {
  const id = nets.traceNetId.get(traceId)
  if (id == null) return nets.unconnectedColor
  if ((nets.netPadCount.get(id) ?? 0) === 0) return nets.unconnectedColor
  return nets.netColor.get(id) ?? nets.unconnectedColor
}

export function padNetIdAt(nets, col, row) {
  return nets.padNetId.get(`${col},${row}`)
}

const SELECTED_FILL = '#fbbf24'
const PAD_DEFAULT_FILL = '#d4a534'

export function padFillFor(nets, col, row, isSelected, hasLabel, defaultFill = PAD_DEFAULT_FILL) {
  if (isSelected) return SELECTED_FILL
  const netId = nets.padNetId.get(`${col},${row}`)
  if (netId == null) return defaultFill
  const netSize =
    (nets.netPadKeys.get(netId)?.size ?? 0) +
    (nets.netTraceIds.get(netId)?.size ?? 0)
  const showNet = netSize > 1 || (!!hasLabel && String(hasLabel).trim().length > 0)
  if (!showNet) return defaultFill
  return nets.netColor.get(netId) ?? defaultFill
}
