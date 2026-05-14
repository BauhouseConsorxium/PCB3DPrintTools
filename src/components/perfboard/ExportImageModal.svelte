<script>
  import Modal from '../Modal.svelte'

  let {
    open = $bindable(false),
    svgEl = null,
    doc,
  } = $props();

  let format = $state('png');
  let scale = $state(2);
  let showDimensions = $state(true);
  let showGridDots = $state(true);
  let showGridLines = $state(false);
  let showAnnotations = $state(true);
  let exporting = $state(false);

  const pitch = $derived(doc.grid.pitch);
  const cols = $derived(doc.grid.cols);
  const rows = $derived(doc.grid.rows);
  const margin = $derived(pitch / 2);
  const boardW = $derived((cols - 1) * pitch + 2 * margin);
  const boardH = $derived((rows - 1) * pitch + 2 * margin);
  const isCircle = $derived((doc.grid.shape ?? 'rect') === 'circle');

  function buildExportSVG() {
    if (!svgEl) return null;
    const clone = svgEl.cloneNode(true);

    const dimOffset = showDimensions ? pitch * 2 : 0;
    const pad = pitch * 0.5;
    if (isCircle) {
      const cx = (cols - 1) * pitch / 2;
      const cy = (rows - 1) * pitch / 2;
      const r = Math.min(cols - 1, rows - 1) * pitch / 2 + margin;
      clone.setAttribute('viewBox',
        `${cx - r - dimOffset - pad} ${cy - r - dimOffset - pad} ${r * 2 + dimOffset + pad * 2} ${r * 2 + dimOffset + pad * 2}`);
    } else {
      clone.setAttribute('viewBox',
        `${-margin - dimOffset - pad} ${-margin - dimOffset - pad} ${boardW + dimOffset + pad * 2} ${boardH + dimOffset + pad * 2}`);
    }

    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.removeAttribute('class');

    for (const el of clone.querySelectorAll('.editor-interactive')) {
      el.remove();
    }

    if (!showDimensions) {
      for (const el of clone.querySelectorAll('.dimensions')) el.remove();
    }
    if (!showGridDots) {
      for (const el of clone.querySelectorAll('.grid-dots')) el.remove();
    }
    if (!showGridLines) {
      for (const el of clone.querySelectorAll('.grid-lines')) el.remove();
    }
    if (!showAnnotations) {
      for (const el of clone.querySelectorAll('.annotations')) el.remove();
    }

    clone.style.background = '#0f0f1a';
    clone.insertBefore(
      (() => {
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const vb = clone.getAttribute('viewBox').split(' ').map(Number);
        bg.setAttribute('x', vb[0]);
        bg.setAttribute('y', vb[1]);
        bg.setAttribute('width', vb[2]);
        bg.setAttribute('height', vb[3]);
        bg.setAttribute('fill', '#0f0f1a');
        return bg;
      })(),
      clone.firstChild
    );

    return clone;
  }

  const previewSrc = $derived.by(() => {
    if (!open || !svgEl) return '';
    void showDimensions;
    void showGridDots;
    void showGridLines;
    void showAnnotations;
    const svg = buildExportSVG();
    if (!svg) return '';
    const serializer = new XMLSerializer();
    const str = serializer.serializeToString(svg);
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
  });

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportSVG() {
    const svg = buildExportSVG();
    if (!svg) return;
    const serializer = new XMLSerializer();
    const str = serializer.serializeToString(svg);
    const blob = new Blob([str], { type: 'image/svg+xml' });
    triggerDownload(blob, `${doc.name || 'perfboard'}.svg`);
  }

  function exportPNG() {
    const svg = buildExportSVG();
    if (!svg) return;
    exporting = true;

    const vb = svg.getAttribute('viewBox').split(' ').map(Number);
    const baseW = vb[2];
    const baseH = vb[3];
    const pxPerMM = 40;
    const imgW = Math.round(baseW * pxPerMM * scale);
    const imgH = Math.round(baseH * pxPerMM * scale);

    svg.setAttribute('width', imgW);
    svg.setAttribute('height', imgH);

    const serializer = new XMLSerializer();
    const str = serializer.serializeToString(svg);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = imgW;
      canvas.height = imgH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, imgW, imgH);
      canvas.toBlob((blob) => {
        if (blob) triggerDownload(blob, `${doc.name || 'perfboard'}.png`);
        exporting = false;
      }, 'image/png');
    };
    img.onerror = () => { exporting = false; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
  }

  function doExport() {
    if (format === 'svg') exportSVG();
    else exportPNG();
  }

  const scales = [1, 2, 4];
</script>

<Modal
  bind:open
  title="Export 2D Image"
  maxHeight="max-h-[85vh]"
  panelClass="bg-surface-1 border-2 border-black rounded-xl shadow-[6px_6px_0_black]"
  headerClass="border-b border-border"
>
  <!-- Preview -->
  <div class="px-4 pt-3">
    {#if previewSrc}
      <div class="rounded-lg border border-border overflow-hidden bg-surface-0">
        <img
          src={previewSrc}
          alt="Export preview"
          class="w-full max-h-[35vh] object-contain"
        />
      </div>
    {:else}
      <div class="rounded-lg border border-border bg-surface-0 h-32 flex items-center justify-center text-slate-500 text-xs">
        No preview available
      </div>
    {/if}
  </div>

  <!-- Controls -->
  <div class="px-4 py-3 space-y-3">
    <!-- Layers -->
    <div>
      <div class="text-[10px] uppercase tracking-wider text-accent font-bold mb-1.5">Layers</div>
      <div class="grid grid-cols-2 gap-x-3 gap-y-1">
        <label class="flex items-center gap-1.5 text-xs text-purple-light cursor-pointer">
          <input type="checkbox" bind:checked={showDimensions} class="accent-accent w-3.5 h-3.5" />
          Dimensions
        </label>
        <label class="flex items-center gap-1.5 text-xs text-purple-light cursor-pointer">
          <input type="checkbox" bind:checked={showGridDots} class="accent-accent w-3.5 h-3.5" />
          Grid dots
        </label>
        <label class="flex items-center gap-1.5 text-xs text-purple-light cursor-pointer">
          <input type="checkbox" bind:checked={showGridLines} class="accent-accent w-3.5 h-3.5" />
          Grid lines
        </label>
        <label class="flex items-center gap-1.5 text-xs text-purple-light cursor-pointer">
          <input type="checkbox" bind:checked={showAnnotations} class="accent-accent w-3.5 h-3.5" />
          Annotations
        </label>
      </div>
    </div>

    <!-- Format & Scale -->
    <div class="flex gap-4">
      <div>
        <div class="text-[10px] uppercase tracking-wider text-accent font-bold mb-1.5">Format</div>
        <div class="flex gap-1">
          {#each ['png', 'svg'] as f}
            <button
              class="px-3 py-1 text-xs font-bold rounded-md border-2 transition-all
                {format === f
                  ? 'bg-accent text-white border-black shadow-[2px_2px_0_black]'
                  : 'text-purple-light border-transparent hover:border-black hover:bg-surface-2'}"
              onclick={() => format = f}
            >{f.toUpperCase()}</button>
          {/each}
        </div>
      </div>

      <div class:opacity-40={format === 'svg'}>
        <div class="text-[10px] uppercase tracking-wider text-accent font-bold mb-1.5">Scale</div>
        <div class="flex gap-1">
          {#each scales as s}
            <button
              class="px-2.5 py-1 text-xs font-bold rounded-md border-2 transition-all
                {scale === s && format === 'png'
                  ? 'bg-cyan text-surface-0 border-black shadow-[2px_2px_0_black]'
                  : 'text-purple-light border-transparent hover:border-black hover:bg-surface-2'}"
              onclick={() => { if (format === 'png') scale = s }}
              disabled={format === 'svg'}
            >{s}x</button>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="px-4 py-3 border-t border-border">
    <button
      class="w-full px-3 py-2 text-xs font-bold rounded-lg bg-accent hover:bg-accent-light text-white border-2 border-black shadow-[4px_4px_0_black] transition-all hover:shadow-[5px_5px_0_black] hover:-translate-x-px hover:-translate-y-px active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_black] disabled:opacity-50 disabled:cursor-not-allowed"
      onclick={doExport}
      disabled={exporting}
    >
      {exporting ? 'Exporting...' : `Export ${format.toUpperCase()}`}
    </button>
  </div>
</Modal>
