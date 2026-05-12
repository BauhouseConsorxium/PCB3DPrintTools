<script>
  import { onMount, untrack } from "svelte";
  import * as THREE from "three";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

  import { isCopper, isPcbBoard, isSilkscreen, isCopperText, isEnclosure, isComponent, isPinHousing, isPinHousingBase } from "../lib/viewer-predicates.js";
  import { makeMaterial, previewMat, subtractCutterMat, subtractBoardMat, previewSubtractBoardMat } from "../lib/viewer-materials.js";
  import { doRaiseExport, doSubtractExport } from "../lib/viewer-export.js";
  import { clearDimGroup, buildDimensions } from "../lib/viewer-dimensions.js";
  import { clearDrcGroup, addDrcTube } from "../lib/viewer-drc.js";

  let {
    bodies = [],
    visibility = {},
    zScale = 8,
    textZScale = 8,
    textMode = "raise",
    boardZScale = 1,
    previewFilter = null,
    traceMode = "raise",
    drcViolations = [],
    isRebuild = false,
    encSideBySide = false,
    rawSegments = null,
    silkPolylines = null,
    copperTextPolylines = null,
    boardThickness = 0,
    showDimensions = false,
  } = $props();

  let canvas;
  let renderer, scene, camera, controls, grid;
  let boardGroup;
  let meshMap = {};
  let animId;
  let needsRender = true;
  let dimCameraFitPending = false;

  // flip animation
  let isFlipped = false;
  let flipStartAngle = 0;
  let flipTargetAngle = 0;
  let flipStartTime = 0;
  let flipDuration = 400;

  function requestRender() {
    needsRender = true;
  }

  let pcbWorldCenter = new THREE.Vector3();
  let drcGroup;
  let dimGroup;

  // board geometry metrics
  let boardOriginalPosY = 0;
  let boardBottomY = 0;
  let boardTop = 0;
  let pinHousingOriginalY = {};
  let pinHousingTotalH = {};
  let copperThicknessLocal = 0;
  let copperOriginalY = {};
  let copperLocalZBottom = {};
  let copperNaturalTopOffset = {};

  let bodiesVersion = $state(0);

  let originalMaterials = {};

  // ------- helpers -------

  function applyState() {
    for (const [name, mesh] of Object.entries(meshMap)) {
      mesh.visible = visibility[name] !== false;
    }
  }

  function fitCamera() {
    const box = new THREE.Box3();
    for (const mesh of Object.values(meshMap)) box.expandByObject(mesh);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    pcbWorldCenter.copy(center);
    for (const mesh of Object.values(meshMap)) mesh.position.sub(center);

    const box2 = new THREE.Box3();
    for (const mesh of Object.values(meshMap)) box2.expandByObject(mesh);
    if (grid) grid.position.y = box2.min.y - 0.05;

    const size = box2.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z);
    camera.position.set(0, span * 1.0, -span * 0.7);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  function applyBoardScale(bS) {
    for (const [name, mesh] of Object.entries(meshMap)) {
      if (isCopper(name) || isComponent(name) || isEnclosure(name) || isPinHousing(name) || isPinHousingBase(name)) continue;
      mesh.scale.z = bS;
      mesh.position.y = boardBottomY + (boardOriginalPosY - boardBottomY) * bS;
    }
    if (grid) grid.position.y = boardBottomY - 0.05;
  }

  function applyCopperScale(zS, tS, bS, trcMode, txtMode) {
    const boardHeight = boardTop - boardBottomY;
    const boardTopCurrent = boardTop + boardHeight * (bS - 1);
    for (const [name, mesh] of Object.entries(meshMap)) {
      if (isPinHousingBase(name)) {
        mesh.scale.z = zS;
        mesh.position.y = (pinHousingOriginalY[name] ?? 0)
          + boardHeight * (bS - 1);
        continue;
      }
      if (isPinHousing(name)) {
        mesh.scale.z = 1;
        mesh.position.y = (pinHousingOriginalY[name] ?? 0)
          + boardHeight * (bS - 1)
          + copperThicknessLocal * (zS - 1);
        continue;
      }
      if (!isCopper(name)) continue;
      const isText = isCopperText(name);
      const s = isText ? tS : zS;
      const m = isText ? txtMode : trcMode;
      mesh.scale.z = s;
      if (m === "subtract") {
        const offset = copperNaturalTopOffset[name] ?? 0;
        mesh.position.y = boardTopCurrent - offset * s;
      } else {
        mesh.position.y =
          (copperOriginalY[name] ?? 0) +
          boardHeight * (bS - 1) +
          (copperLocalZBottom[name] ?? 0) * (s - 1);
      }
    }
  }

  // ------- Three.js init (once) -------

  onMount(() => {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2a2a3e);

    camera = new THREE.PerspectiveCamera(
      50,
      canvas.clientWidth / canvas.clientHeight,
      0.01,
      5000,
    );
    camera.position.set(0, 60, 120);

    scene.add(new THREE.AmbientLight(0xffffff, 2.2));
    const sun = new THREE.DirectionalLight(0xfffbe8, 3.0);
    sun.position.set(80, 160, 100);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xd0e8ff, 1.2);
    fill.position.set(-60, 40, -80);
    scene.add(fill);
    const back = new THREE.DirectionalLight(0xffffff, 0.6);
    back.position.set(0, -60, -100);
    scene.add(back);

    grid = new THREE.GridHelper(300, 30, 0x6060a8, 0x3e3e62);
    scene.add(grid);

    boardGroup = new THREE.Group();
    scene.add(boardGroup);

    drcGroup = new THREE.Group();
    boardGroup.add(drcGroup);

    dimGroup = new THREE.Group();
    boardGroup.add(dimGroup);

    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.5;
    controls.maxDistance = 2000;
    controls.addEventListener("change", requestRender);

    const obs = new ResizeObserver(() => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      requestRender();
    });
    obs.observe(canvas);

    function loop(time) {
      animId = requestAnimationFrame(loop);
      controls.update();

      let isAnimating = false;
      if (boardGroup && boardGroup.rotation.x !== flipTargetAngle) {
        let t = (time - flipStartTime) / flipDuration;
        if (t >= 1) {
          boardGroup.rotation.x = flipTargetAngle;
        } else {
          const ease =
            t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          boardGroup.rotation.x =
            flipStartAngle + (flipTargetAngle - flipStartAngle) * ease;
        }
        isAnimating = true;
        needsRender = true;
      }

      if (isAnimating && boardGroup && grid) {
        boardGroup.updateMatrixWorld(true);
        const bBox = new THREE.Box3().setFromObject(boardGroup);
        if (!bBox.isEmpty() && bBox.min.y !== Infinity) {
          grid.position.y = bBox.min.y - 0.2;
        }
      }

      if (needsRender) {
        renderer.render(scene, camera);
        needsRender = false;
      }
    }
    loop(performance.now());

    return () => {
      cancelAnimationFrame(animId);
      obs.disconnect();
      renderer.dispose();
    };
  });

  // ------- rebuild when bodies change -------

  $effect(() => {
    if (!scene) return;
    const currentBodies = bodies;

    for (const m of Object.values(meshMap)) {
      boardGroup.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    meshMap = {};

    for (const body of currentBodies) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.BufferAttribute(body.positions, 3),
      );
      if (body.normals)
        geo.setAttribute("normal", new THREE.BufferAttribute(body.normals, 3));
      if (body.indices)
        geo.setIndex(new THREE.BufferAttribute(body.indices, 1));
      if (!body.normals) geo.computeVertexNormals();

      const mesh = new THREE.Mesh(geo, makeMaterial(body.name));
      mesh.rotation.x = Math.PI / 2;
      boardGroup.add(mesh);
      meshMap[body.name] = mesh;
    }

    if (grid && boardGroup) {
      boardGroup.updateMatrixWorld(true);
      const bBox = new THREE.Box3().setFromObject(boardGroup);
      if (
        !bBox.isEmpty() &&
        bBox.min.y !== Infinity &&
        bBox.min.y !== -Infinity
      ) {
        grid.position.y = bBox.min.y - 0.2;
      }
    }

    untrack(() => {
      const rebuild = isRebuild;
      applyState();

      if (currentBodies.length) {
        scene.updateMatrixWorld(true);
        copperNaturalTopOffset = {};
        for (const [name, mesh] of Object.entries(meshMap)) {
          if (isCopper(name)) {
            const box = new THREE.Box3().setFromObject(mesh);
            copperNaturalTopOffset[name] = box.max.y - mesh.position.y;
          }
        }

        if (rebuild) {
          for (const mesh of Object.values(meshMap))
            mesh.position.sub(pcbWorldCenter);
          const box2 = new THREE.Box3();
          for (const mesh of Object.values(meshMap)) box2.expandByObject(mesh);
          if (grid) grid.position.y = box2.min.y - 0.05;
        } else {
          fitCamera();
          if (showDimensions) dimCameraFitPending = true;
        }

        originalMaterials = {};
        copperOriginalY = {};
        copperLocalZBottom = {};
        pinHousingOriginalY = {};
        pinHousingTotalH = {};
        copperThicknessLocal = 0;
        boardOriginalPosY = 0;
        boardBottomY = 0;
        boardTop = 0;
        encBaseZ = 0;
        for (const [name, mesh] of Object.entries(meshMap)) {
          originalMaterials[name] = mesh.material;
          if (isEnclosure(name)) {
            encBaseZ = mesh.position.z;
          } else if (isPinHousingBase(name)) {
            pinHousingOriginalY[name] = mesh.position.y;
          } else if (isPinHousing(name)) {
            pinHousingOriginalY[name] = mesh.position.y;
            mesh.geometry.computeBoundingBox();
            pinHousingTotalH[name] = mesh.geometry.boundingBox.max.z - mesh.geometry.boundingBox.min.z;
          } else if (isPcbBoard(name)) {
            const box = new THREE.Box3().setFromObject(mesh);
            boardOriginalPosY = mesh.position.y;
            boardBottomY = box.min.y;
            boardTop = box.max.y;
          } else if (isCopper(name)) {
            copperOriginalY[name] = mesh.position.y;
            mesh.geometry.computeBoundingBox();
            copperLocalZBottom[name] = mesh.geometry.boundingBox.max.z;
            if (!copperThicknessLocal) {
              const bb = mesh.geometry.boundingBox;
              copperThicknessLocal = bb.max.z - bb.min.z;
            }
          }
        }

        applyBoardScale(boardZScale);
        applyCopperScale(zScale, textZScale, boardZScale, traceMode, textMode);
        sideBySideOffsets = {};
        bodiesVersion++;
      }
      requestRender();
    });
  });

  // ------- visibility + material (normal / preview / subtract) -------

  $effect(() => {
    const filter = previewFilter;
    const vis = visibility;
    const trcMode = traceMode;
    const txtMode = textMode;

    for (const [name, mesh] of Object.entries(meshMap)) {
      const isText = isCopperText(name);
      const mode = isText ? txtMode : trcMode;
      const isSubtract = mode === "subtract";
      const isCu = isCopper(name);

      if (
        filter !== null &&
        (trcMode === "subtract" || txtMode === "subtract")
      ) {
        mesh.visible = vis[name] !== false;
        if (isCu && isSubtract) {
          mesh.material = subtractCutterMat;
        } else if (isCu) {
          mesh.material = originalMaterials[name] || mesh.material;
        } else {
          mesh.material = previewSubtractBoardMat;
        }
      } else if (filter !== null) {
        const inExport = filter(name);
        mesh.visible = inExport && vis[name] !== false;
        mesh.material = inExport
          ? previewMat
          : originalMaterials[name] || mesh.material;
      } else if (isCu && isSubtract) {
        mesh.visible = vis[name] !== false;
        mesh.material = subtractCutterMat;
      } else if (!isCu && (trcMode === "subtract" || txtMode === "subtract")) {
        mesh.visible = vis[name] !== false;
        mesh.material = subtractBoardMat;
      } else {
        mesh.visible = vis[name] !== false;
        mesh.material = originalMaterials[name] || mesh.material;
      }
    }
    requestRender();
  });

  // ------- board z-scale -------

  $effect(() => {
    applyBoardScale(boardZScale);
    requestRender();
  });

  // ------- copper z-scale + position -------

  $effect(() => {
    applyCopperScale(zScale, textZScale, boardZScale, traceMode, textMode);
    requestRender();
  });

  // ------- enclosure side-by-side -------

  let sideBySideOffsets = {};
  let encBaseZ = 0;

  $effect(() => {
    const side = encSideBySide;
    const _v = bodiesVersion;
    if (!Object.keys(meshMap).length) return;

    for (const [name, mesh] of Object.entries(meshMap)) {
      if (sideBySideOffsets[name] !== undefined) {
        mesh.position.x -= sideBySideOffsets[name];
      }
    }
    sideBySideOffsets = {};

    const encMesh = meshMap["Enclosure"];
    if (encMesh) {
      if (originalMaterials["Enclosure"])
        encMesh.material = originalMaterials["Enclosure"];
      encMesh.rotation.x = Math.PI / 2;
      encMesh.position.z = encBaseZ;
      if (copperOriginalY["Enclosure"] !== undefined) {
        encMesh.position.y = copperOriginalY["Enclosure"];
      }
    }

    if (!side || !encMesh) {
      requestRender();
      return;
    }

    encMesh.material = new THREE.MeshPhongMaterial({
      color: 0x5a8fa8,
      specular: 0x334455,
      shininess: 20,
      side: THREE.DoubleSide,
    });

    encMesh.rotation.x = -Math.PI / 2;
    encMesh.position.z = -encBaseZ;
    encMesh.updateMatrixWorld(true);
    const flippedBox = new THREE.Box3().setFromObject(encMesh);
    encMesh.position.y += boardBottomY - flippedBox.min.y;

    encMesh.updateMatrixWorld(true);
    const encBox = new THREE.Box3().setFromObject(encMesh);
    const encWidthX = encBox.max.x - encBox.min.x;

    let boardWidthX = 0;
    for (const [name, mesh] of Object.entries(meshMap)) {
      if (isEnclosure(name)) continue;
      const b = new THREE.Box3().setFromObject(mesh);
      boardWidthX = Math.max(boardWidthX, b.max.x - b.min.x);
    }

    const gap = 2;
    const boardShift = -(gap + encWidthX) / 2;
    const encShift = (gap + boardWidthX) / 2;

    for (const [name, mesh] of Object.entries(meshMap)) {
      const offset = isEnclosure(name) ? encShift : boardShift;
      mesh.position.x += offset;
      sideBySideOffsets[name] = offset;
    }

    if (grid) {
      const box = new THREE.Box3();
      for (const mesh of Object.values(meshMap)) box.expandByObject(mesh);
      grid.position.y = box.min.y - 0.05;
    }
    requestRender();
  });

  // ------- dimension annotations -------

  $effect(() => {
    const show = showDimensions;
    const b = bodies;
    const bS = boardZScale;
    untrack(() => {
      clearDimGroup(dimGroup);
      if (show && b.length) {
        buildDimensions(dimGroup, meshMap);
        if (dimCameraFitPending && boardGroup && camera && controls) {
          dimCameraFitPending = false;
          boardGroup.updateMatrixWorld(true);
          const fullBox = new THREE.Box3();
          for (const mesh of Object.values(meshMap))
            fullBox.expandByObject(mesh);
          if (dimGroup.children.length) fullBox.expandByObject(dimGroup);
          if (!fullBox.isEmpty()) {
            const center = fullBox.getCenter(new THREE.Vector3());
            const size = fullBox.getSize(new THREE.Vector3());
            const span = Math.max(size.x, size.z);
            camera.position.set(
              center.x,
              center.y + span * 1.0,
              center.z - span * 0.7,
            );
            controls.target.copy(center);
            controls.update();
          }
        }
      }
      requestRender();
    });
  });

  // ------- DRC markers -------

  function drcMarkerY() {
    return boardBottomY + (boardTop - boardBottomY) * boardZScale + 1.5;
  }

  $effect(() => {
    const violations = drcViolations;
    const b = bodies;
    if (!drcGroup) return;
    clearDrcGroup(drcGroup);
    if (!violations.length || !b.length) return;

    const wy = drcMarkerY();
    for (const v of violations) {
      if (v.type === "width") {
        addDrcTube(drcGroup, pcbWorldCenter, wy, v.x1, v.y1, v.x2, v.y2, 0xf59e0b);
      } else if (v.type === "clearance") {
        addDrcTube(drcGroup, pcbWorldCenter, wy, v.segA.x1, v.segA.y1, v.segA.x2, v.segA.y2, 0xef4444);
        addDrcTube(drcGroup, pcbWorldCenter, wy, v.segB.x1, v.segB.y1, v.segB.x2, v.segB.y2, 0xef4444);
      }
    }
    requestRender();
  });

  $effect(() => {
    if (!drcGroup) return;
    const wy = drcMarkerY();
    for (const m of drcGroup.children) m.position.y = wy;
    requestRender();
  });

  // ------- public API -------

  export function exportSTL(filter, filename) {
    unflipForAction(async () => {
      if (!scene) return;
      if (traceMode === "subtract" || textMode === "subtract") {
        await doSubtractExport({
          meshMap,
          scene,
          traceMode,
          textMode,
          rawSegments,
          silkPolylines,
          copperTextPolylines,
          boardThickness,
          filename,
        });
      } else {
        await doRaiseExport({
          meshMap,
          scene,
          silkPolylines,
          boardThickness,
          filter,
          filename,
        });
      }
    });
  }

  async function unflipForAction(action) {
    if (!boardGroup) return await action();
    const oldRot = boardGroup.rotation.x;
    boardGroup.rotation.x = 0;
    boardGroup.updateMatrixWorld(true);
    try {
      return await action();
    } finally {
      boardGroup.rotation.x = oldRot;
      boardGroup.updateMatrixWorld(true);
      requestRender();
    }
  }

  function flipBoard() {
    if (!boardGroup) return;
    isFlipped = !isFlipped;
    flipStartAngle = boardGroup.rotation.x;
    flipTargetAngle = isFlipped ? Math.PI : 0;
    flipStartTime = performance.now();
    requestRender();
  }
</script>

<div class="relative w-full h-full">
  <canvas bind:this={canvas} class="w-full h-full block"></canvas>
  <button
    onclick={flipBoard}
    class="absolute top-4 right-4 bg-surface-1 hover:bg-surface-2 text-cyan-light font-bold px-3 py-2 rounded-lg border-2 border-black shadow-[2px_2px_0_black] text-xs transition-colors uppercase tracking-wider z-10"
  >
    Flip Board
  </button>
  <span class="absolute bottom-2 right-3 text-[10px] text-white/30 pointer-events-none select-none z-10">Bauhouse Consorxium</span>
</div>
