<script>
  let {
    open = $bindable(false),
    onApply = null,
    pickSettings = () => ({}),
  } = $props()

  const STORAGE_KEY = 'perfboard-print-presets'

  const BOARD_SIZE_PRESETS = [
    { name: 'Micro 5x7', detail: '5 cols × 7 rows', s: { cols: 5, rows: 7, shape: 'rect' } },
    { name: 'Mini 7x9', detail: '7 cols × 9 rows', s: { cols: 7, rows: 9, shape: 'rect' } },
    { name: 'Standard 10x8', detail: '10 cols × 8 rows', s: { cols: 10, rows: 8, shape: 'rect' } },
    { name: 'Wide 12x10', detail: '12 cols × 10 rows', s: { cols: 12, rows: 10, shape: 'rect' } },
    { name: 'Large 16x12', detail: '16 cols × 12 rows', s: { cols: 16, rows: 12, shape: 'rect' } },
    { name: 'XL 20x16', detail: '20 cols × 16 rows', s: { cols: 20, rows: 16, shape: 'rect' } },
    { name: 'Circular ⌀10', detail: '10 × 10 · round', s: { cols: 10, rows: 10, shape: 'circle' } },
    { name: 'Circular ⌀16', detail: '16 × 16 · round', s: { cols: 16, rows: 16, shape: 'circle' } },
  ]

  const PRINT_PRESETS = [
    {
      name: '3D Print', detail: 'Pad 2.0 · Drill 1.0 · Trace 2.0 · 0.8mm',
      s: {
        padDiameter: 2.0, drillDiameter: 1.0, traceWidth: 2.0, boardThickness: 0.8,
        zScale: 37, boardZScale: 1,
        curveEndWidth: 2.0, curveEndWidth2: 2.0, curveTaperDistance: 3.5,
        roundTraceRadius: 1.0, roundTraceMode: 'arc', roundTracePasses: 2,
        roundTraceTeardrop: false, roundTraceTdHPercent: 50, roundTraceTdVPercent: 90,
        pinHousingHeight: 2.5, pinHousingBoreWidth: 0.8, pinHousingBoreOffset: 0,
        pinHousingWidth: 2.6, pinHousingDepth: 2.14, pinHousingFaceOffset: 0
      }
    },
    {
      name: 'Standard', detail: 'Pad 2.0 · Drill 1.0 · Trace 1.0 · 1.6mm',
      s: {
        padDiameter: 2.0, drillDiameter: 1.0, traceWidth: 1.0, boardThickness: 1.6,
        zScale: 8, boardZScale: 1,
        curveEndWidth: 3.0, curveEndWidth2: 3.0, curveTaperDistance: 0,
        roundTraceRadius: 1.0, roundTraceMode: 'arc', roundTracePasses: 2,
        roundTraceTeardrop: false, roundTraceTdHPercent: 50, roundTraceTdVPercent: 90,
        pinHousingHeight: 2.5, pinHousingBoreWidth: 0.8, pinHousingBoreOffset: 0,
        pinHousingWidth: 2.14, pinHousingDepth: 2.14, pinHousingFaceOffset: 0
      }
    },
    {
      name: 'Fine Pitch', detail: 'Pad 1.2 · Drill 0.6 · Trace 0.6 · 1.6mm',
      s: {
        padDiameter: 1.2, drillDiameter: 0.6, traceWidth: 0.6, boardThickness: 1.6,
        zScale: 10, boardZScale: 1,
        curveEndWidth: 2.0, curveEndWidth2: 2.0, curveTaperDistance: 0,
        roundTraceRadius: 0.8, roundTraceMode: 'arc', roundTracePasses: 2,
        roundTraceTeardrop: false, roundTraceTdHPercent: 50, roundTraceTdVPercent: 90,
        pinHousingHeight: 2.5, pinHousingBoreWidth: 0.6, pinHousingBoreOffset: 0,
        pinHousingWidth: 1.8, pinHousingDepth: 1.8, pinHousingFaceOffset: 0
      }
    },
    {
      name: 'Heavy Duty', detail: 'Pad 2.5 · Drill 1.2 · Trace 1.5 · 2.0mm',
      s: {
        padDiameter: 2.5, drillDiameter: 1.2, traceWidth: 1.5, boardThickness: 2.0,
        zScale: 6, boardZScale: 1.5,
        curveEndWidth: 4.0, curveEndWidth2: 4.0, curveTaperDistance: 0,
        roundTraceRadius: 1.5, roundTraceMode: 'arc', roundTracePasses: 2,
        roundTraceTeardrop: false, roundTraceTdHPercent: 50, roundTraceTdVPercent: 90,
        pinHousingHeight: 3.0, pinHousingBoreWidth: 1.0, pinHousingBoreOffset: 0,
        pinHousingWidth: 2.5, pinHousingDepth: 2.5, pinHousingFaceOffset: 0
      }
    },
  ]

  let userPresets = $state([])
  let tab = $state('size')
  let selectedName = $state('')
  let newName = $state('')
  let importEl

  const allSize = $derived(BOARD_SIZE_PRESETS)
  const allPrint = $derived([...PRINT_PRESETS, ...userPresets])

  const selectedPreset = $derived(
    tab === 'size'
      ? allSize.find(p => p.name === selectedName) || null
      : allPrint.find(p => p.name === selectedName) || null
  )

  function isUserPreset(name) {
    return userPresets.some(p => p.name === name)
  }

  function load() {
    try { userPresets = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') }
    catch { userPresets = [] }
    selectedName = ''
    newName = ''
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userPresets))
  }

  function handleApply() {
    if (!selectedPreset) return
    if (tab === 'size') {
      onApply?.({ type: 'size', cols: selectedPreset.s.cols, rows: selectedPreset.s.rows, shape: selectedPreset.s.shape })
    } else {
      onApply?.({ type: 'print', ...selectedPreset.s })
    }
    open = false
  }

  function handleSave() {
    const name = newName.trim()
    if (!name || PRINT_PRESETS.some(p => p.name === name)) return
    const existing = userPresets.findIndex(p => p.name === name)
    const s = pickSettings()
    const entry = {
      name, detail: `Pad ${s.padDiameter} · Drill ${s.drillDiameter} · Trace ${s.traceWidth} · ${s.boardThickness}mm`,
      s: {
        padDiameter: s.padDiameter, drillDiameter: s.drillDiameter,
        traceWidth: s.traceWidth, boardThickness: s.boardThickness,
        zScale: s.zScale, boardZScale: s.boardZScale,
        curveEndWidth: s.curveEndWidth, curveEndWidth2: s.curveEndWidth2,
        curveTaperDistance: s.curveTaperDistance,
        roundTraceRadius: s.roundTraceRadius, roundTraceMode: s.roundTraceMode,
        roundTracePasses: s.roundTracePasses, roundTraceTeardrop: s.roundTraceTeardrop,
        roundTraceTdHPercent: s.roundTraceTdHPercent, roundTraceTdVPercent: s.roundTraceTdVPercent,
        pinHousingHeight: s.pinHousingHeight, pinHousingBoreWidth: s.pinHousingBoreWidth,
        pinHousingBoreOffset: s.pinHousingBoreOffset, pinHousingWidth: s.pinHousingWidth,
        pinHousingDepth: s.pinHousingDepth, pinHousingFaceOffset: s.pinHousingFaceOffset
      }
    }
    if (existing >= 0) userPresets[existing] = entry
    else userPresets.push(entry)
    userPresets = [...userPresets]
    selectedName = name
    newName = ''
    save()
  }

  function handleDelete(name) {
    userPresets = userPresets.filter(p => p.name !== name)
    if (selectedName === name) selectedName = ''
    save()
  }

  function exportJSON() {
    const data = JSON.stringify(userPresets, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'perfboard-print-presets.json'
    a.click(); URL.revokeObjectURL(url)
  }

  function importJSON(e) {
    const file = e.target.files[0]
    if (!file) return
    file.text().then(text => {
      try {
        const imported = JSON.parse(text)
        if (!Array.isArray(imported)) return
        for (const p of imported) {
          if (!p.name || !p.s) continue
          const idx = userPresets.findIndex(x => x.name === p.name)
          if (idx >= 0) userPresets[idx] = p
          else userPresets.push(p)
        }
        userPresets = [...userPresets]
        save()
      } catch { /* skip */ }
    })
    e.target.value = ''
  }

  let detailData = $derived(selectedPreset ? (() => {
    if (tab === 'size') {
      return [
        { group: 'Board Size', items: [
          { label: 'Cols', value: selectedPreset.s.cols },
          { label: 'Rows', value: selectedPreset.s.rows },
          { label: 'Shape', value: selectedPreset.s.shape }
        ]}
      ]
    }
    const s = selectedPreset.s
    return [
      { group: 'Dimensions', items: [
        { label: 'Pad', value: `${s.padDiameter}mm` },
        { label: 'Drill', value: `${s.drillDiameter}mm` },
        { label: 'Trace', value: `${s.traceWidth}mm` },
        { label: 'Board', value: `${s.boardThickness}mm` },
        { label: 'Cu Z', value: `${s.zScale}x` },
        { label: 'Brd Z', value: `${s.boardZScale}x` }
      ]},
      { group: 'Curve', items: [
        { label: 'Start W', value: `${s.curveEndWidth}mm` },
        { label: 'End W', value: `${s.curveEndWidth2}mm` },
        { label: 'Taper', value: `${s.curveTaperDistance}mm` }
      ]},
      { group: 'Round', items: [
        { label: 'Radius', value: `${s.roundTraceRadius}mm` },
        { label: 'Mode', value: s.roundTraceMode },
        { label: 'Passes', value: s.roundTracePasses },
        { label: 'Teardrop', value: s.roundTraceTeardrop ? 'Yes' : 'No' }
      ]},
      { group: 'Pin Housing', items: [
        { label: 'Width', value: `${s.pinHousingWidth}mm` },
        { label: 'Depth', value: `${s.pinHousingDepth}mm` },
        { label: 'Height', value: `${s.pinHousingHeight}mm` },
        { label: 'Bore', value: `${s.pinHousingBoreWidth}mm` }
      ]}
    ]
  })() : [])

  $effect(() => { if (open) load() })
</script>

{#if open}
<div class="fixed inset-0 z-50 flex items-center justify-center" onkeydown={(e) => e.key === 'Escape' && (open = false)}>
  <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => open = false} role="presentation"></div>

  <div class="relative bg-[#111120] border border-[#2a2a48] rounded-lg shadow-2xl w-[680px] max-h-[75vh] flex flex-col">
    <div class="flex items-center justify-between px-5 py-3 border-b border-[#2a2a48] shrink-0">
      <div class="flex items-center gap-2.5">
        <svg class="w-4 h-4 text-accent" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
        </svg>
        <span class="text-sm font-semibold text-slate-100">Board Presets</span>
      </div>
      <button onclick={() => open = false} class="text-slate-500 hover:text-slate-300 transition-colors" title="Close">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="flex flex-1 min-h-0">
      <div class="w-[220px] shrink-0 border-r border-[#2a2a48] flex flex-col">
        <div class="flex border-b border-[#2a2a48]">
          <button onclick={() => { tab = 'size'; selectedName = '' }}
            class="flex-1 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors
              {tab === 'size' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-slate-500 hover:text-slate-300'}">
            Size
          </button>
          <button onclick={() => { tab = 'print'; selectedName = '' }}
            class="flex-1 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors
              {tab === 'print' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-slate-500 hover:text-slate-300'}">
            Print
          </button>
        </div>
        <div class="flex-1 overflow-y-auto p-2">
          {#if tab === 'size'}
            {#each allSize as preset (preset.name)}
              <button
                onclick={() => selectedName = preset.name}
                class="w-full text-left px-2.5 py-2 rounded transition-colors
                  {preset.name === selectedName
                    ? 'bg-accent/15 border border-accent/30'
                    : 'border border-transparent hover:bg-[#1a1a30]'}"
              >
                <div class="flex items-center gap-2">
                  <span class="w-1.5 h-1.5 rounded-full shrink-0 bg-accent"></span>
                  <div class="min-w-0">
                    <div class="text-xs text-slate-200 truncate">{preset.name}</div>
                    <div class="text-[10px] text-slate-600 truncate">{preset.detail}</div>
                  </div>
                </div>
              </button>
            {/each}
          {:else}
            {#each PRINT_PRESETS as preset (preset.name)}
              <button
                onclick={() => selectedName = preset.name}
                class="w-full text-left px-2.5 py-2 rounded transition-colors
                  {preset.name === selectedName
                    ? 'bg-cyan/15 border border-cyan/30'
                    : 'border border-transparent hover:bg-[#1a1a30]'}"
              >
                <div class="flex items-center gap-2">
                  <span class="w-1.5 h-1.5 rounded-full shrink-0 bg-cyan"></span>
                  <div class="min-w-0">
                    <div class="text-xs text-slate-200 truncate">{preset.name}</div>
                    <div class="text-[10px] text-slate-600 truncate">{preset.detail}</div>
                  </div>
                </div>
              </button>
            {/each}
            {#if userPresets.length > 0}
              <div class="border-t border-[#2a2a48] pt-2 mt-1">
                <div class="text-[9px] uppercase tracking-wider text-slate-600 font-semibold px-2.5 py-1">Custom</div>
                {#each userPresets as preset (preset.name)}
                  <button
                    onclick={() => selectedName = preset.name}
                    class="w-full text-left px-2.5 py-2 rounded transition-colors
                      {preset.name === selectedName
                        ? 'bg-cyan/15 border border-cyan/30'
                        : 'border border-transparent hover:bg-[#1a1a30]'}"
                  >
                    <div class="flex items-center gap-2">
                      <span class="w-1.5 h-1.5 rounded-full shrink-0 bg-cyan"></span>
                      <div class="min-w-0">
                        <div class="text-xs text-slate-200 truncate">{preset.name}</div>
                        <div class="text-[10px] text-slate-600 truncate">{preset.detail}</div>
                      </div>
                    </div>
                  </button>
                {/each}
              </div>
            {/if}
          {/if}
        </div>
      </div>

      <div class="flex-1 flex flex-col">
        {#if selectedPreset}
          <div class="flex-1 overflow-y-auto p-4 space-y-3">
            {#each detailData as group}
              <div>
                <div class="text-[10px] uppercase tracking-wider text-slate-600 font-semibold mb-1.5">{group.group}</div>
                <div class="grid grid-cols-2 gap-x-3 gap-y-1">
                  {#each group.items as item}
                    <div class="flex justify-between text-xs">
                      <span class="text-slate-500">{item.label}</span>
                      <span class="text-cyan-light font-mono">{item.value}</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="flex-1 flex items-center justify-center">
            <p class="text-xs text-slate-600">Select a preset to view details</p>
          </div>
        {/if}

        {#if tab === 'print'}
          <div class="p-3 border-t border-[#2a2a48]">
            <div class="flex gap-1.5">
              <input type="text" bind:value={newName} placeholder="Save current as..."
                onkeydown={(e) => e.key === 'Enter' && handleSave()}
                class="flex-1 w-0 min-w-0 bg-[#0d0d1a] text-xs text-slate-300 rounded px-2.5 py-1.5 border border-[#2a2a48]
                  placeholder:text-slate-600 focus:outline-none focus:border-accent/50" />
              <button onclick={handleSave} disabled={!newName.trim()}
class="px-3 py-1.5 text-xs font-medium rounded bg-accent hover:bg-accent-light text-[var(--text-on-accent)]
                  disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Save</button>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <div class="flex items-center justify-between px-4 py-2.5 border-t border-[#2a2a48] bg-[#0d0d1a] shrink-0">
      <div class="flex items-center gap-2">
        <button onclick={handleApply} disabled={!selectedPreset}
          class="px-3 py-1.5 text-xs font-medium rounded bg-accent hover:bg-accent-light text-[var(--text-on-accent)]
            disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Load</button>
        {#if tab === 'print' && selectedPreset && isUserPreset(selectedPreset.name)}
          <button onclick={() => handleDelete(selectedPreset.name)}
            class="px-3 py-1.5 text-xs font-medium rounded border border-red-500/40 text-red-400
              hover:bg-red-500/10 transition-colors">Delete</button>
        {/if}
      </div>
      {#if tab === 'print'}
        <div class="flex items-center gap-2">
          <button onclick={() => importEl.click()}
            class="px-2.5 py-1.5 text-[10px] font-medium rounded border border-[#2a2a48] text-slate-400
              hover:text-slate-200 hover:border-[#3a3a58] transition-colors">Import</button>
          <button onclick={exportJSON} disabled={!userPresets.length}
            class="px-2.5 py-1.5 text-[10px] font-medium rounded border border-[#2a2a48] text-slate-400
              hover:text-slate-200 hover:border-[#3a3a58] transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed">Export</button>
        </div>
        <input bind:this={importEl} type="file" accept=".json" class="hidden" onchange={importJSON} />
      {/if}
    </div>
  </div>
</div>
{/if}
