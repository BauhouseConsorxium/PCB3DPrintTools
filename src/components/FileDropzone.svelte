<script>
  let { onfile, disabled = false } = $props()

  let dragging = $state(false)
  let inputEl

  function pickFile(file) {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (ext === 'step' || ext === 'stp') {
      onfile(file)
    }
  }

  function ondrop(e) {
    e.preventDefault()
    dragging = false
    pickFile(e.dataTransfer.files[0])
  }

  function ondragover(e) {
    e.preventDefault()
    dragging = true
  }

  function ondragleave() {
    dragging = false
  }

  function onchange(e) {
    pickFile(e.target.files[0])
    e.target.value = ''
  }
</script>

<div class="p-3 border-b border-[#2a2a48]">
  <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">STEP File</p>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="relative border-2 border-dashed rounded-lg p-4 text-center transition-all duration-150 cursor-pointer
      {dragging
      ? 'border-[#b87333] bg-[#b87333]/10'
      : 'border-[#2a2a48] hover:border-[#b87333]/60 hover:bg-[#20203a]'}
      {disabled ? 'opacity-50 pointer-events-none' : ''}"
    role="button"
    tabindex="0"
    {ondrop}
    {ondragover}
    {ondragleave}
    onclick={() => inputEl.click()}
    onkeydown={(e) => e.key === 'Enter' && inputEl.click()}
  >
    <input
      bind:this={inputEl}
      type="file"
      accept=".step,.stp"
      class="hidden"
      {onchange}
    />

    <div class="flex flex-col items-center gap-1.5 pointer-events-none">
      <svg class="w-8 h-8 text-[#b87333] opacity-80" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
      <p class="text-sm text-slate-300">Drop .step / .stp here</p>
      <p class="text-xs text-slate-500">or click to browse</p>
    </div>
  </div>
</div>
