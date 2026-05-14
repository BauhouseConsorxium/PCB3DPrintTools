<script>
  import { onMount, tick } from "svelte";
  import {
    catmullRomSVGPath,
    sampleCatmullRom,
    variableWidthOutlinePath,
  } from "../../lib/catmull-rom.js";
  import {
    computeRoundedCorners,
    computeSubdivisionRounding,
    roundedPathToSVG,
    computeTeardrops,
    simplifyPath,
    enforceMinDistance,
  } from "../../lib/round-trace.js";
  import { computeNets, traceColor, padFillFor } from "../../lib/perfboard-nets.js";
  import { circleParams } from "../../lib/perfboard-geometry.js";

  let {
    doc,
    activeTool = "select",
    selectedIds = [],
    onAddPad = () => {},
    onAddHeader = () => {},
    onAddDip = () => {},
    onAddTrace = () => {},
    onAddJumper = () => {},
    onAddJoint = () => {},
    onAddAnnotation = () => {},
    onUpdateAnnotation = () => {},
    onUpdateJumperColor = () => {},
    onUpdateDip = () => {},
    onUpdateCurve = () => {},
    onUpdateTraceWidth = () => {},
    onMeltTraces = () => {},
    onRoundTraces = () => {},
    onUpdateRoundTrace = () => {},
    onUpdatePadLabel = () => {},
    onUpdateHeaderLabels = () => {},
    onMoveSelected = () => {},
    onMoveControlPoint = () => {},
    onMoveJumperEndpoint = () => {},
    onDeleteControlPoint = () => {},
    onSubdivideCurve = () => {},
    onRotateSelected = () => {},
    onResizeGrid = () => {},
    onBeforeResize = () => {},
    onRemoveElement = () => {},
    onSelect = () => {},
    onBulkSelect = () => {},
    onToolChange = () => {},
    onAddCapacitor = () => {},
    onUpdateCapacitor = () => {},
    onAddResistor = () => {},
    onUpdateResistor = () => {},
    onAddPinHousing = () => {},
    onUpdatePinHousing = () => {},
    onAddKeyswitch = () => {},
    onUpdateKeyswitch = () => {},
    svgRef = $bindable(null),
  } = $props();

  let svgEl;
  let containerEl;

  const pitch = $derived(doc.grid.pitch);
  const cols = $derived(doc.grid.cols);
  const rows = $derived(doc.grid.rows);
  const margin = $derived(pitch / 2);
  const boardW = $derived((cols - 1) * pitch + 2 * margin);
  const boardH = $derived((rows - 1) * pitch + 2 * margin);
  const shape = $derived(doc.grid.shape ?? 'rect');
  const isCircle = $derived(shape === 'circle');
  const circle = $derived(isCircle ? circleParams(doc.grid) : null);

  const nets = $derived(computeNets(doc));

  const highlightedNetId = $derived.by(() => {
    if (selectedIds.length !== 1) return null;
    const id = selectedIds[0];
    const trace = doc.traces.find((t) => t.id === id);
    if (trace) return nets.traceNetId.get(trace.id) ?? null;
    const pad = doc.pads.find((p) => p.id === id);
    if (pad) return nets.padNetId.get(`${pad.col},${pad.row}`) ?? null;
    const jumper = doc.jumpers.find((j) => j.id === id);
    if (jumper) return nets.padNetId.get(`${jumper.col1},${jumper.row1}`) ?? null;
    const joint = (doc.joints || []).find((j) => j.id === id);
    if (joint) return nets.padNetId.get(`${joint.col},${joint.row}`) ?? null;
    return null;
  });

  function traceDim(traceId) {
    if (highlightedNetId == null) return 1;
    return nets.traceNetId.get(traceId) === highlightedNetId ? 1 : 0.2;
  }

  function padDim(col, row) {
    if (highlightedNetId == null) return 1;
    return nets.padNetId.get(`${col},${row}`) === highlightedNetId ? 1 : 0.2;
  }

  let vb = $state({ x: 0, y: 0, w: 100, h: 80 });
  let isPanning = $state(false);
  let panStart = $state({ x: 0, y: 0, vx: 0, vy: 0 });

  // Trace drawing state
  let tracePoints = $state([]);
  let tracePreview = $state(null);

  // Curve drawing state
  let curvePoints = $state([]);
  let curvePreview = $state(null);

  // Header drawing state
  let headerStart = $state(null);
  let headerPreview = $state(null);

  // DIP drawing state
  let dipStart = $state(null);
  let dipPreview = $state(null);

  // Capacitor drawing state
  let capStart = $state(null);
  let capPreview = $state(null);
  let editingCapacitor = $state(null);

  // Resistor drawing state
  let resStart = $state(null);
  let resPreview = $state(null);
  let editingResistor = $state(null);

  // Pin housing drawing state
  let phStart = $state(null);
  let phPreview = $state(null);
  let editingPinHousing = $state(null);

  // Keyswitch drawing state
  let kswStart = $state(null);
  let kswPreview = $state(null);
  let editingKeyswitch = $state(null);

  // Freetrace drawing state
  let freetraceDrawing = $state(false);
  let freetracePoints = $state([]);

  // Jumper drawing state
  let jumperStart = $state(null);
  let jumperPreview = $state(null);

  // Drag-to-move state
  let dragInfo = $state(null);

  // Dimension drag state
  let dimDrag = $state(null);
  let dimHover = $state(null);

  // Control point drag state
  let cpDrag = $state(null);
  let activeCP = $state(null);

  // Jumper endpoint drag state
  let jpDrag = $state(null);

  // Rubber band selection
  let selectionBox = $state(null);

  // Inline editing
  let editingAnnotation = $state(null);
  let editingJumper = $state(null);
  let editingDip = $state(null);
  let editingPad = $state(null);
  let editingHeader = $state(null);
  let editingCurve = $state(null);
  let editingTrace = $state(null);
  let editingRoundTrace = $state(null);
  let editInput;
  let dipEditInput;
  let padEditInput;

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

  // Ghost cursor
  let ghostPos = $state(null);
  let freeGhostPos = $state(null);

  $effect(() => {
    if (dimDrag) return;
    if (isCircle && circle) {
      const d = circle.r * 2;
      const pad = d * 0.15 + pitch * 2;
      vb = { x: circle.cx - circle.r - pad, y: circle.cy - circle.r - pad, w: d + 2 * pad, h: d + 2 * pad };
    } else {
      const w = boardW;
      const h = boardH;
      const pad = Math.max(w, h) * 0.15 + pitch * 2;
      vb = { x: -margin - pad, y: -margin - pad, w: w + 2 * pad, h: h + 2 * pad };
    }
  });

  $effect(() => { svgRef = svgEl });

  function svgPoint(e) {
    if (!svgEl) return null;
    const pt = svgEl.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return null;
    const svgP = pt.matrixTransform(ctm.inverse());
    return { x: svgP.x, y: svgP.y };
  }

  function snapToGrid(x, y) {
    const col = Math.round((x / pitch) * 2) / 2;
    const row = Math.round((y / pitch) * 2) / 2;
    let c = Math.max(0, Math.min(cols - 1, col));
    let r = Math.max(0, Math.min(rows - 1, row));

    if (isCircle && circle) {
      const dx = c * pitch - circle.cx;
      const dy = r * pitch - circle.cy;
      const dist = Math.hypot(dx, dy);
      const limit = circle.r - pitch * 0.1;
      if (dist > limit) {
        const scale = limit / dist;
        c = Math.round(((circle.cx + dx * scale) / pitch) * 2) / 2;
        r = Math.round(((circle.cy + dy * scale) / pitch) * 2) / 2;
      }
    }

    return { col: c, row: r };
  }

  function freePosition(x, y) {
    return { col: x / pitch, row: y / pitch };
  }

  function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax,
      dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(
      0,
      Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq),
    );
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function findControlPointAt(rawX, rawY) {
    const hitR = pitch * 0.35;
    for (const trace of doc.traces) {
      if (!selectedIds.includes(trace.id)) continue;
      for (let i = 0; i < trace.points.length; i++) {
        const px = trace.points[i].col * pitch;
        const py = trace.points[i].row * pitch;
        if (Math.hypot(rawX - px, rawY - py) < hitR) {
          return { traceId: trace.id, pointIndex: i };
        }
      }
    }
    return null;
  }

  function findJumperEndpointAt(rawX, rawY) {
    const hitR = pitch * 0.2;
    for (const j of doc.jumpers) {
      if (!selectedIds.includes(j.id)) continue;
      const x1 = j.col1 * pitch,
        y1 = j.row1 * pitch;
      const x2 = j.col2 * pitch,
        y2 = j.row2 * pitch;
      if (Math.hypot(rawX - x1, rawY - y1) < hitR)
        return { jumperId: j.id, endpoint: 1 };
      if (Math.hypot(rawX - x2, rawY - y2) < hitR)
        return { jumperId: j.id, endpoint: 2 };
    }
    return null;
  }

  function findElementAt(col, row, rawX, rawY) {
    for (const p of doc.pads) {
      if (p.col === col && p.row === row) return p;
    }
    for (const h of doc.headers) {
      for (let i = 0; i < h.count; i++) {
        const hc = h.orientation === "h" ? h.col + i : h.col;
        const hr = h.orientation === "v" ? h.row + i : h.row;
        if (hc === col && hr === row) return h;
      }
    }
    for (const d of doc.dips || []) {
      const spacing = d.rowSpacing ?? 3;
      for (let i = 0; i < d.count; i++) {
        if (d.orientation === "v") {
          if (
            (d.col === col && d.row + i === row) ||
            (d.col + spacing === col && d.row + i === row)
          )
            return d;
        } else {
          if (
            (d.col + i === col && d.row === row) ||
            (d.col + i === col && d.row + spacing === row)
          )
            return d;
        }
      }
    }
    for (const cap of doc.capacitors || []) {
      const c2col = cap.orientation === 'h' ? cap.col + 1 : cap.col
      const c2row = cap.orientation === 'h' ? cap.row : cap.row + 1
      if ((cap.col === col && cap.row === row) || (c2col === col && c2row === row)) return cap
    }
    for (const res of doc.resistors || []) {
      const spacing = res.spacing ?? 4
      const r2col = res.orientation === 'h' ? res.col + spacing : res.col
      const r2row = res.orientation === 'h' ? res.row : res.row + spacing
      if ((res.col === col && res.row === row) || (r2col === col && r2row === row)) return res
    }
    for (const ph of doc.pinHousings || []) {
      for (let i = 0; i < ph.count; i++) {
        const pc = ph.orientation === 'h' ? ph.col + i : ph.col
        const pr = ph.orientation === 'v' ? ph.row + i : ph.row
        if (pc === col && pr === row) return ph
      }
    }
    for (const sw of doc.keyswitches || []) {
      if (sw.col === col && sw.row === row) return sw;
      const pins = kswPins(sw);
      if (pins.some((p) => p.col === col && p.row === row)) return sw;
      if (rawX != null && rawY != null) {
        const swCx = sw.col * pitch;
        const swCy = sw.row * pitch;
        if (Math.abs(rawX - swCx) <= 7 && Math.abs(rawY - swCy) <= 7) return sw;
      }
    }
    for (const jt of doc.joints || []) {
      if (jt.col === col && jt.row === row) return jt;
    }
    for (const t of doc.traces) {
      for (const pt of t.points) {
        if (pt.col === col && pt.row === row) return t;
      }
    }
    const hitR = pitch * 0.4;
    if (rawX != null && rawY != null) {
      for (const j of doc.jumpers) {
        const x1 = j.col1 * pitch,
          y1 = j.row1 * pitch;
        const x2 = j.col2 * pitch,
          y2 = j.row2 * pitch;
        const dx = x2 - x1,
          dy = y2 - y1;
        const dist = Math.hypot(dx, dy) || 1;
        const arc = dist * 0.3;
        const mx = (x1 + x2) / 2 + (-dy / dist) * arc;
        const my = (y1 + y2) / 2 + (dx / dist) * arc;
        let hit = false;
        const N = 8;
        for (let i = 0; i < N && !hit; i++) {
          const t0 = i / N,
            t1 = (i + 1) / N;
          const ax =
            (1 - t0) * (1 - t0) * x1 + 2 * (1 - t0) * t0 * mx + t0 * t0 * x2;
          const ay =
            (1 - t0) * (1 - t0) * y1 + 2 * (1 - t0) * t0 * my + t0 * t0 * y2;
          const bx =
            (1 - t1) * (1 - t1) * x1 + 2 * (1 - t1) * t1 * mx + t1 * t1 * x2;
          const by =
            (1 - t1) * (1 - t1) * y1 + 2 * (1 - t1) * t1 * my + t1 * t1 * y2;
          if (distToSegment(rawX, rawY, ax, ay, bx, by) < hitR) hit = true;
        }
        if (hit) return j;
      }
      for (const t of doc.traces) {
        if (t.type === "curve") {
          const pts = t.points.map((p) => ({
            x: p.col * pitch,
            y: p.row * pitch,
          }));
          const samples = sampleCatmullRom(pts, 8, t.tension ?? 0.5);
          for (let i = 0; i < samples.length - 1; i++) {
            if (
              distToSegment(
                rawX,
                rawY,
                samples[i].x,
                samples[i].y,
                samples[i + 1].x,
                samples[i + 1].y,
              ) < hitR
            )
              return t;
          }
        } else if (t.type === "freetrace") {
          const pathSegs = computeSubdivisionRounding(
            t.points, t.radius ?? 1.0, t.passes ?? 2, pitch,
          );
          for (const seg of pathSegs) {
            if (distToSegment(rawX, rawY, seg.x1, seg.y1, seg.x2, seg.y2) < hitR)
              return t;
          }
        } else {
          for (let i = 0; i < t.points.length - 1; i++) {
            const d = distToSegment(
              rawX,
              rawY,
              t.points[i].col * pitch,
              t.points[i].row * pitch,
              t.points[i + 1].col * pitch,
              t.points[i + 1].row * pitch,
            );
            if (d < hitR) return t;
          }
        }
      }
    }
    for (const j of doc.jumpers) {
      if (
        (j.col1 === col && j.row1 === row) ||
        (j.col2 === col && j.row2 === row)
      )
        return j;
    }
    for (const a of doc.annotations) {
      if (rawX != null && rawY != null) {
        const ax = a.col * pitch;
        const ay = a.row * pitch;
        const rx = ax + pitch * 0.2;
        const ry = ay - pitch * 0.45;
        const rw = a.text.length * pitch * 0.28 + pitch * 0.2;
        const rh = pitch * 0.5;
        if (rawX >= rx && rawX <= rx + rw && rawY >= ry && rawY <= ry + rh)
          return a;
      } else if (a.col === col && a.row === row) return a;
    }
    return null;
  }

  function handlePointerDown(e) {
    if (editingJumper) {
      editingJumper = null;
    }
    if (editingDip) {
      editingDip = null;
    }
    if (editingCapacitor) {
      editingCapacitor = null;
    }
    if (editingResistor) {
      editingResistor = null;
    }
    if (editingPinHousing) {
      editingPinHousing = null;
    }
    if (editingKeyswitch) {
      editingKeyswitch = null;
    }
    if (editingPad) {
      editingPad = null;
    }
    if (editingHeader) {
      commitHeaderEdit();
    }
    if (editingCurve) {
      closeCurveEdit();
    }
    if (editingTrace) {
      closeTraceEdit();
    }
    if (editingRoundTrace) {
      closeRoundTraceEdit();
    }
    if (
      e.button === 1 ||
      (e.button === 0 && e.shiftKey && activeTool !== "select")
    ) {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y };
      e.preventDefault();
      return;
    }

    if (e.button !== 0) return;

    const sp = svgPoint(e);
    if (!sp) return;

    // Dimension drag handles — check before tool dispatch
    {
      const hitR = pitch * 1.2;
      if (isCircle && circle) {
        const dimY = circle.cy - circle.r - pitch * 1.5;
        const handleX = circle.cx + circle.r;
        if (Math.hypot(sp.x - handleX, sp.y - dimY) < hitR) {
          onBeforeResize();
          dimDrag = { edge: "diameter", origCols: cols, origRows: rows };
          e.preventDefault();
          return;
        }
      } else {
        const rightArrowX = -margin + boardW;
        const rightArrowY = dimensionTopY;
        const bottomArrowX = dimensionLeftX;
        const bottomArrowY = -margin + boardH;
        if (Math.hypot(sp.x - rightArrowX, sp.y - rightArrowY) < hitR) {
          onBeforeResize();
          dimDrag = { edge: "right", origCols: cols, origRows: rows };
          e.preventDefault();
          return;
        }
        if (Math.hypot(sp.x - bottomArrowX, sp.y - bottomArrowY) < hitR) {
          onBeforeResize();
          dimDrag = { edge: "bottom", origCols: cols, origRows: rows };
          e.preventDefault();
          return;
        }
      }
    }

    const { col, row } = snapToGrid(sp.x, sp.y);

    if (activeTool === "pad") {
      onAddPad(col, row);
    } else if (activeTool === "header") {
      if (!headerStart) {
        headerStart = { col, row };
      } else {
        const dc = col - headerStart.col;
        const dr = row - headerStart.row;
        if (dc === 0 && dr === 0) {
          onAddPad(col, row);
          headerStart = null;
          headerPreview = null;
        } else {
          const orientation = Math.abs(dc) >= Math.abs(dr) ? "h" : "v";
          const count =
            orientation === "h" ? Math.abs(dc) + 1 : Math.abs(dr) + 1;
          const startCol =
            orientation === "h"
              ? Math.min(headerStart.col, col)
              : headerStart.col;
          const startRow =
            orientation === "v"
              ? Math.min(headerStart.row, row)
              : headerStart.row;
          onAddHeader(startCol, startRow, count, orientation);
          headerStart = null;
          headerPreview = null;
        }
      }
    } else if (activeTool === "dip") {
      if (!dipStart) {
        dipStart = { col, row };
      } else {
        const dc = col - dipStart.col;
        const dr = row - dipStart.row;
        if (dc === 0 && dr === 0) {
          dipStart = null;
          dipPreview = null;
        } else {
          const orientation = Math.abs(dc) >= Math.abs(dr) ? "h" : "v";
          const count =
            orientation === "h" ? Math.abs(dc) + 1 : Math.abs(dr) + 1;
          const startCol =
            orientation === "h" ? Math.min(dipStart.col, col) : dipStart.col;
          const startRow =
            orientation === "v" ? Math.min(dipStart.row, row) : dipStart.row;
          if (count >= 2) {
            onAddDip(startCol, startRow, count, orientation);
          }
          dipStart = null;
          dipPreview = null;
        }
      }
    } else if (activeTool === "cap") {
      if (!capStart) {
        capStart = { col, row };
      } else {
        const dc = col - capStart.col;
        const dr = row - capStart.row;
        const orientation = Math.abs(dc) >= Math.abs(dr) ? "h" : "v";
        onAddCapacitor(capStart.col, capStart.row, orientation);
        capStart = null;
        capPreview = null;
      }
    } else if (activeTool === "resistor") {
      if (!resStart) {
        resStart = { col, row };
      } else {
        const dc = col - resStart.col;
        const dr = row - resStart.row;
        const orientation = Math.abs(dc) >= Math.abs(dr) ? "h" : "v";
        const spacing = Math.max(2, orientation === "h" ? Math.abs(dc) : Math.abs(dr));
        onAddResistor(resStart.col, resStart.row, orientation, spacing);
        resStart = null;
        resPreview = null;
      }
    } else if (activeTool === "pinhousing") {
      if (!phStart) {
        phStart = { col, row };
      } else {
        const dc = col - phStart.col;
        const dr = row - phStart.row;
        if (dc === 0 && dr === 0) {
          phStart = null;
          phPreview = null;
        } else {
          const orientation = Math.abs(dc) >= Math.abs(dr) ? "h" : "v";
          const count = orientation === "h" ? Math.abs(dc) + 1 : Math.abs(dr) + 1;
          const startCol = orientation === "h" ? Math.min(phStart.col, col) : phStart.col;
          const startRow = orientation === "v" ? Math.min(phStart.row, row) : phStart.row;
          onAddPinHousing(startCol, startRow, count, orientation);
          phStart = null;
          phPreview = null;
        }
      }
    } else if (activeTool === 'keyswitch') {
      if (!kswStart) {
        kswStart = { col, row };
      } else {
        const dc = col - kswStart.col;
        const dr = row - kswStart.row;
        const orientation = Math.abs(dc) >= Math.abs(dr) ? 'h' : 'v';
        onAddKeyswitch(kswStart.col, kswStart.row, orientation);
        kswStart = null;
        kswPreview = null;
      }
    } else if (activeTool === "trace") {
      if (tracePoints.length === 0) {
        tracePoints = [{ col, row }];
      } else {
        const last = tracePoints[tracePoints.length - 1];
        if (last.col === col && last.row === row) {
          if (tracePoints.length >= 2) {
            onAddTrace([...tracePoints]);
          }
          tracePoints = [];
          tracePreview = null;
        } else {
          const corner = { col: col, row: last.row };
          const isDifferentFromLast = corner.col !== last.col || corner.row !== last.row;
          const isDifferentFromClick = corner.col !== col || corner.row !== row;
          if (isDifferentFromLast && isDifferentFromClick) {
            tracePoints = [...tracePoints, corner, { col, row }];
          } else {
            tracePoints = [...tracePoints, { col, row }];
          }
        }
      }
    } else if (activeTool === "roundtrace") {
      if (tracePoints.length === 0) {
        tracePoints = [{ col, row }];
      } else {
        const last = tracePoints[tracePoints.length - 1];
        if (last.col === col && last.row === row) {
          if (tracePoints.length >= 2) {
            onAddTrace([...tracePoints], "roundtrace");
          }
          tracePoints = [];
          tracePreview = null;
        } else {
          const corner = { col: col, row: last.row };
          const isDifferentFromLast = corner.col !== last.col || corner.row !== last.row;
          const isDifferentFromClick = corner.col !== col || corner.row !== row;
          if (isDifferentFromLast && isDifferentFromClick) {
            tracePoints = [...tracePoints, corner, { col, row }];
          } else {
            tracePoints = [...tracePoints, { col, row }];
          }
        }
      }
    } else if (activeTool === "freetrace") {
      const free = freePosition(sp.x, sp.y);
      freetraceDrawing = true;
      freetracePoints = [{ col: free.col, row: free.row }];
      e.target.setPointerCapture(e.pointerId);
    } else if (activeTool === "curve") {
      if (curvePoints.length === 0) {
        curvePoints = [{ col, row }];
      } else {
        const last = curvePoints[curvePoints.length - 1];
        if (last.col === col && last.row === row) {
          if (curvePoints.length >= 2) {
            onAddTrace([...curvePoints], "curve");
          }
          curvePoints = [];
          curvePreview = null;
        } else {
          curvePoints = [...curvePoints, { col, row }];
        }
      }
    } else if (activeTool === "jumper") {
      if (!jumperStart) {
        jumperStart = { col, row };
      } else {
        if (jumperStart.col !== col || jumperStart.row !== row) {
          onAddJumper(jumperStart.col, jumperStart.row, col, row);
        }
        jumperStart = null;
        jumperPreview = null;
      }
    } else if (activeTool === "label") {
      onAddAnnotation(col, row);
    } else if (activeTool === "joint") {
      onAddJoint(col, row);
    } else if (activeTool === "select") {
      // Check for jumper endpoint click on selected jumpers
      const jpHit = findJumperEndpointAt(sp.x, sp.y);
      if (jpHit) {
        jpDrag = { ...jpHit, startCol: col, startRow: row };
        return;
      }
      // Check for control point click on selected curve traces
      const cpHit = findControlPointAt(sp.x, sp.y);
      if (cpHit) {
        const trace = doc.traces.find((t) => t.id === cpHit.traceId);
        const pt = trace?.points[cpHit.pointIndex];
        const isEdge =
          cpHit.pointIndex === 0 ||
          cpHit.pointIndex === (trace?.points.length ?? 1) - 1;
        const useFree = trace?.freeform && !isEdge;
        const sc = useFree && pt ? pt.col : col;
        const sr = useFree && pt ? pt.row : row;
        cpDrag = {
          traceId: cpHit.traceId,
          pointIndex: cpHit.pointIndex,
          startCol: sc,
          startRow: sr,
        };
        return;
      }
      activeCP = null;
      const el = findElementAt(col, row, sp.x, sp.y);
      if (el) {
        if (e.shiftKey) {
          onSelect(el.id, true);
        } else if (selectedIds.includes(el.id)) {
          dragInfo = { startCol: col, startRow: row };
        } else {
          onSelect(el.id, false);
          dragInfo = { startCol: col, startRow: row };
        }
      } else {
        if (!e.shiftKey) onSelect(null, false);
        selectionBox = {
          x1: sp.x,
          y1: sp.y,
          x2: sp.x,
          y2: sp.y,
          add: e.shiftKey,
        };
      }
    } else if (activeTool === "erase") {
      const el = findElementAt(col, row, sp.x, sp.y);
      if (el) onRemoveElement(el.id);
    }
  }

  function handlePointerMove(e) {
    if (isPanning) {
      const scale = vb.w / (containerEl?.clientWidth || 1);
      vb.x = panStart.vx - (e.clientX - panStart.x) * scale;
      vb.y = panStart.vy - (e.clientY - panStart.y) * scale;
      return;
    }

    const sp = svgPoint(e);
    if (!sp) return;

    // Dimension drag in progress — preview only, apply on drop
    if (dimDrag) {
      if (dimDrag.edge === "diameter") {
        const cx = (cols - 1) * pitch / 2;
        const dist = sp.x - cx;
        const s = Math.max(2, Math.min(40, Math.round((dist * 2) / pitch) + 1));
        dimDrag.previewCols = s;
        dimDrag.previewRows = s;
      } else if (dimDrag.edge === "right") {
        dimDrag.previewCols = Math.max(2, Math.min(40, Math.round((sp.x + margin) / pitch)));
        dimDrag.previewRows = rows;
      } else {
        dimDrag.previewCols = cols;
        dimDrag.previewRows = Math.max(2, Math.min(40, Math.round((sp.y + margin) / pitch)));
      }
      return;
    }

    // Dimension hover detection
    {
      const hitR = pitch * 1.2;
      if (isCircle && circle) {
        const dimY = circle.cy - circle.r - pitch * 1.5;
        const handleX = circle.cx + circle.r;
        dimHover = Math.hypot(sp.x - handleX, sp.y - dimY) < hitR ? "diameter" : null;
      } else {
        const rightArrowX = -margin + boardW;
        const rightArrowY = dimensionTopY;
        const bottomArrowX = dimensionLeftX;
        const bottomArrowY = -margin + boardH;
        if (Math.hypot(sp.x - rightArrowX, sp.y - rightArrowY) < hitR) {
          dimHover = "right";
        } else if (Math.hypot(sp.x - bottomArrowX, sp.y - bottomArrowY) < hitR) {
          dimHover = "bottom";
        } else {
          dimHover = null;
        }
      }
    }

    const { col, row } = snapToGrid(sp.x, sp.y);
    ghostPos = { col, row };
    freeGhostPos = freePosition(sp.x, sp.y);

    if (freetraceDrawing) {
      const free = freePosition(sp.x, sp.y);
      const last = freetracePoints[freetracePoints.length - 1];
      if (Math.hypot(free.col - last.col, free.row - last.row) > 0.02) {
        freetracePoints = [...freetracePoints, { col: free.col, row: free.row }];
      }
      return;
    }

    if (selectionBox) {
      selectionBox = { ...selectionBox, x2: sp.x, y2: sp.y };
      return;
    }

    if (
      (activeTool === "trace" || activeTool === "roundtrace") &&
      tracePoints.length > 0
    ) {
      const last = tracePoints[tracePoints.length - 1];
      tracePreview = { col1: last.col, row1: last.row, col2: col, row2: row };
    }

    if (activeTool === "curve" && curvePoints.length > 0) {
      curvePreview = freePosition(sp.x, sp.y);
    }

    if (activeTool === "jumper" && jumperStart) {
      jumperPreview = { col, row };
    }

    if (activeTool === "header" && headerStart) {
      const dc = col - headerStart.col;
      const dr = row - headerStart.row;
      const orientation = Math.abs(dc) >= Math.abs(dr) ? "h" : "v";
      const count = orientation === "h" ? Math.abs(dc) + 1 : Math.abs(dr) + 1;
      const startCol =
        orientation === "h" ? Math.min(headerStart.col, col) : headerStart.col;
      const startRow =
        orientation === "v" ? Math.min(headerStart.row, row) : headerStart.row;
      headerPreview = { col: startCol, row: startRow, count, orientation };
    }

    if (activeTool === "dip" && dipStart) {
      const dc = col - dipStart.col;
      const dr = row - dipStart.row;
      const orientation = Math.abs(dc) >= Math.abs(dr) ? "h" : "v";
      const count = orientation === "h" ? Math.abs(dc) + 1 : Math.abs(dr) + 1;
      const startCol =
        orientation === "h" ? Math.min(dipStart.col, col) : dipStart.col;
      const startRow =
        orientation === "v" ? Math.min(dipStart.row, row) : dipStart.row;
      dipPreview = { col: startCol, row: startRow, count, orientation };
    }

    if (activeTool === "cap" && capStart) {
      const dc = col - capStart.col;
      const dr = row - capStart.row;
      const orientation = Math.abs(dc) >= Math.abs(dr) ? "h" : "v";
      capPreview = { col: capStart.col, row: capStart.row, orientation };
    }

    if (activeTool === "resistor" && resStart) {
      const dc = col - resStart.col;
      const dr = row - resStart.row;
      const orientation = Math.abs(dc) >= Math.abs(dr) ? "h" : "v";
      const spacing = Math.max(2, orientation === "h" ? Math.abs(dc) : Math.abs(dr));
      resPreview = { col: resStart.col, row: resStart.row, orientation, spacing };
    }

    if (activeTool === "pinhousing" && phStart) {
      const dc = col - phStart.col;
      const dr = row - phStart.row;
      const orientation = Math.abs(dc) >= Math.abs(dr) ? "h" : "v";
      const count = orientation === "h" ? Math.abs(dc) + 1 : Math.abs(dr) + 1;
      const startCol = orientation === "h" ? Math.min(phStart.col, col) : phStart.col;
      const startRow = orientation === "v" ? Math.min(phStart.row, row) : phStart.row;
      phPreview = { col: startCol, row: startRow, count, orientation };
    }

    if (activeTool === 'keyswitch' && kswStart) {
      const dc = col - kswStart.col;
      const dr = row - kswStart.row;
      const orientation = Math.abs(dc) >= Math.abs(dr) ? 'h' : 'v';
      kswPreview = { col: kswStart.col, row: kswStart.row, orientation };
    }
  }

  function findElementsInRect(x1, y1, x2, y2) {
    const minX = Math.min(x1, x2),
      maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2),
      maxY = Math.max(y1, y2);
    const ids = [];
    const inRect = (px, py) =>
      px >= minX && px <= maxX && py >= minY && py <= maxY;
    for (const p of doc.pads) {
      if (inRect(p.col * pitch, p.row * pitch)) ids.push(p.id);
    }
    for (const h of doc.headers) {
      for (let i = 0; i < h.count; i++) {
        const hc = h.orientation === "h" ? h.col + i : h.col;
        const hr = h.orientation === "v" ? h.row + i : h.row;
        if (inRect(hc * pitch, hr * pitch)) {
          ids.push(h.id);
          break;
        }
      }
    }
    for (const d of doc.dips || []) {
      const spacing = d.rowSpacing ?? 3;
      let found = false;
      for (let i = 0; i < d.count && !found; i++) {
        if (d.orientation === "v") {
          if (
            inRect(d.col * pitch, (d.row + i) * pitch) ||
            inRect((d.col + spacing) * pitch, (d.row + i) * pitch)
          )
            found = true;
        } else {
          if (
            inRect((d.col + i) * pitch, d.row * pitch) ||
            inRect((d.col + i) * pitch, (d.row + spacing) * pitch)
          )
            found = true;
        }
      }
      if (found) ids.push(d.id);
    }
    for (const cap of doc.capacitors || []) {
      const c2col = cap.orientation === 'h' ? cap.col + 1 : cap.col;
      const c2row = cap.orientation === 'h' ? cap.row : cap.row + 1;
      if (inRect(cap.col * pitch, cap.row * pitch) || inRect(c2col * pitch, c2row * pitch))
        ids.push(cap.id);
    }
    for (const res of doc.resistors || []) {
      const spacing = res.spacing ?? 4;
      const r2col = res.orientation === 'h' ? res.col + spacing : res.col;
      const r2row = res.orientation === 'h' ? res.row : res.row + spacing;
      if (inRect(res.col * pitch, res.row * pitch) || inRect(r2col * pitch, r2row * pitch))
        ids.push(res.id);
    }
    for (const ph of doc.pinHousings || []) {
      for (let i = 0; i < ph.count; i++) {
        const pc = ph.orientation === 'h' ? ph.col + i : ph.col;
        const pr = ph.orientation === 'v' ? ph.row + i : ph.row;
        if (inRect(pc * pitch, pr * pitch)) { ids.push(ph.id); break; }
      }
    }
    for (const sw of doc.keyswitches || []) {
      const pins = kswPins(sw);
      if (
        inRect(sw.col * pitch, sw.row * pitch) ||
        pins.some((p) => inRect(p.col * pitch, p.row * pitch))
      )
        ids.push(sw.id);
    }
    for (const t of doc.traces) {
      for (const pt of t.points) {
        if (inRect(pt.col * pitch, pt.row * pitch)) {
          ids.push(t.id);
          break;
        }
      }
    }
    for (const j of doc.jumpers) {
      if (
        inRect(j.col1 * pitch, j.row1 * pitch) ||
        inRect(j.col2 * pitch, j.row2 * pitch)
      )
        ids.push(j.id);
    }
    for (const jt of doc.joints || []) {
      if (inRect(jt.col * pitch, jt.row * pitch)) ids.push(jt.id);
    }
    for (const a of doc.annotations) {
      if (inRect(a.col * pitch, a.row * pitch)) ids.push(a.id);
    }
    return ids;
  }

  function handlePointerUp(e) {
    if (dimDrag) {
      if (dimDrag.previewCols != null) {
        onResizeGrid(dimDrag.previewCols, dimDrag.previewRows);
      }
      dimDrag = null;
      return;
    }
    if (isPanning) {
      isPanning = false;
      return;
    }
    if (freetraceDrawing) {
      freetraceDrawing = false;
      if (freetracePoints.length >= 2) {
        let pts = enforceMinDistance(freetracePoints, 0.05);
        pts = simplifyPath(pts, 0.15);
        if (pts.length >= 2) {
          onAddTrace(pts, "freetrace");
        }
      }
      freetracePoints = [];
      return;
    }
    if (selectionBox) {
      const ids = findElementsInRect(
        selectionBox.x1,
        selectionBox.y1,
        selectionBox.x2,
        selectionBox.y2,
      );
      if (ids.length > 0) {
        onBulkSelect(ids, selectionBox.add);
      }
      selectionBox = null;
      return;
    }
    if (jpDrag) {
      const sp = svgPoint(e);
      if (sp) {
        const { col, row } = snapToGrid(sp.x, sp.y);
        const dc = col - jpDrag.startCol;
        const dr = row - jpDrag.startRow;
        if (dc !== 0 || dr !== 0) {
          onMoveJumperEndpoint(jpDrag.jumperId, jpDrag.endpoint, dc, dr);
        }
      }
      jpDrag = null;
      return;
    }
    if (cpDrag) {
      const sp = svgPoint(e);
      if (sp) {
        const trace = doc.traces.find((t) => t.id === cpDrag.traceId);
        const isEdge =
          cpDrag.pointIndex === 0 ||
          cpDrag.pointIndex === (trace?.points.length ?? 1) - 1;
        const useFree = trace?.freeform && !isEdge;
        if (useFree) {
          const free = freePosition(sp.x, sp.y);
          const dc = free.col - cpDrag.startCol;
          const dr = free.row - cpDrag.startRow;
          if (Math.abs(dc) > 0.01 || Math.abs(dr) > 0.01) {
            onMoveControlPoint(cpDrag.traceId, cpDrag.pointIndex, dc, dr);
            activeCP = null;
          } else {
            activeCP = {
              traceId: cpDrag.traceId,
              pointIndex: cpDrag.pointIndex,
            };
          }
        } else {
          const { col, row } = snapToGrid(sp.x, sp.y);
          const dc = col - cpDrag.startCol;
          const dr = row - cpDrag.startRow;
          if (dc !== 0 || dr !== 0) {
            onMoveControlPoint(cpDrag.traceId, cpDrag.pointIndex, dc, dr);
            activeCP = null;
          } else {
            activeCP = {
              traceId: cpDrag.traceId,
              pointIndex: cpDrag.pointIndex,
            };
          }
        }
      }
      cpDrag = null;
      return;
    }
    if (dragInfo) {
      const sp = svgPoint(e);
      if (sp) {
        const { col, row } = snapToGrid(sp.x, sp.y);
        const dc = col - dragInfo.startCol;
        const dr = row - dragInfo.startRow;
        if (dc !== 0 || dr !== 0) {
          onMoveSelected(dc, dr);
        }
      }
      dragInfo = null;
    }
  }

  function handleWheel(e) {
    e.preventDefault();
    const sp = svgPoint(e);
    if (!sp) return;

    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const newW = vb.w * factor;
    const newH = vb.h * factor;
    const minDim = pitch * 3;
    const maxDim = boardW * 3;
    if (newW < minDim || newW > maxDim) return;

    vb.x = sp.x - (sp.x - vb.x) * factor;
    vb.y = sp.y - (sp.y - vb.y) * factor;
    vb.w = newW;
    vb.h = newH;
  }

  function handleDblClick(e) {
    if (activeTool === "curve" && curvePoints.length >= 2) {
      onAddTrace([...curvePoints], "curve");
      curvePoints = [];
      curvePreview = null;
      return;
    }
    if (activeTool === "trace" && tracePoints.length >= 2) {
      onAddTrace([...tracePoints]);
      tracePoints = [];
      tracePreview = null;
      return;
    }
    if (activeTool === "roundtrace" && tracePoints.length >= 2) {
      onAddTrace([...tracePoints], "roundtrace");
      tracePoints = [];
      tracePreview = null;
      return;
    }
    if (activeTool === "select") {
      cpDrag = null;
      const sp = svgPoint(e);
      if (!sp) return;
      const { col, row } = snapToGrid(sp.x, sp.y);
      const el = findElementAt(col, row, sp.x, sp.y);
      if (el && doc.annotations.find((a) => a.id === el.id)) {
        const rect = containerEl.getBoundingClientRect();
        editingAnnotation = {
          id: el.id,
          text: el.text,
          color: el.color,
          left: e.clientX - rect.left,
          top: e.clientY - rect.top - 20,
        };
        tick().then(() => {
          if (editInput) {
            editInput.focus();
            editInput.select();
          }
        });
      } else if (el && (doc.dips || []).find((d) => d.id === el.id)) {
        const dip = (doc.dips || []).find((d) => d.id === el.id);
        const rect = containerEl.getBoundingClientRect();
        editingDip = {
          id: el.id,
          label: dip.label ?? "",
          socket: dip.socket ?? false,
          copperConnectedOnly: dip.copperConnectedOnly ?? false,
          left: e.clientX - rect.left,
          top: e.clientY - rect.top - 20,
        };
        tick().then(() => {
          if (dipEditInput) {
            dipEditInput.focus();
            dipEditInput.select();
          }
        });
      } else if (el && (doc.capacitors || []).find((c) => c.id === el.id)) {
        const cap = (doc.capacitors || []).find((c) => c.id === el.id);
        const rect = containerEl.getBoundingClientRect();
        editingCapacitor = {
          id: el.id,
          type: cap.type ?? "ceramic",
          label: cap.label ?? "",
          left: e.clientX - rect.left,
          top: e.clientY - rect.top - 20,
        };
      } else if (el && (doc.resistors || []).find((r) => r.id === el.id)) {
        const res = (doc.resistors || []).find((r) => r.id === el.id);
        const rect = containerEl.getBoundingClientRect();
        editingResistor = {
          id: el.id,
          spacing: res.spacing ?? 4,
          label: res.label ?? "",
          left: e.clientX - rect.left,
          top: e.clientY - rect.top - 20,
        };
      } else if (el && (doc.pinHousings || []).find((ph) => ph.id === el.id)) {
        const ph = (doc.pinHousings || []).find((ph) => ph.id === el.id);
        const rect = containerEl.getBoundingClientRect();
        editingPinHousing = {
          id: el.id,
          facing: ph.facing ?? (ph.orientation === 'h' ? 'south' : 'east'),
          label: ph.label ?? "",
          left: e.clientX - rect.left,
          top: e.clientY - rect.top - 20,
        };
      } else if (el && (doc.keyswitches || []).find((sw) => sw.id === el.id)) {
        const sw = (doc.keyswitches || []).find((sw) => sw.id === el.id);
        const rect = containerEl.getBoundingClientRect();
        editingKeyswitch = {
          id: el.id,
          label: sw.label ?? '',
          left: e.clientX - rect.left,
          top: e.clientY - rect.top - 20,
        };
      } else if (el && doc.headers.find((h) => h.id === el.id)) {
        const header = doc.headers.find((h) => h.id === el.id);
        const rect = containerEl.getBoundingClientRect();
        const labels = header.labels ?? Array(header.count).fill("");
        editingHeader = {
          id: el.id,
          female: header.female ?? false,
          copperConnectedOnly: header.copperConnectedOnly ?? false,
          labels:
            labels.length >= header.count
              ? labels.slice(0, header.count)
              : [...labels, ...Array(header.count - labels.length).fill("")],
          left: e.clientX - rect.left,
          top: e.clientY - rect.top - 20,
        };
      } else if (el && doc.pads.find((p) => p.id === el.id)) {
        const pad = doc.pads.find((p) => p.id === el.id);
        const rect = containerEl.getBoundingClientRect();
        editingPad = {
          id: el.id,
          label: pad.label ?? "",
          left: e.clientX - rect.left,
          top: e.clientY - rect.top - 20,
        };
        tick().then(() => {
          if (padEditInput) {
            padEditInput.focus();
            padEditInput.select();
          }
        });
      } else if (el && doc.jumpers.find((j) => j.id === el.id)) {
        const rect = containerEl.getBoundingClientRect();
        editingJumper = {
          id: el.id,
          color: el.color ?? "#67e8f9",
          left: e.clientX - rect.left,
          top: e.clientY - rect.top - 20,
        };
      } else if (
        el &&
        doc.traces.find((t) => t.id === el.id && t.type === "curve")
      ) {
        const trace = doc.traces.find((t) => t.id === el.id);
        const rect = containerEl.getBoundingClientRect();
        editingCurve = {
          id: el.id,
          width: trace.width,
          endWidth: trace.endWidth ?? trace.width,
          endWidth2: trace.endWidth2 ?? trace.endWidth ?? trace.width,
          taperDistance: trace.taperDistance ?? 0,
          tension: trace.tension ?? 0.5,
          freeform: !!trace.freeform,
          left: e.clientX - rect.left,
          top: e.clientY - rect.top - 20,
        };
      } else if (
        el &&
        doc.traces.find((t) => t.id === el.id && (t.type === "roundtrace" || t.type === "freetrace"))
      ) {
        const trace = doc.traces.find((t) => t.id === el.id);
        const rect = containerEl.getBoundingClientRect();
        editingRoundTrace = {
          id: el.id,
          width: trace.width,
          radius: trace.radius ?? 1.0,
          mode: trace.type === "freetrace" ? "subdivision" : (trace.mode ?? "arc"),
          passes: trace.passes ?? 2,
          teardrop: trace.teardrop ?? false,
          tdHPercent: trace.tdHPercent ?? 50,
          tdVPercent: trace.tdVPercent ?? 90,
          left: e.clientX - rect.left,
          top: e.clientY - rect.top - 20,
        };
      } else if (
        el &&
        doc.traces.find(
          (t) =>
            t.id === el.id && t.type !== "curve" && t.type !== "roundtrace" && t.type !== "freetrace",
        )
      ) {
        const trace = doc.traces.find((t) => t.id === el.id);
        const rect = containerEl.getBoundingClientRect();
        editingTrace = {
          id: el.id,
          width: trace.width,
          cornerShape: trace.cornerShape ?? 'round',
          endShape: trace.endShape ?? 'round',
          left: e.clientX - rect.left,
          top: e.clientY - rect.top - 20,
        };
      }
    }
  }

  function commitEdit() {
    if (!editingAnnotation) return;
    onUpdateAnnotation(
      editingAnnotation.id,
      editInput?.value ?? "",
      editingAnnotation.color,
    );
    editingAnnotation = null;
  }

  function handleEditKeydown(e) {
    e.stopPropagation();
    if (e.key === "Enter") commitEdit();
    else if (e.key === "Escape") editingAnnotation = null;
  }

  function commitHeaderEdit() {
    if (!editingHeader) return;
    onUpdateHeaderLabels(editingHeader.id, editingHeader.labels, editingHeader.female, editingHeader.copperConnectedOnly);
    editingHeader = null;
  }

  function commitPadEdit() {
    if (!editingPad) return;
    onUpdatePadLabel(editingPad.id, padEditInput?.value ?? "");
    editingPad = null;
  }

  function handlePadEditKeydown(e) {
    e.stopPropagation();
    if (e.key === "Enter") commitPadEdit();
    else if (e.key === "Escape") editingPad = null;
  }

  function applyDipEdit() {
    if (!editingDip) return;
    onUpdateDip(editingDip.id, dipEditInput?.value ?? "", editingDip.socket, editingDip.copperConnectedOnly);
  }

  function closeDipEdit() {
    applyDipEdit();
    editingDip = null;
  }

  function handleDipEditKeydown(e) {
    e.stopPropagation();
    if (e.key === "Enter" || e.key === "Escape") closeDipEdit();
  }

  function applyCapEdit() {
    if (!editingCapacitor) return;
    onUpdateCapacitor(editingCapacitor.id, editingCapacitor.type, editingCapacitor.label);
  }

  function closeCapEdit() {
    applyCapEdit();
    editingCapacitor = null;
  }

  function handleCapEditKeydown(e) {
    e.stopPropagation();
    if (e.key === "Enter" || e.key === "Escape") closeCapEdit();
  }

  function applyResEdit() {
    if (!editingResistor) return;
    onUpdateResistor(editingResistor.id, editingResistor.spacing, editingResistor.label);
  }

  function closeResEdit() {
    applyResEdit();
    editingResistor = null;
  }

  function handleResEditKeydown(e) {
    e.stopPropagation();
    if (e.key === "Enter" || e.key === "Escape") closeResEdit();
  }

  function applyPhEdit() {
    if (!editingPinHousing) return;
    onUpdatePinHousing(editingPinHousing.id, editingPinHousing.facing, editingPinHousing.label);
  }

  function closePhEdit() {
    applyPhEdit();
    editingPinHousing = null;
  }

  function handlePhEditKeydown(e) {
    e.stopPropagation();
    if (e.key === "Enter" || e.key === "Escape") closePhEdit();
  }

  function applyKswEdit() {
    if (!editingKeyswitch) return;
    onUpdateKeyswitch(editingKeyswitch.id, editingKeyswitch.label);
  }

  function closeKswEdit() {
    applyKswEdit();
    editingKeyswitch = null;
  }

  function handleKswEditKeydown(e) {
    e.stopPropagation();
    if (e.key === 'Enter' || e.key === 'Escape') closeKswEdit();
  }

  function applyCurveEdit() {
    if (!editingCurve) return;
    onUpdateCurve(
      editingCurve.id,
      editingCurve.width,
      editingCurve.endWidth,
      editingCurve.taperDistance,
      editingCurve.tension,
      editingCurve.endWidth2,
      editingCurve.freeform,
    );
  }

  function closeCurveEdit() {
    applyCurveEdit();
    editingCurve = null;
  }

  function handleCurveEditKeydown(e) {
    e.stopPropagation();
    if (e.key === "Enter" || e.key === "Escape") closeCurveEdit();
  }

  function applyTraceEdit() {
    if (!editingTrace) return;
    onUpdateTraceWidth(editingTrace.id, editingTrace.width, editingTrace.cornerShape, editingTrace.endShape);
  }

  function closeTraceEdit() {
    applyTraceEdit();
    editingTrace = null;
  }

  function handleTraceEditKeydown(e) {
    e.stopPropagation();
    if (e.key === "Enter" || e.key === "Escape") closeTraceEdit();
  }

  function applyRoundTraceEdit() {
    if (!editingRoundTrace) return;
    onUpdateRoundTrace(
      editingRoundTrace.id,
      editingRoundTrace.width,
      editingRoundTrace.radius,
      editingRoundTrace.mode,
      editingRoundTrace.passes,
      editingRoundTrace.teardrop,
      editingRoundTrace.tdHPercent,
      editingRoundTrace.tdVPercent,
    );
  }

  function closeRoundTraceEdit() {
    applyRoundTraceEdit();
    editingRoundTrace = null;
  }

  function handleRoundTraceEditKeydown(e) {
    e.stopPropagation();
    if (e.key === "Enter" || e.key === "Escape") closeRoundTraceEdit();
  }

  function cancelDrawing() {
    if (cpDrag) {
      cpDrag = null;
      return true;
    }
    if (selectionBox) {
      selectionBox = null;
      return true;
    }
    if (
      (activeTool === "trace" || activeTool === "roundtrace") &&
      tracePoints.length > 0
    ) {
      tracePoints = [];
      tracePreview = null;
      return true;
    }
    if (activeTool === "curve" && curvePoints.length > 0) {
      curvePoints = [];
      curvePreview = null;
      return true;
    }
    if (activeTool === "header" && headerStart) {
      headerStart = null;
      headerPreview = null;
      return true;
    }
    if (activeTool === "dip" && dipStart) {
      dipStart = null;
      dipPreview = null;
      return true;
    }
    if (activeTool === "cap" && capStart) {
      capStart = null;
      capPreview = null;
      return true;
    }
    if (activeTool === "resistor" && resStart) {
      resStart = null;
      resPreview = null;
      return true;
    }
    if (activeTool === "pinhousing" && phStart) {
      phStart = null;
      phPreview = null;
      return true;
    }
    if (activeTool === 'keyswitch' && kswStart) {
      kswStart = null;
      kswPreview = null;
      return true;
    }
    if (freetraceDrawing) {
      freetraceDrawing = false;
      freetracePoints = [];
      return true;
    }
    if (activeTool === "jumper" && jumperStart) {
      jumperStart = null;
      jumperPreview = null;
      return true;
    }
    if (dragInfo) {
      dragInfo = null;
      return true;
    }
    if (jpDrag) {
      jpDrag = null;
      return true;
    }
    return false;
  }

  function handleContextMenu(e) {
    e.preventDefault();
    cancelDrawing();
  }

  const toolHotkeys = {
    "1": "pad",
    "2": "header",
    "3": "dip",
    "4": "trace",
    "5": "jumper",
    "6": "label",
    "7": "erase",
    "8": "curve",
    "9": "roundtrace",
    "0": "cap",
    "j": "joint",
    "J": "joint",
    "f": "freetrace",
    "F": "freetrace",
    "r": "resistor",
    "R": "resistor",
    "h": "pinhousing",
    "H": "pinhousing",
    "k": "keyswitch",
    "K": "keyswitch",
  };

  function handleKeydown(e) {
    const isInput =
      e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA";
    if (isInput) return;
    if (e.key === "Escape") {
      if (dimDrag) {
        dimDrag = null;
        return;
      }
      if (activeCP) {
        activeCP = null;
        return;
      }
      if (editingAnnotation) {
        editingAnnotation = null;
        return;
      }
      if (editingPad) {
        editingPad = null;
        return;
      }
      if (editingHeader) {
        commitHeaderEdit();
        return;
      }
      if (editingDip) {
        editingDip = null;
        return;
      }
      if (editingCapacitor) {
        editingCapacitor = null;
        return;
      }
      if (editingResistor) {
        editingResistor = null;
        return;
      }
      if (editingPinHousing) {
        editingPinHousing = null;
        return;
      }
      if (editingKeyswitch) {
        editingKeyswitch = null;
        return;
      }
      if (editingJumper) {
        editingJumper = null;
        return;
      }
      if (editingCurve) {
        closeCurveEdit();
        return;
      }
      if (editingTrace) {
        closeTraceEdit();
        return;
      }
      if (editingRoundTrace) {
        closeRoundTraceEdit();
        return;
      }
      const cancelled = cancelDrawing();
      if (!cancelled && activeTool !== "select") {
        onToolChange("select");
      }
      return;
    }
    if (
      (e.key === "r" || e.key === "R") &&
      activeTool === "select" &&
      selectedIds.length > 0
    ) {
      onRotateSelected();
      return;
    }
    if (
      (e.key === "m" || e.key === "M") &&
      activeTool === "select" &&
      selectedIds.length > 0
    ) {
      onMeltTraces(selectedIds);
      return;
    }
    if (
      (e.key === "o" || e.key === "O") &&
      activeTool === "select" &&
      selectedIds.length > 0
    ) {
      onRoundTraces(selectedIds);
      return;
    }
    const tool = toolHotkeys[e.key];
    if (tool) onToolChange(tool);
  }

  // Expand header pads for rendering
  function getHeaderPads(header) {
    const pads = [];
    for (let i = 0; i < header.count; i++) {
      pads.push({
        col: header.orientation === "h" ? header.col + i : header.col,
        row: header.orientation === "v" ? header.row + i : header.row,
      });
    }
    return pads;
  }

  // Cherry MX electrical pin positions relative to switch center (col, row)
  function kswPins(sw) {
    if (sw.orientation === 'h') {
      return [
        { col: sw.col - 1.5, row: sw.row - 1 },
        { col: sw.col + 1, row: sw.row - 2 },
      ]
    }
    return [
      { col: sw.col + 1, row: sw.row - 1.5 },
      { col: sw.col + 2, row: sw.row + 1 },
    ]
  }

  // Cherry MX alignment peg positions (no electrical, just drill holes)
  function kswPegs(sw) {
    if (sw.orientation === 'h') {
      return [
        { col: sw.col - 2, row: sw.row },
        { col: sw.col + 2, row: sw.row },
      ]
    }
    return [
      { col: sw.col, row: sw.row - 2 },
      { col: sw.col, row: sw.row + 2 },
    ]
  }

  function getDipPads(dip) {
    const spacing = dip.rowSpacing ?? 3;
    const pads = [];
    for (let i = 0; i < dip.count; i++) {
      if (dip.orientation === "v") {
        pads.push({ col: dip.col, row: dip.row + i, side: "left" });
        pads.push({ col: dip.col + spacing, row: dip.row + i, side: "right" });
      } else {
        pads.push({ col: dip.col + i, row: dip.row, side: "top" });
        pads.push({ col: dip.col + i, row: dip.row + spacing, side: "bottom" });
      }
    }
    return pads;
  }

  // Trace segment rendering
  function getTraceSegments(trace) {
    const segs = [];
    for (let i = 0; i < trace.points.length - 1; i++) {
      segs.push({
        x1: trace.points[i].col * pitch,
        y1: trace.points[i].row * pitch,
        x2: trace.points[i + 1].col * pitch,
        y2: trace.points[i + 1].row * pitch,
      });
    }
    return segs;
  }

  const padR = $derived(doc.padDiameter / 2);
  const drillR = $derived(doc.drillDiameter / 2);

  const allPadPositions = $derived.by(() => {
    const positions = [];
    for (const p of doc.pads) {
      positions.push({ x: p.col * pitch, y: p.row * pitch });
    }
    for (const h of doc.headers) {
      for (const hp of getHeaderPads(h)) {
        positions.push({ x: hp.col * pitch, y: hp.row * pitch });
      }
    }
    for (const d of doc.dips || []) {
      for (const dp of getDipPads(d)) {
        positions.push({ x: dp.col * pitch, y: dp.row * pitch });
      }
    }
    for (const cap of doc.capacitors || []) {
      positions.push({ x: cap.col * pitch, y: cap.row * pitch });
      if (cap.orientation === 'h') positions.push({ x: (cap.col + 1) * pitch, y: cap.row * pitch });
      else positions.push({ x: cap.col * pitch, y: (cap.row + 1) * pitch });
    }
    for (const res of doc.resistors || []) {
      const spacing = res.spacing ?? 4;
      positions.push({ x: res.col * pitch, y: res.row * pitch });
      if (res.orientation === 'h') positions.push({ x: (res.col + spacing) * pitch, y: res.row * pitch });
      else positions.push({ x: res.col * pitch, y: (res.row + spacing) * pitch });
    }
    for (const sw of doc.keyswitches || []) {
      for (const p of kswPins(sw)) {
        positions.push({ x: p.col * pitch, y: p.row * pitch });
      }
    }
    return positions;
  });

  // Dimension layout variables
  const dimensionTopY = $derived(-margin - pitch * 1.5);
  const dimensionLeftX = $derived(-margin - pitch * 1.5);
  const dimRightActive = $derived(dimDrag?.edge === "right" || dimHover === "right");
  const dimBottomActive = $derived(dimDrag?.edge === "bottom" || dimHover === "bottom");
  const dimDiameterActive = $derived(dimDrag?.edge === "diameter" || dimHover === "diameter");

  const dimDisplayW = $derived(dimDrag?.previewCols != null
    ? (dimDrag.previewCols - 1) * pitch + 2 * margin : boardW);
  const dimDisplayH = $derived(dimDrag?.previewRows != null
    ? (dimDrag.previewRows - 1) * pitch + 2 * margin : boardH);
  const dimDisplayDiam = $derived.by(() => {
    if (!isCircle) return 0;
    if (dimDrag?.previewCols != null) {
      const pR = Math.min(dimDrag.previewCols - 1, dimDrag.previewRows - 1) * pitch / 2 + margin;
      return pR * 2;
    }
    return circle ? circle.r * 2 : 0;
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  bind:this={containerEl}
  class="w-full h-full bg-slate-950 select-none relative"
  oncontextmenu={handleContextMenu}
>
  <svg
    bind:this={svgEl}
    viewBox="{vb.x} {vb.y} {vb.w} {vb.h}"
    class="w-full h-full"
    style={dimDrag?.edge === "diameter" || dimHover === "diameter" ? "cursor: ew-resize" : dimDrag?.edge === "right" || dimHover === "right" ? "cursor: ew-resize" : dimDrag?.edge === "bottom" || dimHover === "bottom" ? "cursor: ns-resize" : ""}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onwheel={handleWheel}
    ondblclick={handleDblClick}
  >
    <!-- Board -->
    {#if isCircle && circle}
      <circle
        cx={circle.cx}
        cy={circle.cy}
        r={circle.r}
        fill="#1a5c35"
      />
    {:else}
      <rect
        x={-margin}
        y={-margin}
        width={boardW}
        height={boardH}
        fill="#1a5c35"
        rx="0.5"
      />
    {/if}

    <!-- Dimension drag preview outline -->
    {#if dimDrag?.previewCols != null}
      {@const pCols = dimDrag.previewCols}
      {@const pRows = dimDrag.previewRows}
      {@const pW = (pCols - 1) * pitch + 2 * margin}
      {@const pH = (pRows - 1) * pitch + 2 * margin}
      {#if isCircle}
        {@const pR = Math.min(pCols - 1, pRows - 1) * pitch / 2 + margin}
        {@const pCx = (pCols - 1) * pitch / 2}
        {@const pCy = (pRows - 1) * pitch / 2}
        <circle
          cx={pCx}
          cy={pCy}
          r={pR}
          fill="none"
          stroke="#38bdf8"
          stroke-width={pitch * 0.08}
          stroke-dasharray="{pitch * 0.2},{pitch * 0.15}"
          opacity="0.6"
        />
      {:else}
        <rect
          x={-margin}
          y={-margin}
          width={pW}
          height={pH}
          fill="none"
          stroke="#38bdf8"
          stroke-width={pitch * 0.08}
          stroke-dasharray="{pitch * 0.2},{pitch * 0.15}"
          opacity="0.6"
          rx="0.5"
        />
      {/if}
    {/if}

    <!-- Dimensions (Interactive Technical Drawing style) -->
    {#if isCircle && circle}
      {@const dimY = circle.cy - circle.r - pitch * 1.5}
      {@const diam = circle.r * 2}
      <g
        class="dimensions"
        opacity="0.5"
        stroke="#38bdf8"
        fill="#38bdf8"
        font-family="monospace"
        stroke-width={pitch * 0.05}
      >
        <!-- Diameter Dimension -->
        <line
          x1={circle.cx - circle.r + pitch * 0.4}
          y1={dimY}
          x2={circle.cx - pitch * 1.8}
          y2={dimY}
        />
        <line
          x1={circle.cx + pitch * 1.8}
          y1={dimY}
          x2={circle.cx + circle.r - pitch * 0.4}
          y2={dimY}
        />
        <polygon
          points="{circle.cx - circle.r},{dimY} {circle.cx - circle.r + pitch * 0.4},{dimY - pitch * 0.15} {circle.cx - circle.r + pitch * 0.4},{dimY + pitch * 0.15}"
          stroke="none"
        />
        <polygon
          points="{circle.cx + circle.r},{dimY} {circle.cx + circle.r - pitch * 0.4},{dimY - pitch * 0.15} {circle.cx + circle.r - pitch * 0.4},{dimY + pitch * 0.15}"
          stroke="none"
          opacity={dimDiameterActive ? 1 : undefined}
        />
        <line
          x1={circle.cx - circle.r}
          y1={dimY - pitch * 0.3}
          x2={circle.cx - circle.r}
          y2={circle.cy - circle.r - pitch * 0.2}
          stroke-dasharray="{pitch * 0.1},{pitch * 0.1}"
          stroke-width={pitch * 0.04}
        />
        <line
          x1={circle.cx + circle.r}
          y1={dimY - pitch * 0.3}
          x2={circle.cx + circle.r}
          y2={circle.cy - circle.r - pitch * 0.2}
          stroke-dasharray="{pitch * 0.1},{pitch * 0.1}"
          stroke-width={pitch * 0.04}
        />
        <text
          x={circle.cx}
          y={dimY}
          text-anchor="middle"
          dominant-baseline="central"
          stroke="none"
          font-size={pitch * 0.55}
          font-weight="bold"
          letter-spacing="0.1em">{dimDisplayDiam.toFixed(1)}</text
        >
      </g>

      <!-- Diameter drag handle -->
      <circle
        cx={circle.cx + circle.r}
        cy={dimY}
        r={pitch * 1.0}
        fill={dimDiameterActive ? "rgba(56,189,248,0.15)" : "transparent"}
        stroke={dimDiameterActive ? "#38bdf8" : "none"}
        stroke-width={pitch * 0.06}
        stroke-dasharray={dimDiameterActive ? `${pitch * 0.15},${pitch * 0.1}` : "none"}
        style="cursor: ew-resize"
      />
    {:else}
      <g
        class="dimensions"
        opacity="0.5"
        stroke="#38bdf8"
        fill="#38bdf8"
        font-family="monospace"
        stroke-width={pitch * 0.05}
      >
        <!-- Top Width Dimension -->
        <line
          x1={-margin + pitch * 0.4}
          y1={dimensionTopY}
          x2={boardW / 2 - pitch * 1.8}
          y2={dimensionTopY}
        />
        <line
          x1={boardW / 2 + pitch * 1.8}
          y1={dimensionTopY}
          x2={-margin + boardW - pitch * 0.4}
          y2={dimensionTopY}
        />
        <polygon
          points="{-margin}, {dimensionTopY} {-margin +
            pitch * 0.4}, {dimensionTopY - pitch * 0.15} {-margin +
            pitch * 0.4}, {dimensionTopY + pitch * 0.15}"
          stroke="none"
        />
        <polygon
          points="{-margin + boardW}, {dimensionTopY} {-margin +
            boardW -
            pitch * 0.4}, {dimensionTopY - pitch * 0.15} {-margin +
            boardW -
            pitch * 0.4}, {dimensionTopY + pitch * 0.15}"
          stroke="none"
          opacity={dimRightActive ? 1 : undefined}
        />
        <line
          x1={-margin}
          y1={dimensionTopY - pitch * 0.3}
          x2={-margin}
          y2={-margin - pitch * 0.2}
          stroke-dasharray="{pitch * 0.1},{pitch * 0.1}"
          stroke-width={pitch * 0.04}
        />
        <line
          x1={-margin + boardW}
          y1={dimensionTopY - pitch * 0.3}
          x2={-margin + boardW}
          y2={-margin - pitch * 0.2}
          stroke-dasharray="{pitch * 0.1},{pitch * 0.1}"
          stroke-width={pitch * 0.04}
        />
        <text
          x={boardW / 2 - margin}
          y={dimensionTopY}
          text-anchor="middle"
          dominant-baseline="central"
          stroke="none"
          font-size={pitch * 0.55}
          font-weight="bold"
          letter-spacing="0.1em">{dimDisplayW.toFixed(1)}</text
        >

        <!-- Left Height Dimension -->
        <line
          x1={dimensionLeftX}
          y1={-margin + pitch * 0.4}
          x2={dimensionLeftX}
          y2={boardH / 2 - pitch * 1.8}
        />
        <line
          x1={dimensionLeftX}
          y1={boardH / 2 + pitch * 1.8}
          x2={dimensionLeftX}
          y2={-margin + boardH - pitch * 0.4}
        />
        <polygon
          points="{dimensionLeftX}, {-margin} {dimensionLeftX -
            pitch * 0.15}, {-margin + pitch * 0.4} {dimensionLeftX +
            pitch * 0.15}, {-margin + pitch * 0.4}"
          stroke="none"
        />
        <polygon
          points="{dimensionLeftX}, {-margin + boardH} {dimensionLeftX -
            pitch * 0.15}, {-margin + boardH - pitch * 0.4} {dimensionLeftX +
            pitch * 0.15}, {-margin + boardH - pitch * 0.4}"
          stroke="none"
          opacity={dimBottomActive ? 1 : undefined}
        />
        <line
          x1={dimensionLeftX - pitch * 0.3}
          y1={-margin}
          x2={-margin - pitch * 0.2}
          y2={-margin}
          stroke-dasharray="{pitch * 0.1},{pitch * 0.1}"
          stroke-width={pitch * 0.04}
        />
        <line
          x1={dimensionLeftX - pitch * 0.3}
          y1={-margin + boardH}
          x2={-margin - pitch * 0.2}
          y2={-margin + boardH}
          stroke-dasharray="{pitch * 0.1},{pitch * 0.1}"
          stroke-width={pitch * 0.04}
        />
        <g
          transform="translate({dimensionLeftX}, {boardH / 2 -
            margin}) rotate(-90)"
        >
          <text
            x="0"
            y="0"
            text-anchor="middle"
            dominant-baseline="central"
            stroke="none"
            font-size={pitch * 0.55}
            font-weight="bold"
            letter-spacing="0.1em">{dimDisplayH.toFixed(1)}</text
          >
        </g>
      </g>

      <!-- Dimension drag handles (invisible hit targets) -->
      <circle
        cx={-margin + boardW}
        cy={dimensionTopY}
        r={pitch * 1.0}
        fill={dimRightActive ? "rgba(56,189,248,0.15)" : "transparent"}
        stroke={dimRightActive ? "#38bdf8" : "none"}
        stroke-width={pitch * 0.06}
        stroke-dasharray={dimRightActive ? `${pitch * 0.15},${pitch * 0.1}` : "none"}
        style="cursor: ew-resize"
      />
      <circle
        cx={dimensionLeftX}
        cy={-margin + boardH}
        r={pitch * 1.0}
        fill={dimBottomActive ? "rgba(56,189,248,0.15)" : "transparent"}
      stroke={dimBottomActive ? "#38bdf8" : "none"}
      stroke-width={pitch * 0.06}
      stroke-dasharray={dimBottomActive ? `${pitch * 0.15},${pitch * 0.1}` : "none"}
      style="cursor: ns-resize"
    />
    {/if}

    {#if isCircle && circle}
      <defs>
        <clipPath id="board-clip">
          <circle cx={circle.cx} cy={circle.cy} r={circle.r} />
        </clipPath>
      </defs>
    {/if}

    <!-- Grid lines -->
    <g class="grid-lines" clip-path={isCircle ? "url(#board-clip)" : undefined}>
    {#each Array(cols) as _, c}
      <line
        x1={c * pitch}
        y1={-margin}
        x2={c * pitch}
        y2={(rows - 1) * pitch + margin}
        stroke="rgba(255,255,255,0.06)"
        stroke-width={pitch * 0.02}
      />
    {/each}
    {#each Array(rows) as _, r}
      <line
        x1={-margin}
        y1={r * pitch}
        x2={(cols - 1) * pitch + margin}
        y2={r * pitch}
        stroke="rgba(255,255,255,0.06)"
        stroke-width={pitch * 0.02}
      />
    {/each}
    </g>

    <!-- Grid dots (full + half grid) -->
    <g class="grid-dots">
    {#each Array(cols * 2 - 1) as _, ci}
      {#each Array(rows * 2 - 1) as _, ri}
        {@const dotX = (ci * pitch) / 2}
        {@const dotY = (ri * pitch) / 2}
        {@const isFull = ci % 2 === 0 && ri % 2 === 0}
        {#if !isCircle || !circle || Math.hypot(dotX - circle.cx, dotY - circle.cy) <= circle.r}
          <circle
            cx={dotX}
            cy={dotY}
            r={isFull ? pitch * 0.06 : pitch * 0.03}
            fill={isFull ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)"}
          />
        {/if}
      {/each}
    {/each}
    </g>

    <!-- Traces -->
    {#each doc.traces as trace}
      {@const isSelected = selectedIds.includes(trace.id)}
      {@const netCol = traceColor(nets, trace.id)}
      <g opacity={traceDim(trace.id)}>
      {#if trace.type === "curve"}
        {@const pts = trace.points.map((p) => ({
          x: p.col * pitch,
          y: p.row * pitch,
        }))}
        {@const ew = trace.endWidth ?? trace.width}
        {@const ew2 = trace.endWidth2 ?? ew}
        {@const hasTaper = ew > trace.width || ew2 > trace.width}
        {@const td = trace.taperDistance ?? 0}
        {@const tn = trace.tension ?? 0.5}
        {#if hasTaper}
          {@const outline = variableWidthOutlinePath(
            pts,
            trace.width,
            ew,
            32,
            tn,
            td,
            ew2,
          )}
          {#if isSelected}
            <path
              d={outline}
              stroke="rgba(255,255,255,0.45)"
              stroke-width={pitch * 0.08}
              fill="rgba(255,255,255,0.15)"
            />
          {/if}
          <path
            d={outline}
            fill={isSelected ? "#fbbf24" : netCol}
            stroke={isSelected ? "#fbbf24" : netCol}
            stroke-width={pitch * 0.02}
            opacity={isSelected ? 1 : 0.85}
          />
        {:else}
          {@const d = catmullRomSVGPath(pts, tn)}
          {#if isSelected}
            <path
              {d}
              stroke="rgba(255,255,255,0.45)"
              stroke-width={trace.width + pitch * 0.08}
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            />
          {/if}
          <path
            {d}
            stroke={isSelected ? "#fbbf24" : netCol}
            stroke-width={trace.width}
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
            opacity={isSelected ? 1 : 0.85}
          />
        {/if}
        {#if isSelected}
          <!-- Control polygon -->
          {#each trace.points as pt, i}
            {#if i > 0}
              <line
                x1={trace.points[i - 1].col * pitch}
                y1={trace.points[i - 1].row * pitch}
                x2={pt.col * pitch}
                y2={pt.row * pitch}
                stroke="rgba(34,197,94,0.5)"
                stroke-width={pitch * 0.03}
                stroke-dasharray={pitch * 0.08}
              />
            {/if}
          {/each}
          {#each trace.points as pt, i}
            {@const isActiveCP =
              activeCP &&
              activeCP.traceId === trace.id &&
              activeCP.pointIndex === i}
            <circle
              cx={pt.col * pitch}
              cy={pt.row * pitch}
              r={isActiveCP ? pitch * 0.18 : pitch * 0.14}
              fill={isActiveCP ? "#fbbf24" : "#22c55e"}
              stroke="white"
              stroke-width={pitch * 0.02}
              opacity="0.9"
              style="cursor: pointer"
            />
            {#if isActiveCP && trace.points.length > 2 && i > 0 && i < trace.points.length - 1}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <g
                style="cursor: pointer"
                onpointerdown={(e) => {
                  e.stopPropagation();
                  onDeleteControlPoint(activeCP.traceId, activeCP.pointIndex);
                  activeCP = null;
                }}
              >
                <circle
                  cx={pt.col * pitch + pitch * 0.3}
                  cy={pt.row * pitch - pitch * 0.3}
                  r={pitch * 0.13}
                  fill="#ef4444"
                  stroke="white"
                  stroke-width={pitch * 0.02}
                />
                <line
                  x1={pt.col * pitch + pitch * 0.3 - pitch * 0.06}
                  y1={pt.row * pitch - pitch * 0.3 - pitch * 0.06}
                  x2={pt.col * pitch + pitch * 0.3 + pitch * 0.06}
                  y2={pt.row * pitch - pitch * 0.3 + pitch * 0.06}
                  stroke="white"
                  stroke-width={pitch * 0.03}
                  stroke-linecap="round"
                />
                <line
                  x1={pt.col * pitch + pitch * 0.3 + pitch * 0.06}
                  y1={pt.row * pitch - pitch * 0.3 - pitch * 0.06}
                  x2={pt.col * pitch + pitch * 0.3 - pitch * 0.06}
                  y2={pt.row * pitch - pitch * 0.3 + pitch * 0.06}
                  stroke="white"
                  stroke-width={pitch * 0.03}
                  stroke-linecap="round"
                />
              </g>
            {/if}
          {/each}
        {/if}
      {:else if trace.type === "roundtrace"}
        {@const pathSegs =
          trace.mode === "subdivision"
            ? computeSubdivisionRounding(
                trace.points,
                trace.radius ?? 1.0,
                trace.passes ?? 2,
                pitch,
              )
            : computeRoundedCorners(trace.points, trace.radius ?? 1.0, pitch)}
        {@const d = roundedPathToSVG(pathSegs)}
        {@const teardrops = trace.teardrop
          ? computeTeardrops(
              trace.points,
              trace.width,
              pitch,
              allPadPositions,
              padR,
              trace.tdHPercent ?? 50,
              trace.tdVPercent ?? 90,
            )
          : []}
        {#if d}
          {#if isSelected}
            <path
              {d}
              stroke="rgba(255,255,255,0.45)"
              stroke-width={trace.width + pitch * 0.08}
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            />
          {/if}
          <path
            {d}
            stroke={isSelected ? "#fbbf24" : netCol}
            stroke-width={trace.width}
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
            opacity={isSelected ? 1 : 0.85}
          />
          {#each teardrops as td}
            <path
              d={td.svgPath}
              fill={isSelected ? "#fbbf24" : netCol}
              opacity={isSelected ? 0.9 : 0.75}
              stroke="none"
            />
          {/each}
        {/if}
        {#if isSelected}
          <!-- Control polygon -->
          {#each trace.points as pt, i}
            {#if i > 0}
              <line
                x1={trace.points[i - 1].col * pitch}
                y1={trace.points[i - 1].row * pitch}
                x2={pt.col * pitch}
                y2={pt.row * pitch}
                stroke="rgba(34,197,94,0.5)"
                stroke-width={pitch * 0.03}
                stroke-dasharray={pitch * 0.08}
              />
            {/if}
          {/each}
          {#each trace.points as pt, i}
            {@const isActiveCP =
              activeCP &&
              activeCP.traceId === trace.id &&
              activeCP.pointIndex === i}
            <circle
              cx={pt.col * pitch}
              cy={pt.row * pitch}
              r={isActiveCP ? pitch * 0.18 : pitch * 0.14}
              fill={isActiveCP ? "#fbbf24" : "#22c55e"}
              stroke="white"
              stroke-width={pitch * 0.02}
              opacity="0.9"
              style="cursor: pointer"
            />
            {#if isActiveCP && trace.points.length > 2 && i > 0 && i < trace.points.length - 1}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <g
                style="cursor: pointer"
                onpointerdown={(e) => {
                  e.stopPropagation();
                  onDeleteControlPoint(activeCP.traceId, activeCP.pointIndex);
                  activeCP = null;
                }}
              >
                <circle
                  cx={pt.col * pitch + pitch * 0.3}
                  cy={pt.row * pitch - pitch * 0.3}
                  r={pitch * 0.13}
                  fill="#ef4444"
                  stroke="white"
                  stroke-width={pitch * 0.02}
                />
                <line
                  x1={pt.col * pitch + pitch * 0.3 - pitch * 0.06}
                  y1={pt.row * pitch - pitch * 0.3 - pitch * 0.06}
                  x2={pt.col * pitch + pitch * 0.3 + pitch * 0.06}
                  y2={pt.row * pitch - pitch * 0.3 + pitch * 0.06}
                  stroke="white"
                  stroke-width={pitch * 0.03}
                  stroke-linecap="round"
                />
                <line
                  x1={pt.col * pitch + pitch * 0.3 + pitch * 0.06}
                  y1={pt.row * pitch - pitch * 0.3 - pitch * 0.06}
                  x2={pt.col * pitch + pitch * 0.3 - pitch * 0.06}
                  y2={pt.row * pitch - pitch * 0.3 + pitch * 0.06}
                  stroke="white"
                  stroke-width={pitch * 0.03}
                  stroke-linecap="round"
                />
              </g>
            {/if}
          {/each}
        {/if}
      {:else if trace.type === "freetrace"}
        {@const pathSegs = computeSubdivisionRounding(
          trace.points,
          trace.radius ?? 1.0,
          trace.passes ?? 2,
          pitch,
        )}
        {@const d = roundedPathToSVG(pathSegs)}
        {#if d}
          {#if isSelected}
            <path
              {d}
              stroke="rgba(255,255,255,0.45)"
              stroke-width={trace.width + pitch * 0.08}
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            />
          {/if}
          <path
            {d}
            stroke={isSelected ? "#fbbf24" : netCol}
            stroke-width={trace.width}
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
            opacity={isSelected ? 1 : 0.85}
          />
        {/if}
        {#if isSelected}
          {#each trace.points as pt, i}
            {#if i > 0}
              <line
                x1={trace.points[i - 1].col * pitch}
                y1={trace.points[i - 1].row * pitch}
                x2={pt.col * pitch}
                y2={pt.row * pitch}
                stroke="rgba(34,197,94,0.5)"
                stroke-width={pitch * 0.03}
                stroke-dasharray={pitch * 0.08}
              />
            {/if}
          {/each}
          {#each trace.points as pt, i}
            {@const isActiveCP =
              activeCP &&
              activeCP.traceId === trace.id &&
              activeCP.pointIndex === i}
            <circle
              cx={pt.col * pitch}
              cy={pt.row * pitch}
              r={isActiveCP ? pitch * 0.18 : pitch * 0.14}
              fill={isActiveCP ? "#fbbf24" : "#22c55e"}
              stroke="white"
              stroke-width={pitch * 0.02}
              opacity="0.9"
              style="cursor: pointer"
            />
          {/each}
        {/if}
      {:else}
        {@const sqCorners = trace.cornerShape === 'square'}
        {@const sqEnds = trace.endShape === 'square'}
        {#if sqCorners}
          {@const polyPts = trace.points.map(p => `${p.col * pitch},${p.row * pitch}`).join(' ')}
          {#if isSelected}
            <polyline
              points={polyPts}
              stroke="rgba(255,255,255,0.45)"
              stroke-width={trace.width + pitch * 0.08}
              stroke-linecap={sqEnds ? 'square' : 'round'}
              stroke-linejoin="miter"
              stroke-miterlimit="10"
              fill="none"
            />
          {/if}
          <polyline
            points={polyPts}
            stroke={isSelected ? "#fbbf24" : netCol}
            stroke-width={trace.width}
            stroke-linecap={sqEnds ? 'square' : 'round'}
            stroke-linejoin="miter"
            stroke-miterlimit="10"
            fill="none"
            opacity={isSelected ? 1 : 0.85}
          />
        {:else}
          {#if isSelected}
            {#each getTraceSegments(trace) as seg}
              <line
                x1={seg.x1}
                y1={seg.y1}
                x2={seg.x2}
                y2={seg.y2}
                stroke="rgba(255,255,255,0.45)"
                stroke-width={trace.width + pitch * 0.08}
                stroke-linecap={sqEnds ? 'butt' : 'round'}
              />
            {/each}
          {/if}
          {#each getTraceSegments(trace) as seg}
            <line
              x1={seg.x1}
              y1={seg.y1}
              x2={seg.x2}
              y2={seg.y2}
              stroke={isSelected ? "#fbbf24" : netCol}
              stroke-width={trace.width}
              stroke-linecap={sqEnds ? 'butt' : 'round'}
              opacity={isSelected ? 1 : 0.85}
            />
          {/each}
          {#if sqEnds}
            {#each [trace.points[0], trace.points[trace.points.length - 1]] as pt}
              {@const hw = trace.width / 2}
              <rect
                x={pt.col * pitch - hw}
                y={pt.row * pitch - hw}
                width={trace.width}
                height={trace.width}
                fill={isSelected ? "#fbbf24" : netCol}
                opacity={isSelected ? 1 : 0.85}
              />
            {/each}
          {/if}
        {/if}
        {#if isSelected}
          {#each trace.points as pt, i}
            {@const isActiveCP =
              activeCP &&
              activeCP.traceId === trace.id &&
              activeCP.pointIndex === i}
            <circle
              cx={pt.col * pitch}
              cy={pt.row * pitch}
              r={isActiveCP ? pitch * 0.18 : pitch * 0.14}
              fill={isActiveCP ? "#fbbf24" : "#22c55e"}
              stroke="white"
              stroke-width={pitch * 0.02}
              opacity="0.9"
              style="cursor: pointer"
            />
            {#if isActiveCP && trace.points.length > 2 && i > 0 && i < trace.points.length - 1}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <g
                style="cursor: pointer"
                onpointerdown={(e) => {
                  e.stopPropagation();
                  onDeleteControlPoint(activeCP.traceId, activeCP.pointIndex);
                  activeCP = null;
                }}
              >
                <circle
                  cx={pt.col * pitch + pitch * 0.3}
                  cy={pt.row * pitch - pitch * 0.3}
                  r={pitch * 0.13}
                  fill="#ef4444"
                  stroke="white"
                  stroke-width={pitch * 0.02}
                />
                <line
                  x1={pt.col * pitch + pitch * 0.3 - pitch * 0.06}
                  y1={pt.row * pitch - pitch * 0.3 - pitch * 0.06}
                  x2={pt.col * pitch + pitch * 0.3 + pitch * 0.06}
                  y2={pt.row * pitch - pitch * 0.3 + pitch * 0.06}
                  stroke="white"
                  stroke-width={pitch * 0.03}
                  stroke-linecap="round"
                />
                <line
                  x1={pt.col * pitch + pitch * 0.3 + pitch * 0.06}
                  y1={pt.row * pitch - pitch * 0.3 - pitch * 0.06}
                  x2={pt.col * pitch + pitch * 0.3 - pitch * 0.06}
                  y2={pt.row * pitch - pitch * 0.3 + pitch * 0.06}
                  stroke="white"
                  stroke-width={pitch * 0.03}
                  stroke-linecap="round"
                />
              </g>
            {/if}
          {/each}
        {/if}
      {/if}
      </g>
    {/each}

    <!-- In-progress drawings (editor-only) -->
    <g class="editor-interactive">
    <!-- In-progress trace -->
    {#each tracePoints as pt, i}
      {#if i > 0}
        <line
          x1={tracePoints[i - 1].col * pitch}
          y1={tracePoints[i - 1].row * pitch}
          x2={pt.col * pitch}
          y2={pt.row * pitch}
          stroke="#f5c842"
          stroke-width={doc.traceWidth}
          stroke-linecap="round"
          opacity="0.6"
        />
      {/if}
    {/each}

    <!-- Trace preview (cursor to last point) -->
    {#if tracePreview && tracePoints.length > 0}
      {@const last = tracePoints[tracePoints.length - 1]}
      <line
        x1={last.col * pitch}
        y1={last.row * pitch}
        x2={tracePreview.col2 * pitch}
        y2={last.row * pitch}
        stroke="#f5c842"
        stroke-width={doc.traceWidth}
        stroke-linecap="round"
        opacity="0.3"
        stroke-dasharray={pitch * 0.15}
      />
      <line
        x1={tracePreview.col2 * pitch}
        y1={last.row * pitch}
        x2={tracePreview.col2 * pitch}
        y2={tracePreview.row2 * pitch}
        stroke="#f5c842"
        stroke-width={doc.traceWidth}
        stroke-linecap="round"
        opacity="0.3"
        stroke-dasharray={pitch * 0.15}
      />
    {/if}

    <!-- In-progress freetrace -->
    {#if freetraceDrawing && freetracePoints.length >= 2}
      <polyline
        points={freetracePoints.map(p => `${p.col * pitch},${p.row * pitch}`).join(' ')}
        stroke="#f5c842"
        stroke-width={doc.traceWidth}
        stroke-linecap="round"
        stroke-linejoin="round"
        fill="none"
        opacity="0.6"
      />
    {/if}

    <!-- In-progress curve -->
    {#if curvePoints.length >= 2}
      {@const pts = curvePoints.map((p) => ({
        x: p.col * pitch,
        y: p.row * pitch,
      }))}
      {@const ew = doc.curveEndWidth ?? doc.traceWidth}
      {@const ew2 = doc.curveEndWidth2 ?? ew}
      {#if ew > doc.traceWidth || ew2 > doc.traceWidth}
        {@const outline = variableWidthOutlinePath(
          pts,
          doc.traceWidth,
          ew,
          32,
          0.5,
          0,
          ew2,
        )}
        <path
          d={outline}
          fill="#f5c842"
          opacity="0.5"
          stroke="#b8941f"
          stroke-width={pitch * 0.02}
        />
      {:else}
        {@const d = catmullRomSVGPath(pts)}
        <path
          {d}
          stroke="#f5c842"
          stroke-width={doc.traceWidth}
          stroke-linecap="round"
          stroke-linejoin="round"
          fill="none"
          opacity="0.6"
        />
      {/if}
      <!-- Control polygon while drawing -->
      {#each curvePoints as pt, i}
        {#if i > 0}
          <line
            x1={curvePoints[i - 1].col * pitch}
            y1={curvePoints[i - 1].row * pitch}
            x2={pt.col * pitch}
            y2={pt.row * pitch}
            stroke="rgba(34,197,94,0.4)"
            stroke-width={pitch * 0.03}
            stroke-dasharray={pitch * 0.08}
          />
        {/if}
      {/each}
    {/if}

    <!-- Curve preview (smooth path through waypoints + cursor) -->
    {#if curvePreview && curvePoints.length >= 1}
      {@const pts = [
        ...curvePoints,
        { col: curvePreview.col, row: curvePreview.row },
      ].map((p) => ({ x: p.col * pitch, y: p.row * pitch }))}
      {@const ew = doc.curveEndWidth ?? doc.traceWidth}
      {@const ew2 = doc.curveEndWidth2 ?? ew}
      {#if ew > doc.traceWidth || ew2 > doc.traceWidth}
        {@const outline = variableWidthOutlinePath(
          pts,
          doc.traceWidth,
          ew,
          32,
          0.5,
          0,
          ew2,
        )}
        <path
          d={outline}
          fill="#f5c842"
          opacity="0.2"
          stroke="#b8941f"
          stroke-width={pitch * 0.02}
        />
      {:else}
        {@const d = catmullRomSVGPath(pts)}
        <path
          {d}
          stroke="#f5c842"
          stroke-width={doc.traceWidth}
          stroke-linecap="round"
          stroke-linejoin="round"
          fill="none"
          opacity="0.3"
          stroke-dasharray={pitch * 0.15}
        />
      {/if}
    {/if}

    <!-- Curve waypoint dots -->
    {#each curvePoints as pt}
      <circle
        cx={pt.col * pitch}
        cy={pt.row * pitch}
        r={pitch * 0.1}
        fill="#22c55e"
        stroke="white"
        stroke-width={pitch * 0.02}
        opacity="0.7"
      />
    {/each}
    </g>

    <!-- Header bodies -->
    {#each doc.headers as header}
      {@const isSelected = selectedIds.includes(header.id)}
      {@const isFemale = header.female ?? false}
      {@const hpads = getHeaderPads(header)}
      {#if hpads.length > 1}
        {@const minC = Math.min(...hpads.map((p) => p.col))}
        {@const maxC = Math.max(...hpads.map((p) => p.col))}
        {@const minR = Math.min(...hpads.map((p) => p.row))}
        {@const maxR = Math.max(...hpads.map((p) => p.row))}
        {@const margin = isFemale ? 0.4 : 0.2}
        <rect
          x={minC * pitch - padR - margin}
          y={minR * pitch - padR - margin}
          width={(maxC - minC) * pitch + 2 * padR + margin * 2}
          height={(maxR - minR) * pitch + 2 * padR + margin * 2}
          fill={isFemale ? "rgba(120,80,200,0.08)" : "none"}
          stroke={isSelected ? "#fbbf24" : isFemale ? "rgba(180,140,255,0.35)" : "rgba(255,255,255,0.2)"}
          stroke-width={isFemale ? "0.2" : "0.15"}
          rx="0.3"
        />
      {/if}
      {#each hpads as hp, i}
        {@const hpFill = padFillFor(nets, hp.col, hp.row, isSelected, header.labels?.[i])}
        <g opacity={padDim(hp.col, hp.row)}>
        {#if isSelected}
          <circle
            cx={hp.col * pitch}
            cy={hp.row * pitch}
            r={padR + pitch * 0.04}
            fill="rgba(255,255,255,0.45)"
          />
        {/if}
        {#if isFemale}
          <rect
            x={hp.col * pitch - padR}
            y={hp.row * pitch - padR}
            width={padR * 2}
            height={padR * 2}
            rx={padR * 0.3}
            fill={hpFill}
          />
        {:else}
          <circle
            cx={hp.col * pitch}
            cy={hp.row * pitch}
            r={padR}
            fill={hpFill}
          />
        {/if}
        <circle
          cx={hp.col * pitch}
          cy={hp.row * pitch}
          r={drillR}
          fill="#1a1a2e"
        />
        {#if header.labels?.[i]}
          <text
            x={hp.col * pitch}
            y={hp.row * pitch - padR - pitch * 0.08}
            text-anchor="middle"
            dominant-baseline="auto"
            fill="rgba(255,255,255,0.7)"
            font-size={pitch * 0.35}
            font-family="monospace"
            font-weight="bold">{header.labels[i]}</text
          >
        {/if}
        </g>
      {/each}
    {/each}

    <!-- Header preview -->
    {#if headerPreview}
      {#each Array(headerPreview.count) as _, i}
        {@const c =
          headerPreview.orientation === "h"
            ? headerPreview.col + i
            : headerPreview.col}
        {@const r =
          headerPreview.orientation === "v"
            ? headerPreview.row + i
            : headerPreview.row}
        <circle
          cx={c * pitch}
          cy={r * pitch}
          r={padR}
          fill="#d4a534"
          opacity="0.4"
        />
        <circle
          cx={c * pitch}
          cy={r * pitch}
          r={drillR}
          fill="#1a1a2e"
          opacity="0.4"
        />
      {/each}
      {@const midC =
        headerPreview.orientation === "h"
          ? headerPreview.col + (headerPreview.count - 1) / 2
          : headerPreview.col}
      {@const midR =
        headerPreview.orientation === "v"
          ? headerPreview.row + (headerPreview.count - 1) / 2
          : headerPreview.row}
      <text
        x={midC * pitch}
        y={midR * pitch - padR - pitch * 0.15}
        text-anchor="middle"
        dominant-baseline="auto"
        fill="rgba(255,255,255,0.7)"
        font-size={pitch * 0.55}
        font-weight="bold">{headerPreview.count}</text
      >
    {/if}

    <!-- DIP bodies -->
    {#each doc.dips || [] as dip}
      {@const isSelected = selectedIds.includes(dip.id)}
      {@const dpads = getDipPads(dip)}
      {@const spacing = dip.rowSpacing ?? 3}
      {@const bodyX =
        dip.orientation === "v"
          ? dip.col * pitch + pitch * 0.3
          : dip.col * pitch - padR - 0.2}
      {@const bodyY =
        dip.orientation === "v"
          ? dip.row * pitch - padR - 0.2
          : dip.row * pitch + pitch * 0.3}
      {@const bodyW =
        dip.orientation === "v"
          ? spacing * pitch - pitch * 0.6
          : (dip.count - 1) * pitch + 2 * padR + 0.4}
      {@const bodyH =
        dip.orientation === "v"
          ? (dip.count - 1) * pitch + 2 * padR + 0.4
          : spacing * pitch - pitch * 0.6}
      <rect
        x={bodyX}
        y={bodyY}
        width={bodyW}
        height={bodyH}
        fill={isSelected ? "rgba(251,191,36,0.15)" : "rgba(40,40,60,0.8)"}
        stroke={isSelected ? "#fbbf24" : "rgba(255,255,255,0.25)"}
        stroke-width="0.15"
        rx="0.3"
      />
      {#if dip.orientation === "v"}
        <path
          d="M{dip.col * pitch +
            (spacing * pitch) / 2 -
            pitch * 0.2},{bodyY} A{pitch * 0.2},{pitch * 0.2} 0 0 1 {dip.col *
            pitch +
            (spacing * pitch) / 2 +
            pitch * 0.2},{bodyY}"
          fill="none"
          stroke={isSelected ? "#fbbf24" : "rgba(255,255,255,0.35)"}
          stroke-width="0.12"
        />
      {:else}
        <path
          d="M{bodyX},{dip.row * pitch +
            (spacing * pitch) / 2 -
            pitch * 0.2} A{pitch * 0.2},{pitch * 0.2} 0 0 0 {bodyX},{dip.row *
            pitch +
            (spacing * pitch) / 2 +
            pitch * 0.2}"
          fill="none"
          stroke={isSelected ? "#fbbf24" : "rgba(255,255,255,0.35)"}
          stroke-width="0.12"
        />
      {/if}
      {#if dip.label}
        <text
          x={bodyX + bodyW / 2}
          y={bodyY + bodyH / 2}
          text-anchor="middle"
          dominant-baseline="central"
          fill="rgba(255,255,255,0.7)"
          font-size={pitch * 0.5}
          font-family="monospace"
          font-weight="bold">{dip.label}</text
        >
      {/if}
      {#each dpads as dp}
        {@const dpFill = padFillFor(nets, dp.col, dp.row, isSelected, null)}
        <g opacity={padDim(dp.col, dp.row)}>
        {#if isSelected}
          <circle
            cx={dp.col * pitch}
            cy={dp.row * pitch}
            r={padR + pitch * 0.04}
            fill="rgba(255,255,255,0.45)"
          />
        {/if}
        <circle
          cx={dp.col * pitch}
          cy={dp.row * pitch}
          r={padR}
          fill={dpFill}
        />
        <circle
          cx={dp.col * pitch}
          cy={dp.row * pitch}
          r={drillR}
          fill="#1a1a2e"
        />
        </g>
      {/each}
    {/each}

    <!-- DIP preview -->
    {#if dipPreview && dipPreview.count >= 2}
      {@const spacing = 3}
      {@const bodyX =
        dipPreview.orientation === "v"
          ? dipPreview.col * pitch + pitch * 0.3
          : dipPreview.col * pitch - padR - 0.2}
      {@const bodyY =
        dipPreview.orientation === "v"
          ? dipPreview.row * pitch - padR - 0.2
          : dipPreview.row * pitch + pitch * 0.3}
      {@const bodyW =
        dipPreview.orientation === "v"
          ? spacing * pitch - pitch * 0.6
          : (dipPreview.count - 1) * pitch + 2 * padR + 0.4}
      {@const bodyH =
        dipPreview.orientation === "v"
          ? (dipPreview.count - 1) * pitch + 2 * padR + 0.4
          : spacing * pitch - pitch * 0.6}
      <rect
        x={bodyX}
        y={bodyY}
        width={bodyW}
        height={bodyH}
        fill="rgba(40,40,60,0.3)"
        stroke="rgba(255,255,255,0.15)"
        stroke-width="0.15"
        rx="0.3"
      />
      {#each Array(dipPreview.count) as _, i}
        {#if dipPreview.orientation === "v"}
          <circle
            cx={dipPreview.col * pitch}
            cy={(dipPreview.row + i) * pitch}
            r={padR}
            fill="#d4a534"
            opacity="0.4"
          />
          <circle
            cx={dipPreview.col * pitch}
            cy={(dipPreview.row + i) * pitch}
            r={drillR}
            fill="#1a1a2e"
            opacity="0.4"
          />
          <circle
            cx={(dipPreview.col + spacing) * pitch}
            cy={(dipPreview.row + i) * pitch}
            r={padR}
            fill="#d4a534"
            opacity="0.4"
          />
          <circle
            cx={(dipPreview.col + spacing) * pitch}
            cy={(dipPreview.row + i) * pitch}
            r={drillR}
            fill="#1a1a2e"
            opacity="0.4"
          />
        {:else}
          <circle
            cx={(dipPreview.col + i) * pitch}
            cy={dipPreview.row * pitch}
            r={padR}
            fill="#d4a534"
            opacity="0.4"
          />
          <circle
            cx={(dipPreview.col + i) * pitch}
            cy={dipPreview.row * pitch}
            r={drillR}
            fill="#1a1a2e"
            opacity="0.4"
          />
          <circle
            cx={(dipPreview.col + i) * pitch}
            cy={(dipPreview.row + spacing) * pitch}
            r={padR}
            fill="#d4a534"
            opacity="0.4"
          />
          <circle
            cx={(dipPreview.col + i) * pitch}
            cy={(dipPreview.row + spacing) * pitch}
            r={drillR}
            fill="#1a1a2e"
            opacity="0.4"
          />
        {/if}
      {/each}
      <text
        x={bodyX + bodyW / 2}
        y={bodyY + bodyH / 2}
        text-anchor="middle"
        dominant-baseline="central"
        fill="rgba(255,255,255,0.7)"
        font-size={pitch * 0.7}
        font-weight="bold">{dipPreview.count * 2}</text
      >
    {/if}

    <!-- Capacitors -->
    {#each doc.capacitors || [] as cap}
      {@const isSelected = selectedIds.includes(cap.id)}
      {@const p1x = cap.col * pitch}
      {@const p1y = cap.row * pitch}
      {@const p2x = cap.orientation === 'h' ? (cap.col + 1) * pitch : cap.col * pitch}
      {@const p2y = cap.orientation === 'h' ? cap.row * pitch : (cap.row + 1) * pitch}
      {@const midX = (p1x + p2x) / 2}
      {@const midY = (p1y + p2y) / 2}
      {@const isElyt = (cap.type ?? 'ceramic') === 'electrolytic'}
      {@const bodyColor = isSelected ? "rgba(251,191,36,0.15)" : "rgba(40,40,60,0.8)"}
      {@const strokeColor = isSelected ? "#fbbf24" : "rgba(255,255,255,0.3)"}
      {@const lineColor = isSelected ? "#fbbf24" : "rgba(180,220,255,0.85)"}
      <!-- Lead lines -->
      {#if cap.orientation === 'h'}
        <line x1={p1x} y1={p1y} x2={midX - pitch * 0.12} y2={p1y} stroke={lineColor} stroke-width="0.12" stroke-linecap="round"/>
        <line x1={midX + pitch * 0.12} y1={p1y} x2={p2x} y2={p1y} stroke={lineColor} stroke-width="0.12" stroke-linecap="round"/>
        <!-- Plate 1 -->
        <line x1={midX - pitch * 0.12} y1={midY - pitch * 0.38} x2={midX - pitch * 0.12} y2={midY + pitch * 0.38} stroke={lineColor} stroke-width="0.22" stroke-linecap="round"/>
        <!-- Plate 2 -->
        {#if isElyt}
          <path d="M{midX + pitch * 0.12},{midY - pitch * 0.38} Q{midX + pitch * 0.22},{midY} {midX + pitch * 0.12},{midY + pitch * 0.38}" fill="none" stroke={lineColor} stroke-width="0.18" stroke-linecap="round"/>
          <text x={p1x + pitch * 0.12} y={p1y - pitch * 0.22} font-size={pitch * 0.28} text-anchor="middle" font-family="monospace" fill={lineColor}>+</text>
        {:else}
          <line x1={midX + pitch * 0.12} y1={midY - pitch * 0.38} x2={midX + pitch * 0.12} y2={midY + pitch * 0.38} stroke={lineColor} stroke-width="0.22" stroke-linecap="round"/>
        {/if}
      {:else}
        <line x1={p1x} y1={p1y} x2={p1x} y2={midY - pitch * 0.12} stroke={lineColor} stroke-width="0.12" stroke-linecap="round"/>
        <line x1={p1x} y1={midY + pitch * 0.12} x2={p2x} y2={p2y} stroke={lineColor} stroke-width="0.12" stroke-linecap="round"/>
        <!-- Plate 1 -->
        <line x1={midX - pitch * 0.38} y1={midY - pitch * 0.12} x2={midX + pitch * 0.38} y2={midY - pitch * 0.12} stroke={lineColor} stroke-width="0.22" stroke-linecap="round"/>
        <!-- Plate 2 -->
        {#if isElyt}
          <path d="M{midX - pitch * 0.38},{midY + pitch * 0.12} Q{midX},{midY + pitch * 0.22} {midX + pitch * 0.38},{midY + pitch * 0.12}" fill="none" stroke={lineColor} stroke-width="0.18" stroke-linecap="round"/>
          <text x={p1x + pitch * 0.22} y={p1y + pitch * 0.28} font-size={pitch * 0.28} text-anchor="middle" font-family="monospace" fill={lineColor}>+</text>
        {:else}
          <line x1={midX - pitch * 0.38} y1={midY + pitch * 0.12} x2={midX + pitch * 0.38} y2={midY + pitch * 0.12} stroke={lineColor} stroke-width="0.22" stroke-linecap="round"/>
        {/if}
      {/if}
      <!-- Pads -->
      {@const p2col = cap.orientation === 'h' ? cap.col + 1 : cap.col}
      {@const p2row = cap.orientation === 'h' ? cap.row : cap.row + 1}
      {@const cp1Fill = padFillFor(nets, cap.col, cap.row, isSelected, null)}
      {@const cp2Fill = padFillFor(nets, p2col, p2row, isSelected, null)}
      <g opacity={padDim(cap.col, cap.row)}>
        {#if isSelected}
          <circle cx={p1x} cy={p1y} r={padR + pitch * 0.04} fill="rgba(255,255,255,0.45)"/>
        {/if}
        <circle cx={p1x} cy={p1y} r={padR} fill={cp1Fill}/>
        <circle cx={p1x} cy={p1y} r={drillR} fill="#1a1a2e"/>
      </g>
      <g opacity={padDim(p2col, p2row)}>
        {#if isSelected}
          <circle cx={p2x} cy={p2y} r={padR + pitch * 0.04} fill="rgba(255,255,255,0.45)"/>
        {/if}
        <circle cx={p2x} cy={p2y} r={padR} fill={cp2Fill}/>
        <circle cx={p2x} cy={p2y} r={drillR} fill="#1a1a2e"/>
      </g>
      {#if cap.label}
        <text
          x={midX}
          y={cap.orientation === 'h' ? midY - padR - pitch * 0.08 : midX + padR + pitch * 0.05}
          text-anchor="middle"
          dominant-baseline="auto"
          fill="rgba(255,255,255,0.7)"
          font-size={pitch * 0.32}
          font-family="monospace"
          font-weight="bold">{cap.label}</text>
      {/if}
    {/each}

    <!-- Capacitor preview -->
    {#if capPreview}
      {@const p1x = capPreview.col * pitch}
      {@const p1y = capPreview.row * pitch}
      {@const p2x = capPreview.orientation === 'h' ? (capPreview.col + 1) * pitch : capPreview.col * pitch}
      {@const p2y = capPreview.orientation === 'h' ? capPreview.row * pitch : (capPreview.row + 1) * pitch}
      {@const midX = (p1x + p2x) / 2}
      {@const midY = (p1y + p2y) / 2}
      {#if capPreview.orientation === 'h'}
        <line x1={p1x} y1={p1y} x2={midX - pitch * 0.12} y2={p1y} stroke="rgba(180,220,255,0.4)" stroke-width="0.12"/>
        <line x1={midX + pitch * 0.12} y1={p1y} x2={p2x} y2={p1y} stroke="rgba(180,220,255,0.4)" stroke-width="0.12"/>
        <line x1={midX - pitch * 0.12} y1={midY - pitch * 0.38} x2={midX - pitch * 0.12} y2={midY + pitch * 0.38} stroke="rgba(180,220,255,0.4)" stroke-width="0.22"/>
        <line x1={midX + pitch * 0.12} y1={midY - pitch * 0.38} x2={midX + pitch * 0.12} y2={midY + pitch * 0.38} stroke="rgba(180,220,255,0.4)" stroke-width="0.22"/>
      {:else}
        <line x1={p1x} y1={p1y} x2={p1x} y2={midY - pitch * 0.12} stroke="rgba(180,220,255,0.4)" stroke-width="0.12"/>
        <line x1={p1x} y1={midY + pitch * 0.12} x2={p2x} y2={p2y} stroke="rgba(180,220,255,0.4)" stroke-width="0.12"/>
        <line x1={midX - pitch * 0.38} y1={midY - pitch * 0.12} x2={midX + pitch * 0.38} y2={midY - pitch * 0.12} stroke="rgba(180,220,255,0.4)" stroke-width="0.22"/>
        <line x1={midX - pitch * 0.38} y1={midY + pitch * 0.12} x2={midX + pitch * 0.38} y2={midY + pitch * 0.12} stroke="rgba(180,220,255,0.4)" stroke-width="0.22"/>
      {/if}
      <circle cx={p1x} cy={p1y} r={padR} fill="#d4a534" opacity="0.4"/>
      <circle cx={p1x} cy={p1y} r={drillR} fill="#1a1a2e" opacity="0.4"/>
      <circle cx={p2x} cy={p2y} r={padR} fill="#d4a534" opacity="0.4"/>
      <circle cx={p2x} cy={p2y} r={drillR} fill="#1a1a2e" opacity="0.4"/>
    {/if}

    <!-- Resistors -->
    {#each doc.resistors || [] as res}
      {@const isSelected = selectedIds.includes(res.id)}
      {@const spacing = res.spacing ?? 4}
      {@const p1x = res.col * pitch}
      {@const p1y = res.row * pitch}
      {@const p2x = res.orientation === 'h' ? (res.col + spacing) * pitch : res.col * pitch}
      {@const p2y = res.orientation === 'h' ? res.row * pitch : (res.row + spacing) * pitch}
      {@const midX = (p1x + p2x) / 2}
      {@const midY = (p1y + p2y) / 2}
      {@const bodyColor = isSelected ? "rgba(251,191,36,0.15)" : "rgba(40,40,60,0.8)"}
      {@const strokeColor = isSelected ? "#fbbf24" : "rgba(255,255,255,0.3)"}
      {@const lineColor = isSelected ? "#fbbf24" : "rgba(180,220,255,0.85)"}
      {#if res.orientation === 'h'}
        {@const bodyHW = Math.abs(p2x - p1x) * 0.35}
        <line x1={p1x} y1={p1y} x2={midX - bodyHW} y2={p1y} stroke={lineColor} stroke-width="0.12" stroke-linecap="round"/>
        <line x1={midX + bodyHW} y1={p1y} x2={p2x} y2={p1y} stroke={lineColor} stroke-width="0.12" stroke-linecap="round"/>
        <rect x={midX - bodyHW} y={midY - pitch * 0.28} width={bodyHW * 2} height={pitch * 0.56} rx={pitch * 0.08} fill={bodyColor} stroke={strokeColor} stroke-width="0.12"/>
      {:else}
        {@const bodyHW = Math.abs(p2y - p1y) * 0.35}
        <line x1={p1x} y1={p1y} x2={p1x} y2={midY - bodyHW} stroke={lineColor} stroke-width="0.12" stroke-linecap="round"/>
        <line x1={p1x} y1={midY + bodyHW} x2={p2x} y2={p2y} stroke={lineColor} stroke-width="0.12" stroke-linecap="round"/>
        <rect x={midX - pitch * 0.28} y={midY - bodyHW} width={pitch * 0.56} height={bodyHW * 2} rx={pitch * 0.08} fill={bodyColor} stroke={strokeColor} stroke-width="0.12"/>
      {/if}
      {@const rp2col = res.orientation === 'h' ? res.col + spacing : res.col}
      {@const rp2row = res.orientation === 'h' ? res.row : res.row + spacing}
      {@const rp1Fill = padFillFor(nets, res.col, res.row, isSelected, null)}
      {@const rp2Fill = padFillFor(nets, rp2col, rp2row, isSelected, null)}
      <g opacity={padDim(res.col, res.row)}>
        {#if isSelected}
          <circle cx={p1x} cy={p1y} r={padR + pitch * 0.04} fill="rgba(255,255,255,0.45)"/>
        {/if}
        <circle cx={p1x} cy={p1y} r={padR} fill={rp1Fill}/>
        <circle cx={p1x} cy={p1y} r={drillR} fill="#1a1a2e"/>
      </g>
      <g opacity={padDim(rp2col, rp2row)}>
        {#if isSelected}
          <circle cx={p2x} cy={p2y} r={padR + pitch * 0.04} fill="rgba(255,255,255,0.45)"/>
        {/if}
        <circle cx={p2x} cy={p2y} r={padR} fill={rp2Fill}/>
        <circle cx={p2x} cy={p2y} r={drillR} fill="#1a1a2e"/>
      </g>
      {#if res.label}
        <text
          x={midX}
          y={res.orientation === 'h' ? midY - padR - pitch * 0.08 : midX + padR + pitch * 0.05}
          text-anchor="middle"
          dominant-baseline="auto"
          fill="rgba(255,255,255,0.7)"
          font-size={pitch * 0.32}
          font-family="monospace"
          font-weight="bold">{res.label}</text>
      {/if}
    {/each}

    <!-- Resistor preview -->
    {#if resPreview}
      {@const spacing = resPreview.spacing}
      {@const p1x = resPreview.col * pitch}
      {@const p1y = resPreview.row * pitch}
      {@const p2x = resPreview.orientation === 'h' ? (resPreview.col + spacing) * pitch : resPreview.col * pitch}
      {@const p2y = resPreview.orientation === 'h' ? resPreview.row * pitch : (resPreview.row + spacing) * pitch}
      {@const midX = (p1x + p2x) / 2}
      {@const midY = (p1y + p2y) / 2}
      {#if resPreview.orientation === 'h'}
        {@const bodyHW = Math.abs(p2x - p1x) * 0.35}
        <line x1={p1x} y1={p1y} x2={midX - bodyHW} y2={p1y} stroke="rgba(180,220,255,0.4)" stroke-width="0.12"/>
        <line x1={midX + bodyHW} y1={p1y} x2={p2x} y2={p1y} stroke="rgba(180,220,255,0.4)" stroke-width="0.12"/>
        <rect x={midX - bodyHW} y={midY - pitch * 0.28} width={bodyHW * 2} height={pitch * 0.56} rx={pitch * 0.08} fill="rgba(40,40,60,0.4)" stroke="rgba(255,255,255,0.2)" stroke-width="0.12"/>
      {:else}
        {@const bodyHW = Math.abs(p2y - p1y) * 0.35}
        <line x1={p1x} y1={p1y} x2={p1x} y2={midY - bodyHW} stroke="rgba(180,220,255,0.4)" stroke-width="0.12"/>
        <line x1={p1x} y1={midY + bodyHW} x2={p2x} y2={p2y} stroke="rgba(180,220,255,0.4)" stroke-width="0.12"/>
        <rect x={midX - pitch * 0.28} y={midY - bodyHW} width={pitch * 0.56} height={bodyHW * 2} rx={pitch * 0.08} fill="rgba(40,40,60,0.4)" stroke="rgba(255,255,255,0.2)" stroke-width="0.12"/>
      {/if}
      <circle cx={p1x} cy={p1y} r={padR} fill="#d4a534" opacity="0.4"/>
      <circle cx={p1x} cy={p1y} r={drillR} fill="#1a1a2e" opacity="0.4"/>
      <circle cx={p2x} cy={p2y} r={padR} fill="#d4a534" opacity="0.4"/>
      <circle cx={p2x} cy={p2y} r={drillR} fill="#1a1a2e" opacity="0.4"/>
    {/if}

    <!-- Pin Housings -->
    {#each doc.pinHousings || [] as ph}
      {@const isSelected = selectedIds.includes(ph.id)}
      {@const phPads = Array.from({length: ph.count}, (_, i) => ({
        col: ph.orientation === 'h' ? ph.col + i : ph.col,
        row: ph.orientation === 'v' ? ph.row + i : ph.row,
      }))}
      {@const minC = Math.min(...phPads.map(p => p.col))}
      {@const maxC = Math.max(...phPads.map(p => p.col))}
      {@const minR = Math.min(...phPads.map(p => p.row))}
      {@const maxR = Math.max(...phPads.map(p => p.row))}
      {@const facing = ph.facing ?? (ph.orientation === 'h' ? 'south' : 'east')}
      <rect
        x={minC * pitch - padR - 0.3}
        y={minR * pitch - padR - 0.3}
        width={(maxC - minC) * pitch + 2 * padR + 0.6}
        height={(maxR - minR) * pitch + 2 * padR + 0.6}
        fill={isSelected ? "rgba(251,191,36,0.15)" : "rgba(60,180,140,0.12)"}
        stroke={isSelected ? "#fbbf24" : "rgba(100,220,180,0.4)"}
        stroke-width="0.2"
        rx="0.4"
      />
      {#each phPads as pp}
        {@const ppFill = padFillFor(nets, pp.col, pp.row, isSelected, null)}
        {@const arrowLen = pitch * 0.5}
        {@const ax = pp.col * pitch + (facing === 'east' ? padR + 0.1 : facing === 'west' ? -padR - 0.1 : 0)}
        {@const ay = pp.row * pitch + (facing === 'south' ? padR + 0.1 : facing === 'north' ? -padR - 0.1 : 0)}
        {@const bx = ax + (facing === 'east' ? arrowLen : facing === 'west' ? -arrowLen : 0)}
        {@const by = ay + (facing === 'south' ? arrowLen : facing === 'north' ? -arrowLen : 0)}
        <g opacity={padDim(pp.col, pp.row)}>
        {#if isSelected}
          <circle cx={pp.col * pitch} cy={pp.row * pitch} r={padR + pitch * 0.04} fill="rgba(255,255,255,0.45)"/>
        {/if}
        <circle cx={pp.col * pitch} cy={pp.row * pitch} r={padR} fill={ppFill}/>
        <circle cx={pp.col * pitch} cy={pp.row * pitch} r={drillR} fill="#1a1a2e"/>
        <line x1={ax} y1={ay} x2={bx} y2={by} stroke="rgba(100,220,180,0.5)" stroke-width="0.12" stroke-linecap="round"/>
        </g>
      {/each}
      {#if ph.label}
        <text
          x={(minC + maxC) / 2 * pitch}
          y={minR * pitch - padR - pitch * 0.15}
          text-anchor="middle"
          dominant-baseline="auto"
          fill="rgba(255,255,255,0.7)"
          font-size={pitch * 0.35}
          font-family="monospace"
          font-weight="bold">{ph.label}</text>
      {/if}
    {/each}

    <!-- Pin Housing preview -->
    {#if phPreview}
      {#each Array(phPreview.count) as _, i}
        {@const c = phPreview.orientation === "h" ? phPreview.col + i : phPreview.col}
        {@const r = phPreview.orientation === "v" ? phPreview.row + i : phPreview.row}
        <circle cx={c * pitch} cy={r * pitch} r={padR} fill="#3eb489" opacity="0.4"/>
        <circle cx={c * pitch} cy={r * pitch} r={drillR} fill="#1a1a2e" opacity="0.4"/>
      {/each}
      {@const midC = phPreview.orientation === "h" ? phPreview.col + (phPreview.count - 1) / 2 : phPreview.col}
      {@const midR = phPreview.orientation === "v" ? phPreview.row + (phPreview.count - 1) / 2 : phPreview.row}
      <text
        x={midC * pitch}
        y={midR * pitch - padR - pitch * 0.15}
        text-anchor="middle"
        dominant-baseline="auto"
        fill="rgba(255,255,255,0.7)"
        font-size={pitch * 0.55}
        font-weight="bold">{phPreview.count}</text>
    {/if}

    <!-- Key Switches (Cherry MX footprint) -->
    {#each doc.keyswitches || [] as sw}
      {@const isSelected = selectedIds.includes(sw.id)}
      {@const cx = sw.col * pitch}
      {@const cy = sw.row * pitch}
      {@const pins = kswPins(sw)}
      {@const pegs = kswPegs(sw)}
      {@const halfBody = 7.0}
      {@const halfBase = 7.8}
      {@const centerR = 2.0}
      {@const pegR = 0.85}
      {@const bodyColor = isSelected ? "rgba(251,191,36,0.18)" : "rgba(40,40,60,0.85)"}
      {@const baseColor = isSelected ? "rgba(251,191,36,0.1)" : "rgba(30,30,50,0.6)"}
      {@const strokeColor = isSelected ? "#fbbf24" : "rgba(255,255,255,0.35)"}
      {@const innerStroke = isSelected ? "rgba(251,191,36,0.5)" : "rgba(255,255,255,0.15)"}
      {@const accentColor = isSelected ? "#fbbf24" : "rgba(180,220,255,0.7)"}
      <!-- Outer base flange -->
      <rect x={cx - halfBase} y={cy - halfBase} width={halfBase * 2} height={halfBase * 2}
            rx="0.6" fill={baseColor} stroke={strokeColor} stroke-width="0.15"/>
      <!-- Main housing -->
      <rect x={cx - halfBody} y={cy - halfBody} width={halfBody * 2} height={halfBody * 2}
            rx="0.5" fill={bodyColor} stroke={strokeColor} stroke-width="0.18"/>
      <!-- Inner bevel -->
      <rect x={cx - halfBody + 0.7} y={cy - halfBody + 0.7}
            width={(halfBody - 0.7) * 2} height={(halfBody - 0.7) * 2}
            rx="0.3" fill="none" stroke={innerStroke} stroke-width="0.1"/>
      <!-- Center mounting hole (4mm dia) -->
      <circle cx={cx} cy={cy} r={centerR} fill="#1a1a2e"
              stroke={isSelected ? "#fbbf24" : "rgba(255,255,255,0.2)"} stroke-width="0.12"/>
      <!-- Cherry MX cross stem indicator inside center hole -->
      <rect x={cx - 0.85} y={cy - 0.18} width="1.7" height="0.36" fill={accentColor} opacity="0.85"/>
      <rect x={cx - 0.18} y={cy - 0.85} width="0.36" height="1.7" fill={accentColor} opacity="0.85"/>
      <!-- Alignment pegs (no pad, just drill) -->
      {#each pegs as peg}
        <circle cx={peg.col * pitch} cy={peg.row * pitch} r={pegR + 0.15}
                fill="rgba(20,20,30,0.6)" stroke={innerStroke} stroke-width="0.08"/>
        <circle cx={peg.col * pitch} cy={peg.row * pitch} r={pegR} fill="#1a1a2e"/>
      {/each}
      <!-- Electrical pin pads -->
      {#each pins as pin}
        {@const px = pin.col * pitch}
        {@const py = pin.row * pitch}
        {@const pFill = padFillFor(nets, pin.col, pin.row, isSelected, null)}
        <g opacity={padDim(pin.col, pin.row)}>
          {#if isSelected}
            <circle cx={px} cy={py} r={padR + pitch * 0.04} fill="rgba(255,255,255,0.45)"/>
          {/if}
          <circle cx={px} cy={py} r={padR} fill={pFill}/>
          <circle cx={px} cy={py} r={drillR} fill="#1a1a2e"/>
        </g>
      {/each}
      {#if sw.label}
        <text x={cx} y={cy - halfBase - pitch * 0.2}
              text-anchor="middle" dominant-baseline="auto"
              fill="rgba(255,255,255,0.7)"
              font-size={pitch * 0.4}
              font-family="monospace"
              font-weight="bold">{sw.label}</text>
      {/if}
    {/each}

    <!-- Key Switch preview -->
    {#if kswPreview}
      {@const cx = kswPreview.col * pitch}
      {@const cy = kswPreview.row * pitch}
      {@const pins = kswPins(kswPreview)}
      {@const pegs = kswPegs(kswPreview)}
      {@const halfBody = 7.0}
      {@const halfBase = 7.8}
      {@const centerR = 2.0}
      {@const pegR = 0.85}
      <rect x={cx - halfBase} y={cy - halfBase} width={halfBase * 2} height={halfBase * 2}
            rx="0.6" fill="rgba(30,30,50,0.3)" stroke="rgba(255,255,255,0.15)" stroke-width="0.15"/>
      <rect x={cx - halfBody} y={cy - halfBody} width={halfBody * 2} height={halfBody * 2}
            rx="0.5" fill="rgba(40,40,60,0.4)" stroke="rgba(255,255,255,0.25)" stroke-width="0.18"/>
      <circle cx={cx} cy={cy} r={centerR} fill="#1a1a2e" opacity="0.6"
              stroke="rgba(255,255,255,0.2)" stroke-width="0.12"/>
      {#each pegs as peg}
        <circle cx={peg.col * pitch} cy={peg.row * pitch} r={pegR} fill="#1a1a2e" opacity="0.5"/>
      {/each}
      {#each pins as pin}
        <circle cx={pin.col * pitch} cy={pin.row * pitch} r={padR} fill="#d4a534" opacity="0.4"/>
        <circle cx={pin.col * pitch} cy={pin.row * pitch} r={drillR} fill="#1a1a2e" opacity="0.4"/>
      {/each}
    {/if}

    <!-- Pads -->
    {#each doc.pads as pad}
      {@const isSelected = selectedIds.includes(pad.id)}
      {@const padFill = padFillFor(nets, pad.col, pad.row, isSelected, pad.label)}
      <g opacity={padDim(pad.col, pad.row)}>
      {#if isSelected}
        <circle
          cx={pad.col * pitch}
          cy={pad.row * pitch}
          r={padR + pitch * 0.04}
          fill="rgba(255,255,255,0.45)"
        />
      {/if}
      <circle
        cx={pad.col * pitch}
        cy={pad.row * pitch}
        r={padR}
        fill={padFill}
      />
      <circle
        cx={pad.col * pitch}
        cy={pad.row * pitch}
        r={drillR}
        fill="#1a1a2e"
      />
      {#if pad.label}
        <text
          x={pad.col * pitch}
          y={pad.row * pitch - padR - pitch * 0.08}
          text-anchor="middle"
          dominant-baseline="auto"
          fill="rgba(255,255,255,0.7)"
          font-size={pitch * 0.35}
          font-family="monospace"
          font-weight="bold">{pad.label}</text
        >
      {/if}
      </g>
    {/each}

    <!-- Annotations -->
    <g class="annotations">
    {#each doc.annotations as ann}
      {@const isSelected = selectedIds.includes(ann.id)}
      {@const ax = ann.col * pitch}
      {@const ay = ann.row * pitch}
      <rect
        x={ax + pitch * 0.2}
        y={ay - pitch * 0.45}
        width={ann.text.length * pitch * 0.28 + pitch * 0.2}
        height={pitch * 0.5}
        rx={pitch * 0.08}
        fill="rgba(0,0,0,0.6)"
        stroke={isSelected ? "#fbbf24" : "none"}
        stroke-width={pitch * 0.04}
      />
      <text
        x={ax + pitch * 0.3}
        y={ay - pitch * 0.1}
        font-size={pitch * 0.35}
        font-family="monospace"
        font-weight="bold"
        fill={ann.color}>{ann.text}</text
      >
    {/each}
    </g>

    <!-- Interactive editor overlays (not exported) -->
    <g class="editor-interactive">
    <!-- Ghost cursor -->
    {#if ghostPos && (activeTool === "pad" || activeTool === "header" || (activeTool === "dip" && !dipStart) || (activeTool === "cap" && !capStart) || (activeTool === "resistor" && !resStart) || (activeTool === "pinhousing" && !phStart) || (activeTool === 'keyswitch' && !kswStart))}
      <circle
        cx={ghostPos.col * pitch}
        cy={ghostPos.row * pitch}
        r={padR}
        fill="#d4a534"
        opacity="0.25"
      />
    {/if}
    {#if ghostPos && activeTool === "jumper" && !jumperStart}
      <circle
        cx={ghostPos.col * pitch}
        cy={ghostPos.row * pitch}
        r={pitch * 0.12}
        fill="#67e8f9"
        opacity="0.3"
      />
    {/if}
    {#if ghostPos && (activeTool === "trace" || activeTool === "roundtrace") && tracePoints.length === 0}
      <circle
        cx={ghostPos.col * pitch}
        cy={ghostPos.row * pitch}
        r={pitch * 0.15}
        fill="#f5c842"
        opacity="0.3"
      />
    {/if}
    {#if ghostPos && activeTool === "curve" && curvePoints.length === 0}
      <circle
        cx={ghostPos.col * pitch}
        cy={ghostPos.row * pitch}
        r={pitch * 0.15}
        fill="#f5c842"
        opacity="0.3"
      />
    {/if}
    {#if freeGhostPos && activeTool === "freetrace" && !freetraceDrawing}
      <circle
        cx={freeGhostPos.col * pitch}
        cy={freeGhostPos.row * pitch}
        r={pitch * 0.15}
        fill="#f5c842"
        opacity="0.3"
      />
    {/if}

    <!-- Joints (junction dots) -->
    {#each doc.joints || [] as joint}
      {@const isSelected = selectedIds.includes(joint.id)}
      {@const jtFill = padFillFor(nets, joint.col, joint.row, isSelected, null, "#f5c842")}
      <g opacity={padDim(joint.col, joint.row)}>
        {#if isSelected}
          <circle
            cx={joint.col * pitch}
            cy={joint.row * pitch}
            r={pitch * 0.28}
            fill="rgba(255,255,255,0.45)"
          />
        {/if}
        <circle
          cx={joint.col * pitch}
          cy={joint.row * pitch}
          r={pitch * 0.18}
          fill={jtFill}
          stroke="rgba(0,0,0,0.5)"
          stroke-width={pitch * 0.03}
        />
      </g>
    {/each}

    <!-- Joint ghost cursor -->
    {#if ghostPos && activeTool === "joint"}
      <circle
        cx={ghostPos.col * pitch}
        cy={ghostPos.row * pitch}
        r={pitch * 0.18}
        fill="#f5c842"
        opacity="0.35"
        stroke="rgba(0,0,0,0.5)"
        stroke-width={pitch * 0.03}
      />
    {/if}

    <!-- Jumper wires (topmost layer) -->
    {#each doc.jumpers as jumper}
      {@const isSelected = selectedIds.includes(jumper.id)}
      {@const x1 = jumper.col1 * pitch}
      {@const y1 = jumper.row1 * pitch}
      {@const x2 = jumper.col2 * pitch}
      {@const y2 = jumper.row2 * pitch}
      {@const dx = x2 - x1}
      {@const dy = y2 - y1}
      {@const dist = Math.hypot(dx, dy)}
      {@const arc = dist * 0.3}
      {@const mx = (x1 + x2) / 2}
      {@const my = (y1 + y2) / 2}
      {@const nx = -dy / (dist || 1)}
      {@const ny = dx / (dist || 1)}
      {@const jcolor = jumper.color ?? "#67e8f9"}
      {#if isSelected}
        <path
          d="M{x1},{y1} Q{mx + nx * arc},{my + ny * arc} {x2},{y2}"
          stroke="rgba(255,255,255,0.45)"
          stroke-width={pitch * 0.12 + pitch * 0.08}
          stroke-linecap="round"
          fill="none"
        />
        <circle
          cx={x1}
          cy={y1}
          r={pitch * 0.12 + pitch * 0.04}
          fill="rgba(255,255,255,0.45)"
        />
        <circle
          cx={x2}
          cy={y2}
          r={pitch * 0.12 + pitch * 0.04}
          fill="rgba(255,255,255,0.45)"
        />
      {/if}
      <path
        d="M{x1},{y1} Q{mx + nx * arc},{my + ny * arc} {x2},{y2}"
        stroke={isSelected ? "#fbbf24" : jcolor}
        stroke-width={pitch * 0.12}
        stroke-linecap="round"
        fill="none"
        opacity={isSelected ? 1 : 0.8}
      />
      <circle
        cx={x1}
        cy={y1}
        r={pitch * 0.12}
        fill={isSelected ? "#fbbf24" : jcolor}
      />
      <circle
        cx={x2}
        cy={y2}
        r={pitch * 0.12}
        fill={isSelected ? "#fbbf24" : jcolor}
      />
    {/each}

    <!-- Jumper preview -->
    {#if jumperPreview && jumperStart}
      {@const x1 = jumperStart.col * pitch}
      {@const y1 = jumperStart.row * pitch}
      {@const x2 = jumperPreview.col * pitch}
      {@const y2 = jumperPreview.row * pitch}
      {@const dx = x2 - x1}
      {@const dy = y2 - y1}
      {@const dist = Math.hypot(dx, dy)}
      {@const arc = dist * 0.3}
      {@const mx = (x1 + x2) / 2}
      {@const my = (y1 + y2) / 2}
      {@const nx = -dy / (dist || 1)}
      {@const ny = dx / (dist || 1)}
      <path
        d="M{x1},{y1} Q{mx + nx * arc},{my + ny * arc} {x2},{y2}"
        stroke="#67e8f9"
        stroke-width={pitch * 0.12}
        stroke-linecap="round"
        fill="none"
        opacity="0.4"
      />
      <circle cx={x1} cy={y1} r={pitch * 0.12} fill="#67e8f9" opacity="0.4" />
      <circle cx={x2} cy={y2} r={pitch * 0.12} fill="#67e8f9" opacity="0.4" />
    {/if}

    <!-- Selection box -->
    {#if selectionBox}
      {@const sx = Math.min(selectionBox.x1, selectionBox.x2)}
      {@const sy = Math.min(selectionBox.y1, selectionBox.y2)}
      {@const sw = Math.abs(selectionBox.x2 - selectionBox.x1)}
      {@const sh = Math.abs(selectionBox.y2 - selectionBox.y1)}
      <rect
        x={sx}
        y={sy}
        width={sw}
        height={sh}
        fill="rgba(251, 191, 36, 0.08)"
        stroke="#fbbf24"
        stroke-width={pitch * 0.03}
        stroke-dasharray={pitch * 0.1}
      />
    {/if}

    <!-- Control point drag ghost -->
    {#if jpDrag && ghostPos}
      {@const dc = ghostPos.col - jpDrag.startCol}
      {@const dr = ghostPos.row - jpDrag.startRow}
      {@const jumper = doc.jumpers.find((j) => j.id === jpDrag.jumperId)}
      {#if jumper && (dc !== 0 || dr !== 0)}
        {@const jx1 =
          (jpDrag.endpoint === 1 ? jumper.col1 + dc : jumper.col1) * pitch}
        {@const jy1 =
          (jpDrag.endpoint === 1 ? jumper.row1 + dr : jumper.row1) * pitch}
        {@const jx2 =
          (jpDrag.endpoint === 2 ? jumper.col2 + dc : jumper.col2) * pitch}
        {@const jy2 =
          (jpDrag.endpoint === 2 ? jumper.row2 + dr : jumper.row2) * pitch}
        {@const jdx = jx2 - jx1}
        {@const jdy = jy2 - jy1}
        {@const jdist = Math.hypot(jdx, jdy)}
        {@const jarc = jdist * 0.3}
        {@const jnx = -jdy / (jdist || 1)}
        {@const jny = jdx / (jdist || 1)}
        <path
          d="M{jx1},{jy1} Q{(jx1 + jx2) / 2 + jnx * jarc},{(jy1 + jy2) / 2 +
            jny * jarc} {jx2},{jy2}"
          stroke="#fbbf24"
          stroke-width={pitch * 0.12}
          stroke-linecap="round"
          fill="none"
          opacity="0.5"
        />
        <circle
          cx={jx1}
          cy={jy1}
          r={pitch * 0.12}
          fill={jpDrag.endpoint === 1 ? "#fbbf24" : "#67e8f9"}
          opacity="0.6"
        />
        <circle
          cx={jx2}
          cy={jy2}
          r={pitch * 0.12}
          fill={jpDrag.endpoint === 2 ? "#fbbf24" : "#67e8f9"}
          opacity="0.6"
        />
      {/if}
    {/if}

    {#if cpDrag && ghostPos && freeGhostPos}
      {@const trace = doc.traces.find((t) => t.id === cpDrag.traceId)}
      {@const isEdge =
        cpDrag.pointIndex === 0 ||
        cpDrag.pointIndex === (trace?.points.length ?? 1) - 1}
      {@const useFree = trace?.freeform && !isEdge}
      {@const gp = useFree ? freeGhostPos : ghostPos}
      {@const dc = gp.col - cpDrag.startCol}
      {@const dr = gp.row - cpDrag.startRow}
      {#if trace}
        {@const pts = trace.points.map((p, i) =>
          i === cpDrag.pointIndex
            ? { x: (p.col + dc) * pitch, y: (p.row + dr) * pitch }
            : { x: p.col * pitch, y: p.row * pitch },
        )}
        {#if trace.type === "curve"}
          {@const ew = trace.endWidth ?? trace.width}
          {@const ew2 = trace.endWidth2 ?? ew}
          {@const tn = trace.tension ?? 0.5}
          {#if ew > trace.width || ew2 > trace.width}
            {@const outline = variableWidthOutlinePath(
              pts,
              trace.width,
              ew,
              32,
              tn,
              trace.taperDistance ?? 0,
              ew2,
            )}
            <path d={outline} fill="#fbbf24" opacity="0.5" />
          {:else}
            {@const d = catmullRomSVGPath(pts, tn)}
            <path
              {d}
              stroke="#fbbf24"
              stroke-width={trace.width}
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
              opacity="0.6"
            />
          {/if}
        {:else}
          {#each pts as pt, i}
            {#if i > 0}
              <line
                x1={pts[i - 1].x}
                y1={pts[i - 1].y}
                x2={pt.x}
                y2={pt.y}
                stroke="#fbbf24"
                stroke-width={trace.width}
                stroke-linecap="round"
                fill="none"
                opacity="0.5"
              />
            {/if}
          {/each}
        {/if}
        {#each pts as pt, i}
          <circle
            cx={pt.x}
            cy={pt.y}
            r={pitch * 0.1}
            fill={i === cpDrag.pointIndex ? "#fbbf24" : "#22c55e"}
            stroke="white"
            stroke-width={pitch * 0.02}
            opacity="0.8"
          />
        {/each}
      {/if}
    {/if}

    <!-- Drag ghost (all selected elements) -->
    {#if dragInfo && ghostPos}
      {@const dc = ghostPos.col - dragInfo.startCol}
      {@const dr = ghostPos.row - dragInfo.startRow}
      {#if dc !== 0 || dr !== 0}
        {#each doc.pads.filter((p) => selectedIds.includes(p.id)) as pad}
          <circle
            cx={(pad.col + dc) * pitch}
            cy={(pad.row + dr) * pitch}
            r={padR}
            fill="#fbbf24"
            opacity="0.4"
          />
          <circle
            cx={(pad.col + dc) * pitch}
            cy={(pad.row + dr) * pitch}
            r={drillR}
            fill="#1a1a2e"
            opacity="0.4"
          />
        {/each}
        {#each doc.headers.filter((h) => selectedIds.includes(h.id)) as header}
          {#each getHeaderPads(header) as hp}
            <circle
              cx={(hp.col + dc) * pitch}
              cy={(hp.row + dr) * pitch}
              r={padR}
              fill="#fbbf24"
              opacity="0.4"
            />
            <circle
              cx={(hp.col + dc) * pitch}
              cy={(hp.row + dr) * pitch}
              r={drillR}
              fill="#1a1a2e"
              opacity="0.4"
            />
          {/each}
        {/each}
        {#each (doc.dips || []).filter( (d) => selectedIds.includes(d.id), ) as dip}
          {#each getDipPads(dip) as dp}
            <circle
              cx={(dp.col + dc) * pitch}
              cy={(dp.row + dr) * pitch}
              r={padR}
              fill="#fbbf24"
              opacity="0.4"
            />
            <circle
              cx={(dp.col + dc) * pitch}
              cy={(dp.row + dr) * pitch}
              r={drillR}
              fill="#1a1a2e"
              opacity="0.4"
            />
          {/each}
        {/each}
        {#each (doc.capacitors || []).filter((c) => selectedIds.includes(c.id)) as cap}
          {@const c2col = cap.orientation === 'h' ? cap.col + 1 : cap.col}
          {@const c2row = cap.orientation === 'h' ? cap.row : cap.row + 1}
          <circle cx={(cap.col + dc) * pitch} cy={(cap.row + dr) * pitch} r={padR} fill="#fbbf24" opacity="0.4"/>
          <circle cx={(cap.col + dc) * pitch} cy={(cap.row + dr) * pitch} r={drillR} fill="#1a1a2e" opacity="0.4"/>
          <circle cx={(c2col + dc) * pitch} cy={(c2row + dr) * pitch} r={padR} fill="#fbbf24" opacity="0.4"/>
          <circle cx={(c2col + dc) * pitch} cy={(c2row + dr) * pitch} r={drillR} fill="#1a1a2e" opacity="0.4"/>
        {/each}
        {#each (doc.resistors || []).filter((r) => selectedIds.includes(r.id)) as res}
          {@const rSpacing = res.spacing ?? 4}
          {@const r2col = res.orientation === 'h' ? res.col + rSpacing : res.col}
          {@const r2row = res.orientation === 'h' ? res.row : res.row + rSpacing}
          <circle cx={(res.col + dc) * pitch} cy={(res.row + dr) * pitch} r={padR} fill="#fbbf24" opacity="0.4"/>
          <circle cx={(res.col + dc) * pitch} cy={(res.row + dr) * pitch} r={drillR} fill="#1a1a2e" opacity="0.4"/>
          <circle cx={(r2col + dc) * pitch} cy={(r2row + dr) * pitch} r={padR} fill="#fbbf24" opacity="0.4"/>
          <circle cx={(r2col + dc) * pitch} cy={(r2row + dr) * pitch} r={drillR} fill="#1a1a2e" opacity="0.4"/>
        {/each}
        {#each (doc.pinHousings || []).filter((ph) => selectedIds.includes(ph.id)) as ph}
          {#each Array.from({length: ph.count}, (_, i) => ({
            col: ph.orientation === 'h' ? ph.col + i : ph.col,
            row: ph.orientation === 'v' ? ph.row + i : ph.row,
          })) as pp}
            <circle cx={(pp.col + dc) * pitch} cy={(pp.row + dr) * pitch} r={padR} fill="#fbbf24" opacity="0.4"/>
            <circle cx={(pp.col + dc) * pitch} cy={(pp.row + dr) * pitch} r={drillR} fill="#1a1a2e" opacity="0.4"/>
          {/each}
        {/each}
        {#each (doc.keyswitches || []).filter((sw) => selectedIds.includes(sw.id)) as sw}
          {@const ghostCx = (sw.col + dc) * pitch}
          {@const ghostCy = (sw.row + dr) * pitch}
          <rect x={ghostCx - 7} y={ghostCy - 7} width="14" height="14"
                rx="0.5" fill="rgba(40,40,60,0.3)" stroke="#fbbf24" stroke-width="0.18" opacity="0.4"/>
          <circle cx={ghostCx} cy={ghostCy} r="2" fill="#1a1a2e" opacity="0.5"/>
          {#each kswPins(sw) as pin}
            <circle cx={(pin.col + dc) * pitch} cy={(pin.row + dr) * pitch} r={padR} fill="#fbbf24" opacity="0.4"/>
            <circle cx={(pin.col + dc) * pitch} cy={(pin.row + dr) * pitch} r={drillR} fill="#1a1a2e" opacity="0.4"/>
          {/each}
        {/each}
        {#each doc.traces.filter((t) => selectedIds.includes(t.id)) as trace}
          {#if trace.type === "curve"}
            {@const pts = trace.points.map((p) => ({
              x: (p.col + dc) * pitch,
              y: (p.row + dr) * pitch,
            }))}
            {@const ew = trace.endWidth ?? trace.width}
            {@const ew2 = trace.endWidth2 ?? ew}
            {#if ew > trace.width || ew2 > trace.width}
              {@const outline = variableWidthOutlinePath(
                pts,
                trace.width,
                ew,
                32,
                trace.tension ?? 0.5,
                trace.taperDistance ?? 0,
                ew2,
              )}
              <path d={outline} fill="#fbbf24" opacity="0.3" />
            {:else}
              {@const d = catmullRomSVGPath(pts, trace.tension ?? 0.5)}
              <path
                {d}
                stroke="#fbbf24"
                stroke-width={trace.width}
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none"
                opacity="0.4"
              />
            {/if}
          {:else}
            {@const dSqC = trace.cornerShape === 'square'}
            {@const dSqE = trace.endShape === 'square'}
            {#if dSqC}
              {@const polyPts = trace.points.map(p => `${p.col * pitch + dc * pitch},${p.row * pitch + dr * pitch}`).join(' ')}
              <polyline
                points={polyPts}
                stroke="#fbbf24"
                stroke-width={trace.width}
                stroke-linecap={dSqE ? 'square' : 'round'}
                stroke-linejoin="miter"
                stroke-miterlimit="10"
                fill="none"
                opacity="0.4"
              />
            {:else}
              {#each getTraceSegments(trace) as seg}
                <line
                  x1={seg.x1 + dc * pitch}
                  y1={seg.y1 + dr * pitch}
                  x2={seg.x2 + dc * pitch}
                  y2={seg.y2 + dr * pitch}
                  stroke="#fbbf24"
                  stroke-width={trace.width}
                  stroke-linecap={dSqE ? 'butt' : 'round'}
                  opacity="0.4"
                />
              {/each}
              {#if dSqE}
                {#each [trace.points[0], trace.points[trace.points.length - 1]] as pt}
                  {@const hw = trace.width / 2}
                  <rect
                    x={pt.col * pitch + dc * pitch - hw}
                    y={pt.row * pitch + dr * pitch - hw}
                    width={trace.width}
                    height={trace.width}
                    fill="#fbbf24"
                    opacity="0.4"
                  />
                {/each}
              {/if}
            {/if}
          {/if}
        {/each}
        {#each doc.jumpers.filter((j) => selectedIds.includes(j.id)) as jumper}
          {@const jx1 = (jumper.col1 + dc) * pitch}
          {@const jy1 = (jumper.row1 + dr) * pitch}
          {@const jx2 = (jumper.col2 + dc) * pitch}
          {@const jy2 = (jumper.row2 + dr) * pitch}
          {@const jdx = jx2 - jx1}
          {@const jdy = jy2 - jy1}
          {@const jdist = Math.hypot(jdx, jdy)}
          {@const jarc = jdist * 0.3}
          {@const jnx = -jdy / (jdist || 1)}
          {@const jny = jdx / (jdist || 1)}
          <path
            d="M{jx1},{jy1} Q{(jx1 + jx2) / 2 + jnx * jarc},{(jy1 + jy2) / 2 +
              jny * jarc} {jx2},{jy2}"
            stroke="#fbbf24"
            stroke-width={pitch * 0.12}
            stroke-linecap="round"
            fill="none"
            opacity="0.4"
          />
        {/each}
        {#each doc.annotations.filter((a) => selectedIds.includes(a.id)) as ann}
          {@const aax = (ann.col + dc) * pitch}
          {@const aay = (ann.row + dr) * pitch}
          <text
            x={aax + pitch * 0.3}
            y={aay - pitch * 0.1}
            font-size={pitch * 0.35}
            font-family="monospace"
            font-weight="bold"
            fill="#fbbf24"
            opacity="0.5">{ann.text}</text
          >
        {/each}
      {/if}
    {/if}
    </g>
  </svg>

  {#if editingAnnotation}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute bg-surface-1 rounded-lg border-2 border-black shadow-[4px_4px_0_black] z-10 p-1.5 flex flex-col gap-1.5"
      style="left: {editingAnnotation.left}px; top: {editingAnnotation.top}px"
      onfocusout={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) commitEdit();
      }}
    >
      <input
        bind:this={editInput}
        type="text"
        value={editingAnnotation.text}
        class="bg-surface-2 text-xs text-cyan-light rounded-lg px-2 py-1 border-2 border-black outline-none shadow-[2px_2px_0_black] w-28"
        onkeydown={handleEditKeydown}
      />
      <div class="flex items-center gap-1">
        {#each ["#ff2d95", "#00f0ff", "#a855f7", "#a3e635", "#fbbf24", "#ff6bcb", "#f0f0f0"] as c}
          <button
            onmousedown={(e) => {
              e.preventDefault();
              editingAnnotation.color = c;
            }}
            class="w-3.5 h-3.5 rounded-full border-2 transition-colors {editingAnnotation.color ===
            c
              ? 'border-white'
              : 'border-transparent'}"
            style="background-color: {c}"
          ></button>
        {/each}
      </div>
    </div>
  {/if}

  {#if editingJumper}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute bg-surface-1 rounded-lg border-2 border-black shadow-[4px_4px_0_black] z-10 p-1.5"
      style="left: {editingJumper.left}px; top: {editingJumper.top}px"
    >
      <div class="flex items-center gap-1">
        {#each WIRE_COLORS as c}
          <button
            onclick={() => {
              onUpdateJumperColor(editingJumper.id, c);
              editingJumper.color = c;
            }}
            class="w-3.5 h-3.5 rounded-full border-2 transition-colors {editingJumper.color ===
            c
              ? 'border-white'
              : 'border-transparent'}"
            style="background-color: {c}"
          ></button>
        {/each}
      </div>
    </div>
  {/if}

  {#if editingDip}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute bg-surface-1 rounded-lg border-2 border-black shadow-[4px_4px_0_black] z-10 p-1.5 flex flex-col gap-1.5"
      style="left: {editingDip.left}px; top: {editingDip.top}px"
      onfocusout={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) closeDipEdit();
      }}
    >
      <input
        bind:this={dipEditInput}
        type="text"
        value={editingDip.label}
        placeholder="IC label (e.g. NE555)"
        class="bg-surface-2 text-xs text-cyan-light rounded-lg px-2 py-1 border-2 border-black outline-none shadow-[2px_2px_0_black] w-36"
        onkeydown={handleDipEditKeydown}
        oninput={() => applyDipEdit()}
      />
      <div class="flex gap-1">
        <button
          class="flex-1 text-[10px] px-1.5 py-1 rounded-lg border-2 border-black {editingDip.socket
            ? 'bg-surface-2 text-purple-light'
            : 'bg-accent text-white shadow-[2px_2px_0_black]'}"
          onmousedown={(e) => e.preventDefault()}
          onclick={() => {
            editingDip = { ...editingDip, socket: false };
            applyDipEdit();
          }}>DIP IC</button
        >
        <button
          class="flex-1 text-[10px] px-1.5 py-1 rounded-lg border-2 border-black {editingDip.socket
            ? 'bg-accent text-white shadow-[2px_2px_0_black]'
            : 'bg-surface-2 text-purple-light'}"
          onmousedown={(e) => e.preventDefault()}
          onclick={() => {
            editingDip = { ...editingDip, socket: true };
            applyDipEdit();
          }}>IC Socket</button
        >
      </div>
      <div class="border-t border-black/30 pt-1">
        <label class="text-[10px] text-purple-light flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={editingDip.copperConnectedOnly}
            onchange={(e) => {
              editingDip = { ...editingDip, copperConnectedOnly: e.target.checked };
              applyDipEdit();
            }}
            class="accent-accent"
          />
          Copper only on connected pins
        </label>
      </div>
    </div>
  {/if}

  {#if editingCapacitor}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute bg-surface-1 rounded-lg border-2 border-black shadow-[4px_4px_0_black] z-10 p-1.5 flex flex-col gap-1.5"
      style="left: {editingCapacitor.left}px; top: {editingCapacitor.top}px"
      onfocusout={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) closeCapEdit() }}
    >
      <input
        type="text"
        value={editingCapacitor.label}
        placeholder="Value (e.g. 100nF)"
        class="bg-surface-2 text-xs text-cyan-light rounded-lg px-2 py-1 border-2 border-black outline-none shadow-[2px_2px_0_black] w-36"
        onkeydown={handleCapEditKeydown}
        oninput={(e) => { editingCapacitor = { ...editingCapacitor, label: e.target.value }; applyCapEdit() }}
      />
      <div class="flex gap-1">
        <button
          class="flex-1 text-[10px] px-1.5 py-1 rounded-lg border-2 border-black {editingCapacitor.type === 'ceramic' ? 'bg-accent text-white shadow-[2px_2px_0_black]' : 'bg-surface-2 text-purple-light'}"
          onmousedown={(e) => e.preventDefault()}
          onclick={() => { editingCapacitor = { ...editingCapacitor, type: 'ceramic' }; applyCapEdit() }}>Ceramic</button>
        <button
          class="flex-1 text-[10px] px-1.5 py-1 rounded-lg border-2 border-black {editingCapacitor.type === 'electrolytic' ? 'bg-accent text-white shadow-[2px_2px_0_black]' : 'bg-surface-2 text-purple-light'}"
          onmousedown={(e) => e.preventDefault()}
          onclick={() => { editingCapacitor = { ...editingCapacitor, type: 'electrolytic' }; applyCapEdit() }}>Electrolytic</button>
      </div>
    </div>
  {/if}

  {#if editingResistor}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute bg-surface-1 rounded-lg border-2 border-black shadow-[4px_4px_0_black] z-10 p-1.5 flex flex-col gap-1.5"
      style="left: {editingResistor.left}px; top: {editingResistor.top}px"
      onfocusout={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) closeResEdit() }}
    >
      <input
        type="text"
        value={editingResistor.label}
        placeholder="Value (e.g. 10K)"
        class="bg-surface-2 text-xs text-cyan-light rounded-lg px-2 py-1 border-2 border-black outline-none shadow-[2px_2px_0_black] w-36"
        onkeydown={handleResEditKeydown}
        oninput={(e) => { editingResistor = { ...editingResistor, label: e.target.value }; applyResEdit() }}
      />
      <div>
        <label class="text-[10px] text-purple-light block mb-0.5">Pin spacing</label>
        <input
          type="number"
          value={editingResistor.spacing}
          min="2"
          max="20"
          step="1"
          class="bg-surface-2 text-xs text-cyan-light rounded-lg px-2 py-1 border-2 border-black outline-none shadow-[2px_2px_0_black] w-20"
          onkeydown={handleResEditKeydown}
          oninput={(e) => { editingResistor = { ...editingResistor, spacing: parseInt(e.target.value) || 4 }; applyResEdit() }}
        />
      </div>
    </div>
  {/if}

  {#if editingPinHousing}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute bg-surface-1 rounded-lg border-2 border-black shadow-[4px_4px_0_black] z-10 p-1.5 flex flex-col gap-1.5"
      style="left: {editingPinHousing.left}px; top: {editingPinHousing.top}px"
      onfocusout={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) closePhEdit() }}
    >
      <input
        type="text"
        value={editingPinHousing.label}
        placeholder="Label (e.g. PWR)"
        class="bg-surface-2 text-xs text-cyan-light rounded-lg px-2 py-1 border-2 border-black outline-none shadow-[2px_2px_0_black] w-36"
        onkeydown={handlePhEditKeydown}
        oninput={(e) => { editingPinHousing = { ...editingPinHousing, label: e.target.value }; applyPhEdit() }}
      />
      <div>
        <label class="text-[10px] text-purple-light block mb-0.5">Pin opening</label>
        <div class="grid grid-cols-4 gap-0.5">
          {#each ['north', 'south', 'east', 'west'] as dir}
            <button
              class="text-[9px] px-1 py-0.5 rounded border-2 border-black {editingPinHousing.facing === dir ? 'bg-accent text-white shadow-[2px_2px_0_black]' : 'bg-surface-2 text-purple-light'}"
              onmousedown={(e) => e.preventDefault()}
              onclick={() => { editingPinHousing = { ...editingPinHousing, facing: dir }; applyPhEdit() }}
            >{dir[0].toUpperCase()}</button>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  {#if editingKeyswitch}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute bg-surface-1 rounded-lg border-2 border-black shadow-[4px_4px_0_black] z-10 p-1.5 flex flex-col gap-1.5"
      style="left: {editingKeyswitch.left}px; top: {editingKeyswitch.top}px"
      onfocusout={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) closeKswEdit() }}
    >
      <input
        type="text"
        value={editingKeyswitch.label}
        placeholder="Label (e.g. SW1)"
        class="bg-surface-2 text-xs text-cyan-light rounded-lg px-2 py-1 border-2 border-black outline-none shadow-[2px_2px_0_black] w-36"
        onkeydown={handleKswEditKeydown}
        oninput={(e) => { editingKeyswitch = { ...editingKeyswitch, label: e.target.value }; applyKswEdit() }}
      />
    </div>
  {/if}

  {#if editingCurve}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute bg-surface-1 rounded-lg border-2 border-black shadow-[4px_4px_0_black] z-10 p-1.5 flex flex-col gap-1.5"
      style="left: {editingCurve.left}px; top: {editingCurve.top}px"
      onfocusout={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) closeCurveEdit();
      }}
    >
      <div>
        <label class="text-[10px] text-purple-light block mb-0.5"
          >Trace width (mm)</label
        >
        <input
          type="number"
          value={editingCurve.width}
          min="0.3"
          max="5"
          step="0.1"
          class="bg-surface-2 text-xs text-cyan-light rounded-lg px-2 py-1 border-2 border-black outline-none shadow-[2px_2px_0_black] w-28"
          onkeydown={handleCurveEditKeydown}
          oninput={(e) => {
            editingCurve = {
              ...editingCurve,
              width: parseFloat(e.target.value) || 0.3,
            };
            applyCurveEdit();
          }}
        />
      </div>
      <div>
        <label class="text-[10px] text-purple-light block mb-0.5"
          >Start end width (mm)</label
        >
        <input
          type="number"
          value={editingCurve.endWidth}
          min="0.3"
          max="8"
          step="0.1"
          class="bg-surface-2 text-xs text-cyan-light rounded-lg px-2 py-1 border-2 border-black outline-none shadow-[2px_2px_0_black] w-28"
          onkeydown={handleCurveEditKeydown}
          oninput={(e) => {
            editingCurve = {
              ...editingCurve,
              endWidth: parseFloat(e.target.value) || 0.3,
            };
            applyCurveEdit();
          }}
        />
      </div>
      <div>
        <label class="text-[10px] text-purple-light block mb-0.5"
          >Finish end width (mm)</label
        >
        <input
          type="number"
          value={editingCurve.endWidth2}
          min="0.3"
          max="8"
          step="0.1"
          class="bg-surface-2 text-xs text-cyan-light rounded-lg px-2 py-1 border-2 border-black outline-none shadow-[2px_2px_0_black] w-28"
          onkeydown={handleCurveEditKeydown}
          oninput={(e) => {
            editingCurve = {
              ...editingCurve,
              endWidth2: parseFloat(e.target.value) || 0.3,
            };
            applyCurveEdit();
          }}
        />
      </div>
      <div>
        <label class="text-[10px] text-purple-light block mb-0.5"
          >Taper distance (mm)</label
        >
        <input
          type="number"
          value={editingCurve.taperDistance}
          min="0"
          max="50"
          step="0.5"
          class="bg-surface-2 text-xs text-cyan-light rounded-lg px-2 py-1 border-2 border-black outline-none shadow-[2px_2px_0_black] w-28"
          onkeydown={handleCurveEditKeydown}
          oninput={(e) => {
            editingCurve = {
              ...editingCurve,
              taperDistance: parseFloat(e.target.value) || 0,
            };
            applyCurveEdit();
          }}
        />
        <div class="text-[9px] text-purple-light/50 mt-0.5">
          0 = auto (half curve length)
        </div>
      </div>
      <div>
        <label class="text-[10px] text-purple-light block mb-0.5">Tension</label
        >
        <input
          type="range"
          value={editingCurve.tension}
          min="0.05"
          max="1.5"
          step="0.05"
          class="w-28 accent-[#ff2d95]"
          oninput={(e) => {
            editingCurve = {
              ...editingCurve,
              tension: parseFloat(e.target.value),
            };
            applyCurveEdit();
          }}
        />
        <div class="text-[9px] text-purple-light/50">
          {editingCurve.tension.toFixed(2)} — {editingCurve.tension < 0.3
            ? "loose"
            : editingCurve.tension < 0.7
              ? "smooth"
              : "tight"}
        </div>
      </div>
      <button
        class="w-full text-[10px] px-2 py-1 rounded-lg bg-surface-2 text-cyan-light hover:bg-surface-3 border-2 border-black shadow-[2px_2px_0_black]"
        onmousedown={(e) => e.preventDefault()}
        onclick={() => {
          onSubdivideCurve(editingCurve.id);
          closeCurveEdit();
        }}>+ Add Points (Subdivide)</button
      >
      <label
        class="flex items-center gap-1.5 text-[10px] text-purple-light mt-1 cursor-pointer"
      >
        <input
          type="checkbox"
          checked={editingCurve.freeform}
          class="accent-[#ff2d95]"
          onchange={(e) => {
            editingCurve = { ...editingCurve, freeform: e.target.checked };
            applyCurveEdit();
          }}
        />
        Free-form control points
      </label>
    </div>
  {/if}

  {#if editingTrace}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute bg-surface-1 rounded-lg border-2 border-black shadow-[4px_4px_0_black] z-10 p-2 space-y-1.5"
      style="left: {editingTrace.left}px; top: {editingTrace.top}px"
      onfocusout={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) closeTraceEdit();
      }}
    >
      <div>
        <label class="text-[10px] text-purple-light block mb-0.5"
          >Trace width (mm)</label
        >
        <input
          type="number"
          value={editingTrace.width}
          min="0.3"
          max="5"
          step="0.1"
          class="bg-surface-2 text-xs text-cyan-light rounded-lg px-2 py-1 border-2 border-black outline-none shadow-[2px_2px_0_black] w-28"
          onkeydown={handleTraceEditKeydown}
          oninput={(e) => {
            editingTrace = {
              ...editingTrace,
              width: parseFloat(e.target.value) || 0.3,
            };
            applyTraceEdit();
          }}
          onfocus={(e) => e.target.select()}
        />
      </div>
      <div class="border-t border-black/30 pt-1 mt-1">
        <label class="text-[10px] text-purple-light block mb-0.5">Corners</label>
        <div class="flex gap-1">
          <button
            class="px-2 py-0.5 text-[10px] rounded border-2 border-black {editingTrace.cornerShape === 'round'
              ? 'bg-accent text-white'
              : 'bg-surface-2 text-cyan-light'}"
            onclick={() => {
              editingTrace = { ...editingTrace, cornerShape: 'round' };
              applyTraceEdit();
            }}>Round</button>
          <button
            class="px-2 py-0.5 text-[10px] rounded border-2 border-black {editingTrace.cornerShape === 'square'
              ? 'bg-accent text-white'
              : 'bg-surface-2 text-cyan-light'}"
            onclick={() => {
              editingTrace = { ...editingTrace, cornerShape: 'square' };
              applyTraceEdit();
            }}>Square</button>
        </div>
      </div>
      <div class="border-t border-black/30 pt-1 mt-1">
        <label class="text-[10px] text-purple-light block mb-0.5">Ends</label>
        <div class="flex gap-1">
          <button
            class="px-2 py-0.5 text-[10px] rounded border-2 border-black {editingTrace.endShape === 'round'
              ? 'bg-accent text-white'
              : 'bg-surface-2 text-cyan-light'}"
            onclick={() => {
              editingTrace = { ...editingTrace, endShape: 'round' };
              applyTraceEdit();
            }}>Round</button>
          <button
            class="px-2 py-0.5 text-[10px] rounded border-2 border-black {editingTrace.endShape === 'square'
              ? 'bg-accent text-white'
              : 'bg-surface-2 text-cyan-light'}"
            onclick={() => {
              editingTrace = { ...editingTrace, endShape: 'square' };
              applyTraceEdit();
            }}>Square</button>
        </div>
      </div>
    </div>
  {/if}

  {#if editingRoundTrace}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute bg-surface-1 rounded-lg border-2 border-black shadow-[4px_4px_0_black] z-10 p-2 space-y-1.5"
      style="left: {editingRoundTrace.left}px; top: {editingRoundTrace.top}px"
      onfocusout={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) closeRoundTraceEdit();
      }}
    >
      <div>
        <label class="text-[10px] text-purple-light block mb-0.5"
          >Width (mm)</label
        >
        <input
          type="number"
          value={editingRoundTrace.width}
          min="0.3"
          max="5"
          step="0.1"
          class="bg-surface-2 text-xs text-cyan-light rounded-lg px-2 py-1 border-2 border-black outline-none shadow-[2px_2px_0_black] w-28"
          onkeydown={handleRoundTraceEditKeydown}
          oninput={(e) => {
            editingRoundTrace = {
              ...editingRoundTrace,
              width: parseFloat(e.target.value) || 0.3,
            };
            applyRoundTraceEdit();
          }}
          onfocus={(e) => e.target.select()}
        />
      </div>
      <div>
        <label class="text-[10px] text-purple-light block mb-0.5"
          >Radius (mm)</label
        >
        <input
          type="number"
          value={editingRoundTrace.radius}
          min="0.2"
          max="10"
          step="0.1"
          class="bg-surface-2 text-xs text-cyan-light rounded-lg px-2 py-1 border-2 border-black outline-none shadow-[2px_2px_0_black] w-28"
          onkeydown={handleRoundTraceEditKeydown}
          oninput={(e) => {
            editingRoundTrace = {
              ...editingRoundTrace,
              radius: parseFloat(e.target.value) || 1.0,
            };
            applyRoundTraceEdit();
          }}
          onfocus={(e) => e.target.select()}
        />
      </div>
      <div>
        <label class="text-[10px] text-purple-light block mb-0.5">Mode</label>
        <div class="flex gap-1">
          <button
            class="px-2 py-0.5 text-[10px] rounded border-2 border-black {editingRoundTrace.mode ===
            'arc'
              ? 'bg-accent text-white'
              : 'bg-surface-2 text-cyan-light'}"
            onclick={() => {
              editingRoundTrace = { ...editingRoundTrace, mode: "arc" };
              applyRoundTraceEdit();
            }}>Arc</button
          >
          <button
            class="px-2 py-0.5 text-[10px] rounded border-2 border-black {editingRoundTrace.mode ===
            'subdivision'
              ? 'bg-accent text-white'
              : 'bg-surface-2 text-cyan-light'}"
            onclick={() => {
              editingRoundTrace = { ...editingRoundTrace, mode: "subdivision" };
              applyRoundTraceEdit();
            }}>Subdiv</button
          >
        </div>
      </div>
      {#if editingRoundTrace.mode === "subdivision"}
        <div>
          <label class="text-[10px] text-purple-light block mb-0.5"
            >Passes ({editingRoundTrace.passes})</label
          >
          <input
            type="range"
            value={editingRoundTrace.passes}
            min="1"
            max="5"
            step="1"
            class="w-28"
            oninput={(e) => {
              editingRoundTrace = {
                ...editingRoundTrace,
                passes: parseInt(e.target.value) || 2,
              };
              applyRoundTraceEdit();
            }}
          />
        </div>
      {/if}
      <div class="border-t border-black/30 pt-1.5 mt-1">
        <label
          class="text-[10px] text-purple-light flex items-center gap-1.5 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={editingRoundTrace.teardrop}
            onchange={(e) => {
              editingRoundTrace = {
                ...editingRoundTrace,
                teardrop: e.target.checked,
              };
              applyRoundTraceEdit();
            }}
            class="accent-accent"
          />
          Teardrop
        </label>
      </div>
      {#if editingRoundTrace.teardrop}
        <div>
          <label class="text-[10px] text-purple-light block mb-0.5"
            >Length % ({editingRoundTrace.tdHPercent})</label
          >
          <input
            type="range"
            value={editingRoundTrace.tdHPercent}
            min="10"
            max="100"
            step="5"
            class="w-28"
            oninput={(e) => {
              editingRoundTrace = {
                ...editingRoundTrace,
                tdHPercent: parseInt(e.target.value) || 50,
              };
              applyRoundTraceEdit();
            }}
          />
        </div>
        <div>
          <label class="text-[10px] text-purple-light block mb-0.5"
            >Width % ({editingRoundTrace.tdVPercent})</label
          >
          <input
            type="range"
            value={editingRoundTrace.tdVPercent}
            min="10"
            max="100"
            step="5"
            class="w-28"
            oninput={(e) => {
              editingRoundTrace = {
                ...editingRoundTrace,
                tdVPercent: parseInt(e.target.value) || 90,
              };
              applyRoundTraceEdit();
            }}
          />
        </div>
      {/if}
    </div>
  {/if}

  {#if editingPad}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute bg-surface-1 rounded-lg border-2 border-black shadow-[4px_4px_0_black] z-10 p-1.5"
      style="left: {editingPad.left}px; top: {editingPad.top}px"
      onfocusout={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) commitPadEdit();
      }}
    >
      <input
        bind:this={padEditInput}
        type="text"
        value={editingPad.label}
        placeholder="Pad label (e.g. VCC)"
        class="bg-surface-2 text-xs text-cyan-light rounded-lg px-2 py-1 border-2 border-black outline-none shadow-[2px_2px_0_black] w-28"
        onkeydown={handlePadEditKeydown}
      />
    </div>
  {/if}

  {#if editingHeader}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute bg-surface-1 rounded-lg border-2 border-black shadow-[4px_4px_0_black] z-10 p-1.5"
      style="left: {editingHeader.left}px; top: {editingHeader.top}px; max-height: 260px; overflow-y: auto"
      onfocusout={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) commitHeaderEdit();
      }}
    >
      <div class="flex gap-1 mb-1.5">
        <button
          class="flex-1 text-[10px] px-1.5 py-1 rounded-lg border-2 border-black {editingHeader.female
            ? 'bg-surface-2 text-purple-light'
            : 'bg-accent text-white shadow-[2px_2px_0_black]'}"
          onmousedown={(e) => e.preventDefault()}
          onclick={() => {
            editingHeader = { ...editingHeader, female: false };
          }}>Male</button
        >
        <button
          class="flex-1 text-[10px] px-1.5 py-1 rounded-lg border-2 border-black {editingHeader.female
            ? 'bg-accent text-white shadow-[2px_2px_0_black]'
            : 'bg-surface-2 text-purple-light'}"
          onmousedown={(e) => e.preventDefault()}
          onclick={() => {
            editingHeader = { ...editingHeader, female: true };
          }}>Female</button
        >
      </div>
      <div class="border-t border-black/30 pt-1 mt-1 mb-1">
        <label class="text-[10px] text-purple-light flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={editingHeader.copperConnectedOnly}
            onchange={(e) => {
              editingHeader = { ...editingHeader, copperConnectedOnly: e.target.checked };
            }}
            class="accent-accent"
          />
          Copper only on connected pins
        </label>
      </div>
      <div class="text-[10px] text-purple-light mb-1">Pin labels</div>
      <div class="flex flex-col gap-0.5">
        {#each editingHeader.labels as label, i}
          <div class="flex items-center gap-1">
            <span class="text-[9px] text-purple-light/50 w-3 text-right"
              >{i + 1}</span
            >
            <input
              type="text"
              value={label}
              oninput={(e) => {
                editingHeader.labels[i] = e.target.value;
                editingHeader = editingHeader;
              }}
              onkeydown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  if (i < editingHeader.labels.length - 1) {
                    e.target.parentElement.nextElementSibling
                      ?.querySelector("input")
                      ?.focus();
                  } else {
                    commitHeaderEdit();
                  }
                } else if (e.key === "Escape") {
                  editingHeader = null;
                }
              }}
              placeholder="Pin {i + 1}"
              class="bg-surface-2 text-[11px] text-cyan-light rounded-lg px-1.5 py-0.5 border-2 border-black outline-none shadow-[2px_2px_0_black] w-20"
            />
          </div>
        {/each}
      </div>
    </div>
  {/if}
  <span class="absolute bottom-2 right-3 text-[10px] text-white/30 pointer-events-none select-none z-10">Bauhouse Consorxium</span>
</div>
