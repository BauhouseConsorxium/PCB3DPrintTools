<script>
  let { activeTool = 'select', onToolChange = () => {} } = $props()

  const tools = [
    { id: 'select', label: 'Select', icon: 'pointer' },
    { id: 'pad', label: 'Pad', icon: 'pad' },
    { id: 'header', label: 'Header', icon: 'header' },
    { id: 'trace', label: 'Trace', icon: 'trace' },
    { id: 'jumper', label: 'Jumper', icon: 'jumper' },
    { id: 'erase', label: 'Erase', icon: 'erase' },
  ]
</script>

<div class="flex flex-col gap-1 mb-4">
  <div class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Tools</div>
  <div class="grid grid-cols-6 gap-1">
    {#each tools as tool}
      <button
        class="flex flex-col items-center gap-0.5 px-1 py-1.5 rounded text-[10px] transition-colors
          {activeTool === tool.id ? 'bg-slate-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'}"
        onclick={() => onToolChange(tool.id)}
        title={tool.label}
      >
        <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5">
          {#if tool.icon === 'pointer'}
            <path d="M5 3l10 7-5 1-2 5z" />
          {:else if tool.icon === 'pad'}
            <circle cx="10" cy="10" r="6" />
            <circle cx="10" cy="10" r="2.5" />
          {:else if tool.icon === 'header'}
            <circle cx="5" cy="10" r="3" />
            <circle cx="15" cy="10" r="3" />
          {:else if tool.icon === 'trace'}
            <path d="M4 16L4 8L16 8" stroke-linecap="round" stroke-linejoin="round" />
          {:else if tool.icon === 'jumper'}
            <circle cx="4" cy="16" r="2" />
            <path d="M4 16Q4 4 16 4" stroke-linecap="round" />
            <circle cx="16" cy="4" r="2" />
          {:else if tool.icon === 'erase'}
            <path d="M3 17h14M6 13l8-8M5 14l3-3M10 14l4-4" stroke-linecap="round" />
          {/if}
        </svg>
        <span>{tool.label}</span>
      </button>
    {/each}
  </div>
</div>
