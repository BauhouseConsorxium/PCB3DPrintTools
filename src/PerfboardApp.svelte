<script>
  import { untrack, tick } from "svelte";
  import Viewer3D from "./components/Viewer3D.svelte";
  import Toolbar from "./components/perfboard/Toolbar.svelte";
  import BoardSettings from "./components/perfboard/BoardSettings.svelte";
  import PerfboardExportPanel from "./components/perfboard/PerfboardExportPanel.svelte";
  import GridEditor from "./components/perfboard/GridEditor.svelte";
  import ExportImageModal from "./components/perfboard/ExportImageModal.svelte";
  import AboutModal from "./components/perfboard/AboutModal.svelte";
  import {
    buildPerfboardBodies,
    createDefaultDocument,
  } from "./lib/perfboard-geometry.js";

  let viewer;
  let gridSvgEl = $state(null);
  let showExportModal = $state(false);
  let showIntro = $state(!localStorage.getItem("perfboard-intro-seen"));
  let theme = $state(localStorage.getItem("perfboard-theme") || 'default');
  let showThemePicker = $state(false);

  const schemes = [
    { id: 'default', label: 'Cyber', color: '#ff2d95' },
    { id: 'forest', label: 'Forest', color: '#4ade80' },
    { id: 'ocean', label: 'Ocean', color: '#60a5fa' },
    { id: 'sunset', label: 'Sunset', color: '#fb923c' },
    { id: 'mono', label: 'Mono', color: '#e0e0e0' },
  ]

  function setTheme(t) {
    theme = t;
    localStorage.setItem("perfboard-theme", t);
  }

  $effect(() => {
    document.documentElement.className = theme === 'default' ? '' : `theme-${theme}`;
  });

  let activeTab = $state("editor");
  let activeTool = $state("select");
  let selectedIds = $state([]);
  let zScale = $state(37);
  let boardZScale = $state(1);
  let showExamples = $state(false);
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
  let isRebuild = $state(false);
  $effect(() => {
    if (perfboardBodies.length > 0 && !isRebuild) {
      tick().then(() => { isRebuild = true; });
    }
  });

  function setGridCols(v) {
    doc.grid.cols = Math.max(2, Math.min(40, Number(v) || 2));
  }
  function setGridRows(v) {
    doc.grid.rows = Math.max(2, Math.min(40, Number(v) || 2));
  }

  function resizeGrid(newCols, newRows) {
    doc.grid.cols = Math.max(2, Math.min(40, newCols));
    doc.grid.rows = Math.max(2, Math.min(40, newRows));
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

  function addCapacitor(col, row, orientation) {
    pushUndo();
    doc.capacitors = [
      ...(doc.capacitors || []),
      { id: crypto.randomUUID(), col, row, orientation, type: 'ceramic' },
    ];
  }

  function updateCapacitor(id, type, label) {
    pushUndo();
    const cap = (doc.capacitors || []).find((c) => c.id === id);
    if (cap) {
      cap.type = type;
      cap.label = label;
      doc.capacitors = [...(doc.capacitors || [])];
    }
  }

  function addResistor(col, row, orientation, spacing) {
    pushUndo();
    doc.resistors = [
      ...(doc.resistors || []),
      { id: crypto.randomUUID(), col, row, orientation, spacing: spacing ?? 4 },
    ];
  }

  function addPinHousing(col, row, count, orientation) {
    pushUndo();
    const facing = orientation === 'h' ? 'south' : 'east';
    doc.pinHousings = [
      ...(doc.pinHousings || []),
      { id: crypto.randomUUID(), col, row, count, orientation, facing },
    ];
  }

  function updatePinHousing(id, facing, label) {
    pushUndo();
    const ph = (doc.pinHousings || []).find((p) => p.id === id);
    if (ph) {
      ph.facing = facing;
      ph.label = label;
      doc.pinHousings = [...(doc.pinHousings || [])];
    }
  }

  function updateResistor(id, spacing, label) {
    pushUndo();
    const res = (doc.resistors || []).find((r) => r.id === id);
    if (res) {
      res.spacing = spacing;
      res.label = label;
      doc.resistors = [...(doc.resistors || [])];
    }
  }

  function addKeyswitch(col, row, orientation) {
    pushUndo();
    doc.keyswitches = [
      ...(doc.keyswitches || []),
      { id: crypto.randomUUID(), col, row, orientation },
    ];
  }

  function updateKeyswitch(id, label) {
    pushUndo();
    const sw = (doc.keyswitches || []).find((s) => s.id === id);
    if (sw) {
      sw.label = label;
      doc.keyswitches = [...(doc.keyswitches || [])];
    }
  }

  function addModule(col, row, variant) {
    pushUndo();
    doc.modules = [
      ...(doc.modules || []),
      { id: crypto.randomUUID(), col, row, orientation: 'S', variant },
    ];
  }

  function updateModule(id, label, copperConnectedOnly) {
    pushUndo();
    const m = (doc.modules || []).find((x) => x.id === id);
    if (m) {
      if (label !== undefined) m.label = label;
      if (copperConnectedOnly !== undefined) m.copperConnectedOnly = copperConnectedOnly;
      doc.modules = [...(doc.modules || [])];
    }
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
    if (type === "freetrace") {
      trace.radius = doc.roundTraceRadius ?? 1.0;
      trace.mode = "subdivision";
      trace.passes = doc.roundTracePasses ?? 2;
      trace.freeform = true;
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

  function addJoint(col, row) {
    const existing = (doc.joints || []).find(
      (j) => j.col === col && j.row === row,
    );
    if (existing) return;
    pushUndo();
    doc.joints = [
      ...(doc.joints || []),
      { id: crypto.randomUUID(), col, row },
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

  function updateHeaderLabels(id, labels, female, copperConnectedOnly) {
    pushUndo();
    const header = doc.headers.find((h) => h.id === id);
    if (header) {
      header.labels = labels;
      header.female = female ?? false;
      if (copperConnectedOnly !== undefined) header.copperConnectedOnly = copperConnectedOnly;
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

  function updateDip(id, label, socket, copperConnectedOnly) {
    pushUndo();
    const dip = (doc.dips || []).find((d) => d.id === id);
    if (dip) {
      dip.label = label;
      dip.socket = socket;
      if (copperConnectedOnly !== undefined) dip.copperConnectedOnly = copperConnectedOnly;
      doc.dips = [...(doc.dips || [])];
    }
  }

  function updateTraceWidth(id, width, cornerShape, endShape) {
    pushUndo();
    const trace = doc.traces.find((t) => t.id === id);
    if (trace) {
      trace.width = width;
      if (cornerShape !== undefined) trace.cornerShape = cornerShape;
      if (endShape !== undefined) trace.endShape = endShape;
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
      const cap = (doc.capacitors || []).find((c) => c.id === id);
      if (cap) {
        cap.col += dc;
        cap.row += dr;
        continue;
      }
      const res = (doc.resistors || []).find((r) => r.id === id);
      if (res) {
        res.col += dc;
        res.row += dr;
        continue;
      }
      const ph = (doc.pinHousings || []).find((p) => p.id === id);
      if (ph) {
        ph.col += dc;
        ph.row += dr;
        continue;
      }
      const ksw = (doc.keyswitches || []).find((s) => s.id === id);
      if (ksw) {
        ksw.col += dc;
        ksw.row += dr;
        continue;
      }
      const mod = (doc.modules || []).find((m) => m.id === id);
      if (mod) {
        mod.col += dc;
        mod.row += dr;
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
      const joint = (doc.joints || []).find((j) => j.id === id);
      if (joint) {
        joint.col += dc;
        joint.row += dr;
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
    doc.capacitors = [...(doc.capacitors || [])];
    doc.resistors = [...(doc.resistors || [])];
    doc.pinHousings = [...(doc.pinHousings || [])];
    doc.keyswitches = [...(doc.keyswitches || [])];
    doc.modules = [...(doc.modules || [])];
    doc.traces = [...doc.traces];
    doc.jumpers = [...doc.jumpers];
    doc.joints = [...(doc.joints || [])];
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
      const cap = (doc.capacitors || []).find((c) => c.id === id);
      if (cap) {
        cap.orientation = cap.orientation === "h" ? "v" : "h";
        continue;
      }
      const res = (doc.resistors || []).find((r) => r.id === id);
      if (res) {
        res.orientation = res.orientation === "h" ? "v" : "h";
        continue;
      }
      const ph = (doc.pinHousings || []).find((p) => p.id === id);
      if (ph) {
        ph.orientation = ph.orientation === "h" ? "v" : "h";
        const facingMap = { north: 'east', east: 'south', south: 'west', west: 'north' };
        ph.facing = facingMap[ph.facing] ?? (ph.orientation === 'h' ? 'south' : 'east');
        continue;
      }
      const ksw = (doc.keyswitches || []).find((s) => s.id === id);
      if (ksw) {
        ksw.orientation = ksw.orientation === 'h' ? 'v' : 'h';
        continue;
      }
      const mod = (doc.modules || []).find((m) => m.id === id);
      if (mod) {
        // Cycle: S → E → N → W → S (CCW visual rotation, 4 states)
        const cycle = { S: 'E', E: 'N', N: 'W', W: 'S', v: 'E', h: 'N' };
        mod.orientation = cycle[mod.orientation] ?? 'E';
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
    doc.capacitors = [...(doc.capacitors || [])];
    doc.resistors = [...(doc.resistors || [])];
    doc.pinHousings = [...(doc.pinHousings || [])];
    doc.keyswitches = [...(doc.keyswitches || [])];
    doc.modules = [...(doc.modules || [])];
    doc.traces = [...doc.traces];
    doc.jumpers = [...doc.jumpers];
  }

  function removeElement(id) {
    pushUndo();
    doc.pads = doc.pads.filter((p) => p.id !== id);
    doc.headers = doc.headers.filter((h) => h.id !== id);
    doc.dips = (doc.dips || []).filter((d) => d.id !== id);
    doc.capacitors = (doc.capacitors || []).filter((c) => c.id !== id);
    doc.resistors = (doc.resistors || []).filter((r) => r.id !== id);
    doc.pinHousings = (doc.pinHousings || []).filter((p) => p.id !== id);
    doc.keyswitches = (doc.keyswitches || []).filter((s) => s.id !== id);
    doc.modules = (doc.modules || []).filter((m) => m.id !== id);
    doc.traces = doc.traces.filter((t) => t.id !== id);
    doc.jumpers = doc.jumpers.filter((j) => j.id !== id);
    doc.joints = (doc.joints || []).filter((j) => j.id !== id);
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

  let exportIncludeBoard = $state(true)

  function handleExport() {
    if (!viewer) return;
    const ts = new Date().toISOString().replace(/[:-]/g, "").slice(0, 15);
    viewer.exportSTL(null, `${doc.name}_perfboard_${ts}.stl`, exportIncludeBoard);
  }

  // Session system
  const SESSION_KEY = "perfboard-sessions";

  const ADJECTIVES = [
    'swift','calm','bold','bright','cool','warm','keen','sharp',
    'lucky','happy','brave','quiet','vivid','noble','witty','rapid',
    'neat','snug','fair','deft'
  ];
  const NOUNS = [
    'falcon','river','pixel','prism','spark','coral','cedar','orbit',
    'atlas','maple','flint','bloom','frost','ember','ridge','haven',
    'drift','forge','crest','quartz'
  ];

  function friendlyName() {
    const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    return `${a}-${n}`;
  }

  function getSessionStore() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; }
    catch { return null; }
  }

  function migrateOldSaves() {
    const old = localStorage.getItem("perfboard-saves");
    if (!old) return null;
    try {
      const saves = JSON.parse(old);
      if (!saves.length) { localStorage.removeItem("perfboard-saves"); return null; }
      const sessions = {};
      let activeId;
      for (const s of saves) {
        const id = crypto.randomUUID();
        if (!activeId) activeId = id;
        sessions[id] = { name: s.name || friendlyName(), doc: s.doc, updatedAt: s.savedAt || new Date().toISOString() };
      }
      localStorage.removeItem("perfboard-saves");
      return { activeId, sessions };
    } catch { localStorage.removeItem("perfboard-saves"); return null; }
  }

  function initSession() {
    let store = getSessionStore() || migrateOldSaves();
    if (!store) {
      const id = crypto.randomUUID();
      const name = friendlyName();
      doc.name = name;
      store = {
        activeId: id,
        sessions: { [id]: { name, doc: JSON.parse(JSON.stringify(doc)), updatedAt: new Date().toISOString() } }
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(store));
    } else {
      const session = store.sessions[store.activeId];
      if (session) {
        applySessionDoc(session.doc);
      }
    }
    return store;
  }

  function applySessionDoc(parsed) {
    parsed.grid.shape = parsed.grid.shape ?? 'rect';
    parsed.dips = parsed.dips ?? [];
    parsed.capacitors = parsed.capacitors ?? [];
    parsed.resistors = parsed.resistors ?? [];
    parsed.pinHousings = parsed.pinHousings ?? [];
    parsed.keyswitches = parsed.keyswitches ?? [];
    parsed.modules = parsed.modules ?? [];
    // Migrate legacy module orientation 'v' → 'S', 'h' → 'E'
    for (const m of parsed.modules) {
      if (m.orientation === 'v') m.orientation = 'S';
      else if (m.orientation === 'h') m.orientation = 'E';
    }
    parsed.jumpers = parsed.jumpers ?? [];
    parsed.joints = parsed.joints ?? [];
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
    parsed.pinHousingHeight = parsed.pinHousingHeight ?? 2.5;
    parsed.pinHousingBoreWidth = parsed.pinHousingBoreWidth ?? 0.8;
    parsed.pinHousingBoreOffset = parsed.pinHousingBoreOffset ?? 0;
    parsed.pinHousingWidth = parsed.pinHousingWidth ?? parsed.pinHousingSize ?? 2.14;
    parsed.pinHousingDepth = parsed.pinHousingDepth ?? parsed.pinHousingSize ?? 2.14;
    parsed.pinHousingFaceOffset = parsed.pinHousingFaceOffset ?? 0;
    parsed.enclosure = parsed.enclosure ?? {
      enabled: false,
      sideBySide: false,
      wallThickness: 2,
      clearance: 0.5,
      floorThickness: 1.5,
      wallHeight: 10,
      shelfDepth: 1,
      shelfHeight: 1.6,
    };
    if (parsed.enclosure.sideBySide === undefined) parsed.enclosure.sideBySide = false;
    doc = parsed;
    selectedIds = [];
    isRebuild = false;
  }

  let sessionStore = $state(initSession());
  let showSessionPanel = $state(false);
  let activeSessionId = $derived(sessionStore.activeId);
  let sessionList = $derived(
    Object.entries(sessionStore.sessions)
      .map(([id, s]) => ({ id, name: s.name, updatedAt: s.updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  );

  let autoSaveTimer;
  $effect(() => {
    const snapshot = JSON.stringify(doc);
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      const store = getSessionStore();
      if (!store || !store.sessions[store.activeId]) return;
      store.sessions[store.activeId].doc = JSON.parse(snapshot);
      store.sessions[store.activeId].name = doc.name;
      store.sessions[store.activeId].updatedAt = new Date().toISOString();
      localStorage.setItem(SESSION_KEY, JSON.stringify(store));
      sessionStore = store;
    }, 500);
  });

  function switchSession(id) {
    if (id === sessionStore.activeId) return;
    const store = getSessionStore();
    if (!store?.sessions[id]) return;
    store.sessions[store.activeId].doc = JSON.parse(JSON.stringify(doc));
    store.sessions[store.activeId].updatedAt = new Date().toISOString();
    store.activeId = id;
    localStorage.setItem(SESSION_KEY, JSON.stringify(store));
    sessionStore = store;
    applySessionDoc(JSON.parse(JSON.stringify(store.sessions[id].doc)));
    undoStack = [];
    redoStack = [];
    showSessionPanel = false;
  }

  function newSession() {
    const store = getSessionStore() || sessionStore;
    store.sessions[store.activeId].doc = JSON.parse(JSON.stringify(doc));
    store.sessions[store.activeId].updatedAt = new Date().toISOString();
    const id = crypto.randomUUID();
    const name = friendlyName();
    const newDoc = createDefaultDocument();
    newDoc.name = name;
    store.sessions[id] = { name, doc: JSON.parse(JSON.stringify(newDoc)), updatedAt: new Date().toISOString() };
    store.activeId = id;
    localStorage.setItem(SESSION_KEY, JSON.stringify(store));
    sessionStore = store;
    doc = newDoc;
    selectedIds = [];
    undoStack = [];
    redoStack = [];
    isRebuild = false;
    showSessionPanel = false;
  }

  function deleteSession(id) {
    const store = getSessionStore() || sessionStore;
    if (Object.keys(store.sessions).length <= 1) return;
    delete store.sessions[id];
    if (store.activeId === id) {
      const remaining = Object.entries(store.sessions).sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt));
      store.activeId = remaining[0][0];
      localStorage.setItem(SESSION_KEY, JSON.stringify(store));
      sessionStore = store;
      applySessionDoc(JSON.parse(JSON.stringify(store.sessions[store.activeId].doc)));
      undoStack = [];
      redoStack = [];
    } else {
      localStorage.setItem(SESSION_KEY, JSON.stringify(store));
      sessionStore = store;
    }
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
    applySessionDoc(parsed);
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
        applyParsedDoc(parsed);
      } catch {
        alert("Failed to parse file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  let saveMessage = $state("");

  async function loadExample(name) {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}examples/${name}`);
      const parsed = await res.json();
      if (parsed.version !== 1 || !parsed.grid) {
        alert("Invalid example file");
        return;
      }
      applyParsedDoc(parsed);
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
        doc.capacitors = (doc.capacitors || []).filter((c) => !idSet.has(c.id));
        doc.resistors = (doc.resistors || []).filter((r) => !idSet.has(r.id));
        doc.pinHousings = (doc.pinHousings || []).filter((p) => !idSet.has(p.id));
        doc.keyswitches = (doc.keyswitches || []).filter((s) => !idSet.has(s.id));
        doc.modules = (doc.modules || []).filter((m) => !idSet.has(m.id));
        doc.traces = doc.traces.filter((t) => !idSet.has(t.id));
        doc.jumpers = doc.jumpers.filter((j) => !idSet.has(j.id));
        doc.joints = (doc.joints || []).filter((j) => !idSet.has(j.id));
        doc.annotations = doc.annotations.filter((a) => !idSet.has(a.id));
        selectedIds = [];
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="h-screen flex flex-col bg-surface-0 text-cyan-light overflow-hidden"
  style="background-image: radial-gradient(circle at 20px 20px, rgba(255,45,149,0.03) 1px, transparent 1px); background-size: 20px 20px;"
>
  <!-- Header -->
  <div
    class="h-11 flex items-center px-4 bg-gradient-to-b from-[var(--grad-from-1)] to-surface-1 border-b-3 border-black shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
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

      <!-- Session picker -->
      <div class="flex items-center gap-0.5 ml-1.5 relative">
        <button
          onclick={() => (showSessionPanel = !showSessionPanel)}
          class="flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-purple-light hover:text-cyan hover:bg-surface-2 transition-colors {showSessionPanel ? 'bg-surface-2 text-cyan' : ''}"
          title="Sessions ({sessionList.length})"
        >
          <svg viewBox="0 0 16 16" class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 2v12M8 2v12M12 2v12" />
            <path d="M2 5h12M2 11h12" />
          </svg>
          <span class="text-[10px] font-semibold truncate max-w-[90px]">{sessionStore.sessions[activeSessionId]?.name ?? ''}</span>
          <svg viewBox="0 0 10 6" class="w-2 h-2 shrink-0 opacity-50">
            <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        {#if showSessionPanel}
          <div class="absolute top-full left-0 mt-2 w-56 bg-surface-1 border-2 border-black rounded-lg shadow-[4px_4px_0_black] p-2.5 z-50">
            <div class="flex items-center justify-between mb-2">
              <span class="text-[10px] uppercase tracking-wider text-accent font-bold">Sessions</span>
              <button
                onclick={newSession}
                class="text-[10px] px-2 py-0.5 rounded-md bg-accent hover:bg-accent-light text-[var(--text-on-accent)] font-bold border border-black shadow-[1px_1px_0_black] transition-all"
              >+ New</button>
            </div>
            <div class="space-y-1 max-h-48 overflow-y-auto">
              {#each sessionList as session}
                <div class="flex items-center gap-1 text-[10px] group">
                  <button
                    onclick={() => switchSession(session.id)}
                    class="flex-1 text-left px-2 py-1.5 rounded-lg truncate transition-colors
                      {session.id === activeSessionId
                        ? 'bg-accent/10 text-cyan-light border border-accent'
                        : 'bg-surface-2 hover:bg-surface-3 text-cyan-light border border-transparent hover:border-purple-light/20'}"
                  >
                    {session.name}
                  </button>
                  {#if Object.keys(sessionStore.sessions).length > 1}
                    <button
                      onclick={() => deleteSession(session.id)}
                      class="text-purple-light/30 hover:text-red-400 px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >&times;</button>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Separator -->
      <div class="w-px h-4 bg-purple-light/20 ml-1.5"></div>

      <!-- File actions -->
      <div class="flex items-center gap-0.5 ml-1.5">
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
      </div>

      <!-- Examples dropdown (Arduino IDE style) -->
      <div class="flex items-center gap-0.5 ml-1.5 relative">
        <button
          onmousedown={() => (showExamples = !showExamples)}
          class="flex items-center gap-1 px-2 py-0.5 rounded-lg text-purple-light hover:text-cyan hover:bg-surface-2 transition-colors text-[11px] font-semibold"
          title="Load example project"
        >
          <svg viewBox="0 0 16 16" class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 3v10M3 8h10" />
            <circle cx="8" cy="8" r="6" />
          </svg>
          Examples
        </button>
        {#if showExamples}
          <div class="absolute top-full left-0 mt-2 w-60 bg-surface-1 border-2 border-black rounded-lg shadow-[4px_4px_0_black] p-2 z-50">
            <div class="text-[9px] uppercase tracking-wider text-accent font-bold mb-1.5 px-1">Load Example</div>
            <div class="space-y-0.5">
              {#each [
                { file: "cd4093-noise-gen.perfboard.json", label: "CD4093 Noise Generator" },
                { file: "attiny85-synth.perfboard.json", label: "ATtiny85 Synthesizer" },
                { file: "pt2399-chaos-looper.perfboard.json", label: "PT2399 Chaos Looper" },
                { file: "jellyfish-bytebeat.perfboard.json", label: "PCB Art: Jellyfish Bytebeat" },
                { file: "pcm1808-module.perfboard.json", label: "PCM1808 ADC Module" },
              ] as ex}
                <button
                  onmousedown={() => { loadExample(ex.file); showExamples = false }}
                  class="w-full text-left px-2.5 py-1.5 text-[10px] rounded-lg bg-surface-2 hover:bg-surface-3 text-cyan-light border border-black/50 transition-colors"
                >
                  {ex.label}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
    <div class="ml-auto flex items-center gap-2">
      <!-- Theme picker -->
      <div class="relative">
        <button
          onmousedown={() => showThemePicker = !showThemePicker}
          class="flex items-center gap-1.5 px-1.5 py-1 rounded-lg text-purple-light/50 hover:text-purple-light hover:bg-white/5 transition-colors"
        >
          {#each schemes as s}
            {#if s.id === theme}
              <span class="w-3 h-3 rounded-full border border-black/30" style="background:{s.color}"></span>
            {/if}
          {/each}
        </button>
        {#if showThemePicker}
          <div class="absolute top-full right-0 mt-2 w-36 bg-surface-1 border-2 border-black rounded-lg shadow-[4px_4px_0_black] p-1.5 z-50">
            {#each schemes as s}
              <button
                onmousedown={() => { setTheme(s.id); showThemePicker = false }}
                class="w-full flex items-center gap-2 px-2 py-1.5 text-[10px] rounded-lg transition-colors
                  {s.id === theme ? 'bg-accent/10 text-cyan-light' : 'text-purple-light/60 hover:text-cyan hover:bg-surface-2'}"
              >
                <span class="w-3 h-3 rounded-full border border-black/30 shrink-0" style="background:{s.color}"></span>
                {s.label}
                {#if s.id === theme}
                  <svg viewBox="0 0 12 12" class="w-2.5 h-2.5 ml-auto text-accent" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 6l3 3 5-5" />
                  </svg>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>

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
      class="w-56 bg-gradient-to-b from-[var(--grad-from-1)] to-surface-1 border-r-3 border-black overflow-y-auto p-3 shrink-0 shadow-[inset_-2px_0_8px_rgba(0,0,0,0.3)]"
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
        bind:pinHousingHeight={doc.pinHousingHeight}
        bind:pinHousingBoreWidth={doc.pinHousingBoreWidth}
        bind:pinHousingBoreOffset={doc.pinHousingBoreOffset}
        bind:pinHousingWidth={doc.pinHousingWidth}
        bind:pinHousingDepth={doc.pinHousingDepth}
        bind:pinHousingFaceOffset={doc.pinHousingFaceOffset}
        bind:enclosureEnabled={doc.enclosure.enabled}
        bind:enclosureSideBySide={doc.enclosure.sideBySide}
        bind:enclosureWallThickness={doc.enclosure.wallThickness}
        bind:enclosureClearance={doc.enclosure.clearance}
        bind:enclosureFloorThickness={doc.enclosure.floorThickness}
        bind:enclosureWallHeight={doc.enclosure.wallHeight}
        bind:enclosureShelfDepth={doc.enclosure.shelfDepth}
        bind:enclosureShelfHeight={doc.enclosure.shelfHeight}
        bind:shape={doc.grid.shape}
        bind:zScale
        bind:boardZScale
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
        bind:includeBoard={exportIncludeBoard}
        onExport={handleExport}
        onExport2D={() => showExportModal = true}
      />




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
          Pads: {doc.pads.length} | Headers: {doc.headers.length} | DIPs: {(doc.dips || []).length} | Caps: {(doc.capacitors || []).length} | Res: {(doc.resistors || []).length} | Sockets: {(doc.pinHousings || []).length} | Keys: {(doc.keyswitches || []).length} | Modules: {(doc.modules || []).length} | Traces: {doc.traces.length} | Jumpers: {doc.jumpers.length} | Labels: {doc.annotations.length}
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
            bind:svgRef={gridSvgEl}
            onAddPad={addPad}
            onAddHeader={addHeader}
            onAddTrace={addTrace}
            onAddDip={addDip}
            onAddCapacitor={addCapacitor}
            onUpdateCapacitor={updateCapacitor}
            onAddResistor={addResistor}
            onUpdateResistor={updateResistor}
            onAddPinHousing={addPinHousing}
            onUpdatePinHousing={updatePinHousing}
            onAddKeyswitch={addKeyswitch}
            onUpdateKeyswitch={updateKeyswitch}
            onAddModule={addModule}
            onUpdateModule={updateModule}
            onAddJumper={addJumper}
            onAddJoint={addJoint}
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
            onResizeGrid={resizeGrid}
            onBeforeResize={pushUndo}
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
            {isRebuild}
            encSideBySide={doc.enclosure?.enabled && doc.enclosure?.sideBySide}
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

  <AboutModal bind:open={showIntro} />

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

<ExportImageModal bind:open={showExportModal} svgEl={gridSvgEl} {doc} />

<style>
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
