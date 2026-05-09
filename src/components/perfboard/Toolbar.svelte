<script>
  let { activeTool = 'select', onToolChange = () => {} } = $props()

  const tools = [
    { id: 'select', label: 'Select', icon: 'pointer', key: null },
    { id: 'pad', label: 'Pad', icon: 'pad', key: '1' },
    { id: 'header', label: 'Header', icon: 'header', key: '2' },
    { id: 'dip', label: 'DIP', icon: 'dip', key: '3' },
    { id: 'trace', label: 'Trace', icon: 'trace', key: '4' },
    { id: 'jumper', label: 'Jumper', icon: 'jumper', key: '5' },
    { id: 'label', label: 'Label', icon: 'label', key: '6' },
    { id: 'erase', label: 'Erase', icon: 'erase', key: '7' },
    { id: 'curve', label: 'Curve', icon: 'curve', key: '8' },
  ]
</script>

<div class="flex flex-col gap-1 mb-4">
  <div class="text-[10px] uppercase tracking-wider text-accent font-bold mb-1">Tools</div>
  <div class="grid grid-cols-4 gap-1">
    {#each tools as tool}
      <button
        class="relative flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-lg text-[10px] transition-all
          {activeTool === tool.id ? 'bg-accent text-white border-2 border-black shadow-[3px_3px_0_black]' : 'text-purple-light hover:bg-surface-2 hover:text-cyan border-2 border-transparent hover:border-black'}"
        onclick={() => onToolChange(tool.id)}
        title={tool.key ? `${tool.label} (${tool.key})` : tool.label}
      >
        {#if tool.key}
          <span class="absolute top-0.5 right-0.5 text-[8px] text-cyan/40 leading-none">{tool.key}</span>
        {/if}
        <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5">
          {#if tool.icon === 'pointer'}
            <path d="M5 3l10 7-5 1-2 5z" />
          {:else if tool.icon === 'pad'}
            <circle cx="10" cy="10" r="6" />
            <circle cx="10" cy="10" r="2.5" />
          {:else if tool.icon === 'header'}
            <circle cx="5" cy="10" r="3" />
            <circle cx="15" cy="10" r="3" />
          {:else if tool.icon === 'dip'}
            <rect x="6" y="2" width="8" height="16" rx="1" />
            <line x1="3" y1="5" x2="6" y2="5" />
            <line x1="3" y1="10" x2="6" y2="10" />
            <line x1="3" y1="15" x2="6" y2="15" />
            <line x1="14" y1="5" x2="17" y2="5" />
            <line x1="14" y1="10" x2="17" y2="10" />
            <line x1="14" y1="15" x2="17" y2="15" />
            <path d="M8.5 2 A1.5 1.5 0 0 0 11.5 2" fill="none" />
          {:else if tool.icon === 'trace'}
            <path d="M4 16L4 8L16 8" stroke-linecap="round" stroke-linejoin="round" />
          {:else if tool.icon === 'jumper'}
            <circle cx="4" cy="16" r="2" />
            <path d="M4 16Q4 4 16 4" stroke-linecap="round" />
            <circle cx="16" cy="4" r="2" />
          {:else if tool.icon === 'label'}
            <text x="10" y="15" font-size="13" font-weight="bold" text-anchor="middle" fill="currentColor" stroke="none">A</text>
          {:else if tool.icon === 'erase'}
            <path d="M3 17h14M6 13l8-8M5 14l3-3M10 14l4-4" stroke-linecap="round" />
          {:else if tool.icon === 'curve'}
            <path d="M3 16C3 8 10 12 10 8S17 4 17 8" stroke-linecap="round" fill="none" />
          {/if}
        </svg>
        <span>{tool.label}</span>
      </button>
    {/each}
  </div>
</div>
