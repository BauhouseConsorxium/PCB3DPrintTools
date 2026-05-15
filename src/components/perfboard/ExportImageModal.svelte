<script>
  import Modal from '../Modal.svelte'

  let {
    open = $bindable(false),
    svgEl = null,
    doc,
  } = $props();

  let mode = $state('standard'); // 'standard' | 'etching'
  let format = $state('png');
  let scale = $state(2);
  let showDimensions = $state(true);
  let showGridDots = $state(true);
  let showGridLines = $state(false);
  let showAnnotations = $state(true);
  let exporting = $state(false);

  // Etching mode forces SVG output and strips all non-conductive layers.
  const etching = $derived(mode === 'etching');
  $effect(() => {
    if (etching) format = 'svg';
  });

  const pitch = $derived(doc.grid.pitch);
  const cols = $derived(doc.grid.cols);
  const rows = $derived(doc.grid.rows);
  const margin = $derived(pitch / 2);
  const boardW = $derived((cols - 1) * pitch + 2 * margin);
  const boardH = $derived((rows - 1) * pitch + 2 * margin);
  const isCircle = $derived((doc.grid.shape ?? 'rect') === 'circle');

  // Prune everything except class="copper" subtrees (and their ancestors so
  // transforms still resolve), then force every surviving fill/stroke to
  // black. The mask reads as a clean positive: black where copper should
  // remain, white elsewhere.
  function flattenToEtchingMask(svg) {
    // 1. Drop all text — component labels, pin numbers — even inside copper.
    for (const tx of svg.querySelectorAll('text')) tx.remove();

    // 2. Find every .copper element. Mark it, all its descendants, and all
    //    its ancestors. This preserves the wrapper group AND its rendered
    //    contents (circles, paths) AND the parent <svg>/<g> chain.
    const keep = new WeakSet();
    keep.add(svg);
    for (const el of svg.querySelectorAll('.copper')) {
      keep.add(el);
      for (const d of el.querySelectorAll('*')) keep.add(d);
      let p = el.parentNode;
      while (p && p !== svg.parentNode) {
        keep.add(p);
        p = p.parentNode;
      }
    }

    // 3. Top-down prune. Anything not in `keep` is non-copper — drop it.
    //    Always preserve metadata (defs/style/title/desc) so referenced
    //    clip-paths and gradients still resolve.
    function prune(el) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'defs' || tag === 'style' || tag === 'title' || tag === 'desc') return;
      if (!keep.has(el)) {
        el.remove();
        return;
      }
      for (const child of [...el.children]) prune(child);
    }
    for (const child of [...svg.children]) prune(child);

    // 4. Force every surviving visible fill/stroke to pure black, except
    //    drill-hole circles (which carry the substrate color #1a1a2e in the
    //    source) — those become white so the drill punches through the pad
    //    in the resulting mask.
    const DRILL_FILL = '#1a1a2e';
    for (const el of svg.querySelectorAll('*')) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'style' || tag === 'defs' || tag === 'title' || tag === 'desc') continue;

      el.removeAttribute('opacity');
      el.removeAttribute('fill-opacity');
      el.removeAttribute('stroke-opacity');

      const fill = el.getAttribute('fill');
      const stroke = el.getAttribute('stroke');
      const isDrill = fill === DRILL_FILL;

      if (isDrill) {
        el.setAttribute('fill', '#fff');
      } else if (fill !== null && fill !== 'none') {
        el.setAttribute('fill', '#000');
      }
      if (stroke !== null && stroke !== 'none') el.setAttribute('stroke', '#000');

      if (el.style) {
        if (!isDrill) {
          if (el.style.fill && el.style.fill !== 'none') el.style.fill = '#000';
        }
        if (el.style.stroke && el.style.stroke !== 'none') el.style.stroke = '#000';
        el.style.opacity = '';
        el.style.fillOpacity = '';
        el.style.strokeOpacity = '';
        el.style.filter = '';
      }
    }
  }

  function buildExportSVG() {
    if (!svgEl) return null;
    const clone = svgEl.cloneNode(true);

    const dimOffset = (!etching && showDimensions) ? pitch * 2 : 0;
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

    for (const el of clone.querySelectorAll('.editor-interactive')) el.remove();

    if (etching) {
      // Strip all decorative / non-conductive layers
      for (const sel of ['.dimensions', '.grid-dots', '.grid-lines', '.annotations']) {
        for (const el of clone.querySelectorAll(sel)) el.remove();
      }
    } else {
      if (!showDimensions) for (const el of clone.querySelectorAll('.dimensions')) el.remove();
      if (!showGridDots) for (const el of clone.querySelectorAll('.grid-dots')) el.remove();
      if (!showGridLines) for (const el of clone.querySelectorAll('.grid-lines')) el.remove();
      if (!showAnnotations) for (const el of clone.querySelectorAll('.annotations')) el.remove();
    }

    // Etching needs the prune pass to run BEFORE the background rect is
    // added — otherwise the rect itself gets pruned out as non-copper.
    if (etching) flattenToEtchingMask(clone);

    const bgColor = etching ? '#ffffff' : '#0f0f1a';
    clone.style.background = bgColor;
    clone.insertBefore(
      (() => {
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const vb = clone.getAttribute('viewBox').split(' ').map(Number);
        bg.setAttribute('x', vb[0]);
        bg.setAttribute('y', vb[1]);
        bg.setAttribute('width', vb[2]);
        bg.setAttribute('height', vb[3]);
        bg.setAttribute('fill', bgColor);
        return bg;
      })(),
      clone.firstChild
    );

    return clone;
  }

  const previewSrc = $derived.by(() => {
    if (!open || !svgEl) return '';
    void mode;
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

  function baseName() {
    const stem = doc.name || 'perfboard';
    return etching ? `${stem}-etch` : stem;
  }

  function exportSVG() {
    const svg = buildExportSVG();
    if (!svg) return;
    const serializer = new XMLSerializer();
    const str = serializer.serializeToString(svg);
    const blob = new Blob([str], { type: 'image/svg+xml' });
    triggerDownload(blob, `${baseName()}.svg`);
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
        if (blob) triggerDownload(blob, `${baseName()}.png`);
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
      <div class="rounded-lg border border-border overflow-hidden {etching ? 'bg-white' : 'bg-surface-0'}">
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
    <!-- Mode -->
    <div>
      <div class="text-[10px] uppercase tracking-wider text-accent font-bold mb-1.5">Mode</div>
      <div class="grid grid-cols-2 gap-1">
        <button
          class="px-2 py-1.5 text-[11px] font-bold rounded-md border-2 transition-all flex flex-col items-center gap-0.5
            {!etching
              ? 'bg-accent text-white border-black shadow-[2px_2px_0_black]'
              : 'text-purple-light border-transparent hover:border-black hover:bg-surface-2'}"
          onclick={() => mode = 'standard'}
        >
          <span>Standard</span>
          <span class="text-[8px] font-normal opacity-70">full color · all layers</span>
        </button>
        <button
          class="px-2 py-1.5 text-[11px] font-bold rounded-md border-2 transition-all flex flex-col items-center gap-0.5
            {etching
              ? 'bg-white text-black border-black shadow-[2px_2px_0_black]'
              : 'text-purple-light border-transparent hover:border-black hover:bg-surface-2'}"
          onclick={() => mode = 'etching'}
        >
          <span>Etching</span>
          <span class="text-[8px] font-normal opacity-70">B&W mask · traces only · SVG</span>
        </button>
      </div>
    </div>

    <!-- Layers -->
    <div class:opacity-40={etching}>
      <div class="text-[10px] uppercase tracking-wider text-accent font-bold mb-1.5">Layers</div>
      <div class="grid grid-cols-2 gap-x-3 gap-y-1">
        <label class="flex items-center gap-1.5 text-xs text-purple-light {etching ? 'cursor-not-allowed' : 'cursor-pointer'}">
          <input type="checkbox" bind:checked={showDimensions} disabled={etching} class="accent-accent w-3.5 h-3.5" />
          Dimensions
        </label>
        <label class="flex items-center gap-1.5 text-xs text-purple-light {etching ? 'cursor-not-allowed' : 'cursor-pointer'}">
          <input type="checkbox" bind:checked={showGridDots} disabled={etching} class="accent-accent w-3.5 h-3.5" />
          Grid dots
        </label>
        <label class="flex items-center gap-1.5 text-xs text-purple-light {etching ? 'cursor-not-allowed' : 'cursor-pointer'}">
          <input type="checkbox" bind:checked={showGridLines} disabled={etching} class="accent-accent w-3.5 h-3.5" />
          Grid lines
        </label>
        <label class="flex items-center gap-1.5 text-xs text-purple-light {etching ? 'cursor-not-allowed' : 'cursor-pointer'}">
          <input type="checkbox" bind:checked={showAnnotations} disabled={etching} class="accent-accent w-3.5 h-3.5" />
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
                  : 'text-purple-light border-transparent hover:border-black hover:bg-surface-2'}
                {etching && f === 'png' ? 'opacity-30 cursor-not-allowed' : ''}"
              onclick={() => { if (!(etching && f === 'png')) format = f }}
              disabled={etching && f === 'png'}
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
      {exporting ? 'Exporting...' : etching ? 'Export Etching Mask (SVG)' : `Export ${format.toUpperCase()}`}
    </button>
  </div>
</Modal>
