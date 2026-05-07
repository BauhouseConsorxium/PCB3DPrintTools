<script>
  let {
    open = $bindable(false),
    settings = {},
    onapply = null,
  } = $props()

  const STORAGE_KEY = 'pcb3d-presets'
  const ACTIVE_KEY = 'pcb3d-active-preset'
  const SETTINGS_KEYS = ['zScale', 'boardZScale', 'traceMode', 'traceWidthOffset', 'drillDiameterOffset', 'squareEnds', 'enclosureEnabled', 'encWallThickness', 'encClearance', 'encFloorThickness', 'encWallHeight', 'encShelfDepth', 'encShelfHeight', 'encSideBySide']

  let presets = $state([])
  let activePresetName = $state('')
  let newName = $state('')
  let confirmDelete = $state(null)
  let importInputEl

  function load() {
    try {
      presets = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      activePresetName = localStorage.getItem(ACTIVE_KEY) || ''
    } catch { presets = [] }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
    localStorage.setItem(ACTIVE_KEY, activePresetName)
  }

  function pickSettings() {
    const s = {}
    for (const k of SETTINGS_KEYS) s[k] = settings[k]
    return s
  }

  function settingsEqual(a, b) {
    return SETTINGS_KEYS.every(k => a[k] === b[k])
  }

  const activePreset = $derived(presets.find(p => p.name === activePresetName) || null)
  const isModified = $derived(activePreset ? !settingsEqual(pickSettings(), activePreset.settings) : false)

  function applyPreset(preset) {
    activePresetName = preset.name
    persist()
    onapply?.(preset.settings)
  }

  function saveNew() {
    const name = newName.trim()
    if (!name) return
    const existing = presets.findIndex(p => p.name === name)
    const entry = { name, settings: pickSettings() }
    if (existing >= 0) {
      presets[existing] = entry
    } else {
      presets.push(entry)
    }
    presets = [...presets]
    activePresetName = name
    newName = ''
    persist()
  }

  function saveOverActive() {
    if (!activePreset) return
    const idx = presets.findIndex(p => p.name === activePresetName)
    if (idx >= 0) {
      presets[idx] = { name: activePresetName, settings: pickSettings() }
      presets = [...presets]
      persist()
    }
  }

  function deletePreset(name) {
    presets = presets.filter(p => p.name !== name)
    if (activePresetName === name) activePresetName = ''
    confirmDelete = null
    persist()
  }

  function exportJSON() {
    const data = JSON.stringify(presets, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'pcb3d-presets.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function importJSON(e) {
    const file = e.target.files[0]
    if (!file) return
    file.text().then(text => {
      try {
        const imported = JSON.parse(text)
        if (!Array.isArray(imported)) return
        for (const p of imported) {
          if (!p.name || !p.settings) continue
          const existing = presets.findIndex(x => x.name === p.name)
          if (existing >= 0) {
            presets[existing] = p
          } else {
            presets.push(p)
          }
        }
        presets = [...presets]
        persist()
      } catch { /* invalid JSON */ }
    })
    e.target.value = ''
  }

  function onkeydown(e) {
    if (e.key === 'Escape') open = false
  }

  $effect(() => {
    if (open) {
      load()
      confirmDelete = null
      newName = ''
    }
  })
</script>

{#if open}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center"
  onkeydown={onkeydown}
>
  <!-- Backdrop -->
  <div
    class="absolute inset-0 bg-black/60 backdrop-blur-sm"
    onclick={() => open = false}
    role="presentation"
  ></div>

  <!-- Modal -->
  <div class="relative bg-[#111120] border border-[#2a2a48] rounded-lg shadow-2xl w-[420px] max-h-[80vh] flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-[#2a2a48]">
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 text-[#b87333]" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
        </svg>
        <span class="text-sm font-semibold text-slate-100">Presets</span>
      </div>
      <button
        onclick={() => open = false}
        class="text-slate-500 hover:text-slate-300 transition-colors"
        title="Close"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Active preset indicator -->
    <div class="px-4 py-2.5 border-b border-[#2a2a48] bg-[#0d0d1a]">
      <div class="flex items-center gap-2">
        <span class="text-[10px] uppercase tracking-wider text-slate-600">Active</span>
        {#if activePresetName}
          <span class="text-xs text-slate-200 font-medium">{activePresetName}</span>
          {#if isModified}
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">modified</span>
          {/if}
        {:else}
          <span class="text-xs text-slate-500 italic">none</span>
        {/if}
      </div>
    </div>

    <!-- Preset list -->
    <div class="flex-1 overflow-y-auto px-4 py-3 min-h-0">
      {#if presets.length === 0}
        <p class="text-xs text-slate-600 text-center py-4">No saved presets</p>
      {:else}
        <div class="space-y-1">
          {#each presets as preset (preset.name)}
            <div class="flex items-center gap-2 group rounded px-2 py-1.5 hover:bg-[#1a1a30] transition-colors
              {preset.name === activePresetName ? 'bg-[#1a1a30] border border-[#2a2a48]' : 'border border-transparent'}">
              <div class="flex-1 min-w-0">
                <span class="text-xs text-slate-200 truncate block">{preset.name}</span>
                <span class="text-[10px] text-slate-600">
                  {preset.settings.traceMode}
                  · Z {preset.settings.zScale}x
                  · W {preset.settings.traceWidthOffset > 0 ? '+' : ''}{preset.settings.traceWidthOffset}mm
                  {preset.settings.squareEnds ? '· sq' : ''}
                  {preset.settings.enclosureEnabled ? '· enc' : ''}
                </span>
              </div>
              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onclick={() => applyPreset(preset)}
                  class="px-2 py-0.5 text-[10px] rounded bg-[#b87333]/20 text-[#b87333] hover:bg-[#b87333]/30 font-medium"
                >Load</button>
                {#if confirmDelete === preset.name}
                  <button
                    onclick={() => deletePreset(preset.name)}
                    class="px-2 py-0.5 text-[10px] rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 font-medium"
                  >Confirm</button>
                  <button
                    onclick={() => confirmDelete = null}
                    class="px-1.5 py-0.5 text-[10px] text-slate-500 hover:text-slate-300"
                  >Cancel</button>
                {:else}
                  <button
                    onclick={() => confirmDelete = preset.name}
                    class="px-1.5 py-0.5 text-[10px] text-slate-600 hover:text-red-400"
                    title="Delete preset"
                  >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Save section -->
    <div class="px-4 py-3 border-t border-[#2a2a48] space-y-2">
      <!-- Save as new -->
      <div class="flex gap-2">
        <input
          type="text"
          bind:value={newName}
          placeholder="Preset name"
          onkeydown={(e) => e.key === 'Enter' && saveNew()}
          class="flex-1 px-2.5 py-1.5 text-xs rounded bg-[#0d0d1a] border border-[#2a2a48]
            text-slate-200 placeholder:text-slate-600
            focus:outline-none focus:border-[#b87333]/50"
        />
        <button
          onclick={saveNew}
          disabled={!newName.trim()}
          class="px-3 py-1.5 text-xs font-medium rounded bg-[#b87333] hover:bg-[#d4974a]
            text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >Save</button>
      </div>

      <!-- Save over active -->
      {#if activePreset && isModified}
        <button
          onclick={saveOverActive}
          class="w-full py-1.5 text-xs font-medium rounded border border-[#b87333]/40
            text-[#b87333] hover:bg-[#b87333]/10 transition-colors"
        >Update "{activePresetName}"</button>
      {/if}
    </div>

    <!-- Import / Export -->
    <div class="px-4 py-2.5 border-t border-[#2a2a48] flex gap-2">
      <button
        onclick={exportJSON}
        disabled={!presets.length}
        class="flex-1 py-1.5 text-xs font-medium rounded bg-[#1a1a30] border border-[#2a2a48]
          text-slate-400 hover:text-slate-200 hover:border-[#3a3a58] transition-colors
          disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
      >
        <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        Export JSON
      </button>
      <button
        onclick={() => importInputEl.click()}
        class="flex-1 py-1.5 text-xs font-medium rounded bg-[#1a1a30] border border-[#2a2a48]
          text-slate-400 hover:text-slate-200 hover:border-[#3a3a58] transition-colors
          flex items-center justify-center gap-1.5"
      >
        <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        Import JSON
      </button>
      <input
        bind:this={importInputEl}
        type="file"
        accept=".json"
        class="hidden"
        onchange={importJSON}
      />
    </div>
  </div>
</div>
{/if}
