<script>
  import { untrack } from "svelte";
  import Viewer3D from "./components/Viewer3D.svelte";
  import Toolbar from "./components/perfboard/Toolbar.svelte";
  import BoardSettings from "./components/perfboard/BoardSettings.svelte";
  import PerfboardExportPanel from "./components/perfboard/PerfboardExportPanel.svelte";
  import GridEditor from "./components/perfboard/GridEditor.svelte";
  import {
    buildPerfboardBodies,
    createDefaultDocument,
  } from "./lib/perfboard-geometry.js";

  let viewer;
  let showIntro = $state(!localStorage.getItem("perfboard-intro-seen"));
  let activeTab = $state("editor");
  let activeTool = $state("select");
  let selectedIds = $state([]);
  let zScale = $state(8);
  let boardZScale = $state(1);
  let annotationText = $state("VCC");
  let annotationColor = $state("#ff2d95");

  let doc = $state(createDefaultDocument());

  // Undo/redo
  const MAX_UNDO = 50;
  let undoStack = $state([]);
  let redoStack = $state([]);

  function cloneDoc() {
    return JSON.parse(JSON.stringify(doc));
  }

  function pushUndo() {
    const snapshot = cloneDoc();
    if (
      undoStack.length > 0 &&
      JSON.stringify(undoStack[undoStack.length - 1]) ===
        JSON.stringify(snapshot)
    ) {
      return;
    }
    undoStack = [...undoStack.slice(-(MAX_UNDO - 1)), snapshot];
    redoStack = [];
  }

  function undo() {
    const current = cloneDoc();
    const currentStr = JSON.stringify(current);
    while (undoStack.length > 0) {
      const prev = undoStack[undoStack.length - 1];
      undoStack = undoStack.slice(0, -1);
      if (JSON.stringify(prev) !== currentStr) {
        redoStack = [...redoStack, current];
        doc = prev;
        selectedIds = [];
        return;
      }
    }
  }

  function redo() {
    const current = cloneDoc();
    const currentStr = JSON.stringify(current);
    while (redoStack.length > 0) {
      const next = redoStack[redoStack.length - 1];
      redoStack = redoStack.slice(0, -1);
      if (JSON.stringify(next) !== currentStr) {
        undoStack = [...undoStack, current];
        doc = next;
        selectedIds = [];
        return;
      }
    }
  }

  let cols = $derived(doc.grid.cols);
  let rows = $derived(doc.grid.rows);

  const perfboardBodies = $derived(buildPerfboardBodies(doc));
  const bodyVisibility = $derived(
    Object.fromEntries(perfboardBodies.map((b) => [b.name, true])),
  );

  function setGridCols(v) {
    doc.grid.cols = Math.max(2, Math.min(40, Number(v) || 2));
  }
  function setGridRows(v) {
    doc.grid.rows = Math.max(2, Math.min(40, Number(v) || 2));
  }

  function addPad(col, row) {
    pushUndo();
    const exists = doc.pads.find((p) => p.col === col && p.row === row);
    if (exists) {
      doc.pads = doc.pads.filter((p) => p.id !== exists.id);
      return;
    }
    doc.pads = [...doc.pads, { id: crypto.randomUUID(), col, row }];
  }

  function addHeader(col, row, count, orientation) {
    pushUndo();
    doc.headers = [
      ...doc.headers,
      { id: crypto.randomUUID(), col, row, count, orientation },
    ];
  }

  function addDip(col, row, count, orientation) {
    pushUndo();
    doc.dips = [
      ...(doc.dips || []),
      { id: crypto.randomUUID(), col, row, count, orientation, rowSpacing: 3 },
    ];
  }

  function addTrace(points, type) {
    if (points.length < 2) return;
    pushUndo();
    const trace = { id: crypto.randomUUID(), points, width: doc.traceWidth };
    if (type) trace.type = type;
    if (type === "curve") {
      trace.endWidth = doc.curveEndWidth ?? doc.traceWidth;
      trace.endWidth2 = doc.curveEndWidth2 ?? trace.endWidth;
      trace.taperDistance = doc.curveTaperDistance ?? 0;
      trace.tension = 0.5;
    }
    if (type === "roundtrace") {
      trace.radius = doc.roundTraceRadius ?? 1.0;
      trace.mode = doc.roundTraceMode ?? "arc";
      trace.passes = doc.roundTracePasses ?? 2;
      trace.teardrop = doc.roundTraceTeardrop ?? false;
      trace.tdHPercent = doc.roundTraceTdHPercent ?? 50;
      trace.tdVPercent = doc.roundTraceTdVPercent ?? 90;
    }
    doc.traces = [...doc.traces, trace];
  }

  const WIRE_COLORS = [
    "#ff2d95",
    "#ff6bcb",
    "#00f0ff",
    "#7df9ff",
    "#a855f7",
    "#c084fc",
    "#a3e635",
    "#fbbf24",
    "#f0f0f0",
    "#84cc16",
  ];

  function addJumper(col1, row1, col2, row2) {
    pushUndo();
    const color = WIRE_COLORS[Math.floor(Math.random() * WIRE_COLORS.length)];
    doc.jumpers = [
      ...doc.jumpers,
      { id: crypto.randomUUID(), col1, row1, col2, row2, color },
    ];
  }

  function updateJumperColor(id, color) {
    pushUndo();
    const j = doc.jumpers.find((j) => j.id === id);
    if (j) {
      j.color = color;
      doc.jumpers = [...doc.jumpers];
    }
  }

  function updateHeaderLabels(id, labels) {
    pushUndo();
    const header = doc.headers.find((h) => h.id === id);
    if (header) {
      header.labels = labels;
      doc.headers = [...doc.headers];
    }
  }

  function updatePadLabel(id, label) {
    pushUndo();
    const pad = doc.pads.find((p) => p.id === id);
    if (pad) {
      pad.label = label;
      doc.pads = [...doc.pads];
    }
  }

  function updateDip(id, label, socket) {
    pushUndo();
    const dip = (doc.dips || []).find((d) => d.id === id);
    if (dip) {
      dip.label = label;
      dip.socket = socket;
      doc.dips = [...(doc.dips || [])];
    }
  }

  function updateTraceWidth(id, width) {
    pushUndo();
    const trace = doc.traces.find((t) => t.id === id);
    if (trace) {
      trace.width = width;
      doc.traces = [...doc.traces];
    }
  }

  function updateCurve(
    id,
    width,
    endWidth,
    taperDistance,
    tension,
    endWidth2,
    freeform,
  ) {
    pushUndo();
    const trace = doc.traces.find((t) => t.id === id);
    if (trace) {
      trace.width = width;
      trace.endWidth = endWidth;
      trace.endWidth2 = endWidth2 ?? endWidth;
      trace.taperDistance = taperDistance;
      trace.tension = tension;
      trace.freeform = !!freeform;
      doc.traces = [...doc.traces];
    }
  }

  function moveControlPoint(traceId, pointIndex, dc, dr) {
    pushUndo();
    const trace = doc.traces.find((t) => t.id === traceId);
    if (trace && trace.points[pointIndex]) {
      trace.points[pointIndex].col += dc;
      trace.points[pointIndex].row += dr;
      doc.traces = [...doc.traces];
    }
  }

  function moveJumperEndpoint(jumperId, endpoint, dc, dr) {
    pushUndo();
    const j = doc.jumpers.find((j) => j.id === jumperId);
    if (!j) return;
    if (endpoint === 1) {
      j.col1 += dc;
      j.row1 += dr;
    } else {
      j.col2 += dc;
      j.row2 += dr;
    }
    doc.jumpers = [...doc.jumpers];
  }

  function deleteControlPoint(traceId, pointIndex) {
    const trace = doc.traces.find((t) => t.id === traceId);
    if (!trace || trace.points.length <= 2) return;
    pushUndo();
    trace.points = trace.points.filter((_, i) => i !== pointIndex);
    doc.traces = [...doc.traces];
  }

  function subdivideCurve(traceId) {
    const trace = doc.traces.find((t) => t.id === traceId);
    if (!trace || trace.points.length < 2) return;
    pushUndo();
    const newPoints = [trace.points[0]];
    for (let i = 0; i < trace.points.length - 1; i++) {
      const a = trace.points[i],
        b = trace.points[i + 1];
      newPoints.push({
        col: (a.col + b.col) / 2,
        row: (a.row + b.row) / 2,
      });
      newPoints.push(b);
    }
    trace.points = newPoints;
    doc.traces = [...doc.traces];
  }

  function meltTraces(ids) {
    const targets = doc.traces.filter(
      (t) => ids.includes(t.id) && t.type !== "curve",
    );
    if (targets.length === 0) return;
    pushUndo();
    for (const trace of targets) {
      trace.type = "curve";
      trace.endWidth = trace.endWidth ?? doc.curveEndWidth ?? doc.traceWidth;
      trace.endWidth2 = trace.endWidth2 ?? trace.endWidth;
      trace.taperDistance = trace.taperDistance ?? doc.curveTaperDistance ?? 0;
      trace.tension = trace.tension ?? 0.5;
    }
    doc.traces = [...doc.traces];
  }

  function roundTraces(ids) {
    const targets = doc.traces.filter(
      (t) => ids.includes(t.id) && t.type !== "roundtrace",
    );
    if (targets.length === 0) return;
    pushUndo();
    for (const trace of targets) {
      trace.type = "roundtrace";
      trace.radius = trace.radius ?? doc.roundTraceRadius ?? 1.0;
      trace.mode = trace.mode ?? doc.roundTraceMode ?? "arc";
      trace.passes = trace.passes ?? doc.roundTracePasses ?? 2;
      trace.teardrop = trace.teardrop ?? doc.roundTraceTeardrop ?? false;
      trace.tdHPercent = trace.tdHPercent ?? doc.roundTraceTdHPercent ?? 50;
      trace.tdVPercent = trace.tdVPercent ?? doc.roundTraceTdVPercent ?? 90;
    }
    doc.traces = [...doc.traces];
  }

  function updateRoundTrace(
    id,
    width,
    radius,
    mode,
    passes,
    teardrop,
    tdHPercent,
    tdVPercent,
  ) {
    pushUndo();
    const trace = doc.traces.find((t) => t.id === id);
    if (trace) {
      trace.width = width;
      trace.radius = radius;
      trace.mode = mode;
      trace.passes = passes;
      trace.teardrop = teardrop;
      trace.tdHPercent = tdHPercent;
      trace.tdVPercent = tdVPercent;
      doc.traces = [...doc.traces];
    }
  }

  function addAnnotation(col, row) {
    pushUndo();
    doc.annotations = [
      ...doc.annotations,
      {
        id: crypto.randomUUID(),
        col,
        row,
        text: annotationText,
        color: annotationColor,
      },
    ];
  }

  function updateAnnotation(id, text, color) {
    pushUndo();
    if (!text.trim()) {
      doc.annotations = doc.annotations.filter((a) => a.id !== id);
      selectedIds = selectedIds.filter((sid) => sid !== id);
      return;
    }
    const ann = doc.annotations.find((a) => a.id === id);
    if (ann) {
      ann.text = text;
      if (color) ann.color = color;
      doc.annotations = [...doc.annotations];
    }
  }

  function moveSelected(dc, dr) {
    if (selectedIds.length === 0) return;
    pushUndo();
    for (const id of selectedIds) {
      const pad = doc.pads.find((p) => p.id === id);
      if (pad) {
        pad.col += dc;
        pad.row += dr;
        continue;
      }
      const header = doc.headers.find((h) => h.id === id);
      if (header) {
        header.col += dc;
        header.row += dr;
        continue;
      }
      const trace = doc.traces.find((t) => t.id === id);
      if (trace) {
        for (const pt of trace.points) {
          pt.col += dc;
          pt.row += dr;
        }
        continue;
      }
      const dip = (doc.dips || []).find((d) => d.id === id);
      if (dip) {
        dip.col += dc;
        dip.row += dr;
        continue;
      }
      const jumper = doc.jumpers.find((j) => j.id === id);
      if (jumper) {
        jumper.col1 += dc;
        jumper.row1 += dr;
        jumper.col2 += dc;
        jumper.row2 += dr;
        continue;
      }
      const ann = doc.annotations.find((a) => a.id === id);
      if (ann) {
        ann.col += dc;
        ann.row += dr;
        continue;
      }
    }
    doc.pads = [...doc.pads];
    doc.headers = [...doc.headers];
    doc.dips = [...(doc.dips || [])];
    doc.traces = [...doc.traces];
    doc.jumpers = [...doc.jumpers];
    doc.annotations = [...doc.annotations];
  }

  function rotateSelected() {
    if (selectedIds.length === 0) return;
    pushUndo();
    for (const id of selectedIds) {
      const header = doc.headers.find((h) => h.id === id);
      if (header) {
        header.orientation = header.orientation === "h" ? "v" : "h";
        continue;
      }
      const dip = (doc.dips || []).find((d) => d.id === id);
      if (dip) {
        dip.orientation = dip.orientation === "h" ? "v" : "h";
        continue;
      }
      const trace = doc.traces.find((t) => t.id === id);
      if (trace && trace.points.length >= 2) {
        const pivot = trace.points[0];
        for (let i = 1; i < trace.points.length; i++) {
          const dc = trace.points[i].col - pivot.col;
          const dr = trace.points[i].row - pivot.row;
          trace.points[i].col = pivot.col + dr;
          trace.points[i].row = pivot.row - dc;
        }
        continue;
      }
      const jumper = doc.jumpers.find((j) => j.id === id);
      if (jumper) {
        const mc = (jumper.col1 + jumper.col2) / 2;
        const mr = (jumper.row1 + jumper.row2) / 2;
        const dc1 = jumper.col1 - mc,
          dr1 = jumper.row1 - mr;
        const dc2 = jumper.col2 - mc,
          dr2 = jumper.row2 - mr;
        jumper.col1 = mc + dr1;
        jumper.row1 = mr - dc1;
        jumper.col2 = mc + dr2;
        jumper.row2 = mr - dc2;
        continue;
      }
    }
    doc.headers = [...doc.headers];
    doc.dips = [...(doc.dips || [])];
    doc.traces = [...doc.traces];
    doc.jumpers = [...doc.jumpers];
  }

  function removeElement(id) {
    pushUndo();
    doc.pads = doc.pads.filter((p) => p.id !== id);
    doc.headers = doc.headers.filter((h) => h.id !== id);
    doc.dips = (doc.dips || []).filter((d) => d.id !== id);
    doc.traces = doc.traces.filter((t) => t.id !== id);
    doc.jumpers = doc.jumpers.filter((j) => j.id !== id);
    doc.annotations = doc.annotations.filter((a) => a.id !== id);
    selectedIds = selectedIds.filter((sid) => sid !== id);
  }

  function selectElement(id, addToSelection = false) {
    if (id == null) {
      if (!addToSelection) selectedIds = [];
      return;
    }
    if (addToSelection) {
      if (selectedIds.includes(id)) {
        selectedIds = selectedIds.filter((sid) => sid !== id);
      } else {
        selectedIds = [...selectedIds, id];
      }
    } else {
      selectedIds = [id];
    }
  }

  function bulkSelect(ids, addToSelection = false) {
    if (addToSelection) {
      const current = new Set(selectedIds);
      for (const id of ids) current.add(id);
      selectedIds = [...current];
    } else {
      selectedIds = [...ids];
    }
  }

  function handleExport() {
    if (!viewer) return;
    const ts = new Date().toISOString().replace(/[:-]/g, "").slice(0, 15);
    viewer.exportSTL(null, `${doc.name}_perfboard_${ts}.stl`);
  }

  // Save/load
  const STORAGE_KEY = "perfboard-saves";

  function getSaves() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveToSlot() {
    const saves = getSaves();
    const entry = {
      name: doc.name,
      doc: JSON.parse(JSON.stringify(doc)),
      savedAt: new Date().toISOString(),
    };
    const idx = saves.findIndex((s) => s.name === doc.name);
    if (idx >= 0) saves[idx] = entry;
    else saves.unshift(entry);
    if (saves.length > 5) saves.length = 5;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
    lastSavedDoc = JSON.stringify(doc);
    saveMessage = `Saved "${doc.name}"`;
    setTimeout(() => (saveMessage = ""), 2500);
  }

  function loadFromSlot(entry) {
    confirmThenLoad(() => applyParsedDoc(entry.doc));
  }

  function deleteSlot(name) {
    const saves = getSaves().filter((s) => s.name !== name);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
  }

  function downloadJSON() {
    const blob = new Blob([JSON.stringify(doc, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.name}.perfboard.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function applyParsedDoc(parsed) {
    pushUndo();
    parsed.dips = parsed.dips ?? [];
    parsed.jumpers = parsed.jumpers ?? [];
    parsed.annotations = parsed.annotations ?? [];
    parsed.curveEndWidth = parsed.curveEndWidth ?? 3.0;
    parsed.curveEndWidth2 = parsed.curveEndWidth2 ?? parsed.curveEndWidth;
    parsed.curveTaperDistance = parsed.curveTaperDistance ?? 0;
    parsed.roundTraceRadius = parsed.roundTraceRadius ?? 1.0;
    parsed.roundTraceMode = parsed.roundTraceMode ?? "arc";
    parsed.roundTracePasses = parsed.roundTracePasses ?? 2;
    parsed.roundTraceTeardrop = parsed.roundTraceTeardrop ?? false;
    parsed.roundTraceTdHPercent = parsed.roundTraceTdHPercent ?? 50;
    parsed.roundTraceTdVPercent = parsed.roundTraceTdVPercent ?? 90;
    doc = parsed;
    selectedIds = [];
    lastSavedDoc = JSON.stringify(doc);
    saveMessage = `Loaded "${parsed.name}"`;
    setTimeout(() => (saveMessage = ""), 2500);
  }

  function uploadJSON(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (parsed.version !== 1 || !parsed.grid) {
          alert("Invalid perfboard file");
          return;
        }
        confirmThenLoad(() => applyParsedDoc(parsed));
      } catch {
        alert("Failed to parse file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  let saveMessage = $state("");
  let showSavePanel = $state(false);
  let savedSlots = $derived(getSaves());

  let lastSavedDoc = $state(JSON.stringify(doc));
  let pendingLoadAction = $state(null);

  function isDirty() {
    return JSON.stringify(doc) !== lastSavedDoc;
  }

  function confirmThenLoad(action) {
    if (isDirty()) {
      pendingLoadAction = action;
    } else {
      action();
    }
  }

  async function loadExample(name) {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}examples/${name}`);
      const parsed = await res.json();
      if (parsed.version !== 1 || !parsed.grid) {
        alert("Invalid example file");
        return;
      }
      confirmThenLoad(() => applyParsedDoc(parsed));
    } catch {
      alert("Failed to load example");
    }
  }

  function handleKeydown(e) {
    const isInput =
      e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA";
    const mod = e.metaKey || e.ctrlKey;
    if (!isInput && mod && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (!isInput && mod && ((e.key === "z" && e.shiftKey) || e.key === "y")) {
      e.preventDefault();
      redo();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (!isInput && selectedIds.length > 0 && activeTool === "select") {
        pushUndo();
        const idSet = new Set(selectedIds);
        doc.pads = doc.pads.filter((p) => !idSet.has(p.id));
        doc.headers = doc.headers.filter((h) => !idSet.has(h.id));
        doc.dips = (doc.dips || []).filter((d) => !idSet.has(d.id));
        doc.traces = doc.traces.filter((t) => !idSet.has(t.id));
        doc.jumpers = doc.jumpers.filter((j) => !idSet.has(j.id));
        doc.annotations = doc.annotations.filter((a) => !idSet.has(a.id));
        selectedIds = [];
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="h-screen flex flex-col bg-surface-0 text-cyan-light overflow-hidden"
>
  <!-- Header -->
  <div
    class="h-11 flex items-center px-4 bg-surface-1 border-b-3 border-black shrink-0"
  >
    <div class="flex items-center gap-2">
      <svg
        viewBox="0 0 20 20"
        class="w-5 h-5 text-accent"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <rect x="2" y="2" width="16" height="16" rx="1" />
        <circle cx="6" cy="6" r="1.5" />
        <circle cx="10" cy="6" r="1.5" />
        <circle cx="14" cy="6" r="1.5" />
        <circle cx="6" cy="10" r="1.5" />
        <circle cx="14" cy="10" r="1.5" />
        <circle cx="6" cy="14" r="1.5" />
        <circle cx="10" cy="14" r="1.5" />
        <circle cx="14" cy="14" r="1.5" />
      </svg>
      <span class="text-sm font-semibold text-cyan-light"
        >Perfboard 3D Print Tools</span
      >
    </div>
    <div class="ml-4 flex items-center gap-2">
      <input
        type="text"
        bind:value={doc.name}
        onfocus={pushUndo}
        class="bg-surface-2 text-xs text-cyan-light rounded-lg px-2 py-0.5 border-2 border-black focus:border-accent outline-none w-32 shadow-[2px_2px_0_black]"
        placeholder="Project name"
      />
      <div class="flex items-center gap-0.5 ml-2">
        <button
          onclick={undo}
          disabled={undoStack.length === 0}
          class="p-1 rounded-lg text-purple-light hover:text-cyan hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-purple-light"
          title="Undo (Ctrl+Z)"
        >
          <svg
            viewBox="0 0 16 16"
            class="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 7h7a3 3 0 0 1 0 6H8" />
            <path d="M6 4L3 7l3 3" />
          </svg>
        </button>
        <button
          onclick={redo}
          disabled={redoStack.length === 0}
          class="p-1 rounded-lg text-purple-light hover:text-cyan hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-purple-light"
          title="Redo (Ctrl+Shift+Z)"
        >
          <svg
            viewBox="0 0 16 16"
            class="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M13 7H6a3 3 0 0 0 0 6h2" />
            <path d="M10 4l3 3-3 3" />
          </svg>
        </button>
      </div>

      <!-- Separator -->
      <div class="w-px h-4 bg-purple-light/20 ml-3"></div>

      <!-- Project actions — icon-only, matches undo/redo style -->
      <div class="flex items-center gap-0.5 ml-1.5 relative">
        <button
          onclick={saveToSlot}
          class="p-1 rounded-lg text-purple-light hover:text-cyan hover:bg-surface-2 transition-colors"
          title="Save (Ctrl+S)"
        >
          <svg viewBox="0 0 16 16" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 14V2h8l2 2v10H3z" />
            <path d="M5 2v4h5V2" />
            <path d="M5 14v-4h6v4" />
          </svg>
        </button>
        <label
          class="p-1 rounded-lg text-purple-light hover:text-cyan hover:bg-surface-2 transition-colors cursor-pointer"
          title="Open file"
        >
          <svg viewBox="0 0 16 16" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 13V5h4l2 2h6v6H2z" />
          </svg>
          <input
            type="file"
            accept=".json"
            onchange={uploadJSON}
            class="hidden"
          />
        </label>
        <button
          onclick={downloadJSON}
          class="p-1 rounded-lg text-purple-light hover:text-cyan hover:bg-surface-2 transition-colors"
          title="Download .json"
        >
          <svg viewBox="0 0 16 16" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 2v8M5 7l3 3 3-3" />
            <path d="M3 12v2h10v-2" />
          </svg>
        </button>
        <button
          onclick={() => (showSavePanel = !showSavePanel)}
          class="p-1 rounded-lg text-purple-light hover:text-cyan hover:bg-surface-2 transition-colors {showSavePanel ? 'bg-surface-2 text-cyan' : ''}"
          title="Saved projects ({getSaves().length})"
        >
          <svg viewBox="0 0 16 16" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 2v12M8 2v12M12 2v12" />
            <path d="M2 5h12M2 11h12" />
          </svg>
        </button>
        {#if showSavePanel}
          <div class="absolute top-full right-0 mt-2 w-52 bg-surface-1 border-2 border-black rounded-lg shadow-[4px_4px_0_black] p-2.5 z-50">
            <div class="text-[10px] uppercase tracking-wider text-accent font-bold mb-2">Saved Projects</div>
            {#if getSaves().length === 0}
              <div class="text-[10px] text-purple-light/40 italic py-1">No saves yet</div>
            {:else}
              <div class="space-y-1 max-h-48 overflow-y-auto">
                {#each getSaves() as save}
                  <div class="flex items-center gap-1 text-[10px] group">
                    <button
                      onclick={() => loadFromSlot(save)}
                      class="flex-1 text-left px-2 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-cyan-light truncate border border-transparent hover:border-purple-light/20 transition-colors"
                    >
                      {save.name}
                    </button>
                    <button
                      onclick={() => deleteSlot(save.name)}
                      class="text-purple-light/30 hover:text-red-400 px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >&times;</button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
    <div class="ml-auto flex items-center gap-3">
      <button
        onclick={() => (showIntro = true)}
        class="text-[10px] text-purple-light/60 hover:text-accent transition-colors"
      >
        About
      </button>
      <a
        href="index.html"
        class="text-[10px] text-purple-light/60 hover:text-accent transition-colors"
      >
        PCB 3D Print Tools &rarr;
      </a>
    </div>
  </div>

  <!-- Main -->
  <div class="flex flex-1 min-h-0">
    <!-- Sidebar -->
    <div
      class="w-56 bg-surface-1 border-r-3 border-black overflow-y-auto p-3 shrink-0"
    >
      <BoardSettings
        bind:cols={doc.grid.cols}
        bind:rows={doc.grid.rows}
        bind:padDiameter={doc.padDiameter}
        bind:drillDiameter={doc.drillDiameter}
        bind:traceWidth={doc.traceWidth}
        bind:curveEndWidth={doc.curveEndWidth}
        bind:curveEndWidth2={doc.curveEndWidth2}
        bind:curveTaperDistance={doc.curveTaperDistance}
        bind:roundTraceRadius={doc.roundTraceRadius}
        bind:roundTraceMode={doc.roundTraceMode}
        bind:roundTracePasses={doc.roundTracePasses}
        bind:roundTraceTeardrop={doc.roundTraceTeardrop}
        bind:roundTraceTdHPercent={doc.roundTraceTdHPercent}
        bind:roundTraceTdVPercent={doc.roundTraceTdVPercent}
        bind:boardThickness={doc.boardThickness}
        onBeforeChange={pushUndo}
      />

      <Toolbar
        {activeTool}
        onToolChange={(t) => {
          activeTool = t;
          selectedIds = [];
        }}
      />

      {#if activeTool === "label"}
        <div class="mb-4">
          <div
            class="text-[10px] uppercase tracking-wider text-accent font-bold mb-2"
          >
            Label
          </div>
          <div class="space-y-1.5">
            <input
              type="text"
              bind:value={annotationText}
              class="w-full bg-surface-2 text-xs text-cyan-light rounded-lg px-2 py-1 border-2 border-black focus:border-accent outline-none shadow-[2px_2px_0_black]"
              placeholder="Label text"
            />
            <div class="flex items-center gap-1.5">
              {#each ["#ff2d95", "#00f0ff", "#a855f7", "#a3e635", "#fbbf24", "#ff6bcb", "#f0f0f0"] as c}
                <button
                  onclick={() => (annotationColor = c)}
                  class="w-4 h-4 rounded-full border-2 transition-colors {annotationColor ===
                  c
                    ? 'border-white'
                    : 'border-transparent'}"
                  style="background-color: {c}"
                ></button>
              {/each}
            </div>
          </div>
        </div>
      {/if}

      <PerfboardExportPanel
        bind:zScale
        bind:boardZScale
        onExport={handleExport}
      />


      <!-- Examples -->
      <div class="mb-4">
        <div
          class="text-[10px] uppercase tracking-wider text-accent font-bold mb-2"
        >
          Examples
        </div>
        <div class="space-y-1">
          <button
            onclick={() => loadExample("cd4093-noise-gen.perfboard.json")}
            class="w-full text-left px-2 py-1.5 text-[10px] rounded-lg bg-surface-2 hover:bg-surface-3 text-cyan-light font-bold border-2 border-black shadow-[2px_2px_0_black] transition-colors"
          >
            CD4093 Noise Generator
          </button>
          <button
            onclick={() => loadExample("attiny85-synth.perfboard.json")}
            class="w-full text-left px-2 py-1.5 text-[10px] rounded-lg bg-surface-2 hover:bg-surface-3 text-cyan-light font-bold border-2 border-black shadow-[2px_2px_0_black] transition-colors"
          >
            ATtiny85 Synthesizer
          </button>
          <button
            onclick={() => loadExample("pt2399-chaos-looper.perfboard.json")}
            class="w-full text-left px-2 py-1.5 text-[10px] rounded-lg bg-surface-2 hover:bg-surface-3 text-cyan-light font-bold border-2 border-black shadow-[2px_2px_0_black] transition-colors"
          >
            PT2399 Chaos Looper
          </button>
          <button
            onclick={() => loadExample("jellyfish-bytebeat.perfboard.json")}
            class="w-full text-left px-2 py-1.5 text-[10px] rounded-lg bg-surface-2 hover:bg-surface-3 text-cyan-light font-bold border-2 border-black shadow-[2px_2px_0_black] transition-colors"
          >
            PCB Art: Jellyfish Bytebeat
          </button>
        </div>
      </div>

      <!-- Board info -->
      <div class="text-[10px] text-purple-light/50 space-y-0.5">
        <div>
          Board: {(
            (doc.grid.cols - 1) * doc.grid.pitch +
            doc.grid.pitch
          ).toFixed(1)} &times; {(
            (doc.grid.rows - 1) * doc.grid.pitch +
            doc.grid.pitch
          ).toFixed(1)} mm
        </div>
        <div>
          Pads: {doc.pads.length} | Headers: {doc.headers.length} | DIPs: {(
            doc.dips || []
          ).length} | Traces: {doc.traces.length} | Jumpers: {doc.jumpers
            .length} | Labels: {doc.annotations.length}
        </div>
      </div>
    </div>

    <!-- Content area -->
    <div class="flex-1 flex flex-col min-h-0">
      <!-- Tabs -->
      <div class="flex bg-surface-1 border-b-3 border-black shrink-0">
        <button
          class="px-4 py-2 text-xs transition-colors {activeTab === 'editor'
            ? 'text-cyan font-bold border-b-3 border-accent'
            : 'text-purple-light hover:text-cyan'}"
          onclick={() => (activeTab = "editor")}
        >
          2D Editor
        </button>
        <button
          class="px-4 py-2 text-xs transition-colors {activeTab === 'preview'
            ? 'text-cyan font-bold border-b-3 border-accent'
            : 'text-purple-light hover:text-cyan'}"
          onclick={() => (activeTab = "preview")}
        >
          3D Preview
        </button>
      </div>

      <!-- Tab content -->
      <div class="flex-1 min-h-0 relative">
        <div class="absolute inset-0" class:hidden={activeTab !== "editor"}>
          <GridEditor
            {doc}
            {activeTool}
            {selectedIds}
            onAddPad={addPad}
            onAddHeader={addHeader}
            onAddTrace={addTrace}
            onAddDip={addDip}
            onAddJumper={addJumper}
            onAddAnnotation={addAnnotation}
            onUpdateAnnotation={updateAnnotation}
            onUpdateJumperColor={updateJumperColor}
            onUpdateDip={updateDip}
            onUpdateCurve={updateCurve}
            onUpdateTraceWidth={updateTraceWidth}
            onMeltTraces={meltTraces}
            onRoundTraces={roundTraces}
            onUpdateRoundTrace={updateRoundTrace}
            onUpdateHeaderLabels={updateHeaderLabels}
            onUpdatePadLabel={updatePadLabel}
            onMoveSelected={moveSelected}
            onMoveControlPoint={moveControlPoint}
            onMoveJumperEndpoint={moveJumperEndpoint}
            onDeleteControlPoint={deleteControlPoint}
            onSubdivideCurve={subdivideCurve}
            onRotateSelected={rotateSelected}
            onRemoveElement={removeElement}
            onSelect={selectElement}
            onBulkSelect={bulkSelect}
            onToolChange={(t) => {
              activeTool = t;
              selectedIds = [];
            }}
          />
        </div>
        <div class="absolute inset-0" class:hidden={activeTab !== "preview"}>
          <Viewer3D
            bind:this={viewer}
            bodies={perfboardBodies}
            visibility={bodyVisibility}
            {zScale}
            {boardZScale}
            textZScale={1}
            textMode="raise"
            traceMode="raise"
            previewFilter={null}
            drcViolations={[]}
            isRebuild={false}
            encSideBySide={false}
            rawSegments={null}
            silkPolylines={null}
            copperTextPolylines={null}
            boardThickness={doc.boardThickness}
            showDimensions={true}
          />
        </div>
      </div>
    </div>
  </div>

  {#if showIntro}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onclick={() => {
        showIntro = false;
        localStorage.setItem("perfboard-intro-seen", "1");
      }}
    >
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="bg-surface-1 border-3 border-black rounded-2xl shadow-[8px_8px_0_black] max-w-md w-full mx-4 p-8 text-center"
        onclick={(e) => e.stopPropagation()}
      >
        <h2 class="text-lg font-black text-accent mb-3">
          Perfboard 3D Print Tools
        </h2>

        <div class="text-left space-y-2.5 mb-5">
          <p class="text-[11px] text-purple-light leading-relaxed">
            I used to etch my own PCBs. Ferric chloride, UV exposure, careful timing. Every batch ended the same way &mdash; copper-laced waste down the sink. I knew it was wrong. I kept doing it because the results were good.
          </p>
          <p class="text-[11px] text-purple-light leading-relaxed">
            Eventually I couldn't justify it anymore, so I stopped. No more homemade boards. That lasted years.
          </p>
          <p class="text-[11px] text-cyan-light leading-relaxed">
            3D printing a substrate and laying copper tape by hand got me back in. The traces are rougher. The tolerances are worse. You can't do fine-pitch SMD this way. But nothing toxic leaves the room, and you end up holding something you actually made &mdash; not something a chemical bath revealed.
          </p>
          <p class="text-[11px] text-purple-light leading-relaxed">
            This tool handles the layout. Design, export STL, print, lay copper. It was built with AI assistance &mdash; not casually, but as a deliberate choice to spend less compute, not more. Whether that matters at the scale of one small tool, I'm honestly not sure. But I'd rather ask the question than ignore it.
          </p>
          <p class="text-[10px] text-purple-light/50 mt-1">
            &mdash; Budi Prakosa
          </p>
        </div>

        <button
          class="px-5 py-2.5 text-xs font-bold rounded-xl bg-accent hover:bg-accent-light text-white border-2 border-black shadow-[4px_4px_0_black] transition-all hover:shadow-[5px_5px_0_black] hover:-translate-x-px hover:-translate-y-px active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_black]"
          onclick={() => {
            showIntro = false;
            localStorage.setItem("perfboard-intro-seen", "1");
          }}
        >
          Start Building
        </button>
        <p class="text-purple-light/40 text-[10px] mt-4">
          Bauhouse Consorxium
        </p>
      </div>
    </div>
  {/if}

  <!-- Unsaved changes confirmation modal -->
  {#if pendingLoadAction}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-[200] flex items-center justify-center bg-black/60"
      onclick={() => (pendingLoadAction = null)}
    >
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="bg-surface-1 border-3 border-black rounded-xl shadow-[6px_6px_0_black] max-w-sm w-full mx-4 p-6"
        onclick={(e) => e.stopPropagation()}
      >
        <div class="flex items-center gap-3 mb-4">
          <svg viewBox="0 0 20 20" class="w-6 h-6 text-amber-400 shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 3L2 17h16L10 3z" />
            <path d="M10 9v4" />
            <circle cx="10" cy="15" r="0.5" fill="currentColor" />
          </svg>
          <h3 class="text-sm font-bold text-cyan-light">Unsaved Changes</h3>
        </div>
        <p class="text-xs text-purple-light leading-relaxed mb-5">
          You have unsaved changes that will be lost. Do you want to save first, or discard and continue?
        </p>
        <div class="flex gap-2">
          <button
            onclick={() => {
              saveToSlot();
              const action = pendingLoadAction;
              pendingLoadAction = null;
              action();
            }}
            class="flex-1 px-3 py-2 text-xs font-bold rounded-lg bg-accent hover:bg-accent-light text-white border-2 border-black shadow-[3px_3px_0_black] transition-all hover:shadow-[4px_4px_0_black] hover:-translate-x-px hover:-translate-y-px"
          >
            Save & Load
          </button>
          <button
            onclick={() => {
              const action = pendingLoadAction;
              pendingLoadAction = null;
              action();
            }}
            class="flex-1 px-3 py-2 text-xs font-bold rounded-lg bg-surface-2 hover:bg-surface-3 text-cyan-light border-2 border-black shadow-[3px_3px_0_black] transition-all hover:shadow-[4px_4px_0_black] hover:-translate-x-px hover:-translate-y-px"
          >
            Discard
          </button>
          <button
            onclick={() => (pendingLoadAction = null)}
            class="px-3 py-2 text-xs font-bold rounded-lg text-purple-light/60 hover:text-purple-light hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Save toast -->
  {#if saveMessage}
    <div class="fixed top-16 right-4 z-[100] animate-[slideIn_0.25s_ease-out] pointer-events-none">
      <div class="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-surface-1 border-2 border-black shadow-[4px_4px_0_black] text-xs">
        {#if saveMessage.startsWith("Loaded")}
          <svg viewBox="0 0 16 16" class="w-4 h-4 text-cyan shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 13V5h4l2 2h6v6H2z" />
          </svg>
        {:else}
          <svg viewBox="0 0 16 16" class="w-4 h-4 text-lime shrink-0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 8.5l3 3 7-7" />
          </svg>
        {/if}
        <span class="text-cyan-light font-semibold">{saveMessage}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
