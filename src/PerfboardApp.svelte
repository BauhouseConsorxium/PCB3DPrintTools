<script>
  import { untrack } from 'svelte'
  import Viewer3D from './components/Viewer3D.svelte'
  import Toolbar from './components/perfboard/Toolbar.svelte'
  import BoardSettings from './components/perfboard/BoardSettings.svelte'
  import PerfboardExportPanel from './components/perfboard/PerfboardExportPanel.svelte'
  import GridEditor from './components/perfboard/GridEditor.svelte'
  import { buildPerfboardBodies, createDefaultDocument } from './lib/perfboard-geometry.js'

  let viewer
  let activeTab = $state('editor')
  let activeTool = $state('pad')
  let selectedId = $state(null)
  let zScale = $state(8)
  let boardZScale = $state(1)

  let doc = $state(createDefaultDocument())

  let cols = $derived(doc.grid.cols)
  let rows = $derived(doc.grid.rows)

  const perfboardBodies = $derived(buildPerfboardBodies(doc))
  const bodyVisibility = $derived(
    Object.fromEntries(perfboardBodies.map(b => [b.name, true]))
  )

  function setGridCols(v) { doc.grid.cols = Math.max(2, Math.min(40, Number(v) || 2)) }
  function setGridRows(v) { doc.grid.rows = Math.max(2, Math.min(40, Number(v) || 2)) }

  function addPad(col, row) {
    const exists = doc.pads.find(p => p.col === col && p.row === row)
    if (exists) {
      doc.pads = doc.pads.filter(p => p.id !== exists.id)
      return
    }
    doc.pads = [...doc.pads, { id: crypto.randomUUID(), col, row }]
  }

  function addHeader(col, row, count, orientation) {
    doc.headers = [...doc.headers, { id: crypto.randomUUID(), col, row, count, orientation }]
  }

  function addTrace(points) {
    if (points.length < 2) return
    doc.traces = [...doc.traces, { id: crypto.randomUUID(), points, width: doc.traceWidth }]
  }

  function addJumper(col1, row1, col2, row2) {
    doc.jumpers = [...doc.jumpers, { id: crypto.randomUUID(), col1, row1, col2, row2 }]
  }

  function removeElement(id) {
    doc.pads = doc.pads.filter(p => p.id !== id)
    doc.headers = doc.headers.filter(h => h.id !== id)
    doc.traces = doc.traces.filter(t => t.id !== id)
    doc.jumpers = doc.jumpers.filter(j => j.id !== id)
    if (selectedId === id) selectedId = null
  }

  function selectElement(id) {
    selectedId = id
  }

  function handleExport() {
    if (!viewer) return
    const ts = new Date().toISOString().replace(/[:-]/g, '').slice(0, 15)
    viewer.exportSTL(null, `${doc.name}_perfboard_${ts}.stl`)
  }

  // Save/load
  const STORAGE_KEY = 'perfboard-saves'

  function getSaves() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    } catch { return [] }
  }

  function saveToSlot() {
    const saves = getSaves()
    const entry = { name: doc.name, doc: JSON.parse(JSON.stringify(doc)), savedAt: new Date().toISOString() }
    const idx = saves.findIndex(s => s.name === doc.name)
    if (idx >= 0) saves[idx] = entry
    else saves.unshift(entry)
    if (saves.length > 5) saves.length = 5
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves))
    saveMessage = 'Saved!'
    setTimeout(() => saveMessage = '', 2000)
  }

  function loadFromSlot(entry) {
    entry.doc.jumpers = entry.doc.jumpers ?? []
    doc = entry.doc
    selectedId = null
  }

  function deleteSlot(name) {
    const saves = getSaves().filter(s => s.name !== name)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves))
  }

  function downloadJSON() {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${doc.name}.perfboard.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function uploadJSON(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result)
        if (parsed.version !== 1 || !parsed.grid) { alert('Invalid perfboard file'); return }
        parsed.jumpers = parsed.jumpers ?? []
        doc = parsed
        selectedId = null
      } catch { alert('Failed to parse file') }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  let saveMessage = $state('')
  let showSavePanel = $state(false)
  let savedSlots = $derived(getSaves())

  async function loadExample(name) {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}examples/${name}`)
      const parsed = await res.json()
      if (parsed.version !== 1 || !parsed.grid) { alert('Invalid example file'); return }
      parsed.jumpers = parsed.jumpers ?? []
      doc = parsed
      selectedId = null
    } catch { alert('Failed to load example') }
  }

  function handleKeydown(e) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedId && activeTool === 'select') {
        removeElement(selectedId)
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="h-screen flex flex-col bg-slate-900 text-slate-200 overflow-hidden">
  <!-- Header -->
  <div class="h-11 flex items-center px-4 bg-slate-800 border-b border-slate-700 shrink-0">
    <div class="flex items-center gap-2">
      <svg viewBox="0 0 20 20" class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="2" y="2" width="16" height="16" rx="1" />
        <circle cx="6" cy="6" r="1.5" />
        <circle cx="10" cy="6" r="1.5" />
        <circle cx="14" cy="6" r="1.5" />
        <circle cx="6" cy="10" r="1.5" />
        <circle cx="14" cy="10" r="1.5" />
        <circle cx="6" cy="14" r="1.5" />
        <circle cx="10" cy="14" r="1.5" />
        <circle cx="14" cy="14" r="1.5" />
      </svg>
      <span class="text-sm font-semibold text-slate-200">Perfboard 3D Print Tools</span>
    </div>
    <div class="ml-4 flex items-center gap-2">
      <input
        type="text"
        bind:value={doc.name}
        class="bg-slate-700 text-xs text-slate-300 rounded px-2 py-0.5 border border-slate-600 focus:border-slate-400 outline-none w-32"
        placeholder="Project name"
      />
    </div>
    <div class="ml-auto">
      <a href="index.html" class="text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
        PCB 3D Print Tools &rarr;
      </a>
    </div>
  </div>

  <!-- Main -->
  <div class="flex flex-1 min-h-0">
    <!-- Sidebar -->
    <div class="w-56 bg-slate-800 border-r border-slate-700 overflow-y-auto p-3 shrink-0">
      <BoardSettings
        bind:cols={doc.grid.cols}
        bind:rows={doc.grid.rows}
        bind:padDiameter={doc.padDiameter}
        bind:drillDiameter={doc.drillDiameter}
        bind:traceWidth={doc.traceWidth}
        bind:boardThickness={doc.boardThickness}
      />

      <Toolbar {activeTool} onToolChange={(t) => { activeTool = t; selectedId = null }} />

      <PerfboardExportPanel
        bind:zScale
        bind:boardZScale
        onExport={handleExport}
      />

      <!-- Save/Load -->
      <div class="mb-4">
        <div class="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Project</div>
        <div class="flex gap-1 mb-2">
          <button onclick={saveToSlot}
            class="flex-1 px-2 py-1.5 text-[10px] rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">
            Save
          </button>
          <button onclick={downloadJSON}
            class="flex-1 px-2 py-1.5 text-[10px] rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">
            Download
          </button>
          <label class="flex-1 px-2 py-1.5 text-[10px] rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors text-center cursor-pointer">
            Load
            <input type="file" accept=".json" onchange={uploadJSON} class="hidden" />
          </label>
        </div>
        {#if saveMessage}
          <div class="text-[10px] text-emerald-400 mb-1">{saveMessage}</div>
        {/if}
        <button onclick={() => showSavePanel = !showSavePanel}
          class="text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
          {showSavePanel ? 'Hide saves' : 'Show saves'} ({getSaves().length})
        </button>
        {#if showSavePanel}
          <div class="mt-1 space-y-1">
            {#each getSaves() as save}
              <div class="flex items-center gap-1 text-[10px]">
                <button onclick={() => loadFromSlot(save)}
                  class="flex-1 text-left px-1.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 truncate">
                  {save.name}
                </button>
                <button onclick={() => deleteSlot(save.name)}
                  class="text-slate-500 hover:text-red-400 px-1">&times;</button>
              </div>
            {/each}
            {#if getSaves().length === 0}
              <div class="text-[10px] text-slate-500 italic">No saves yet</div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Examples -->
      <div class="mb-4">
        <div class="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Examples</div>
        <button onclick={() => loadExample('cd4093-noise-gen.perfboard.json')}
          class="w-full text-left px-2 py-1.5 text-[10px] rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">
          CD4093 Noise Generator
        </button>
      </div>

      <!-- Board info -->
      <div class="text-[10px] text-slate-500 space-y-0.5">
        <div>Board: {((doc.grid.cols - 1) * doc.grid.pitch + doc.grid.pitch).toFixed(1)} &times; {((doc.grid.rows - 1) * doc.grid.pitch + doc.grid.pitch).toFixed(1)} mm</div>
        <div>Pads: {doc.pads.length} | Headers: {doc.headers.length} | Traces: {doc.traces.length} | Jumpers: {doc.jumpers.length}</div>
      </div>
    </div>

    <!-- Content area -->
    <div class="flex-1 flex flex-col min-h-0">
      <!-- Tabs -->
      <div class="flex bg-slate-800 border-b border-slate-700 shrink-0">
        <button
          class="px-4 py-2 text-xs transition-colors {activeTab === 'editor' ? 'text-white border-b-2 border-amber-400' : 'text-slate-400 hover:text-slate-200'}"
          onclick={() => activeTab = 'editor'}
        >
          2D Editor
        </button>
        <button
          class="px-4 py-2 text-xs transition-colors {activeTab === 'preview' ? 'text-white border-b-2 border-amber-400' : 'text-slate-400 hover:text-slate-200'}"
          onclick={() => activeTab = 'preview'}
        >
          3D Preview
        </button>
      </div>

      <!-- Tab content -->
      <div class="flex-1 min-h-0 relative">
        <div class="absolute inset-0" class:hidden={activeTab !== 'editor'}>
          <GridEditor
            {doc}
            {activeTool}
            {selectedId}
            onAddPad={addPad}
            onAddHeader={addHeader}
            onAddTrace={addTrace}
            onAddJumper={addJumper}
            onRemoveElement={removeElement}
            onSelect={selectElement}
          />
        </div>
        <div class="absolute inset-0" class:hidden={activeTab !== 'preview'}>
          <Viewer3D
            bind:this={viewer}
            bodies={perfboardBodies}
            visibility={bodyVisibility}
            {zScale}
            {boardZScale}
            textZScale={1}
            textMode="raise"
            traceMode="raise"
            previewFilter={null}
            drcViolations={[]}
            isRebuild={false}
            encSideBySide={false}
            rawSegments={null}
            silkPolylines={null}
            copperTextPolylines={null}
            boardThickness={doc.boardThickness}
            showDimensions={false}
          />
        </div>
      </div>
    </div>
  </div>
</div>
