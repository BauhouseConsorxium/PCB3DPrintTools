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
    onBeforeChange = () => {},
  } = $props()

  let showCurve = $state(false)
  let showRound = $state(false)

  const inputClass = "w-full bg-surface-2 text-cyan-light text-xs rounded-lg px-2 py-1 border-2 border-black focus:border-accent outline-none shadow-[2px_2px_0_black]"
</script>

<div class="mb-4 space-y-3">
  <!-- Grid size — always visible -->
  <div>
    <div class="text-[10px] uppercase tracking-wider text-accent font-bold mb-1.5">Board</div>
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
            class="flex-1 px-2 py-1 text-[10px] rounded-lg border-2 border-black transition-colors {roundTraceMode === 'arc' ? 'bg-accent text-white shadow-[2px_2px_0_black]' : 'bg-surface-2 text-cyan-light hover:bg-surface-3'}"
            onclick={() => { onBeforeChange(); roundTraceMode = 'arc' }}
          >Arc</button>
          <button
            class="flex-1 px-2 py-1 text-[10px] rounded-lg border-2 border-black transition-colors {roundTraceMode === 'subdivision' ? 'bg-accent text-white shadow-[2px_2px_0_black]' : 'bg-surface-2 text-cyan-light hover:bg-surface-3'}"
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
</div>
