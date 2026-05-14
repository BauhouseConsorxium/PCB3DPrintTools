<script>
  let {
    open = $bindable(false),
    title = '',
    width = 'w-[420px]',
    maxHeight = 'max-h-[80vh]',
    panelClass = 'bg-[#111120] border border-[#2a2a48] rounded-lg shadow-2xl',
    headerClass = 'border-b border-[#2a2a48]',
    children,
  } = $props()

  function onkeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      open = false
    }
  }
</script>

{#if open}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center"
  onkeydown={onkeydown}
>
  <div
    class="absolute inset-0 bg-black/60 backdrop-blur-sm"
    onclick={() => open = false}
    role="presentation"
  ></div>

  <div class="relative {panelClass} {width} {maxHeight} flex flex-col">
    {#if title}
      <div class="flex items-center justify-between px-4 py-3 {headerClass}">
        <span class="text-sm font-semibold text-slate-100">{title}</span>
        <button
          onclick={() => open = false}
          class="text-slate-500 hover:text-slate-300 transition-colors"
          title="Close"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    {/if}

    {@render children()}
  </div>
</div>
{/if}
