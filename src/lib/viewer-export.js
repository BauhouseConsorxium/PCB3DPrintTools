import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import earcut from "earcut";
import { isCopper, isPcbBoard, isCopperText, isSilkscreen } from "./viewer-predicates.js";

export const SILK_ENGRAVE_DEPTH = 0.15;

export function polylineOutline2D(pts, hw) {
  const CAP = 8;
  const snap = (v) => Math.round(v * 1000) / 1000;
  const N = pts.length;
  if (N < 2) return null;
  const dirs = [];
  for (let i = 0; i < N - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0],
      dy = pts[i + 1][1] - pts[i][1];
    const len = Math.hypot(dx, dy) || 1e-9;
    dirs.push([dx / len, dy / len]);
  }
  const right = [],
    left = [];
  for (let i = 0; i < N; i++) {
    if (i === 0) {
      right.push([pts[0][0] + dirs[0][1] * hw, pts[0][1] - dirs[0][0] * hw]);
      left.push([pts[0][0] - dirs[0][1] * hw, pts[0][1] + dirs[0][0] * hw]);
    } else if (i === N - 1) {
      const d = dirs[N - 2];
      right.push([pts[i][0] + d[1] * hw, pts[i][1] - d[0] * hw]);
      left.push([pts[i][0] - d[1] * hw, pts[i][1] + d[0] * hw]);
    } else {
      const d0 = dirs[i - 1],
        d1 = dirs[i];
      const nx0 = d0[1],
        ny0 = -d0[0],
        nx1 = d1[1],
        ny1 = -d1[0];
      const bx = nx0 + nx1,
        by = ny0 + ny1,
        bLen = Math.hypot(bx, by) || 1e-9;
      const bnx = bx / bLen,
        bny = by / bLen;
      const cosHalf = Math.max(0.25, nx0 * bnx + ny0 * bny);
      const dist = hw / cosHalf;
      right.push([pts[i][0] + bnx * dist, pts[i][1] + bny * dist]);
      left.push([pts[i][0] - bnx * dist, pts[i][1] - bny * dist]);
    }
  }
  const ring = [];
  for (let i = 0; i < N; i++)
    ring.push([snap(right[i][0]), snap(right[i][1])]);
  const lastDir = dirs[N - 2];
  const endTheta = Math.atan2(lastDir[1], lastDir[0]);
  for (let i = 1; i < CAP; i++) {
    const a = endTheta - Math.PI / 2 + (Math.PI * i) / CAP;
    ring.push([
      snap(pts[N - 1][0] + hw * Math.cos(a)),
      snap(pts[N - 1][1] + hw * Math.sin(a)),
    ]);
  }
  for (let i = N - 1; i >= 0; i--)
    ring.push([snap(left[i][0]), snap(left[i][1])]);
  const firstDir = dirs[0];
  const startTheta = Math.atan2(firstDir[1], firstDir[0]);
  for (let i = 1; i < CAP; i++) {
    const a = startTheta + Math.PI / 2 + (Math.PI * i) / CAP;
    ring.push([
      snap(pts[0][0] + hw * Math.cos(a)),
      snap(pts[0][1] + hw * Math.sin(a)),
    ]);
  }
  ring.push(ring[0].slice());
  return ring;
}

export function stadiumPoly2D(p1x, p1y, p2x, p2y, hw) {
  const HALF = 16;
  const snap = (v) => Math.round(v * 1000) / 1000;
  const dx = p2x - p1x,
    dy = p2y - p1y;
  const theta = Math.atan2(dy, dx);
  const ring = [];
  for (let i = 0; i <= HALF; i++) {
    const a = theta - Math.PI / 2 + (Math.PI * i) / HALF;
    ring.push([snap(p2x + hw * Math.cos(a)), snap(p2y + hw * Math.sin(a))]);
  }
  for (let i = 1; i < HALF; i++) {
    const a = theta + Math.PI / 2 + (Math.PI * i) / HALF;
    ring.push([snap(p1x + hw * Math.cos(a)), snap(p1y + hw * Math.sin(a))]);
  }
  ring.push(ring[0].slice());
  return ring;
}

export function extrudeMultiPoly(multiPoly, zBot, zTop) {
  const pos = [],
    nrm = [],
    idx = [];
  let vOff = 0;
  for (const polygon of multiPoly) {
    const outer = polygon[0];
    const holes = polygon.slice(1);
    const outerVerts = outer.slice(0, -1);
    const flat = [];
    const holeIndices = [];
    for (const [x, y] of outerVerts) flat.push(x, y);
    for (const hole of holes) {
      holeIndices.push(flat.length / 2);
      const hv = hole.slice(0, -1);
      for (const [x, y] of hv) flat.push(x, y);
    }
    const triIdx = earcut(flat, holeIndices.length ? holeIndices : null, 2);
    if (!triIdx.length) continue;
    const nFace = flat.length / 2;
    let lvi = 0;
    // Top face
    for (let i = 0; i < nFace; i++) {
      pos.push(flat[i * 2], flat[i * 2 + 1], zTop);
      nrm.push(0, 0, 1);
      lvi++;
    }
    for (const t of triIdx) idx.push(vOff + t);
    // Bottom face
    const bOff = lvi;
    for (let i = 0; i < nFace; i++) {
      pos.push(flat[i * 2], flat[i * 2 + 1], zBot);
      nrm.push(0, 0, -1);
      lvi++;
    }
    for (let i = 0; i < triIdx.length; i += 3)
      idx.push(
        vOff + bOff + triIdx[i + 2],
        vOff + bOff + triIdx[i + 1],
        vOff + bOff + triIdx[i],
      );
    // Outer side wall
    for (let i = 0; i < outerVerts.length; i++) {
      const j = (i + 1) % outerVerts.length;
      const [x0, y0] = outerVerts[i],
        [x1, y1] = outerVerts[j];
      const edx = x1 - x0,
        edy = y1 - y0,
        edL = Math.hypot(edx, edy) || 1;
      const nx = edy / edL,
        ny = -edx / edL;
      const a0 = vOff + lvi,
        a1 = a0 + 1,
        b0 = a0 + 2,
        b1 = a0 + 3;
      pos.push(x0, y0, zBot);
      nrm.push(nx, ny, 0);
      lvi++;
      pos.push(x0, y0, zTop);
      nrm.push(nx, ny, 0);
      lvi++;
      pos.push(x1, y1, zBot);
      nrm.push(nx, ny, 0);
      lvi++;
      pos.push(x1, y1, zTop);
      nrm.push(nx, ny, 0);
      lvi++;
      idx.push(a0, b0, b1, a0, b1, a1);
    }
    // Hole side walls
    for (const hole of holes) {
      const hv = hole.slice(0, -1);
      for (let i = 0; i < hv.length; i++) {
        const j = (i + 1) % hv.length;
        const [x0, y0] = hv[i],
          [x1, y1] = hv[j];
        const edx = x1 - x0,
          edy = y1 - y0,
          edL = Math.hypot(edx, edy) || 1;
        const nx = edy / edL,
          ny = -edx / edL;
        const a0 = vOff + lvi,
          a1 = a0 + 1,
          b0 = a0 + 2,
          b1 = a0 + 3;
        pos.push(x0, y0, zBot);
        nrm.push(nx, ny, 0);
        lvi++;
        pos.push(x0, y0, zTop);
        nrm.push(nx, ny, 0);
        lvi++;
        pos.push(x1, y1, zBot);
        nrm.push(nx, ny, 0);
        lvi++;
        pos.push(x1, y1, zTop);
        nrm.push(nx, ny, 0);
        lvi++;
        idx.push(a0, b0, b1, a0, b1, a1);
      }
    }
    vOff += lvi;
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return geo;
}

export function parsePackedPolylines(buf) {
  if (!buf || !buf.length) return null;
  const result = { front: [], back: [] };
  let off = 0;
  const count = buf[off++];
  for (let i = 0; i < count; i++) {
    const numPts = buf[off++];
    const hw = buf[off++];
    const layerFlag = buf[off++];
    const pts = [];
    for (let j = 0; j < numPts; j++) {
      pts.push([buf[off++], buf[off++]]);
    }
    const ring = polylineOutline2D(pts, hw);
    if (ring) {
      const bucket = layerFlag < 0.5 ? "front" : "back";
      result[bucket].push([ring]);
    }
  }
  return result;
}

export function chunkMergeUnion(polys, pcUnion) {
  let level = polys.slice();
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 8) {
      const chunk = level.slice(i, i + 8);
      try {
        next.push(pcUnion(...chunk));
      } catch {
        let acc = chunk[0];
        for (let j = 1; j < chunk.length; j++) {
          try {
            acc = pcUnion(acc, chunk[j]);
          } catch {
            /* skip */
          }
        }
        next.push(acc);
      }
    }
    level = next;
  }
  return level[0] || null;
}

export async function buildSilkCutters(silkPolylines, boardThickness, pcUnion) {
  const silk = parsePackedPolylines(silkPolylines);
  if (!silk) return [];
  const thickness = boardThickness;
  const cutters = [];
  for (const [key, polys] of Object.entries(silk)) {
    if (!polys.length) continue;
    const isFront = key === "front";
    const zBot = isFront ? thickness - SILK_ENGRAVE_DEPTH : 0;
    const zTop = isFront ? thickness + 0.01 : SILK_ENGRAVE_DEPTH + 0.01;

    const merged = chunkMergeUnion(polys, pcUnion);
    if (!merged || !merged.length) continue;
    const geo = extrudeMultiPoly(merged, zBot, zTop);
    if (geo) cutters.push({ geo, key });
  }
  return cutters;
}

export async function engraveSilkscreen(
  base,
  evaluator,
  Brush,
  SUBTRACTION,
  pcUnion,
  boardMesh,
  silkPolylines,
  boardThickness,
) {
  const cutters = await buildSilkCutters(silkPolylines, boardThickness, pcUnion);
  for (const { geo, key } of cutters) {
    const cutter = new Brush(geo);
    cutter.rotation.copy(boardMesh.rotation);
    cutter.scale.copy(boardMesh.scale);
    cutter.position.copy(boardMesh.position);
    cutter.updateMatrixWorld();
    try {
      base = evaluator.evaluate(base, cutter, SUBTRACTION);
    } catch (e) {
      console.warn("Silk engrave failed for", key, e.message);
    }
  }
  return base;
}

export async function doRaiseExport({
  meshMap,
  scene,
  silkPolylines,
  boardThickness,
  filter,
  filename,
}) {
  scene.updateMatrixWorld(true);
  const group = new THREE.Group();

  const hasSilk = silkPolylines && silkPolylines.length > 0;
  let engravedBoardGeo = null;

  if (hasSilk) {
    const boardMesh = Object.entries(meshMap).find(
      ([n, m]) => isPcbBoard(n) && m.visible,
    )?.[1];
    if (boardMesh) {
      const [{ Brush, Evaluator, SUBTRACTION }, polygonClipping] =
        await Promise.all([
          import("three-bvh-csg"),
          import("polygon-clipping"),
        ]);
      const pcUnion = polygonClipping.default?.union || polygonClipping.union;
      const evaluator = new Evaluator();
      evaluator.attributes = ["position", "normal"];
      let boardBrush = new Brush(boardMesh.geometry.clone());
      boardBrush.position.copy(boardMesh.position);
      boardBrush.rotation.copy(boardMesh.rotation);
      boardBrush.scale.copy(boardMesh.scale);
      boardBrush.updateMatrixWorld();
      boardBrush = await engraveSilkscreen(
        boardBrush,
        evaluator,
        Brush,
        SUBTRACTION,
        pcUnion,
        boardMesh,
        silkPolylines,
        boardThickness,
      );
      engravedBoardGeo = boardBrush.geometry.clone();
      engravedBoardGeo.applyMatrix4(boardBrush.matrixWorld);
    }
  }

  for (const [name, mesh] of Object.entries(meshMap)) {
    if (!mesh.visible) continue;
    if (filter && !filter(name)) continue;
    if (isSilkscreen(name)) continue;
    if (engravedBoardGeo && isPcbBoard(name)) {
      group.add(new THREE.Mesh(engravedBoardGeo));
      continue;
    }
    const clone = mesh.clone();
    clone.applyMatrix4(mesh.matrixWorld);
    group.add(clone);
  }
  if (!group.children.length) {
    alert("No visible bodies match the selected export target.");
    return;
  }
  triggerDownload(
    new STLExporter().parse(group, { binary: true }),
    filename || "pcb-export.stl",
  );
}

export async function doSubtractExport({
  meshMap,
  scene,
  traceMode,
  textMode,
  rawSegments,
  silkPolylines,
  copperTextPolylines,
  boardThickness,
  filename,
}) {
  const [{ Brush, Evaluator, SUBTRACTION }, polygonClipping] =
    await Promise.all([import("three-bvh-csg"), import("polygon-clipping")]);
  const pcUnion = polygonClipping.default?.union || polygonClipping.union;
  scene.updateMatrixWorld(true);

  const boardMesh = Object.entries(meshMap).find(
    ([n, m]) => isPcbBoard(n) && m.visible,
  )?.[1];
  if (!boardMesh) {
    alert("No board mesh found for export.");
    return;
  }

  const fCuMesh = meshMap["F.Cu"];
  const bCuMesh = meshMap["B.Cu"];

  const evaluator = new Evaluator();
  evaluator.attributes = ["position", "normal"];

  const boardBrush = new Brush(boardMesh.geometry.clone());
  boardBrush.position.copy(boardMesh.position);
  boardBrush.rotation.copy(boardMesh.rotation);
  boardBrush.scale.copy(boardMesh.scale);
  boardBrush.updateMatrixWorld();
  let base = boardBrush;

  const thickness = boardThickness;
  const copperH = 0.035;
  const PIERCE = 0.01;
  let subtractCount = 0;

  if (traceMode === "subtract" && rawSegments && rawSegments.length) {
    const layerPolys = { front: [], back: [] };
    const segCount = rawSegments.length / 6;
    for (let i = 0; i < segCount; i++) {
      const p1x = rawSegments[i * 6],
        p1y = rawSegments[i * 6 + 1];
      const p2x = rawSegments[i * 6 + 2],
        p2y = rawSegments[i * 6 + 3];
      const width = rawSegments[i * 6 + 4],
        layerFlag = rawSegments[i * 6 + 5];
      const ring = stadiumPoly2D(p1x, p1y, p2x, p2y, width / 2);
      layerPolys[layerFlag < 0.5 ? "front" : "back"].push([ring]);
    }
    for (const [key, polys] of Object.entries(layerPolys)) {
      if (!polys.length) continue;
      const refMesh = key === "front" ? fCuMesh : bCuMesh;
      if (!refMesh) continue;
      const isFront = key === "front";
      const merged = chunkMergeUnion(polys, pcUnion);
      if (!merged || !merged.length) continue;
      const geo = extrudeMultiPoly(
        merged,
        isFront ? thickness : -copperH,
        isFront ? thickness + copperH : 0,
      );
      if (!geo) continue;
      const cutter = new Brush(geo);
      cutter.rotation.copy(refMesh.rotation);
      cutter.scale.copy(refMesh.scale);
      cutter.position.copy(refMesh.position);
      cutter.position.y += PIERCE;
      cutter.updateMatrixWorld();
      try {
        base = evaluator.evaluate(base, cutter, SUBTRACTION);
        subtractCount++;
      } catch (e) {
        console.error("CSG trace subtract failed for", key, e);
      }
    }
  }

  if (textMode === "subtract") {
    const textMeshes = {
      front: meshMap["F.Cu_text"],
      back: meshMap["B.Cu_text"],
    };
    const copperText = parsePackedPolylines(copperTextPolylines);
    if (copperText) {
      for (const [key, polys] of Object.entries(copperText)) {
        if (!polys.length) continue;
        const isFront = key === "front";
        const refMesh = textMeshes[key];
        if (!refMesh) continue;
        const merged = chunkMergeUnion(polys, pcUnion);
        if (!merged || !merged.length) continue;
        const geo = extrudeMultiPoly(
          merged,
          isFront ? thickness : -copperH,
          isFront ? thickness + copperH : 0,
        );
        if (!geo) continue;
        const cutter = new Brush(geo);
        cutter.rotation.copy(refMesh.rotation);
        cutter.scale.copy(refMesh.scale);
        cutter.position.copy(refMesh.position);
        cutter.position.y += PIERCE;
        cutter.updateMatrixWorld();
        try {
          base = evaluator.evaluate(base, cutter, SUBTRACTION);
          subtractCount++;
        } catch (e) {
          console.error("CSG text subtract failed for", key, e);
        }
      }
    }
  }

  if (subtractCount === 0) {
    alert(
      "No CSG subtraction was performed. Check that traces or text are set to subtract mode.",
    );
    return;
  }

  base = await engraveSilkscreen(
    base,
    evaluator,
    Brush,
    SUBTRACTION,
    pcUnion,
    boardMesh,
    silkPolylines,
    boardThickness,
  );

  const resultGeo = base.geometry.clone();
  resultGeo.applyMatrix4(base.matrixWorld);

  const group = new THREE.Group();
  group.add(new THREE.Mesh(resultGeo));

  for (const [name, mesh] of Object.entries(meshMap)) {
    if (!mesh.visible) continue;
    if (isCopper(name) && !isCopperText(name) && traceMode === "raise") {
      const clone = mesh.geometry.clone();
      clone.applyMatrix4(mesh.matrixWorld);
      group.add(new THREE.Mesh(clone));
    }
    if (isCopperText(name) && textMode === "raise") {
      const clone = mesh.geometry.clone();
      clone.applyMatrix4(mesh.matrixWorld);
      group.add(new THREE.Mesh(clone));
    }
  }

  triggerDownload(
    new STLExporter().parse(group, { binary: true }),
    filename || "pcb-3dprint.stl",
  );
}

export function triggerDownload(data, filename) {
  const blob = new Blob([data.buffer], { type: "model/stl" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
