<script>
  import { onMount } from 'svelte'

  let {
    doc,
    activeTool = 'select',
    selectedId = null,
    onAddPad = () => {},
    onAddHeader = () => {},
    onAddTrace = () => {},
    onAddJumper = () => {},
    onMoveElement = () => {},
    onRemoveElement = () => {},
    onSelect = () => {},
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

  // Jumper drawing state
  let jumperStart = $state(null)
  let jumperPreview = $state(null)

  // Drag-to-move state
  let dragInfo = $state(null)

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
    const col = Math.round(x / pitch)
    const row = Math.round(y / pitch)
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
    return null
  }

  function handlePointerDown(e) {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
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
    } else if (activeTool === 'select') {
      const el = findElementAt(col, row, sp.x, sp.y)
      if (el && el.id === selectedId) {
        dragInfo = { id: el.id, startCol: col, startRow: row }
      } else {
        onSelect(el?.id ?? null)
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
  }

  function handlePointerUp(e) {
    if (isPanning) {
      isPanning = false
      return
    }
    if (dragInfo) {
      const sp = svgPoint(e)
      if (sp) {
        const { col, row } = snapToGrid(sp.x, sp.y)
        const dc = col - dragInfo.startCol
        const dr = row - dragInfo.startRow
        if (dc !== 0 || dr !== 0) {
          onMoveElement(dragInfo.id, dc, dr)
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
    }
  }

  function handleContextMenu(e) {
    e.preventDefault()
    if (activeTool === 'trace' && tracePoints.length > 0) {
      tracePoints = []
      tracePreview = null
    }
    if (activeTool === 'header' && headerStart) {
      headerStart = null
      headerPreview = null
    }
    if (activeTool === 'jumper' && jumperStart) {
      jumperStart = null
      jumperPreview = null
    }
    if (dragInfo) {
      dragInfo = null
    }
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

<div
  bind:this={containerEl}
  class="w-full h-full bg-slate-950 select-none"
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

    <!-- Grid dots -->
    {#each Array(cols) as _, c}
      {#each Array(rows) as _, r}
        <circle
          cx={c * pitch} cy={r * pitch}
          r={pitch * 0.06}
          fill="rgba(255,255,255,0.15)"
        />
      {/each}
    {/each}

    <!-- Traces -->
    {#each doc.traces as trace}
      {@const isSelected = trace.id === selectedId}
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
      {@const isSelected = header.id === selectedId}
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
        <circle cx={hp.col * pitch} cy={hp.row * pitch} r={padR} fill="#d4a534" />
        <circle cx={hp.col * pitch} cy={hp.row * pitch} r={drillR} fill="#1a1a2e" />
      {/each}
    {/each}

    <!-- Header preview -->
    {#if headerPreview}
      {@const pads = []}
      {#each Array(headerPreview.count) as _, i}
        {@const c = headerPreview.orientation === 'h' ? headerPreview.col + i : headerPreview.col}
        {@const r = headerPreview.orientation === 'v' ? headerPreview.row + i : headerPreview.row}
        <circle cx={c * pitch} cy={r * pitch} r={padR} fill="#d4a534" opacity="0.4" />
        <circle cx={c * pitch} cy={r * pitch} r={drillR} fill="#1a1a2e" opacity="0.4" />
      {/each}
    {/if}

    <!-- Pads -->
    {#each doc.pads as pad}
      {@const isSelected = pad.id === selectedId}
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

    <!-- Ghost cursor -->
    {#if ghostPos && (activeTool === 'pad' || activeTool === 'header')}
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
      {@const isSelected = jumper.id === selectedId}
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
      <path
        d="M{x1},{y1} Q{mx + nx * arc},{my + ny * arc} {x2},{y2}"
        stroke={isSelected ? '#fbbf24' : '#67e8f9'}
        stroke-width={pitch * 0.12}
        stroke-linecap="round"
        stroke-dasharray="{pitch * 0.15} {pitch * 0.1}"
        fill="none"
        opacity={isSelected ? 1 : 0.8}
      />
      <circle cx={x1} cy={y1} r={pitch * 0.12} fill={isSelected ? '#fbbf24' : '#67e8f9'} />
      <circle cx={x2} cy={y2} r={pitch * 0.12} fill={isSelected ? '#fbbf24' : '#67e8f9'} />
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

    <!-- Drag ghost -->
    {#if dragInfo && ghostPos}
      {@const dc = ghostPos.col - dragInfo.startCol}
      {@const dr = ghostPos.row - dragInfo.startRow}
      {#if dc !== 0 || dr !== 0}
        {#each doc.pads.filter(p => p.id === dragInfo.id) as pad}
          <circle cx={(pad.col + dc) * pitch} cy={(pad.row + dr) * pitch} r={padR} fill="#fbbf24" opacity="0.4" />
          <circle cx={(pad.col + dc) * pitch} cy={(pad.row + dr) * pitch} r={drillR} fill="#1a1a2e" opacity="0.4" />
        {/each}
        {#each doc.headers.filter(h => h.id === dragInfo.id) as header}
          {#each getHeaderPads(header) as hp}
            <circle cx={(hp.col + dc) * pitch} cy={(hp.row + dr) * pitch} r={padR} fill="#fbbf24" opacity="0.4" />
            <circle cx={(hp.col + dc) * pitch} cy={(hp.row + dr) * pitch} r={drillR} fill="#1a1a2e" opacity="0.4" />
          {/each}
        {/each}
        {#each doc.traces.filter(t => t.id === dragInfo.id) as trace}
          {#each getTraceSegments(trace) as seg}
            <line
              x1={seg.x1 + dc * pitch} y1={seg.y1 + dr * pitch}
              x2={seg.x2 + dc * pitch} y2={seg.y2 + dr * pitch}
              stroke="#fbbf24" stroke-width={trace.width}
              stroke-linecap="round" opacity="0.4"
            />
          {/each}
        {/each}
        {#each doc.jumpers.filter(j => j.id === dragInfo.id) as jumper}
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
      {/if}
    {/if}
  </svg>
</div>
