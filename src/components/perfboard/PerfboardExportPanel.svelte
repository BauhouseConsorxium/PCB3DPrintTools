<script>
  let {
    zScale = $bindable(8),
    boardZScale = $bindable(1),
    onExport = () => {},
  } = $props()

  const copperMM = $derived((zScale * 0.035).toFixed(2))
</script>

<div class="mb-4">
  <div class="text-[10px] uppercase tracking-wider text-slate-500 mb-2">3D Settings</div>

  <div class="mb-3">
    <div class="flex justify-between items-center mb-1">
      <span class="text-xs text-slate-400">Copper Z-scale</span>
      <span class="text-[10px] text-amber-400/80 tabular-nums">{zScale}x ({copperMM} mm)</span>
    </div>
    <input type="range" bind:value={zScale} min="1" max="143" step="1"
      class="w-full h-1 accent-amber-500 cursor-pointer" />
  </div>

  <div class="mb-3">
    <div class="flex justify-between items-center mb-1">
      <span class="text-xs text-slate-400">Board Z-scale</span>
      <span class="text-[10px] text-emerald-400/80 tabular-nums">{boardZScale}x</span>
    </div>
    <input type="range" bind:value={boardZScale} min="0.25" max="10" step="0.25"
      class="w-full h-1 accent-emerald-500 cursor-pointer" />
  </div>

  <button
    class="w-full px-3 py-2 text-xs font-medium rounded bg-amber-600 hover:bg-amber-500 text-white transition-colors"
    onclick={onExport}
  >
    Export STL
  </button>
</div>
