<script>
  let { viewer = null, zScale = $bindable(8), boardZScale = $bindable(1), traceMode = $bindable('raise'), traceWidthOffset = $bindable(0), drillDiameterOffset = $bindable(0), bodies = [], filename = '', onpreviewchange = null } = $props()

  function buildFilename(target) {
    const base = filename.replace(/\.[^.]+$/, '') || 'pcb'
    const now = new Date()
    const ts = now.getFullYear().toString()
      + String(now.getMonth() + 1).padStart(2, '0')
      + String(now.getDate()).padStart(2, '0')
      + '-'
      + String(now.getHours()).padStart(2, '0')
      + String(now.getMinutes()).padStart(2, '0')
      + String(now.getSeconds()).padStart(2, '0')
    return `${base}_${target}_3dprint_${ts}.stl`
  }

  let exportTarget = $state('copper')
  let previewing = $state(false)

  // Derive board thickness from the Z extent of non-copper body positions (KiCad Z = thickness)
  const boardThicknessMm = $derived((() => {
    const boardBodies = bodies.filter((b) => isPcbBoard(b.name))
    if (!boardBodies.length) return null
    let minZ = Infinity, maxZ = -Infinity
    for (const body of boardBodies) {
      const pos = body.positions
      for (let i = 2; i < pos.length; i += 3) {
        if (pos[i] < minZ) minZ = pos[i]
        if (pos[i] > maxZ) maxZ = pos[i]
      }
    }
    return maxZ - minZ
  })())

  function isCopper(name) {
    const n = name.toLowerCase()
    return n.includes('copper') || n.includes('.cu') || n.includes('_cu')
  }

  function isPcbBoard(name) {
    const n = name.toLowerCase()
    return !isCopper(name) && (n.includes('_pcb') || n.endsWith('pcb'))
  }

  function isComponent(name) {
    return !isCopper(name) && !isPcbBoard(name)
  }

  const copperBodies = $derived(bodies.filter((b) => isCopper(b.name)))

  function getPreviewFilter() {
    if (exportTarget === 'board') return isPcbBoard
    return (name) => !isComponent(name)
  }

  const targetLabel = $derived(
    exportTarget === 'board' ? 'PCB board only'
    : exportTarget === 'copper' ? 'Copper + Board'
    : 'All bodies'
  )

  function togglePreview() {
    previewing = !previewing
    onpreviewchange?.(previewing ? getPreviewFilter() : null, previewing ? targetLabel : '')
  }

  // Keep preview in sync when export target changes
  $effect(() => {
    const label = targetLabel  // track
    if (previewing) onpreviewchange?.(getPreviewFilter(), label)
  })

  // Turn off preview when panel unmounts or bodies cleared
  $effect(() => {
    if (!bodies.length && previewing) {
      previewing = false
      onpreviewchange?.(null)
    }
  })

  function doExport() {
    if (!viewer) return
    if (traceMode === 'subtract') {
      viewer.exportSTL(name => !isComponent(name), buildFilename('pcb-channel'))
    } else if (exportTarget === 'copper') {
      viewer.exportSTL(name => !isComponent(name), buildFilename('pcb-print'))
    } else if (exportTarget === 'board') {
      viewer.exportSTL(isPcbBoard, buildFilename('pcb-board'))
    } else {
      viewer.exportSTL(name => !isComponent(name), buildFilename('all'))
    }
  }
</script>

{#if bodies.length > 0}
  <div class="p-3">
    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Export</p>

    <!-- Trace mode switcher -->
    <div class="mb-3">
      <p class="text-xs text-slate-400 mb-1">Trace mode</p>
      <div class="flex rounded overflow-hidden border border-[#2a2a48]">
        {#each [
          { val: 'raise',    icon: '▲', label: 'Raise',    desc: 'Traces extruded above board' },
          { val: 'subtract', icon: '▼', label: 'Subtract', desc: 'Traces carved into board' },
        ] as opt}
          <button
            onclick={() => traceMode = opt.val}
            title={opt.desc}
            class="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium
              transition-colors duration-100
              {traceMode === opt.val
                ? opt.val === 'raise'
                  ? 'bg-[#f5c842]/20 text-[#f5c842] border-[#f5c842]/30'
                  : 'bg-[#ff6b35]/20 text-[#ff6b35] border-[#ff6b35]/30'
                : 'bg-transparent text-slate-500 hover:text-slate-300'}"
          >
            <span class="text-[10px]">{opt.icon}</span>
            {opt.label}
          </button>
        {/each}
      </div>
      <p class="text-[10px] text-slate-600 mt-0.5 text-center">
        {traceMode === 'raise' ? 'Copper tape sits on raised ridges' : 'Copper tape pressed into carved channels'}
      </p>
    </div>

    <!-- Z-scale for copper -->
    <div class="mb-3">
      <div class="flex justify-between items-center mb-1">
        <label for="z-scale" class="text-xs text-slate-400">Copper Z-scale</label>
        <div class="flex items-baseline gap-1.5">
          <span class="text-xs text-[#f5c842] font-mono font-semibold">{zScale}×</span>
          <span class="text-xs text-slate-400 font-mono">= {(0.035 * zScale).toFixed(3)} mm</span>
        </div>
      </div>
      <input
        id="z-scale"
        type="range"
        min="1"
        max="143"
        step="1"
        bind:value={zScale}
        class="w-full h-1.5 rounded-full appearance-none cursor-pointer
          bg-[#2a2a48] accent-[#f5c842]"
      />
      <div class="flex justify-between text-[10px] text-slate-600 mt-0.5">
        <span>0.035 mm</span>
        <span>5.005 mm</span>
      </div>
    </div>

    <!-- Board Z-scale -->
    <div class="mb-3">
      <div class="flex justify-between items-center mb-1">
        <label for="board-z-scale" class="text-xs text-slate-400">Board Z-scale</label>
        <div class="flex items-baseline gap-1.5">
          <span class="text-xs text-[#27ae60] font-mono font-semibold">{boardZScale}×</span>
          {#if boardThicknessMm !== null}
            <span class="text-xs text-slate-400 font-mono">= {(boardThicknessMm * boardZScale).toFixed(2)} mm</span>
          {/if}
        </div>
      </div>
      <input
        id="board-z-scale"
        type="range"
        min="0.25"
        max="10"
        step="0.25"
        bind:value={boardZScale}
        class="w-full h-1.5 rounded-full appearance-none cursor-pointer
          bg-[#2a2a48] accent-[#27ae60]"
      />
      <div class="flex justify-between text-[10px] text-slate-600 mt-0.5">
        <span>0.25×</span>
        <span>10×</span>
      </div>
    </div>

    <!-- Trace width offset -->
    <div class="mb-3">
      <div class="flex justify-between items-center mb-1">
        <label for="trace-width-offset" class="text-xs text-slate-400">Trace width offset</label>
        <div class="flex items-baseline gap-1.5">
          <span class="text-xs text-[#b87333] font-mono font-semibold">{traceWidthOffset > 0 ? '+' : ''}{traceWidthOffset.toFixed(2)} mm</span>
          {#if traceWidthOffset !== 0}
            <button
              onclick={() => traceWidthOffset = 0}
              class="text-[10px] text-slate-500 hover:text-slate-300 underline"
            >reset</button>
          {/if}
        </div>
      </div>
      <input
        id="trace-width-offset"
        type="range"
        min="-1"
        max="3"
        step="0.05"
        bind:value={traceWidthOffset}
        class="w-full h-1.5 rounded-full appearance-none cursor-pointer
          bg-[#2a2a48] accent-[#b87333]"
      />
      <div class="flex justify-between text-[10px] text-slate-600 mt-0.5">
        <span>-1.0 mm</span>
        <span>0</span>
        <span>+3.0 mm</span>
      </div>
    </div>

    <!-- Drill diameter offset -->
    <div class="mb-3">
      <div class="flex justify-between items-center mb-1">
        <label for="drill-offset" class="text-xs text-slate-400">Drill diameter offset</label>
        <div class="flex items-baseline gap-1.5">
          <span class="text-xs text-[#6366f1] font-mono font-semibold">{drillDiameterOffset > 0 ? '+' : ''}{drillDiameterOffset.toFixed(2)} mm</span>
          {#if drillDiameterOffset !== 0}
            <button
              onclick={() => drillDiameterOffset = 0}
              class="text-[10px] text-slate-500 hover:text-slate-300 underline"
            >reset</button>
          {/if}
        </div>
      </div>
      <input
        id="drill-offset"
        type="range"
        min="-0.5"
        max="2"
        step="0.05"
        bind:value={drillDiameterOffset}
        class="w-full h-1.5 rounded-full appearance-none cursor-pointer
          bg-[#2a2a48] accent-[#6366f1]"
      />
      <div class="flex justify-between text-[10px] text-slate-600 mt-0.5">
        <span>-0.5 mm</span>
        <span>0</span>
        <span>+2.0 mm</span>
      </div>
    </div>

    <!-- Export target -->
    <div class="mb-3">
      <p class="text-xs text-slate-400 mb-1">Export target</p>
      <div class="flex flex-col gap-1">
        {#each [
          { val: 'copper', label: 'Copper + Board', color: '#b87333' },
          { val: 'board', label: 'PCB board only', color: '#1a6b3a' },
          { val: 'all', label: 'All bodies', color: '#6366f1' },
        ] as opt}
          <label class="flex items-center gap-2 cursor-pointer group">
            <input
              type="radio"
              name="export-target"
              value={opt.val}
              bind:group={exportTarget}
              class="accent-[#b87333]"
            />
            <span class="w-2 h-2 rounded-full" style="background:{opt.color}"></span>
            <span class="text-xs text-slate-300 group-hover:text-slate-100">{opt.label}</span>
          </label>
        {/each}
      </div>
    </div>

    <!-- Preview toggle -->
    <button
      onclick={togglePreview}
      class="w-full py-1.5 px-3 rounded text-xs font-medium mb-2 flex items-center justify-center gap-1.5
        transition-colors duration-100
        {previewing
          ? 'bg-amber-500/20 border border-amber-500/50 text-amber-400 hover:bg-amber-500/30'
          : 'bg-[#1a1a30] border border-[#2a2a48] text-slate-400 hover:text-slate-200 hover:border-[#3a3a58]'}"
    >
      <!-- Eye icon -->
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        {#if previewing}
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        {:else}
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        {/if}
      </svg>
      {previewing ? 'Exit Preview' : 'Preview Export'}
    </button>

    <!-- Export button -->
    <button
      onclick={doExport}
      class="w-full py-2 px-3 rounded text-sm font-semibold
        bg-[#b87333] hover:bg-[#d4974a] active:bg-[#8b5e28]
        text-white transition-colors duration-100
        disabled:opacity-40 disabled:cursor-not-allowed"
      disabled={!viewer}
    >
      Export STL
    </button>

    {#if exportTarget === 'copper' && copperBodies.length === 0}
      <p class="text-xs text-amber-500 mt-1.5 text-center">No copper bodies detected</p>
    {/if}
  </div>
{/if}
