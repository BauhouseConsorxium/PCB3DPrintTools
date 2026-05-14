<script>
  let {
    cols = $bindable(10),
    rows = $bindable(8),
    padDiameter = $bindable(2.0),
    drillDiameter = $bindable(1.0),
    traceWidth = $bindable(1.0),
    curveEndWidth = $bindable(3.0),
    curveEndWidth2 = $bindable(3.0),
    curveTaperDistance = $bindable(0),
    roundTraceRadius = $bindable(1.0),
    roundTraceMode = $bindable('arc'),
    roundTracePasses = $bindable(2),
    roundTraceTeardrop = $bindable(false),
    roundTraceTdHPercent = $bindable(50),
    roundTraceTdVPercent = $bindable(90),
    boardThickness = $bindable(1.6),
    pinHousingHeight = $bindable(2.5),
    pinHousingBoreWidth = $bindable(0.8),
    pinHousingBoreOffset = $bindable(0),
    pinHousingWidth = $bindable(2.14),
    pinHousingDepth = $bindable(2.14),
    pinHousingFaceOffset = $bindable(0),
    enclosureEnabled = $bindable(false),
    enclosureSideBySide = $bindable(false),
    enclosureWallThickness = $bindable(2),
    enclosureClearance = $bindable(0.5),
    enclosureFloorThickness = $bindable(1.5),
    enclosureWallHeight = $bindable(10),
    enclosureShelfDepth = $bindable(1),
    enclosureShelfHeight = $bindable(1.6),
    shape = $bindable('rect'),
    zScale = $bindable(8),
    boardZScale = $bindable(1),
    onBeforeChange = () => {},
  } = $props()

  import PerfboardPresetModal from "./PerfboardPresetModal.svelte";

  let showCurve = $state(false)
  let showRound = $state(false)
  let showPinHousing = $state(false)
  let showEnclosure = $state(false)

  let presetModalOpen = $state(false)

  const inputClass = "w-full bg-gradient-to-b from-[var(--grad-input)] to-surface-2 text-cyan-light text-xs rounded-lg px-2 py-1 border-2 border-black focus:border-accent outline-none shadow-[inset_2px_2px_3px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.04)] focus:shadow-[inset_2px_2px_3px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)] transition-shadow [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0"

  function pickSettings() {
    return {
      cols, rows, padDiameter, drillDiameter, traceWidth, boardThickness, shape,
      zScale, boardZScale,
      curveEndWidth, curveEndWidth2, curveTaperDistance,
      roundTraceRadius, roundTraceMode, roundTracePasses, roundTraceTeardrop,
      roundTraceTdHPercent, roundTraceTdVPercent,
      pinHousingHeight, pinHousingBoreWidth, pinHousingBoreOffset,
      pinHousingWidth, pinHousingDepth, pinHousingFaceOffset
    }
  }

  function applyPresetSettings(s) {
    if (s.type === 'size') {
      cols = s.cols ?? cols; rows = s.rows ?? rows; shape = s.shape ?? shape
      onBeforeChange()
      return
    }
    cols = s.cols ?? cols; rows = s.rows ?? rows
    padDiameter = s.padDiameter ?? padDiameter
    drillDiameter = s.drillDiameter ?? drillDiameter
    traceWidth = s.traceWidth ?? traceWidth
    boardThickness = s.boardThickness ?? boardThickness
    shape = s.shape ?? shape
    zScale = s.zScale ?? zScale
    boardZScale = s.boardZScale ?? boardZScale
    curveEndWidth = s.curveEndWidth ?? curveEndWidth
    curveEndWidth2 = s.curveEndWidth2 ?? curveEndWidth2
    curveTaperDistance = s.curveTaperDistance ?? curveTaperDistance
    roundTraceRadius = s.roundTraceRadius ?? roundTraceRadius
    roundTraceMode = s.roundTraceMode ?? roundTraceMode
    roundTracePasses = s.roundTracePasses ?? roundTracePasses
    roundTraceTeardrop = s.roundTraceTeardrop ?? roundTraceTeardrop
    roundTraceTdHPercent = s.roundTraceTdHPercent ?? roundTraceTdHPercent
    roundTraceTdVPercent = s.roundTraceTdVPercent ?? roundTraceTdVPercent
    pinHousingHeight = s.pinHousingHeight ?? pinHousingHeight
    pinHousingBoreWidth = s.pinHousingBoreWidth ?? pinHousingBoreWidth
    pinHousingBoreOffset = s.pinHousingBoreOffset ?? pinHousingBoreOffset
    pinHousingWidth = s.pinHousingWidth ?? pinHousingWidth
    pinHousingDepth = s.pinHousingDepth ?? pinHousingDepth
    pinHousingFaceOffset = s.pinHousingFaceOffset ?? pinHousingFaceOffset
    onBeforeChange()
  }
</script>

<div class="mb-4 space-y-3">
  <!-- Presets button -->
  <button
    onclick={() => presetModalOpen = true}
    class="w-full px-3 py-1.5 text-[10px] font-bold rounded-lg border-2 border-black bg-gradient-to-b from-[var(--grad-from-2)] to-surface-2 text-cyan-light hover:from-[var(--grad-btn-hover)] hover:to-surface-2 active:from-[var(--grad-btn-active)] active:to-[var(--grad-btn-active)] shadow-[3px_3px_0_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)] active:shadow-[1px_1px_0_rgba(0,0,0,0.4)] transition-all mb-1"
  >
    Presets
  </button>

  <PerfboardPresetModal bind:open={presetModalOpen} pickSettings={pickSettings} onApply={applyPresetSettings} />

  <!-- Grid size — always visible -->
  <div>
    <div class="text-[10px] uppercase tracking-wider text-accent font-bold mb-1.5">Board</div>
    <div class="flex gap-1 mb-1.5">
      <button
        class="flex-1 px-2 py-1 text-[10px] rounded-lg border-2 border-black transition-all {shape === 'rect' ? 'bg-gradient-to-b from-accent to-accent/80 text-[var(--text-on-accent)] shadow-[1px_1px_0_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.2)] translate-y-0.5' : 'bg-gradient-to-b from-[var(--grad-from-2)] to-surface-2 text-cyan-light hover:from-[var(--grad-btn-hover)] hover:to-surface-2 shadow-[3px_3px_0_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)]'}"
        onclick={() => { onBeforeChange(); shape = 'rect' }}
      >Rect</button>
      <button
        class="flex-1 px-2 py-1 text-[10px] rounded-lg border-2 border-black transition-all {shape === 'circle' ? 'bg-gradient-to-b from-accent to-accent/80 text-[var(--text-on-accent)] shadow-[1px_1px_0_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.2)] translate-y-0.5' : 'bg-gradient-to-b from-[var(--grad-from-2)] to-surface-2 text-cyan-light hover:from-[var(--grad-btn-hover)] hover:to-surface-2 shadow-[3px_3px_0_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)]'}"
        onclick={() => { onBeforeChange(); shape = 'circle' }}
      >Circle</button>
    </div>
    <div class="grid grid-cols-4 gap-1.5 items-center">
      <span class="text-[10px] text-purple-light">Col</span>
      <input type="number" bind:value={cols} min="2" max="40" onfocus={onBeforeChange} class={inputClass} />
      <span class="text-[10px] text-purple-light">Row</span>
      <input type="number" bind:value={rows} min="2" max="40" onfocus={onBeforeChange} class={inputClass} />
    </div>
  </div>

  <!-- Core dimensions — always visible, compact -->
  <div>
    <div class="text-[10px] uppercase tracking-wider text-accent font-bold mb-1.5">Dimensions <span class="normal-case font-normal text-purple-light/50">(mm)</span></div>
    <div class="grid grid-cols-[auto_1fr_auto_1fr] gap-x-2 gap-y-1 items-center">
      <span class="text-[10px] text-purple-light">Pad</span>
      <input type="number" bind:value={padDiameter} min="0.5" max="4" step="0.1" onfocus={onBeforeChange} class={inputClass} />
      <span class="text-[10px] text-purple-light">Drill</span>
      <input type="number" bind:value={drillDiameter} min="0.3" max="3" step="0.1" onfocus={onBeforeChange} class={inputClass} />
      <span class="text-[10px] text-purple-light">Trace</span>
      <input type="number" bind:value={traceWidth} min="0.3" max="5" step="0.1" onfocus={onBeforeChange} class={inputClass} />
      <span class="text-[10px] text-purple-light">Board</span>
      <input type="number" bind:value={boardThickness} min="0.5" max="5" step="0.1" onfocus={onBeforeChange} class={inputClass} />
    </div>
  </div>

  <!-- Curve trace settings — collapsible -->
  <div>
    <button
      onclick={() => (showCurve = !showCurve)}
      class="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-purple-light/60 hover:text-accent transition-colors w-full"
    >
      <svg viewBox="0 0 10 10" class="w-2.5 h-2.5 transition-transform {showCurve ? 'rotate-90' : ''}" fill="currentColor">
        <path d="M3 1l5 4-5 4z" />
      </svg>
      Curve Trace
    </button>
    {#if showCurve}
      <div class="grid grid-cols-[auto_1fr_auto_1fr] gap-x-2 gap-y-1 items-center mt-1.5">
        <span class="text-[10px] text-purple-light">Start W</span>
        <input type="number" bind:value={curveEndWidth} min="0.3" max="8" step="0.1" onfocus={onBeforeChange} class={inputClass} />
        <span class="text-[10px] text-purple-light">End W</span>
        <input type="number" bind:value={curveEndWidth2} min="0.3" max="8" step="0.1" onfocus={onBeforeChange} class={inputClass} />
        <span class="text-[10px] text-purple-light">Taper</span>
        <input type="number" bind:value={curveTaperDistance} min="0" max="50" step="0.5" onfocus={onBeforeChange} class={inputClass} />
      </div>
    {/if}
  </div>

  <!-- Round trace settings — collapsible -->
  <div>
    <button
      onclick={() => (showRound = !showRound)}
      class="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-purple-light/60 hover:text-accent transition-colors w-full"
    >
      <svg viewBox="0 0 10 10" class="w-2.5 h-2.5 transition-transform {showRound ? 'rotate-90' : ''}" fill="currentColor">
        <path d="M3 1l5 4-5 4z" />
      </svg>
      Round Trace
    </button>
    {#if showRound}
      <div class="mt-1.5 space-y-1.5">
        <div class="grid grid-cols-[auto_1fr_auto_1fr] gap-x-2 gap-y-1 items-center">
          <span class="text-[10px] text-purple-light">Radius</span>
          <input type="number" bind:value={roundTraceRadius} min="0.2" max="10" step="0.1" onfocus={onBeforeChange} class={inputClass} />
          <span class="text-[10px] text-purple-light">Passes</span>
          <input type="number" bind:value={roundTracePasses} min="1" max="5" step="1" onfocus={onBeforeChange} class={inputClass}
            disabled={roundTraceMode !== 'subdivision'} />
        </div>
        <div class="flex gap-1">
          <button
                class="flex-1 px-2 py-1 text-[10px] rounded-lg border-2 border-black transition-colors {roundTraceMode === 'arc' ? 'bg-accent text-[var(--text-on-accent)] shadow-[2px_2px_0_black]' : 'bg-surface-2 text-cyan-light hover:bg-surface-3'}"
                onclick={() => { onBeforeChange(); roundTraceMode = 'arc' }}
              >Arc</button>
              <button
                class="flex-1 px-2 py-1 text-[10px] rounded-lg border-2 border-black transition-colors {roundTraceMode === 'subdivision' ? 'bg-accent text-[var(--text-on-accent)] shadow-[2px_2px_0_black]' : 'bg-surface-2 text-cyan-light hover:bg-surface-3'}"
            onclick={() => { onBeforeChange(); roundTraceMode = 'subdivision' }}
          >Subdivision</button>
        </div>
        <label class="text-[10px] text-purple-light flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" bind:checked={roundTraceTeardrop} onclick={onBeforeChange}
            class="accent-accent" />
          Teardrop pads
        </label>
        {#if roundTraceTeardrop}
          <div class="grid grid-cols-[auto_1fr_auto_1fr] gap-x-2 gap-y-1 items-center">
            <span class="text-[10px] text-purple-light">Len %</span>
            <input type="number" bind:value={roundTraceTdHPercent} min="10" max="100" step="5" onfocus={onBeforeChange} class={inputClass} />
            <span class="text-[10px] text-purple-light">Wid %</span>
            <input type="number" bind:value={roundTraceTdVPercent} min="10" max="100" step="5" onfocus={onBeforeChange} class={inputClass} />
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Pin housing settings — collapsible -->
  <div>
    <button
      onclick={() => (showPinHousing = !showPinHousing)}
      class="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-purple-light/60 hover:text-accent transition-colors w-full"
    >
      <svg viewBox="0 0 10 10" class="w-2.5 h-2.5 transition-transform {showPinHousing ? 'rotate-90' : ''}" fill="currentColor">
        <path d="M3 1l5 4-5 4z" />
      </svg>
      Pin Housing
    </button>
    {#if showPinHousing}
      <div class="grid grid-cols-[auto_1fr_auto_1fr] gap-x-2 gap-y-1 items-center mt-1.5">
        <span class="text-[10px] text-purple-light">Width</span>
        <input type="number" bind:value={pinHousingWidth} min="1" max="5" step="0.1" onfocus={onBeforeChange} class={inputClass} />
        <span class="text-[10px] text-purple-light">Depth</span>
        <input type="number" bind:value={pinHousingDepth} min="1" max="5" step="0.1" onfocus={onBeforeChange} class={inputClass} />
        <span class="text-[10px] text-purple-light">Height</span>
        <input type="number" bind:value={pinHousingHeight} min="1" max="10" step="0.5" onfocus={onBeforeChange} class={inputClass} />
        <span class="text-[10px] text-purple-light">Bore</span>
        <input type="number" bind:value={pinHousingBoreWidth} min="0.3" max="2" step="0.1" onfocus={onBeforeChange} class={inputClass} />
        <span class="text-[10px] text-purple-light">B.Ofs</span>
        <input type="number" bind:value={pinHousingBoreOffset} min="-2" max="2" step="0.1" onfocus={onBeforeChange} class={inputClass} />
        <span class="text-[10px] text-purple-light">F.Ofs</span>
        <input type="number" bind:value={pinHousingFaceOffset} min="-3" max="3" step="0.1" onfocus={onBeforeChange} class={inputClass} />
      </div>
    {/if}
  </div>

  <!-- Enclosure settings — collapsible -->
  <div>
    <button
      onclick={() => (showEnclosure = !showEnclosure)}
      class="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-purple-light/60 hover:text-accent transition-colors w-full"
    >
      <svg viewBox="0 0 10 10" class="w-2.5 h-2.5 transition-transform {showEnclosure ? 'rotate-90' : ''}" fill="currentColor">
        <path d="M3 1l5 4-5 4z" />
      </svg>
      Enclosure
    </button>
    {#if showEnclosure}
      <div class="mt-1.5 space-y-1.5">
        <label class="text-[10px] text-purple-light flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" bind:checked={enclosureEnabled} onclick={onBeforeChange}
            class="accent-accent" />
          Enable enclosure
        </label>
        {#if enclosureEnabled}
          <label class="text-[10px] text-purple-light flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" bind:checked={enclosureSideBySide}
              class="accent-accent" />
            Side-by-side view
          </label>
          <div class="grid grid-cols-[auto_1fr_auto_1fr] gap-x-2 gap-y-1 items-center">
            <span class="text-[10px] text-purple-light">Wall</span>
            <input type="number" bind:value={enclosureWallThickness} min="0.5" max="10" step="0.5" onfocus={onBeforeChange} class={inputClass} />
            <span class="text-[10px] text-purple-light">Clear</span>
            <input type="number" bind:value={enclosureClearance} min="0" max="5" step="0.1" onfocus={onBeforeChange} class={inputClass} />
            <span class="text-[10px] text-purple-light">Floor</span>
            <input type="number" bind:value={enclosureFloorThickness} min="0.5" max="5" step="0.5" onfocus={onBeforeChange} class={inputClass} />
            <span class="text-[10px] text-purple-light">Height</span>
            <input type="number" bind:value={enclosureWallHeight} min="1" max="50" step="1" onfocus={onBeforeChange} class={inputClass} />
            <span class="text-[10px] text-purple-light">Shelf</span>
            <input type="number" bind:value={enclosureShelfDepth} min="0.5" max="5" step="0.5" onfocus={onBeforeChange} class={inputClass} />
            <span class="text-[10px] text-purple-light">Sh.H</span>
            <input type="number" bind:value={enclosureShelfHeight} min="0.5" max="5" step="0.1" onfocus={onBeforeChange} class={inputClass} />
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
