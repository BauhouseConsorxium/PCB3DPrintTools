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
</script>

<div class="mb-4">
  <div class="text-[10px] uppercase tracking-wider text-accent font-bold mb-2">Board</div>

  <div class="grid grid-cols-2 gap-2 mb-2">
    <div>
      <label class="text-[10px] text-purple-light block mb-0.5">Columns</label>
      <input type="number" bind:value={cols} min="2" max="40" onfocus={onBeforeChange}
        class="w-full bg-surface-2 text-cyan-light text-xs rounded-lg px-2 py-1 border-2 border-black focus:border-accent outline-none shadow-[2px_2px_0_black]" />
    </div>
    <div>
      <label class="text-[10px] text-purple-light block mb-0.5">Rows</label>
      <input type="number" bind:value={rows} min="2" max="40" onfocus={onBeforeChange}
        class="w-full bg-surface-2 text-cyan-light text-xs rounded-lg px-2 py-1 border-2 border-black focus:border-accent outline-none shadow-[2px_2px_0_black]" />
    </div>
  </div>

  <div class="text-[10px] uppercase tracking-wider text-accent font-bold mb-2 mt-3">Dimensions (mm)</div>

  <div class="grid grid-cols-2 gap-2">
    <div>
      <label class="text-[10px] text-purple-light block mb-0.5">Pad diameter</label>
      <input type="number" bind:value={padDiameter} min="0.5" max="4" step="0.1" onfocus={onBeforeChange}
        class="w-full bg-surface-2 text-cyan-light text-xs rounded-lg px-2 py-1 border-2 border-black focus:border-accent outline-none shadow-[2px_2px_0_black]" />
    </div>
    <div>
      <label class="text-[10px] text-purple-light block mb-0.5">Drill diameter</label>
      <input type="number" bind:value={drillDiameter} min="0.3" max="3" step="0.1" onfocus={onBeforeChange}
        class="w-full bg-surface-2 text-cyan-light text-xs rounded-lg px-2 py-1 border-2 border-black focus:border-accent outline-none shadow-[2px_2px_0_black]" />
    </div>
    <div>
      <label class="text-[10px] text-purple-light block mb-0.5">Trace width</label>
      <input type="number" bind:value={traceWidth} min="0.3" max="5" step="0.1" onfocus={onBeforeChange}
        class="w-full bg-surface-2 text-cyan-light text-xs rounded-lg px-2 py-1 border-2 border-black focus:border-accent outline-none shadow-[2px_2px_0_black]" />
    </div>
    <div>
      <label class="text-[10px] text-purple-light block mb-0.5">Start end width</label>
      <input type="number" bind:value={curveEndWidth} min="0.3" max="8" step="0.1" onfocus={onBeforeChange}
        class="w-full bg-surface-2 text-cyan-light text-xs rounded-lg px-2 py-1 border-2 border-black focus:border-accent outline-none shadow-[2px_2px_0_black]" />
    </div>
    <div>
      <label class="text-[10px] text-purple-light block mb-0.5">Finish end width</label>
      <input type="number" bind:value={curveEndWidth2} min="0.3" max="8" step="0.1" onfocus={onBeforeChange}
        class="w-full bg-surface-2 text-cyan-light text-xs rounded-lg px-2 py-1 border-2 border-black focus:border-accent outline-none shadow-[2px_2px_0_black]" />
    </div>
    <div>
      <label class="text-[10px] text-purple-light block mb-0.5">Taper distance</label>
      <input type="number" bind:value={curveTaperDistance} min="0" max="50" step="0.5" onfocus={onBeforeChange}
        class="w-full bg-surface-2 text-cyan-light text-xs rounded-lg px-2 py-1 border-2 border-black focus:border-accent outline-none shadow-[2px_2px_0_black]" />
    </div>
    <div>
      <label class="text-[10px] text-purple-light block mb-0.5">Board thickness</label>
      <input type="number" bind:value={boardThickness} min="0.5" max="5" step="0.1" onfocus={onBeforeChange}
        class="w-full bg-surface-2 text-cyan-light text-xs rounded-lg px-2 py-1 border-2 border-black focus:border-accent outline-none shadow-[2px_2px_0_black]" />
    </div>
  </div>

  <div class="text-[10px] uppercase tracking-wider text-accent font-bold mb-2 mt-3">Round Trace</div>

  <div class="grid grid-cols-2 gap-2">
    <div>
      <label class="text-[10px] text-purple-light block mb-0.5">Radius (mm)</label>
      <input type="number" bind:value={roundTraceRadius} min="0.2" max="10" step="0.1" onfocus={onBeforeChange}
        class="w-full bg-surface-2 text-cyan-light text-xs rounded-lg px-2 py-1 border-2 border-black focus:border-accent outline-none shadow-[2px_2px_0_black]" />
    </div>
    <div>
      <label class="text-[10px] text-purple-light block mb-0.5">Passes</label>
      <input type="number" bind:value={roundTracePasses} min="1" max="5" step="1" onfocus={onBeforeChange}
        class="w-full bg-surface-2 text-cyan-light text-xs rounded-lg px-2 py-1 border-2 border-black focus:border-accent outline-none shadow-[2px_2px_0_black]"
        disabled={roundTraceMode !== 'subdivision'} />
    </div>
    <div class="col-span-2">
      <label class="text-[10px] text-purple-light block mb-0.5">Mode</label>
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
    </div>
    <div class="col-span-2">
      <label class="text-[10px] text-purple-light flex items-center gap-1.5 cursor-pointer">
        <input type="checkbox" bind:checked={roundTraceTeardrop} onclick={onBeforeChange}
          class="accent-accent" />
        Teardrop pads
      </label>
    </div>
    {#if roundTraceTeardrop}
      <div>
        <label class="text-[10px] text-purple-light block mb-0.5">TD length %</label>
        <input type="number" bind:value={roundTraceTdHPercent} min="10" max="100" step="5" onfocus={onBeforeChange}
          class="w-full bg-surface-2 text-cyan-light text-xs rounded-lg px-2 py-1 border-2 border-black focus:border-accent outline-none shadow-[2px_2px_0_black]" />
      </div>
      <div>
        <label class="text-[10px] text-purple-light block mb-0.5">TD width %</label>
        <input type="number" bind:value={roundTraceTdVPercent} min="10" max="100" step="5" onfocus={onBeforeChange}
          class="w-full bg-surface-2 text-cyan-light text-xs rounded-lg px-2 py-1 border-2 border-black focus:border-accent outline-none shadow-[2px_2px_0_black]" />
      </div>
    {/if}
  </div>
</div>
