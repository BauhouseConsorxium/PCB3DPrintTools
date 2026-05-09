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
  let activeTool = $state('select')
  let selectedIds = $state([])
  let zScale = $state(8)
  let boardZScale = $state(1)
  let annotationText = $state('VCC')
  let annotationColor = $state('#ef4444')

  let doc = $state(createDefaultDocument())

  // Undo/redo
  const MAX_UNDO = 50
  let undoStack = $state([])
  let redoStack = $state([])

  function cloneDoc() {
    return JSON.parse(JSON.stringify(doc))
  }

  function pushUndo() {
    const snapshot = cloneDoc()
    if (undoStack.length > 0 && JSON.stringify(undoStack[undoStack.length - 1]) === JSON.stringify(snapshot)) {
      return
    }
    undoStack = [...undoStack.slice(-(MAX_UNDO - 1)), snapshot]
    redoStack = []
  }

  function undo() {
    const current = cloneDoc()
    const currentStr = JSON.stringify(current)
    while (undoStack.length > 0) {
      const prev = undoStack[undoStack.length - 1]
      undoStack = undoStack.slice(0, -1)
      if (JSON.stringify(prev) !== currentStr) {
        redoStack = [...redoStack, current]
        doc = prev
        selectedIds = []
        return
      }
    }
  }

  function redo() {
    const current = cloneDoc()
    const currentStr = JSON.stringify(current)
    while (redoStack.length > 0) {
      const next = redoStack[redoStack.length - 1]
      redoStack = redoStack.slice(0, -1)
      if (JSON.stringify(next) !== currentStr) {
        undoStack = [...undoStack, current]
        doc = next
        selectedIds = []
        return
      }
    }
  }

  let cols = $derived(doc.grid.cols)
  let rows = $derived(doc.grid.rows)

  const perfboardBodies = $derived(buildPerfboardBodies(doc))
  const bodyVisibility = $derived(
    Object.fromEntries(perfboardBodies.map(b => [b.name, true]))
  )

  function setGridCols(v) { doc.grid.cols = Math.max(2, Math.min(40, Number(v) || 2)) }
  function setGridRows(v) { doc.grid.rows = Math.max(2, Math.min(40, Number(v) || 2)) }

  function addPad(col, row) {
    pushUndo()
    const exists = doc.pads.find(p => p.col === col && p.row === row)
    if (exists) {
      doc.pads = doc.pads.filter(p => p.id !== exists.id)
      return
    }
    doc.pads = [...doc.pads, { id: crypto.randomUUID(), col, row }]
  }

  function addHeader(col, row, count, orientation) {
    pushUndo()
    doc.headers = [...doc.headers, { id: crypto.randomUUID(), col, row, count, orientation }]
  }

  function addTrace(points) {
    if (points.length < 2) return
    pushUndo()
    doc.traces = [...doc.traces, { id: crypto.randomUUID(), points, width: doc.traceWidth }]
  }

  const WIRE_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
    '#3b82f6', '#a855f7', '#ec4899', '#f0f0f0', '#a78bfa',
  ]

  function addJumper(col1, row1, col2, row2) {
    pushUndo()
    const color = WIRE_COLORS[Math.floor(Math.random() * WIRE_COLORS.length)]
    doc.jumpers = [...doc.jumpers, { id: crypto.randomUUID(), col1, row1, col2, row2, color }]
  }

  function updateJumperColor(id, color) {
    pushUndo()
    const j = doc.jumpers.find(j => j.id === id)
    if (j) { j.color = color; doc.jumpers = [...doc.jumpers] }
  }

  function addAnnotation(col, row) {
    pushUndo()
    doc.annotations = [...doc.annotations, { id: crypto.randomUUID(), col, row, text: annotationText, color: annotationColor }]
  }

  function updateAnnotation(id, text, color) {
    pushUndo()
    if (!text.trim()) {
      doc.annotations = doc.annotations.filter(a => a.id !== id)
      selectedIds = selectedIds.filter(sid => sid !== id)
      return
    }
    const ann = doc.annotations.find(a => a.id === id)
    if (ann) {
      ann.text = text
      if (color) ann.color = color
      doc.annotations = [...doc.annotations]
    }
  }

  function moveSelected(dc, dr) {
    if (selectedIds.length === 0) return
    pushUndo()
    for (const id of selectedIds) {
      const pad = doc.pads.find(p => p.id === id)
      if (pad) { pad.col += dc; pad.row += dr; continue }
      const header = doc.headers.find(h => h.id === id)
      if (header) { header.col += dc; header.row += dr; continue }
      const trace = doc.traces.find(t => t.id === id)
      if (trace) { for (const pt of trace.points) { pt.col += dc; pt.row += dr }; continue }
      const jumper = doc.jumpers.find(j => j.id === id)
      if (jumper) { jumper.col1 += dc; jumper.row1 += dr; jumper.col2 += dc; jumper.row2 += dr; continue }
      const ann = doc.annotations.find(a => a.id === id)
      if (ann) { ann.col += dc; ann.row += dr; continue }
    }
    doc.pads = [...doc.pads]
    doc.headers = [...doc.headers]
    doc.traces = [...doc.traces]
    doc.jumpers = [...doc.jumpers]
    doc.annotations = [...doc.annotations]
  }

  function removeElement(id) {
    pushUndo()
    doc.pads = doc.pads.filter(p => p.id !== id)
    doc.headers = doc.headers.filter(h => h.id !== id)
    doc.traces = doc.traces.filter(t => t.id !== id)
    doc.jumpers = doc.jumpers.filter(j => j.id !== id)
    doc.annotations = doc.annotations.filter(a => a.id !== id)
    selectedIds = selectedIds.filter(sid => sid !== id)
  }

  function selectElement(id, addToSelection = false) {
    if (id == null) {
      if (!addToSelection) selectedIds = []
      return
    }
    if (addToSelection) {
      if (selectedIds.includes(id)) {
        selectedIds = selectedIds.filter(sid => sid !== id)
      } else {
        selectedIds = [...selectedIds, id]
      }
    } else {
      selectedIds = [id]
    }
  }

  function bulkSelect(ids, addToSelection = false) {
    if (addToSelection) {
      const current = new Set(selectedIds)
      for (const id of ids) current.add(id)
      selectedIds = [...current]
    } else {
      selectedIds = [...ids]
    }
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
    pushUndo()
    entry.doc.jumpers = entry.doc.jumpers ?? []
    entry.doc.annotations = entry.doc.annotations ?? []
    doc = entry.doc
    selectedIds = []
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
        pushUndo()
        parsed.jumpers = parsed.jumpers ?? []
        parsed.annotations = parsed.annotations ?? []
        doc = parsed
        selectedIds = []
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
      pushUndo()
      parsed.jumpers = parsed.jumpers ?? []
      parsed.annotations = parsed.annotations ?? []
      doc = parsed
      selectedIds = []
    } catch { alert('Failed to load example') }
  }

  function handleKeydown(e) {
    const isInput = e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA'
    const mod = e.metaKey || e.ctrlKey
    if (!isInput && mod && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      undo()
      return
    }
    if (!isInput && mod && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
      e.preventDefault()
      redo()
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!isInput && selectedIds.length > 0 && activeTool === 'select') {
        pushUndo()
        const idSet = new Set(selectedIds)
        doc.pads = doc.pads.filter(p => !idSet.has(p.id))
        doc.headers = doc.headers.filter(h => !idSet.has(h.id))
        doc.traces = doc.traces.filter(t => !idSet.has(t.id))
        doc.jumpers = doc.jumpers.filter(j => !idSet.has(j.id))
        doc.annotations = doc.annotations.filter(a => !idSet.has(a.id))
        selectedIds = []
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
        onfocus={pushUndo}
        class="bg-slate-700 text-xs text-slate-300 rounded px-2 py-0.5 border border-slate-600 focus:border-slate-400 outline-none w-32"
        placeholder="Project name"
      />
      <div class="flex items-center gap-0.5 ml-2">
        <button
          onclick={undo}
          disabled={undoStack.length === 0}
          class="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-slate-400"
          title="Undo (Ctrl+Z)"
        >
          <svg viewBox="0 0 16 16" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7h7a3 3 0 0 1 0 6H8" />
            <path d="M6 4L3 7l3 3" />
          </svg>
        </button>
        <button
          onclick={redo}
          disabled={redoStack.length === 0}
          class="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-slate-400"
          title="Redo (Ctrl+Shift+Z)"
        >
          <svg viewBox="0 0 16 16" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 7H6a3 3 0 0 0 0 6h2" />
            <path d="M10 4l3 3-3 3" />
          </svg>
        </button>
      </div>
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
        onBeforeChange={pushUndo}
      />

      <Toolbar {activeTool} onToolChange={(t) => { activeTool = t; selectedIds = [] }} />

      {#if activeTool === 'label'}
        <div class="mb-4">
          <div class="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Label</div>
          <div class="space-y-1.5">
            <input
              type="text"
              bind:value={annotationText}
              class="w-full bg-slate-700 text-xs text-slate-300 rounded px-2 py-1 border border-slate-600 focus:border-slate-400 outline-none"
              placeholder="Label text"
            />
            <div class="flex items-center gap-1.5">
              {#each ['#ef4444', '#22c55e', '#3b82f6', '#eab308', '#f97316', '#a855f7', '#f0f0f0'] as c}
                <button
                  onclick={() => annotationColor = c}
                  class="w-4 h-4 rounded-full border-2 transition-colors {annotationColor === c ? 'border-white' : 'border-transparent'}"
                  style="background-color: {c}"
                ></button>
              {/each}
            </div>
          </div>
        </div>
      {/if}

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
        <div>Pads: {doc.pads.length} | Headers: {doc.headers.length} | Traces: {doc.traces.length} | Jumpers: {doc.jumpers.length} | Labels: {doc.annotations.length}</div>
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
            {selectedIds}
            onAddPad={addPad}
            onAddHeader={addHeader}
            onAddTrace={addTrace}
            onAddJumper={addJumper}
            onAddAnnotation={addAnnotation}
            onUpdateAnnotation={updateAnnotation}
            onUpdateJumperColor={updateJumperColor}
            onMoveSelected={moveSelected}
            onRemoveElement={removeElement}
            onSelect={selectElement}
            onBulkSelect={bulkSelect}
            onToolChange={(t) => { activeTool = t; selectedIds = [] }}
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
