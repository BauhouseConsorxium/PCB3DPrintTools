<script>
  import Modal from '../Modal.svelte'
  import { isEnclosure, isCopper, isPcbBoard } from '../../lib/viewer-predicates.js'

  let {
    open = $bindable(false),
    viewer = null,
    docName = 'perfboard',
    hasEnclosure = false,
  } = $props();

  let target = $state('full'); // 'full' | 'noEnclosure' | 'enclosure' | 'copper'
  let exporting = $state(false);

  // If user lands on the modal and there's no enclosure, force off enclosure-only.
  $effect(() => {
    if (open && !hasEnclosure && target === 'enclosure') target = 'full';
  });

  const PRESETS = {
    full: {
      label: 'Full',
      summary: 'Board, traces, pads — everything visible',
      filter: null,
      includeBoard: true,
      suffix: '',
    },
    noEnclosure: {
      label: 'Board Only',
      summary: 'Board + traces, no enclosure',
      filter: (name) => !isEnclosure(name),
      includeBoard: true,
      suffix: '-board',
    },
    enclosure: {
      label: 'Enclosure Only',
      summary: 'Just the enclosure shell',
      filter: (name) => isEnclosure(name),
      includeBoard: false,
      suffix: '-enclosure',
    },
    copper: {
      label: 'Copper Only',
      summary: 'Raised traces + pads, no substrate',
      filter: (name) => isCopper(name) && !isPcbBoard(name),
      includeBoard: false,
      suffix: '-copper',
    },
  };

  const preset = $derived(PRESETS[target]);

  function timestamp() {
    return new Date().toISOString().replace(/[:-]/g, '').slice(0, 15);
  }

  function doExport() {
    if (!viewer || exporting) return;
    exporting = true;
    const fn = `${docName || 'perfboard'}_${timestamp()}${preset.suffix}.stl`;
    try {
      viewer.exportSTL(preset.filter, fn, preset.includeBoard);
    } finally {
      // exportSTL is async but doesn't return a promise — clear flag next tick.
      setTimeout(() => { exporting = false; open = false; }, 250);
    }
  }
</script>

<Modal
  bind:open
  title="Export 3D Model (STL)"
  width="w-[460px]"
  maxHeight="max-h-[88vh]"
  panelClass="bg-surface-1 border-2 border-black rounded-xl shadow-[6px_6px_0_black]"
  headerClass="border-b border-border"
>
  <!-- Controls -->
  <div class="px-4 py-4 space-y-3">
    <!-- Target -->
    <div>
      <div class="text-[10px] uppercase tracking-wider text-accent font-bold mb-1.5">Target</div>
      <div class="grid grid-cols-2 gap-1">
        {#each Object.entries(PRESETS) as [key, p]}
          {@const isDisabled = key === 'enclosure' && !hasEnclosure}
          <button
            class="px-2 py-1.5 text-[11px] font-bold rounded-md border-2 transition-all flex flex-col items-center gap-0.5 text-center
              {target === key
                ? 'bg-accent text-white border-black shadow-[2px_2px_0_black]'
                : 'text-purple-light border-transparent hover:border-black hover:bg-surface-2'}
              {isDisabled ? 'opacity-30 cursor-not-allowed' : ''}"
            onclick={() => { if (!isDisabled) target = key }}
            disabled={isDisabled}
            title={isDisabled ? 'No enclosure enabled in board settings' : p.summary}
          >
            <span>{p.label}</span>
            <span class="text-[8px] font-normal opacity-70 leading-tight">{p.summary}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Filename hint -->
    <div class="flex items-center justify-between text-[10px] text-purple-light/55 px-1">
      <span class="uppercase tracking-wider font-semibold">Filename</span>
      <span class="font-mono truncate ml-2 text-cyan-light/70">{docName || 'perfboard'}_{timestamp()}{preset.suffix}.stl</span>
    </div>
  </div>

  <!-- Footer -->
  <div class="px-4 py-3 border-t border-border">
    <button
      class="w-full px-3 py-2 text-xs font-bold rounded-lg bg-accent hover:bg-accent-light text-white border-2 border-black shadow-[4px_4px_0_black] transition-all hover:shadow-[5px_5px_0_black] hover:-translate-x-px hover:-translate-y-px active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_black] disabled:opacity-50 disabled:cursor-not-allowed"
      onclick={doExport}
      disabled={exporting}
    >
      {exporting ? 'Exporting...' : `Export ${preset.label} STL`}
    </button>
  </div>
</Modal>
