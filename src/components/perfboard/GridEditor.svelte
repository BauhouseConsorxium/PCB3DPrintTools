<script>
  import { onMount, tick } from 'svelte'

  let {
    doc,
    activeTool = 'select',
    selectedIds = [],
    onAddPad = () => {},
    onAddHeader = () => {},
    onAddDip = () => {},
    onAddTrace = () => {},
    onAddJumper = () => {},
    onAddAnnotation = () => {},
    onUpdateAnnotation = () => {},
    onUpdateJumperColor = () => {},
    onMoveSelected = () => {},
    onRemoveElement = () => {},
    onSelect = () => {},
    onBulkSelect = () => {},
    onToolChange = () => {},
  } = $props()

  let svgEl
  let containerEl

  const pitch = $derived(doc.grid.pitch)
  const cols = $derived(doc.grid.cols)
  const rows = $derived(doc.grid.rows)
  const margin = $derived(pitch / 2)
  const boardW = $derived((cols - 1) * pitch + 2 * margin)
  const boardH = $derived((rows - 1) * pitch + 2 * margin)

  let vb = $state({ x: 0, y: 0, w: 100, h: 80 })
  let isPanning = $state(false)
  let panStart = $state({ x: 0, y: 0, vx: 0, vy: 0 })

  // Trace drawing state
  let tracePoints = $state([])
  let tracePreview = $state(null)

  // Header drawing state
  let headerStart = $state(null)
  let headerPreview = $state(null)

  // DIP drawing state
  let dipStart = $state(null)
  let dipPreview = $state(null)

  // Jumper drawing state
  let jumperStart = $state(null)
  let jumperPreview = $state(null)

  // Drag-to-move state
  let dragInfo = $state(null)

  // Rubber band selection
  let selectionBox = $state(null)

  // Inline editing
  let editingAnnotation = $state(null)
  let editingJumper = $state(null)
  let editInput

  const WIRE_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
    '#3b82f6', '#a855f7', '#ec4899', '#f0f0f0', '#a78bfa',
  ]

  // Ghost cursor
  let ghostPos = $state(null)

  $effect(() => {
    const w = boardW
    const h = boardH
    const pad = Math.max(w, h) * 0.15
    vb = { x: -margin - pad, y: -margin - pad, w: w + 2 * pad, h: h + 2 * pad }
  })

  function svgPoint(e) {
    if (!svgEl) return null
    const pt = svgEl.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const ctm = svgEl.getScreenCTM()
    if (!ctm) return null
    const svgP = pt.matrixTransform(ctm.inverse())
    return { x: svgP.x, y: svgP.y }
  }

  function snapToGrid(x, y) {
    const col = Math.round(x / pitch * 2) / 2
    const row = Math.round(y / pitch * 2) / 2
    return {
      col: Math.max(0, Math.min(cols - 1, col)),
      row: Math.max(0, Math.min(rows - 1, row)),
    }
  }

  function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) return Math.hypot(px - ax, py - ay)
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
  }

  function findElementAt(col, row, rawX, rawY) {
    for (const p of doc.pads) {
      if (p.col === col && p.row === row) return p
    }
    for (const h of doc.headers) {
      for (let i = 0; i < h.count; i++) {
        const hc = h.orientation === 'h' ? h.col + i : h.col
        const hr = h.orientation === 'v' ? h.row + i : h.row
        if (hc === col && hr === row) return h
      }
    }
    for (const d of (doc.dips || [])) {
      const spacing = d.rowSpacing ?? 3
      for (let i = 0; i < d.count; i++) {
        if (d.orientation === 'v') {
          if ((d.col === col && d.row + i === row) || (d.col + spacing === col && d.row + i === row)) return d
        } else {
          if ((d.col + i === col && d.row === row) || (d.col + i === col && d.row + spacing === row)) return d
        }
      }
    }
    for (const t of doc.traces) {
      for (const pt of t.points) {
        if (pt.col === col && pt.row === row) return t
      }
    }
    const hitR = pitch * 0.4
    if (rawX != null && rawY != null) {
      for (const j of doc.jumpers) {
        const x1 = j.col1 * pitch, y1 = j.row1 * pitch
        const x2 = j.col2 * pitch, y2 = j.row2 * pitch
        const dx = x2 - x1, dy = y2 - y1
        const dist = Math.hypot(dx, dy) || 1
        const arc = dist * 0.3
        const mx = (x1 + x2) / 2 + (-dy / dist) * arc
        const my = (y1 + y2) / 2 + (dx / dist) * arc
        let hit = false
        const N = 8
        for (let i = 0; i < N && !hit; i++) {
          const t0 = i / N, t1 = (i + 1) / N
          const ax = (1-t0)*(1-t0)*x1 + 2*(1-t0)*t0*mx + t0*t0*x2
          const ay = (1-t0)*(1-t0)*y1 + 2*(1-t0)*t0*my + t0*t0*y2
          const bx = (1-t1)*(1-t1)*x1 + 2*(1-t1)*t1*mx + t1*t1*x2
          const by = (1-t1)*(1-t1)*y1 + 2*(1-t1)*t1*my + t1*t1*y2
          if (distToSegment(rawX, rawY, ax, ay, bx, by) < hitR) hit = true
        }
        if (hit) return j
      }
      for (const t of doc.traces) {
        for (let i = 0; i < t.points.length - 1; i++) {
          const d = distToSegment(rawX, rawY, t.points[i].col * pitch, t.points[i].row * pitch, t.points[i+1].col * pitch, t.points[i+1].row * pitch)
          if (d < hitR) return t
        }
      }
    }
    for (const j of doc.jumpers) {
      if ((j.col1 === col && j.row1 === row) || (j.col2 === col && j.row2 === row)) return j
    }
    for (const a of doc.annotations) {
      if (rawX != null && rawY != null) {
        const ax = a.col * pitch
        const ay = a.row * pitch
        const rx = ax + pitch * 0.2
        const ry = ay - pitch * 0.45
        const rw = a.text.length * pitch * 0.28 + pitch * 0.2
        const rh = pitch * 0.5
        if (rawX >= rx && rawX <= rx + rw && rawY >= ry && rawY <= ry + rh) return a
      } else if (a.col === col && a.row === row) return a
    }
    return null
  }

  function handlePointerDown(e) {
    if (editingJumper) { editingJumper = null }
    if (e.button === 1 || (e.button === 0 && e.shiftKey && activeTool !== 'select')) {
      isPanning = true
      panStart = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y }
      e.preventDefault()
      return
    }

    if (e.button !== 0) return

    const sp = svgPoint(e)
    if (!sp) return
    const { col, row } = snapToGrid(sp.x, sp.y)

    if (activeTool === 'pad') {
      onAddPad(col, row)
    } else if (activeTool === 'header') {
      if (!headerStart) {
        headerStart = { col, row }
      } else {
        const dc = col - headerStart.col
        const dr = row - headerStart.row
        if (dc === 0 && dr === 0) {
          onAddPad(col, row)
          headerStart = null
          headerPreview = null
        } else {
          const orientation = Math.abs(dc) >= Math.abs(dr) ? 'h' : 'v'
          const count = orientation === 'h' ? Math.abs(dc) + 1 : Math.abs(dr) + 1
          const startCol = orientation === 'h' ? Math.min(headerStart.col, col) : headerStart.col
          const startRow = orientation === 'v' ? Math.min(headerStart.row, row) : headerStart.row
          onAddHeader(startCol, startRow, count, orientation)
          headerStart = null
          headerPreview = null
        }
      }
    } else if (activeTool === 'dip') {
      if (!dipStart) {
        dipStart = { col, row }
      } else {
        const dc = col - dipStart.col
        const dr = row - dipStart.row
        if (dc === 0 && dr === 0) {
          dipStart = null
          dipPreview = null
        } else {
          const orientation = Math.abs(dc) >= Math.abs(dr) ? 'h' : 'v'
          const count = orientation === 'h' ? Math.abs(dc) + 1 : Math.abs(dr) + 1
          const startCol = orientation === 'h' ? Math.min(dipStart.col, col) : dipStart.col
          const startRow = orientation === 'v' ? Math.min(dipStart.row, row) : dipStart.row
          if (count >= 2) {
            onAddDip(startCol, startRow, count, orientation)
          }
          dipStart = null
          dipPreview = null
        }
      }
    } else if (activeTool === 'trace') {
      if (tracePoints.length === 0) {
        tracePoints = [{ col, row }]
      } else {
        const last = tracePoints[tracePoints.length - 1]
        if (last.col === col && last.row === row) {
          if (tracePoints.length >= 2) {
            onAddTrace([...tracePoints])
          }
          tracePoints = []
          tracePreview = null
        } else {
          tracePoints = [...tracePoints, { col: col, row: last.row }, { col, row }]
        }
      }
    } else if (activeTool === 'jumper') {
      if (!jumperStart) {
        jumperStart = { col, row }
      } else {
        if (jumperStart.col !== col || jumperStart.row !== row) {
          onAddJumper(jumperStart.col, jumperStart.row, col, row)
        }
        jumperStart = null
        jumperPreview = null
      }
    } else if (activeTool === 'label') {
      onAddAnnotation(col, row)
    } else if (activeTool === 'select') {
      const el = findElementAt(col, row, sp.x, sp.y)
      if (el) {
        if (e.shiftKey) {
          onSelect(el.id, true)
        } else if (selectedIds.includes(el.id)) {
          dragInfo = { startCol: col, startRow: row }
        } else {
          onSelect(el.id, false)
          dragInfo = { startCol: col, startRow: row }
        }
      } else {
        if (!e.shiftKey) onSelect(null, false)
        selectionBox = { x1: sp.x, y1: sp.y, x2: sp.x, y2: sp.y, add: e.shiftKey }
      }
    } else if (activeTool === 'erase') {
      const el = findElementAt(col, row, sp.x, sp.y)
      if (el) onRemoveElement(el.id)
    }
  }

  function handlePointerMove(e) {
    if (isPanning) {
      const scale = vb.w / (containerEl?.clientWidth || 1)
      vb.x = panStart.vx - (e.clientX - panStart.x) * scale
      vb.y = panStart.vy - (e.clientY - panStart.y) * scale
      return
    }

    const sp = svgPoint(e)
    if (!sp) return
    const { col, row } = snapToGrid(sp.x, sp.y)
    ghostPos = { col, row }

    if (selectionBox) {
      selectionBox = { ...selectionBox, x2: sp.x, y2: sp.y }
      return
    }

    if (activeTool === 'trace' && tracePoints.length > 0) {
      const last = tracePoints[tracePoints.length - 1]
      tracePreview = { col1: last.col, row1: last.row, col2: col, row2: row }
    }

    if (activeTool === 'jumper' && jumperStart) {
      jumperPreview = { col, row }
    }

    if (activeTool === 'header' && headerStart) {
      const dc = col - headerStart.col
      const dr = row - headerStart.row
      const orientation = Math.abs(dc) >= Math.abs(dr) ? 'h' : 'v'
      const count = orientation === 'h' ? Math.abs(dc) + 1 : Math.abs(dr) + 1
      const startCol = orientation === 'h' ? Math.min(headerStart.col, col) : headerStart.col
      const startRow = orientation === 'v' ? Math.min(headerStart.row, row) : headerStart.row
      headerPreview = { col: startCol, row: startRow, count, orientation }
    }

    if (activeTool === 'dip' && dipStart) {
      const dc = col - dipStart.col
      const dr = row - dipStart.row
      const orientation = Math.abs(dc) >= Math.abs(dr) ? 'h' : 'v'
      const count = orientation === 'h' ? Math.abs(dc) + 1 : Math.abs(dr) + 1
      const startCol = orientation === 'h' ? Math.min(dipStart.col, col) : dipStart.col
      const startRow = orientation === 'v' ? Math.min(dipStart.row, row) : dipStart.row
      dipPreview = { col: startCol, row: startRow, count, orientation }
    }
  }

  function findElementsInRect(x1, y1, x2, y2) {
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2)
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2)
    const ids = []
    const inRect = (px, py) => px >= minX && px <= maxX && py >= minY && py <= maxY
    for (const p of doc.pads) {
      if (inRect(p.col * pitch, p.row * pitch)) ids.push(p.id)
    }
    for (const h of doc.headers) {
      for (let i = 0; i < h.count; i++) {
        const hc = h.orientation === 'h' ? h.col + i : h.col
        const hr = h.orientation === 'v' ? h.row + i : h.row
        if (inRect(hc * pitch, hr * pitch)) { ids.push(h.id); break }
      }
    }
    for (const d of (doc.dips || [])) {
      const spacing = d.rowSpacing ?? 3
      let found = false
      for (let i = 0; i < d.count && !found; i++) {
        if (d.orientation === 'v') {
          if (inRect(d.col * pitch, (d.row + i) * pitch) || inRect((d.col + spacing) * pitch, (d.row + i) * pitch)) found = true
        } else {
          if (inRect((d.col + i) * pitch, d.row * pitch) || inRect((d.col + i) * pitch, (d.row + spacing) * pitch)) found = true
        }
      }
      if (found) ids.push(d.id)
    }
    for (const t of doc.traces) {
      for (const pt of t.points) {
        if (inRect(pt.col * pitch, pt.row * pitch)) { ids.push(t.id); break }
      }
    }
    for (const j of doc.jumpers) {
      if (inRect(j.col1 * pitch, j.row1 * pitch) || inRect(j.col2 * pitch, j.row2 * pitch)) ids.push(j.id)
    }
    for (const a of doc.annotations) {
      if (inRect(a.col * pitch, a.row * pitch)) ids.push(a.id)
    }
    return ids
  }

  function handlePointerUp(e) {
    if (isPanning) {
      isPanning = false
      return
    }
    if (selectionBox) {
      const ids = findElementsInRect(selectionBox.x1, selectionBox.y1, selectionBox.x2, selectionBox.y2)
      if (ids.length > 0) {
        onBulkSelect(ids, selectionBox.add)
      }
      selectionBox = null
      return
    }
    if (dragInfo) {
      const sp = svgPoint(e)
      if (sp) {
        const { col, row } = snapToGrid(sp.x, sp.y)
        const dc = col - dragInfo.startCol
        const dr = row - dragInfo.startRow
        if (dc !== 0 || dr !== 0) {
          onMoveSelected(dc, dr)
        }
      }
      dragInfo = null
    }
  }

  function handleWheel(e) {
    e.preventDefault()
    const sp = svgPoint(e)
    if (!sp) return

    const factor = e.deltaY > 0 ? 1.1 : 0.9
    const newW = vb.w * factor
    const newH = vb.h * factor
    const minDim = pitch * 3
    const maxDim = boardW * 3
    if (newW < minDim || newW > maxDim) return

    vb.x = sp.x - (sp.x - vb.x) * factor
    vb.y = sp.y - (sp.y - vb.y) * factor
    vb.w = newW
    vb.h = newH
  }

  function handleDblClick(e) {
    if (activeTool === 'trace' && tracePoints.length >= 2) {
      onAddTrace([...tracePoints])
      tracePoints = []
      tracePreview = null
      return
    }
    if (activeTool === 'select') {
      const sp = svgPoint(e)
      if (!sp) return
      const { col, row } = snapToGrid(sp.x, sp.y)
      const el = findElementAt(col, row, sp.x, sp.y)
      if (el && doc.annotations.find(a => a.id === el.id)) {
        const rect = containerEl.getBoundingClientRect()
        editingAnnotation = {
          id: el.id,
          text: el.text,
          color: el.color,
          left: e.clientX - rect.left,
          top: e.clientY - rect.top - 20
        }
        tick().then(() => {
          if (editInput) { editInput.focus(); editInput.select() }
        })
      } else if (el && doc.jumpers.find(j => j.id === el.id)) {
        const rect = containerEl.getBoundingClientRect()
        editingJumper = {
          id: el.id,
          color: el.color ?? '#67e8f9',
          left: e.clientX - rect.left,
          top: e.clientY - rect.top - 20
        }
      }
    }
  }

  function commitEdit() {
    if (!editingAnnotation) return
    onUpdateAnnotation(editingAnnotation.id, editInput?.value ?? '', editingAnnotation.color)
    editingAnnotation = null
  }

  function handleEditKeydown(e) {
    e.stopPropagation()
    if (e.key === 'Enter') commitEdit()
    else if (e.key === 'Escape') editingAnnotation = null
  }

  function cancelDrawing() {
    if (selectionBox) {
      selectionBox = null
      return true
    }
    if (activeTool === 'trace' && tracePoints.length > 0) {
      tracePoints = []
      tracePreview = null
      return true
    }
    if (activeTool === 'header' && headerStart) {
      headerStart = null
      headerPreview = null
      return true
    }
    if (activeTool === 'dip' && dipStart) {
      dipStart = null
      dipPreview = null
      return true
    }
    if (activeTool === 'jumper' && jumperStart) {
      jumperStart = null
      jumperPreview = null
      return true
    }
    if (dragInfo) {
      dragInfo = null
      return true
    }
    return false
  }

  function handleContextMenu(e) {
    e.preventDefault()
    cancelDrawing()
  }

  const toolHotkeys = { '1': 'pad', '2': 'header', '3': 'dip', '4': 'trace', '5': 'jumper', '6': 'label', '7': 'erase' }

  function handleKeydown(e) {
    const isInput = e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA'
    if (isInput) return
    if (e.key === 'Escape') {
      if (editingAnnotation) { editingAnnotation = null; return }
      if (editingJumper) { editingJumper = null; return }
      const cancelled = cancelDrawing()
      if (!cancelled && activeTool !== 'select') {
        onToolChange('select')
      }
      return
    }
    const tool = toolHotkeys[e.key]
    if (tool) onToolChange(tool)
  }

  // Expand header pads for rendering
  function getHeaderPads(header) {
    const pads = []
    for (let i = 0; i < header.count; i++) {
      pads.push({
        col: header.orientation === 'h' ? header.col + i : header.col,
        row: header.orientation === 'v' ? header.row + i : header.row,
      })
    }
    return pads
  }

  function getDipPads(dip) {
    const spacing = dip.rowSpacing ?? 3
    const pads = []
    for (let i = 0; i < dip.count; i++) {
      if (dip.orientation === 'v') {
        pads.push({ col: dip.col, row: dip.row + i, side: 'left' })
        pads.push({ col: dip.col + spacing, row: dip.row + i, side: 'right' })
      } else {
        pads.push({ col: dip.col + i, row: dip.row, side: 'top' })
        pads.push({ col: dip.col + i, row: dip.row + spacing, side: 'bottom' })
      }
    }
    return pads
  }

  // Trace segment rendering
  function getTraceSegments(trace) {
    const segs = []
    for (let i = 0; i < trace.points.length - 1; i++) {
      segs.push({
        x1: trace.points[i].col * pitch,
        y1: trace.points[i].row * pitch,
        x2: trace.points[i + 1].col * pitch,
        y2: trace.points[i + 1].row * pitch,
      })
    }
    return segs
  }

  const padR = $derived(doc.padDiameter / 2)
  const drillR = $derived(doc.drillDiameter / 2)
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  bind:this={containerEl}
  class="w-full h-full bg-slate-950 select-none relative"
  oncontextmenu={handleContextMenu}
>
  <svg
    bind:this={svgEl}
    viewBox="{vb.x} {vb.y} {vb.w} {vb.h}"
    class="w-full h-full"
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onwheel={handleWheel}
    ondblclick={handleDblClick}
  >
    <!-- Board -->
    <rect
      x={-margin} y={-margin}
      width={boardW} height={boardH}
      fill="#1a5c35" rx="0.5"
    />

    <!-- Grid lines -->
    {#each Array(cols) as _, c}
      <line
        x1={c * pitch} y1={-margin}
        x2={c * pitch} y2={(rows - 1) * pitch + margin}
        stroke="rgba(255,255,255,0.06)" stroke-width={pitch * 0.02}
      />
    {/each}
    {#each Array(rows) as _, r}
      <line
        x1={-margin} y1={r * pitch}
        x2={(cols - 1) * pitch + margin} y2={r * pitch}
        stroke="rgba(255,255,255,0.06)" stroke-width={pitch * 0.02}
      />
    {/each}

    <!-- Grid dots (full + half grid) -->
    {#each Array(cols * 2 - 1) as _, ci}
      {#each Array(rows * 2 - 1) as _, ri}
        {@const isFull = ci % 2 === 0 && ri % 2 === 0}
        <circle
          cx={ci * pitch / 2} cy={ri * pitch / 2}
          r={isFull ? pitch * 0.06 : pitch * 0.03}
          fill={isFull ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'}
        />
      {/each}
    {/each}

    <!-- Traces -->
    {#each doc.traces as trace}
      {@const isSelected = selectedIds.includes(trace.id)}
      {#if isSelected}
        {#each getTraceSegments(trace) as seg}
          <line
            x1={seg.x1} y1={seg.y1}
            x2={seg.x2} y2={seg.y2}
            stroke="rgba(255,255,255,0.45)"
            stroke-width={trace.width + pitch * 0.08}
            stroke-linecap="round"
          />
        {/each}
      {/if}
      {#each getTraceSegments(trace) as seg}
        <line
          x1={seg.x1} y1={seg.y1}
          x2={seg.x2} y2={seg.y2}
          stroke={isSelected ? '#fbbf24' : '#f5c842'}
          stroke-width={trace.width}
          stroke-linecap="round"
          opacity={isSelected ? 1 : 0.85}
        />
      {/each}
    {/each}

    <!-- In-progress trace -->
    {#each tracePoints as pt, i}
      {#if i > 0}
        <line
          x1={tracePoints[i-1].col * pitch} y1={tracePoints[i-1].row * pitch}
          x2={pt.col * pitch} y2={pt.row * pitch}
          stroke="#f5c842" stroke-width={doc.traceWidth}
          stroke-linecap="round" opacity="0.6"
        />
      {/if}
    {/each}

    <!-- Trace preview (cursor to last point) -->
    {#if tracePreview && tracePoints.length > 0}
      {@const last = tracePoints[tracePoints.length - 1]}
      <line
        x1={last.col * pitch} y1={last.row * pitch}
        x2={tracePreview.col2 * pitch} y2={last.row * pitch}
        stroke="#f5c842" stroke-width={doc.traceWidth}
        stroke-linecap="round" opacity="0.3" stroke-dasharray="{pitch * 0.15}"
      />
      <line
        x1={tracePreview.col2 * pitch} y1={last.row * pitch}
        x2={tracePreview.col2 * pitch} y2={tracePreview.row2 * pitch}
        stroke="#f5c842" stroke-width={doc.traceWidth}
        stroke-linecap="round" opacity="0.3" stroke-dasharray="{pitch * 0.15}"
      />
    {/if}

    <!-- Header bodies -->
    {#each doc.headers as header}
      {@const isSelected = selectedIds.includes(header.id)}
      {@const hpads = getHeaderPads(header)}
      {#if hpads.length > 1}
        {@const minC = Math.min(...hpads.map(p => p.col))}
        {@const maxC = Math.max(...hpads.map(p => p.col))}
        {@const minR = Math.min(...hpads.map(p => p.row))}
        {@const maxR = Math.max(...hpads.map(p => p.row))}
        <rect
          x={minC * pitch - padR - 0.2}
          y={minR * pitch - padR - 0.2}
          width={(maxC - minC) * pitch + 2 * padR + 0.4}
          height={(maxR - minR) * pitch + 2 * padR + 0.4}
          fill="none"
          stroke={isSelected ? '#fbbf24' : 'rgba(255,255,255,0.2)'}
          stroke-width="0.15"
          rx="0.3"
        />
      {/if}
      {#each hpads as hp}
        {#if isSelected}
          <circle cx={hp.col * pitch} cy={hp.row * pitch} r={padR + pitch * 0.04} fill="rgba(255,255,255,0.45)" />
        {/if}
        <circle cx={hp.col * pitch} cy={hp.row * pitch} r={padR} fill={isSelected ? '#fbbf24' : '#d4a534'} />
        <circle cx={hp.col * pitch} cy={hp.row * pitch} r={drillR} fill="#1a1a2e" />
      {/each}
    {/each}

    <!-- Header preview -->
    {#if headerPreview}
      {#each Array(headerPreview.count) as _, i}
        {@const c = headerPreview.orientation === 'h' ? headerPreview.col + i : headerPreview.col}
        {@const r = headerPreview.orientation === 'v' ? headerPreview.row + i : headerPreview.row}
        <circle cx={c * pitch} cy={r * pitch} r={padR} fill="#d4a534" opacity="0.4" />
        <circle cx={c * pitch} cy={r * pitch} r={drillR} fill="#1a1a2e" opacity="0.4" />
      {/each}
      {@const midC = headerPreview.orientation === 'h' ? (headerPreview.col + (headerPreview.count - 1) / 2) : headerPreview.col}
      {@const midR = headerPreview.orientation === 'v' ? (headerPreview.row + (headerPreview.count - 1) / 2) : headerPreview.row}
      <text
        x={midC * pitch} y={midR * pitch - padR - pitch * 0.15}
        text-anchor="middle" dominant-baseline="auto"
        fill="rgba(255,255,255,0.7)" font-size={pitch * 0.55} font-weight="bold"
      >{headerPreview.count}</text>
    {/if}

    <!-- DIP bodies -->
    {#each (doc.dips || []) as dip}
      {@const isSelected = selectedIds.includes(dip.id)}
      {@const dpads = getDipPads(dip)}
      {@const spacing = dip.rowSpacing ?? 3}
      {@const bodyX = dip.orientation === 'v' ? dip.col * pitch + pitch * 0.3 : dip.col * pitch - padR - 0.2}
      {@const bodyY = dip.orientation === 'v' ? dip.row * pitch - padR - 0.2 : dip.row * pitch + pitch * 0.3}
      {@const bodyW = dip.orientation === 'v' ? (spacing * pitch - pitch * 0.6) : ((dip.count - 1) * pitch + 2 * padR + 0.4)}
      {@const bodyH = dip.orientation === 'v' ? ((dip.count - 1) * pitch + 2 * padR + 0.4) : (spacing * pitch - pitch * 0.6)}
      <rect
        x={bodyX} y={bodyY}
        width={bodyW} height={bodyH}
        fill={isSelected ? 'rgba(251,191,36,0.15)' : 'rgba(40,40,60,0.8)'}
        stroke={isSelected ? '#fbbf24' : 'rgba(255,255,255,0.25)'}
        stroke-width="0.15"
        rx="0.3"
      />
      {#if dip.orientation === 'v'}
        <path
          d="M{dip.col * pitch + spacing * pitch / 2 - pitch * 0.2},{bodyY} A{pitch * 0.2},{pitch * 0.2} 0 0 1 {dip.col * pitch + spacing * pitch / 2 + pitch * 0.2},{bodyY}"
          fill="none" stroke={isSelected ? '#fbbf24' : 'rgba(255,255,255,0.35)'} stroke-width="0.12"
        />
      {:else}
        <path
          d="M{bodyX},{dip.row * pitch + spacing * pitch / 2 - pitch * 0.2} A{pitch * 0.2},{pitch * 0.2} 0 0 0 {bodyX},{dip.row * pitch + spacing * pitch / 2 + pitch * 0.2}"
          fill="none" stroke={isSelected ? '#fbbf24' : 'rgba(255,255,255,0.35)'} stroke-width="0.12"
        />
      {/if}
      {#each dpads as dp}
        {#if isSelected}
          <circle cx={dp.col * pitch} cy={dp.row * pitch} r={padR + pitch * 0.04} fill="rgba(255,255,255,0.45)" />
        {/if}
        <circle cx={dp.col * pitch} cy={dp.row * pitch} r={padR} fill={isSelected ? '#fbbf24' : '#d4a534'} />
        <circle cx={dp.col * pitch} cy={dp.row * pitch} r={drillR} fill="#1a1a2e" />
      {/each}
    {/each}

    <!-- DIP preview -->
    {#if dipPreview && dipPreview.count >= 2}
      {@const spacing = 3}
      {@const bodyX = dipPreview.orientation === 'v' ? dipPreview.col * pitch + pitch * 0.3 : dipPreview.col * pitch - padR - 0.2}
      {@const bodyY = dipPreview.orientation === 'v' ? dipPreview.row * pitch - padR - 0.2 : dipPreview.row * pitch + pitch * 0.3}
      {@const bodyW = dipPreview.orientation === 'v' ? (spacing * pitch - pitch * 0.6) : ((dipPreview.count - 1) * pitch + 2 * padR + 0.4)}
      {@const bodyH = dipPreview.orientation === 'v' ? ((dipPreview.count - 1) * pitch + 2 * padR + 0.4) : (spacing * pitch - pitch * 0.6)}
      <rect x={bodyX} y={bodyY} width={bodyW} height={bodyH}
        fill="rgba(40,40,60,0.3)" stroke="rgba(255,255,255,0.15)" stroke-width="0.15" rx="0.3" />
      {#each Array(dipPreview.count) as _, i}
        {#if dipPreview.orientation === 'v'}
          <circle cx={dipPreview.col * pitch} cy={(dipPreview.row + i) * pitch} r={padR} fill="#d4a534" opacity="0.4" />
          <circle cx={dipPreview.col * pitch} cy={(dipPreview.row + i) * pitch} r={drillR} fill="#1a1a2e" opacity="0.4" />
          <circle cx={(dipPreview.col + spacing) * pitch} cy={(dipPreview.row + i) * pitch} r={padR} fill="#d4a534" opacity="0.4" />
          <circle cx={(dipPreview.col + spacing) * pitch} cy={(dipPreview.row + i) * pitch} r={drillR} fill="#1a1a2e" opacity="0.4" />
        {:else}
          <circle cx={(dipPreview.col + i) * pitch} cy={dipPreview.row * pitch} r={padR} fill="#d4a534" opacity="0.4" />
          <circle cx={(dipPreview.col + i) * pitch} cy={dipPreview.row * pitch} r={drillR} fill="#1a1a2e" opacity="0.4" />
          <circle cx={(dipPreview.col + i) * pitch} cy={(dipPreview.row + spacing) * pitch} r={padR} fill="#d4a534" opacity="0.4" />
          <circle cx={(dipPreview.col + i) * pitch} cy={(dipPreview.row + spacing) * pitch} r={drillR} fill="#1a1a2e" opacity="0.4" />
        {/if}
      {/each}
      <text
        x={bodyX + bodyW / 2} y={bodyY + bodyH / 2}
        text-anchor="middle" dominant-baseline="central"
        fill="rgba(255,255,255,0.7)" font-size={pitch * 0.7} font-weight="bold"
      >{dipPreview.count * 2}</text>
    {/if}

    <!-- Pads -->
    {#each doc.pads as pad}
      {@const isSelected = selectedIds.includes(pad.id)}
      {#if isSelected}
        <circle cx={pad.col * pitch} cy={pad.row * pitch} r={padR + pitch * 0.04} fill="rgba(255,255,255,0.45)" />
      {/if}
      <circle
        cx={pad.col * pitch} cy={pad.row * pitch}
        r={padR}
        fill={isSelected ? '#fbbf24' : '#d4a534'}
      />
      <circle
        cx={pad.col * pitch} cy={pad.row * pitch}
        r={drillR}
        fill="#1a1a2e"
      />
    {/each}

    <!-- Annotations -->
    {#each doc.annotations as ann}
      {@const isSelected = selectedIds.includes(ann.id)}
      {@const ax = ann.col * pitch}
      {@const ay = ann.row * pitch}
      <rect
        x={ax + pitch * 0.2}
        y={ay - pitch * 0.45}
        width={ann.text.length * pitch * 0.28 + pitch * 0.2}
        height={pitch * 0.5}
        rx={pitch * 0.08}
        fill="rgba(0,0,0,0.6)"
        stroke={isSelected ? '#fbbf24' : 'none'}
        stroke-width={pitch * 0.04}
      />
      <text
        x={ax + pitch * 0.3}
        y={ay - pitch * 0.1}
        font-size={pitch * 0.35}
        font-family="monospace"
        font-weight="bold"
        fill={ann.color}
      >{ann.text}</text>
    {/each}

    <!-- Ghost cursor -->
    {#if ghostPos && (activeTool === 'pad' || activeTool === 'header' || (activeTool === 'dip' && !dipStart))}
      <circle
        cx={ghostPos.col * pitch} cy={ghostPos.row * pitch}
        r={padR}
        fill="#d4a534" opacity="0.25"
      />
    {/if}
    {#if ghostPos && activeTool === 'jumper' && !jumperStart}
      <circle
        cx={ghostPos.col * pitch} cy={ghostPos.row * pitch}
        r={pitch * 0.12}
        fill="#67e8f9" opacity="0.3"
      />
    {/if}
    {#if ghostPos && activeTool === 'trace' && tracePoints.length === 0}
      <circle
        cx={ghostPos.col * pitch} cy={ghostPos.row * pitch}
        r={pitch * 0.15}
        fill="#f5c842" opacity="0.3"
      />
    {/if}

    <!-- Jumper wires (topmost layer) -->
    {#each doc.jumpers as jumper}
      {@const isSelected = selectedIds.includes(jumper.id)}
      {@const x1 = jumper.col1 * pitch}
      {@const y1 = jumper.row1 * pitch}
      {@const x2 = jumper.col2 * pitch}
      {@const y2 = jumper.row2 * pitch}
      {@const dx = x2 - x1}
      {@const dy = y2 - y1}
      {@const dist = Math.hypot(dx, dy)}
      {@const arc = dist * 0.3}
      {@const mx = (x1 + x2) / 2}
      {@const my = (y1 + y2) / 2}
      {@const nx = -dy / (dist || 1)}
      {@const ny = dx / (dist || 1)}
      {@const jcolor = jumper.color ?? '#67e8f9'}
      {#if isSelected}
        <path
          d="M{x1},{y1} Q{mx + nx * arc},{my + ny * arc} {x2},{y2}"
          stroke="rgba(255,255,255,0.45)"
          stroke-width={pitch * 0.12 + pitch * 0.08}
          stroke-linecap="round"
          fill="none"
        />
        <circle cx={x1} cy={y1} r={pitch * 0.12 + pitch * 0.04} fill="rgba(255,255,255,0.45)" />
        <circle cx={x2} cy={y2} r={pitch * 0.12 + pitch * 0.04} fill="rgba(255,255,255,0.45)" />
      {/if}
      <path
        d="M{x1},{y1} Q{mx + nx * arc},{my + ny * arc} {x2},{y2}"
        stroke={isSelected ? '#fbbf24' : jcolor}
        stroke-width={pitch * 0.12}
        stroke-linecap="round"
        stroke-dasharray="{pitch * 0.15} {pitch * 0.1}"
        fill="none"
        opacity={isSelected ? 1 : 0.8}
      />
      <circle cx={x1} cy={y1} r={pitch * 0.12} fill={isSelected ? '#fbbf24' : jcolor} />
      <circle cx={x2} cy={y2} r={pitch * 0.12} fill={isSelected ? '#fbbf24' : jcolor} />
    {/each}

    <!-- Jumper preview -->
    {#if jumperPreview && jumperStart}
      {@const x1 = jumperStart.col * pitch}
      {@const y1 = jumperStart.row * pitch}
      {@const x2 = jumperPreview.col * pitch}
      {@const y2 = jumperPreview.row * pitch}
      {@const dx = x2 - x1}
      {@const dy = y2 - y1}
      {@const dist = Math.hypot(dx, dy)}
      {@const arc = dist * 0.3}
      {@const mx = (x1 + x2) / 2}
      {@const my = (y1 + y2) / 2}
      {@const nx = -dy / (dist || 1)}
      {@const ny = dx / (dist || 1)}
      <path
        d="M{x1},{y1} Q{mx + nx * arc},{my + ny * arc} {x2},{y2}"
        stroke="#67e8f9"
        stroke-width={pitch * 0.12}
        stroke-linecap="round"
        stroke-dasharray="{pitch * 0.15} {pitch * 0.1}"
        fill="none"
        opacity="0.4"
      />
      <circle cx={x1} cy={y1} r={pitch * 0.12} fill="#67e8f9" opacity="0.4" />
      <circle cx={x2} cy={y2} r={pitch * 0.12} fill="#67e8f9" opacity="0.4" />
    {/if}

    <!-- Selection box -->
    {#if selectionBox}
      {@const sx = Math.min(selectionBox.x1, selectionBox.x2)}
      {@const sy = Math.min(selectionBox.y1, selectionBox.y2)}
      {@const sw = Math.abs(selectionBox.x2 - selectionBox.x1)}
      {@const sh = Math.abs(selectionBox.y2 - selectionBox.y1)}
      <rect x={sx} y={sy} width={sw} height={sh}
        fill="rgba(251, 191, 36, 0.08)" stroke="#fbbf24" stroke-width={pitch * 0.03}
        stroke-dasharray="{pitch * 0.1}"
      />
    {/if}

    <!-- Drag ghost (all selected elements) -->
    {#if dragInfo && ghostPos}
      {@const dc = ghostPos.col - dragInfo.startCol}
      {@const dr = ghostPos.row - dragInfo.startRow}
      {#if dc !== 0 || dr !== 0}
        {#each doc.pads.filter(p => selectedIds.includes(p.id)) as pad}
          <circle cx={(pad.col + dc) * pitch} cy={(pad.row + dr) * pitch} r={padR} fill="#fbbf24" opacity="0.4" />
          <circle cx={(pad.col + dc) * pitch} cy={(pad.row + dr) * pitch} r={drillR} fill="#1a1a2e" opacity="0.4" />
        {/each}
        {#each doc.headers.filter(h => selectedIds.includes(h.id)) as header}
          {#each getHeaderPads(header) as hp}
            <circle cx={(hp.col + dc) * pitch} cy={(hp.row + dr) * pitch} r={padR} fill="#fbbf24" opacity="0.4" />
            <circle cx={(hp.col + dc) * pitch} cy={(hp.row + dr) * pitch} r={drillR} fill="#1a1a2e" opacity="0.4" />
          {/each}
        {/each}
        {#each (doc.dips || []).filter(d => selectedIds.includes(d.id)) as dip}
          {#each getDipPads(dip) as dp}
            <circle cx={(dp.col + dc) * pitch} cy={(dp.row + dr) * pitch} r={padR} fill="#fbbf24" opacity="0.4" />
            <circle cx={(dp.col + dc) * pitch} cy={(dp.row + dr) * pitch} r={drillR} fill="#1a1a2e" opacity="0.4" />
          {/each}
        {/each}
        {#each doc.traces.filter(t => selectedIds.includes(t.id)) as trace}
          {#each getTraceSegments(trace) as seg}
            <line
              x1={seg.x1 + dc * pitch} y1={seg.y1 + dr * pitch}
              x2={seg.x2 + dc * pitch} y2={seg.y2 + dr * pitch}
              stroke="#fbbf24" stroke-width={trace.width}
              stroke-linecap="round" opacity="0.4"
            />
          {/each}
        {/each}
        {#each doc.jumpers.filter(j => selectedIds.includes(j.id)) as jumper}
          {@const jx1 = (jumper.col1 + dc) * pitch}
          {@const jy1 = (jumper.row1 + dr) * pitch}
          {@const jx2 = (jumper.col2 + dc) * pitch}
          {@const jy2 = (jumper.row2 + dr) * pitch}
          {@const jdx = jx2 - jx1}
          {@const jdy = jy2 - jy1}
          {@const jdist = Math.hypot(jdx, jdy)}
          {@const jarc = jdist * 0.3}
          {@const jnx = -jdy / (jdist || 1)}
          {@const jny = jdx / (jdist || 1)}
          <path
            d="M{jx1},{jy1} Q{(jx1+jx2)/2 + jnx*jarc},{(jy1+jy2)/2 + jny*jarc} {jx2},{jy2}"
            stroke="#fbbf24" stroke-width={pitch * 0.12} stroke-linecap="round"
            stroke-dasharray="{pitch * 0.15} {pitch * 0.1}" fill="none" opacity="0.4"
          />
        {/each}
        {#each doc.annotations.filter(a => selectedIds.includes(a.id)) as ann}
          {@const aax = (ann.col + dc) * pitch}
          {@const aay = (ann.row + dr) * pitch}
          <text
            x={aax + pitch * 0.3} y={aay - pitch * 0.1}
            font-size={pitch * 0.35} font-family="monospace" font-weight="bold"
            fill="#fbbf24" opacity="0.5"
          >{ann.text}</text>
        {/each}
      {/if}
    {/if}
  </svg>

  {#if editingAnnotation}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute bg-slate-700 rounded border border-amber-400 z-10 p-1.5 flex flex-col gap-1.5"
      style="left: {editingAnnotation.left}px; top: {editingAnnotation.top}px"
      onfocusout={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) commitEdit() }}
    >
      <input
        bind:this={editInput}
        type="text"
        value={editingAnnotation.text}
        class="bg-slate-800 text-xs text-slate-200 rounded px-2 py-1 border border-slate-600 outline-none w-28"
        onkeydown={handleEditKeydown}
      />
      <div class="flex items-center gap-1">
        {#each ['#ef4444', '#22c55e', '#3b82f6', '#eab308', '#f97316', '#a855f7', '#f0f0f0'] as c}
          <button
            onmousedown={(e) => { e.preventDefault(); editingAnnotation.color = c }}
            class="w-3.5 h-3.5 rounded-full border-2 transition-colors {editingAnnotation.color === c ? 'border-white' : 'border-transparent'}"
            style="background-color: {c}"
          ></button>
        {/each}
      </div>
    </div>
  {/if}

  {#if editingJumper}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute bg-slate-700 rounded border border-amber-400 z-10 p-1.5"
      style="left: {editingJumper.left}px; top: {editingJumper.top}px"
    >
      <div class="flex items-center gap-1">
        {#each WIRE_COLORS as c}
          <button
            onclick={() => { onUpdateJumperColor(editingJumper.id, c); editingJumper.color = c }}
            class="w-3.5 h-3.5 rounded-full border-2 transition-colors {editingJumper.color === c ? 'border-white' : 'border-transparent'}"
            style="background-color: {c}"
          ></button>
        {/each}
      </div>
    </div>
  {/if}
</div>
