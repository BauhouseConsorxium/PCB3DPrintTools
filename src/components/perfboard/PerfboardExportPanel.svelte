<script>
  let {
    zScale = $bindable(8),
    boardZScale = $bindable(1),
    includeBoard = $bindable(true),
    onExport = () => {},
    onExport2D = () => {},
  } = $props()

  const copperMM = $derived((zScale * 0.035).toFixed(2))
</script>

<div class="mb-4">
  <div class="text-[10px] uppercase tracking-wider text-accent font-bold mb-2">3D Settings</div>

  <div class="mb-3">
    <div class="flex justify-between items-center mb-1">
      <span class="text-xs text-purple-light">Copper Z-scale</span>
      <span class="text-[10px] text-cyan tabular-nums">{zScale}x ({copperMM} mm)</span>
    </div>
    <input type="range" bind:value={zScale} min="1" max="143" step="1"
      class="w-full h-1 accent-[#ff2d95] cursor-pointer" />
  </div>

  <div class="mb-3">
    <div class="flex justify-between items-center mb-1">
      <span class="text-xs text-purple-light">Board Z-scale</span>
      <span class="text-[10px] text-lime tabular-nums">{boardZScale}x</span>
    </div>
    <input type="range" bind:value={boardZScale} min="0.25" max="10" step="0.25"
      class="w-full h-1 accent-[#a3e635] cursor-pointer" />
  </div>

  <button
    class="w-full px-3 py-2 text-xs font-bold rounded-lg bg-accent hover:bg-accent-light text-[var(--text-on-accent)] border-2 border-black shadow-[4px_4px_0_black] transition-all hover:shadow-[5px_5px_0_black] hover:-translate-x-px hover:-translate-y-px active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_black]"
    onclick={onExport}
  >
    Export STL
  </button>

  <label class="flex items-center gap-2 mt-2 cursor-pointer">
    <input type="checkbox" bind:checked={includeBoard} class="accent-[#a3e635] w-3.5 h-3.5" />
    <span class="text-xs text-purple-light">Include board</span>
  </label>

  <button
    class="w-full px-3 py-2 text-xs font-bold rounded-lg bg-cyan hover:bg-cyan-light text-surface-0 border-2 border-black shadow-[4px_4px_0_black] transition-all hover:shadow-[5px_5px_0_black] hover:-translate-x-px hover:-translate-y-px active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_black] mt-2"
    onclick={onExport2D}
  >
    Export 2D
  </button>
</div>
