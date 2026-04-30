<script>
  let { bodies = [], filename = '' } = $props()

  let info = $derived.by(() => {
    if (!bodies.length) return null

    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    let totalTris = 0

    for (const body of bodies) {
      const pos = body.positions
      for (let i = 0; i < pos.length; i += 3) {
        minX = Math.min(minX, pos[i])
        minY = Math.min(minY, pos[i + 1])
        minZ = Math.min(minZ, pos[i + 2])
        maxX = Math.max(maxX, pos[i])
        maxY = Math.max(maxY, pos[i + 1])
        maxZ = Math.max(maxZ, pos[i + 2])
      }
      totalTris += body.indices ? body.indices.length / 3 : pos.length / 9
    }

    return {
      width: (maxX - minX).toFixed(2),
      depth: (maxY - minY).toFixed(2),
      height: (maxZ - minZ).toFixed(2),
      bodies: bodies.length,
      triangles: Math.round(totalTris).toLocaleString(),
    }
  })
</script>

{#if info}
  <div class="p-3 border-b border-[#2a2a48]">
    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Info</p>

    {#if filename}
      <p class="text-xs text-slate-400 mb-2 truncate" title={filename}>{filename}</p>
    {/if}

    <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
      <div>
        <p class="text-[10px] text-slate-600 uppercase">Width</p>
        <p class="text-sm text-slate-200 font-mono">{info.width} mm</p>
      </div>
      <div>
        <p class="text-[10px] text-slate-600 uppercase">Depth</p>
        <p class="text-sm text-slate-200 font-mono">{info.depth} mm</p>
      </div>
      <div>
        <p class="text-[10px] text-slate-600 uppercase">Height</p>
        <p class="text-sm text-slate-200 font-mono">{info.height} mm</p>
      </div>
      <div>
        <p class="text-[10px] text-slate-600 uppercase">Bodies</p>
        <p class="text-sm text-slate-200 font-mono">{info.bodies}</p>
      </div>
      <div class="col-span-2">
        <p class="text-[10px] text-slate-600 uppercase">Triangles</p>
        <p class="text-sm text-slate-200 font-mono">{info.triangles}</p>
      </div>
    </div>
  </div>
{/if}
