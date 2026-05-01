<script>
  let { ondrcchange } = $props()

  let pcbText = $state(null)
  let pcbFilename = $state('')
  let minClearance = $state(0.5)
  let minTraceWidth = $state(0.5)
  let dragOver = $state(false)
  let fileInput = $state(null)

  let results = $derived.by(() => {
    if (!pcbText) return null
    return runDrc(pcbText, minClearance, minTraceWidth)
  })

  $effect(() => {
    if (!results) { ondrcchange?.([]); return }
    ondrcchange?.([
      ...results.widthViolations.map(v => ({ type: 'width', ...v })),
      ...results.clearViolations.map(v => ({ type: 'clearance', ...v })),
    ])
  })

  function parseSegments(text) {
    const segs = []
    let i = 0
    while (i < text.length) {
      const si = text.indexOf('(segment', i)
      if (si === -1) break
      let depth = 0, j = si
      while (j < text.length) {
        if (text[j] === '(') depth++
        else if (text[j] === ')' && --depth === 0) { j++; break }
        j++
      }
      const blk = text.slice(si, j)
      const sM = blk.match(/\(start\s+([\d.-]+)\s+([\d.-]+)\)/)
      const eM = blk.match(/\(end\s+([\d.-]+)\s+([\d.-]+)\)/)
      const wM = blk.match(/\(width\s+([\d.-]+)\)/)
      const lM = blk.match(/\(layer\s+"([^"]+)"\)/)
      const nM = blk.match(/\(net\s+"([^"]+)"\)/)
      if (sM && eM && wM && lM) {
        const layer = lM[1]
        if (layer === 'F.Cu' || layer === 'B.Cu') {
          segs.push({
            x1: +sM[1], y1: +sM[2],
            x2: +eM[1], y2: +eM[2],
            width: +wM[1],
            layer, net: nM?.[1] ?? ''
          })
        }
      }
      i = j
    }
    return segs
  }

  function ptSegDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    if (len2 < 1e-12) return Math.hypot(px - ax, py - ay)
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
  }

  function segSegDist(x1, y1, x2, y2, x3, y3, x4, y4) {
    const d1x = x2 - x1, d1y = y2 - y1
    const d2x = x4 - x3, d2y = y4 - y3
    const cross = d1x * d2y - d1y * d2x
    if (Math.abs(cross) > 1e-10) {
      const t = ((x3 - x1) * d2y - (y3 - y1) * d2x) / cross
      const u = ((x3 - x1) * d1y - (y3 - y1) * d1x) / cross
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0
    }
    return Math.min(
      ptSegDist(x1, y1, x3, y3, x4, y4),
      ptSegDist(x2, y2, x3, y3, x4, y4),
      ptSegDist(x3, y3, x1, y1, x2, y2),
      ptSegDist(x4, y4, x1, y1, x2, y2)
    )
  }

  function runDrc(text, clearance, minWidth) {
    const segs = parseSegments(text)
    const clearViolations = []
    const widthViolations = []

    for (const s of segs) {
      if (s.width < minWidth) {
        widthViolations.push({ net: s.net, layer: s.layer, width: s.width,
          x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 })
      }
    }

    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const a = segs[i], b = segs[j]
        if (a.layer !== b.layer || a.net === b.net) continue
        // Quick bbox reject
        const margin = a.width / 2 + b.width / 2 + clearance
        if (Math.max(a.x1, a.x2) + margin < Math.min(b.x1, b.x2)) continue
        if (Math.max(b.x1, b.x2) + margin < Math.min(a.x1, a.x2)) continue
        if (Math.max(a.y1, a.y2) + margin < Math.min(b.y1, b.y2)) continue
        if (Math.max(b.y1, b.y2) + margin < Math.min(a.y1, a.y2)) continue

        const cd = segSegDist(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2)
        const gap = cd - (a.width / 2 + b.width / 2)

        if (gap < clearance) {
          clearViolations.push({
            netA: a.net, netB: b.net, layer: a.layer,
            gap: Math.max(0, gap),
            segA: { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 },
            segB: { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 },
          })
        }
      }
    }

    return { count: segs.length, clearViolations, widthViolations }
  }

  async function loadFile(file) {
    if (!file?.name.endsWith('.kicad_pcb')) return
    pcbFilename = file.name
    pcbText = await file.text()
  }

  function onDrop(e) {
    e.preventDefault()
    dragOver = false
    loadFile([...e.dataTransfer.files].find(f => f.name.endsWith('.kicad_pcb')))
  }
</script>

<div class="p-3 border-b border-[#2a2a48]">
  <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Tape DRC</p>

  {#if !pcbText}
    <!-- Drop zone -->
    <div
      class="border border-dashed rounded px-3 py-3 text-center cursor-pointer transition-colors select-none
        {dragOver ? 'border-amber-500 bg-amber-500/5' : 'border-[#3a3a5a] bg-[#111120]'}"
      ondragover={e => { e.preventDefault(); dragOver = true }}
      ondragleave={() => dragOver = false}
      ondrop={onDrop}
      onclick={() => fileInput?.click()}
      role="button"
      tabindex="0"
      onkeydown={e => e.key === 'Enter' && fileInput?.click()}
    >
      <p class="text-xs text-slate-500">Drop .kicad_pcb</p>
      <p class="text-[10px] text-slate-600 mt-0.5">or click to browse</p>
    </div>
  {:else}
    <!-- File loaded header -->
    <div class="flex items-center gap-2 mb-3">
      <svg class="w-3 h-3 text-slate-500 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
      </svg>
      <span class="text-xs text-slate-400 truncate flex-1 font-mono" title={pcbFilename}>{pcbFilename}</span>
      <button
        onclick={() => { pcbText = null; pcbFilename = '' }}
        class="text-slate-600 hover:text-slate-300 transition-colors text-xs leading-none"
        title="Clear"
      >✕</button>
    </div>

    <!-- Thresholds -->
    <div class="grid grid-cols-2 gap-x-3 gap-y-2 mb-3">
      <div>
        <label class="text-[10px] text-slate-600 uppercase block mb-1">Min clearance</label>
        <div class="flex items-center gap-1">
          <input
            type="number" min="0" max="10" step="0.1"
            bind:value={minClearance}
            class="w-full bg-[#0d0d1a] border border-[#2a2a48] rounded px-1.5 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-[#4a4a7a]"
          />
          <span class="text-[10px] text-slate-600 shrink-0">mm</span>
        </div>
      </div>
      <div>
        <label class="text-[10px] text-slate-600 uppercase block mb-1">Min width</label>
        <div class="flex items-center gap-1">
          <input
            type="number" min="0" max="10" step="0.1"
            bind:value={minTraceWidth}
            class="w-full bg-[#0d0d1a] border border-[#2a2a48] rounded px-1.5 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-[#4a4a7a]"
          />
          <span class="text-[10px] text-slate-600 shrink-0">mm</span>
        </div>
      </div>
    </div>

    <!-- Results summary -->
    {#if results}
      {@const total = results.clearViolations.length + results.widthViolations.length}
      <div class="flex items-center gap-2 mb-2">
        {#if total === 0}
          <span class="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
          <span class="text-xs text-emerald-400">Pass — {results.count} traces OK</span>
        {:else}
          <span class="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse"></span>
          <span class="text-xs text-red-400">{total} violation{total !== 1 ? 's' : ''} · {results.count} traces</span>
        {/if}
      </div>

      {#if results.clearViolations.length > 0}
        <div class="mb-2">
          <p class="text-[10px] text-slate-600 uppercase mb-1.5">
            Clearance &lt; {minClearance} mm ({results.clearViolations.length})
          </p>
          <div class="space-y-1 max-h-36 overflow-y-auto">
            {#each results.clearViolations as v}
              <div class="bg-red-950/40 border border-red-900/40 rounded px-2 py-1.5">
                <p class="text-[10px] text-red-300 font-mono truncate" title="{v.netA} ↔ {v.netB}">
                  {v.netA} ↔ {v.netB}
                </p>
                <p class="text-[10px] text-slate-500">{v.layer} · gap {v.gap.toFixed(3)} mm</p>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if results.widthViolations.length > 0}
        <div>
          <p class="text-[10px] text-slate-600 uppercase mb-1.5">
            Width &lt; {minTraceWidth} mm ({results.widthViolations.length})
          </p>
          <div class="space-y-1 max-h-36 overflow-y-auto">
            {#each results.widthViolations as v}
              <div class="bg-amber-950/40 border border-amber-900/40 rounded px-2 py-1.5">
                <p class="text-[10px] text-amber-300 font-mono truncate" title={v.net}>
                  {v.net || '(no net)'}
                </p>
                <p class="text-[10px] text-slate-500">{v.layer} · {v.width.toFixed(3)} mm</p>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  {/if}

  <input
    bind:this={fileInput}
    type="file"
    accept=".kicad_pcb"
    class="hidden"
    onchange={e => loadFile(e.target.files[0])}
  />
</div>
