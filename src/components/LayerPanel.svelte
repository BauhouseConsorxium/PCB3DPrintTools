<script>
  import { untrack } from 'svelte'

  let { bodies = [], visibility = {}, ontoggle, ontogglegroup } = $props()

  function isCopper(name) {
    const n = name.toLowerCase()
    return n.includes('copper') || n.includes('.cu') || n.includes('_cu')
  }

  const groups = $derived((() => {
    const copperBodies = bodies.filter(b => isCopper(b.name))
    const boardBodies  = bodies.filter(b => !isCopper(b.name))
    const result = []
    if (copperBodies.length) result.push({ id: 'copper', label: 'Copper', color: '#f5c842', bodies: copperBodies })
    if (boardBodies.length)  result.push({ id: 'board',  label: 'Board',  color: '#27ae60', bodies: boardBodies  })
    return result
  })())

  // Expand state per group — auto-collapses large groups on first load
  let expanded = $state({})
  $effect(() => {
    for (const g of groups) {
      untrack(() => {
        if (!(g.id in expanded)) {
          expanded = { ...expanded, [g.id]: false }
        }
      })
    }
  })

  function toggleExpanded(id) {
    expanded = { ...expanded, [id]: !expanded[id] }
  }

  function isVisible(name) { return visibility[name] !== false }

  function groupAnyVisible(g) { return g.bodies.some(b => isVisible(b.name)) }

  function handleGroupEye(g) {
    const show = !groupAnyVisible(g)
    ontogglegroup?.(g.bodies.map(b => b.name), show)
  }

  function totalTris(g) {
    return g.bodies.reduce((sum, b) => {
      return sum + (b.indices ? b.indices.length / 3 : 0)
    }, 0)
  }
</script>

{#if bodies.length > 0}
  <div class="border-b border-[#2a2a48]">
    <p class="px-3 pt-3 pb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Bodies</p>

    <div class="overflow-y-auto max-h-72">
      {#each groups as group (group.id)}
        <!-- Group header -->
        <div class="flex items-center gap-1 px-2 py-1 hover:bg-[#1a1a30] select-none">
          <!-- Collapse chevron -->
          <button
            onclick={() => toggleExpanded(group.id)}
            class="p-0.5 rounded text-slate-500 hover:text-slate-300 transition-colors shrink-0"
            aria-label={expanded[group.id] ? 'Collapse' : 'Expand'}
          >
            <svg
              class="w-3 h-3 transition-transform duration-150 {expanded[group.id] ? 'rotate-90' : ''}"
              fill="currentColor" viewBox="0 0 20 20"
            >
              <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
            </svg>
          </button>

          <!-- Group eye toggle -->
          <button
            onclick={() => handleGroupEye(group)}
            class="p-0.5 rounded hover:bg-[#2a2a48] shrink-0 transition-colors
              {groupAnyVisible(group) ? 'opacity-100' : 'opacity-30'}"
          >
            <svg class="w-3.5 h-3.5" style="color:{group.color}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              {#if groupAnyVisible(group)}
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              {:else}
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              {/if}
            </svg>
          </button>

          <!-- Color dot + label -->
          <span class="w-2 h-2 rounded-full shrink-0" style="background:{group.color}"></span>
          <span class="text-xs font-semibold text-slate-300 flex-1">{group.label}</span>

          <!-- Count + total tris -->
          <span class="text-[10px] text-slate-600 shrink-0">
            {group.bodies.length} &nbsp;{totalTris(group).toLocaleString()}▲
          </span>
        </div>

        <!-- Body items -->
        {#if expanded[group.id]}
          {#each group.bodies as body, i (i)}
            {@const visible = isVisible(body.name)}
            <button
              onclick={() => ontoggle(body.name)}
              class="w-full flex items-center gap-2 pl-7 pr-2 py-1 text-left
                transition-colors hover:bg-[#20203a]
                {visible ? 'opacity-100' : 'opacity-35'}"
            >
              <!-- Eye icon -->
              <svg class="w-3.5 h-3.5 shrink-0" style="color:{group.color}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                {#if visible}
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                {:else}
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                {/if}
              </svg>

              <!-- Name -->
              <span class="text-xs text-slate-400 truncate flex-1 min-w-0">{body.name}</span>

              <!-- Triangle count -->
              <span class="text-[10px] text-slate-600 shrink-0">
                {body.indices ? (body.indices.length / 3).toLocaleString() : '—'}▲
              </span>
            </button>
          {/each}
        {/if}
      {/each}
    </div>
  </div>
{/if}
