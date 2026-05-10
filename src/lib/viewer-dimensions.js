import * as THREE from "three";
import { isPcbBoard } from "./viewer-predicates.js";

export function clearDimGroup(dimGroup) {
  while (dimGroup && dimGroup.children.length) {
    const c = dimGroup.children[0];
    dimGroup.remove(c);
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (c.material.map) c.material.map.dispose();
      c.material.dispose();
    }
  }
}

export function makeTextSprite(text, scale) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const fontSize = 64;
  ctx.font = `bold ${fontSize}px "Courier New", monospace`;
  const metrics = ctx.measureText(text);
  const pw = Math.ceil(metrics.width) + 24;
  const ph = fontSize + 24;
  canvas.width = pw;
  canvas.height = ph;
  ctx.font = `bold ${fontSize}px "Courier New", monospace`;
  ctx.fillStyle = "#c8c8e8";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, pw / 2, ph / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    depthTest: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(mat);
  const aspect = pw / ph;
  sprite.scale.set(scale * aspect, scale, 1);
  return sprite;
}

export function buildDimensions(dimGroup, meshMap) {
  if (!dimGroup) return;
  const boardMesh = Object.entries(meshMap).find(([n]) => isPcbBoard(n))?.[1];
  if (!boardMesh) return;

  const box = new THREE.Box3().setFromObject(boardMesh);
  const minX = box.min.x,
    maxX = box.max.x;
  const minZ = box.min.z,
    maxZ = box.max.z;
  const bY = box.min.y;

  const widthMM = maxX - minX;
  const heightMM = maxZ - minZ;
  if (widthMM < 0.1 || heightMM < 0.1) return;

  const span = Math.max(widthMM, heightMM);
  const gap = span * 0.08;
  const ext = span * 0.03;
  const arrowLen = span * 0.04;
  const arrowR = arrowLen * 0.3;
  const textScale = span * 0.06;

  const dimColor = 0x8888cc;
  const lineMat = new THREE.LineBasicMaterial({
    color: dimColor,
    depthTest: false,
  });

  // --- Width dimension (below board, along X) ---
  const wY = bY;
  const wZ = maxZ + gap;
  const wExtZ = wZ + ext;

  const wPts = [];
  wPts.push(minX, wY, maxZ + gap * 0.3, minX, wY, wExtZ);
  wPts.push(maxX, wY, maxZ + gap * 0.3, maxX, wY, wExtZ);
  wPts.push(minX, wY, wZ, maxX, wY, wZ);

  const wGeo = new THREE.BufferGeometry();
  wGeo.setAttribute("position", new THREE.Float32BufferAttribute(wPts, 3));
  const wLines = new THREE.LineSegments(wGeo, lineMat);
  dimGroup.add(wLines);

  const wArrowL = new THREE.Mesh(
    new THREE.ConeGeometry(arrowR, arrowLen, 6),
    new THREE.MeshBasicMaterial({ color: dimColor, depthTest: false }),
  );
  wArrowL.position.set(minX + arrowLen / 2, wY, wZ);
  wArrowL.rotation.z = Math.PI / 2;
  dimGroup.add(wArrowL);

  const wArrowR = new THREE.Mesh(
    new THREE.ConeGeometry(arrowR, arrowLen, 6),
    new THREE.MeshBasicMaterial({ color: dimColor, depthTest: false }),
  );
  wArrowR.position.set(maxX - arrowLen / 2, wY, wZ);
  wArrowR.rotation.z = -Math.PI / 2;
  dimGroup.add(wArrowR);

  const wText = makeTextSprite(`${widthMM.toFixed(2)} mm`, textScale);
  wText.position.set((minX + maxX) / 2, wY, wZ + textScale * 0.6);
  dimGroup.add(wText);

  // --- Height dimension (right side, along Z) ---
  const hX = maxX + gap;

  const hPts = [];
  hPts.push(maxX + gap * 0.3, wY, minZ, maxX + gap + ext, wY, minZ);
  hPts.push(maxX + gap * 0.3, wY, maxZ, maxX + gap + ext, wY, maxZ);
  hPts.push(hX, wY, minZ, hX, wY, maxZ);

  const hGeo = new THREE.BufferGeometry();
  hGeo.setAttribute("position", new THREE.Float32BufferAttribute(hPts, 3));
  const hLines = new THREE.LineSegments(hGeo, lineMat);
  dimGroup.add(hLines);

  const hArrowT = new THREE.Mesh(
    new THREE.ConeGeometry(arrowR, arrowLen, 6),
    new THREE.MeshBasicMaterial({ color: dimColor, depthTest: false }),
  );
  hArrowT.position.set(hX, wY, minZ + arrowLen / 2);
  hArrowT.rotation.x = -Math.PI / 2;
  dimGroup.add(hArrowT);

  const hArrowB = new THREE.Mesh(
    new THREE.ConeGeometry(arrowR, arrowLen, 6),
    new THREE.MeshBasicMaterial({ color: dimColor, depthTest: false }),
  );
  hArrowB.position.set(hX, wY, maxZ - arrowLen / 2);
  hArrowB.rotation.x = Math.PI / 2;
  dimGroup.add(hArrowB);

  const hText = makeTextSprite(`${heightMM.toFixed(2)} mm`, textScale);
  hText.position.set(hX + textScale * 0.6, wY, (minZ + maxZ) / 2);
  dimGroup.add(hText);
}
