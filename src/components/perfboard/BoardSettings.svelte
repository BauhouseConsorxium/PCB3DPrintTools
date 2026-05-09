<script>
  let {
    cols = $bindable(10),
    rows = $bindable(8),
    padDiameter = $bindable(2.0),
    drillDiameter = $bindable(1.0),
    traceWidth = $bindable(1.0),
    curveEndWidth = $bindable(3.0),
    curveTaperDistance = $bindable(0),
    boardThickness = $bindable(1.6),
    onBeforeChange = () => {},
  } = $props()
</script>

<div class="mb-4">
  <div class="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Board</div>

  <div class="grid grid-cols-2 gap-2 mb-2">
    <div>
      <label class="text-[10px] text-slate-400 block mb-0.5">Columns</label>
      <input type="number" bind:value={cols} min="2" max="40" onfocus={onBeforeChange}
        class="w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600 focus:border-slate-400 outline-none" />
    </div>
    <div>
      <label class="text-[10px] text-slate-400 block mb-0.5">Rows</label>
      <input type="number" bind:value={rows} min="2" max="40" onfocus={onBeforeChange}
        class="w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600 focus:border-slate-400 outline-none" />
    </div>
  </div>

  <div class="text-[10px] uppercase tracking-wider text-slate-500 mb-2 mt-3">Dimensions (mm)</div>

  <div class="grid grid-cols-2 gap-2">
    <div>
      <label class="text-[10px] text-slate-400 block mb-0.5">Pad diameter</label>
      <input type="number" bind:value={padDiameter} min="0.5" max="4" step="0.1" onfocus={onBeforeChange}
        class="w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600 focus:border-slate-400 outline-none" />
    </div>
    <div>
      <label class="text-[10px] text-slate-400 block mb-0.5">Drill diameter</label>
      <input type="number" bind:value={drillDiameter} min="0.3" max="3" step="0.1" onfocus={onBeforeChange}
        class="w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600 focus:border-slate-400 outline-none" />
    </div>
    <div>
      <label class="text-[10px] text-slate-400 block mb-0.5">Trace width</label>
      <input type="number" bind:value={traceWidth} min="0.3" max="5" step="0.1" onfocus={onBeforeChange}
        class="w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600 focus:border-slate-400 outline-none" />
    </div>
    <div>
      <label class="text-[10px] text-slate-400 block mb-0.5">Curve end width</label>
      <input type="number" bind:value={curveEndWidth} min="0.3" max="8" step="0.1" onfocus={onBeforeChange}
        class="w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600 focus:border-slate-400 outline-none" />
    </div>
    <div>
      <label class="text-[10px] text-slate-400 block mb-0.5">Taper distance</label>
      <input type="number" bind:value={curveTaperDistance} min="0" max="50" step="0.5" onfocus={onBeforeChange}
        class="w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600 focus:border-slate-400 outline-none" />
    </div>
    <div>
      <label class="text-[10px] text-slate-400 block mb-0.5">Board thickness</label>
      <input type="number" bind:value={boardThickness} min="0.5" max="5" step="0.1" onfocus={onBeforeChange}
        class="w-full bg-slate-700 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600 focus:border-slate-400 outline-none" />
    </div>
  </div>
</div>
