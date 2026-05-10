<script>
  import { onMount, untrack } from "svelte";
  import * as THREE from "three";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
  import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
  import earcut from "earcut";

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
  let boardGroup; // NEW
  let meshMap = {};
  let animId;
  let needsRender = true;

  // flip animation
  let isFlipped = false;
  let flipStartAngle = 0;
  let flipTargetAngle = 0;
  let flipStartTime = 0;
  let flipDuration = 400; // ms

  function requestRender() {
    needsRender = true;
  }

  let pcbWorldCenter = new THREE.Vector3();
  let drcGroup;
  let dimGroup;

  // board geometry metrics — computed after centering
  let boardOriginalPosY = 0;
  let boardBottomY = 0;
  let boardTop = 0;
  let copperOriginalY = {};
  let copperLocalZBottom = {};
  // distance from copper mesh's position.y to its world Y top at scale.z=1 — invariant to centering
  let copperNaturalTopOffset = {};

  let bodiesVersion = $state(0);

  // materials
  let originalMaterials = {};

  const previewMat = new THREE.MeshPhongMaterial({
    color: 0xd4d4d4,
    specular: 0x888888,
    shininess: 60,
    side: THREE.DoubleSide,
  });
  const subtractCutterMat = new THREE.MeshPhongMaterial({
    color: 0xff6b35,
    specular: 0x884422,
    shininess: 80,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const subtractBoardMat = new THREE.MeshPhongMaterial({
    color: 0x27ae60,
    specular: 0x5dade2,
    shininess: 40,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  // Grey semi-transparent board used in export-preview + subtract mode combined
  const previewSubtractBoardMat = new THREE.MeshPhongMaterial({
    color: 0xd4d4d4,
    specular: 0x888888,
    shininess: 60,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });

  // ------- helpers -------

  function isCopper(name) {
    const n = name.toLowerCase();
    return n.includes("copper") || n.includes(".cu") || n.includes("_cu");
  }

  function isPcbBoard(name) {
    const n = name.toLowerCase();
    return !isCopper(name) && (n.includes("_pcb") || n.endsWith("pcb"));
  }

  function isSilkscreen(name) {
    const n = name.toLowerCase();
    return n.includes("silks");
  }

  function isCopperText(name) {
    return name.endsWith("_text") && isCopper(name);
  }

  function isEnclosure(name) {
    return name.toLowerCase() === "enclosure";
  }

  function isComponent(name) {
    return (
      !isCopper(name) &&
      !isPcbBoard(name) &&
      !isEnclosure(name) &&
      !isSilkscreen(name)
    );
  }

  function makeMaterial(name) {
    if (isCopper(name)) {
      return new THREE.MeshPhongMaterial({
        color: 0xf5c842,
        specular: 0xffffff,
        shininess: 120,
        side: THREE.DoubleSide,
      });
    }
    if (isSilkscreen(name)) {
      return new THREE.MeshPhongMaterial({
        color: 0xf0f0f0,
        specular: 0x444444,
        shininess: 30,
        side: THREE.DoubleSide,
      });
    }
    if (isEnclosure(name)) {
      return new THREE.MeshPhongMaterial({
        color: 0x5a8fa8,
        specular: 0x334455,
        shininess: 20,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      });
    }
    if (isComponent(name)) {
      return new THREE.MeshPhongMaterial({
        color: 0xe0609a,
        specular: 0xffaad4,
        shininess: 80,
        side: THREE.DoubleSide,
      });
    }
    return new THREE.MeshPhongMaterial({
      color: 0x27ae60,
      specular: 0x5dade2,
      shininess: 40,
      side: THREE.DoubleSide,
    });
  }

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

  // Apply board mesh scale + pin bottom, grid stays fixed
  function applyBoardScale(bS) {
    for (const [name, mesh] of Object.entries(meshMap)) {
      if (isCopper(name) || isComponent(name) || isEnclosure(name)) continue;
      mesh.scale.z = bS;
      mesh.position.y = boardBottomY + (boardOriginalPosY - boardBottomY) * bS;
    }
    if (grid) grid.position.y = boardBottomY - 0.05;
  }

  // Apply copper scale + position
  function applyCopperScale(zS, tS, bS, trcMode, txtMode) {
    const boardHeight = boardTop - boardBottomY;
    const boardTopCurrent = boardTop + boardHeight * (bS - 1);
    for (const [name, mesh] of Object.entries(meshMap)) {
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
          // Cubic in/out
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
        // Compute copper natural top offset at scale.z=1 (before any scale is applied)
        // box.max.y - mesh.position.y is invariant to the centering that fitCamera will do
        scene.updateMatrixWorld(true);
        copperNaturalTopOffset = {};
        for (const [name, mesh] of Object.entries(meshMap)) {
          if (isCopper(name)) {
            const box = new THREE.Box3().setFromObject(mesh);
            copperNaturalTopOffset[name] = box.max.y - mesh.position.y;
          }
        }

        if (rebuild) {
          // Re-center meshes using the stored pcbWorldCenter (skip camera reset)
          for (const mesh of Object.values(meshMap))
            mesh.position.sub(pcbWorldCenter);
          const box2 = new THREE.Box3();
          for (const mesh of Object.values(meshMap)) box2.expandByObject(mesh);
          if (grid) grid.position.y = box2.min.y - 0.05;
        } else {
          fitCamera();
        }

        originalMaterials = {};
        copperOriginalY = {};
        copperLocalZBottom = {};
        boardOriginalPosY = 0;
        boardBottomY = 0;
        boardTop = 0;
        encBaseZ = 0;
        for (const [name, mesh] of Object.entries(meshMap)) {
          originalMaterials[name] = mesh.material;
          if (isEnclosure(name)) {
            encBaseZ = mesh.position.z;
          } else if (isPcbBoard(name)) {
            const box = new THREE.Box3().setFromObject(mesh);
            boardOriginalPosY = mesh.position.y;
            boardBottomY = box.min.y;
            boardTop = box.max.y;
          } else if (isCopper(name)) {
            copperOriginalY[name] = mesh.position.y;
            mesh.geometry.computeBoundingBox();
            copperLocalZBottom[name] = mesh.geometry.boundingBox.max.z;
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

    // Reset all positions to base (undo previous side-by-side shift)
    for (const [name, mesh] of Object.entries(meshMap)) {
      if (sideBySideOffsets[name] !== undefined) {
        mesh.position.x -= sideBySideOffsets[name];
      }
    }
    sideBySideOffsets = {};

    // Restore enclosure state when leaving side-by-side
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

    // Opaque material
    encMesh.material = new THREE.MeshPhongMaterial({
      color: 0x5a8fa8,
      specular: 0x334455,
      shininess: 20,
      side: THREE.DoubleSide,
    });

    // Flip enclosure upside down — compensate Z for the rotation inversion
    encMesh.rotation.x = -Math.PI / 2;
    encMesh.position.z = -encBaseZ;
    encMesh.updateMatrixWorld(true);
    const flippedBox = new THREE.Box3().setFromObject(encMesh);
    encMesh.position.y += boardBottomY - flippedBox.min.y;

    // Measure widths after flip
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

    // Reposition grid
    if (grid) {
      const box = new THREE.Box3();
      for (const mesh of Object.values(meshMap)) box.expandByObject(mesh);
      grid.position.y = box.min.y - 0.05;
    }
    requestRender();
  });

  // ------- dimension annotations -------

  function clearDimGroup() {
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

  function makeTextSprite(text, scale) {
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

  function buildDimensions() {
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
    // left extension line
    wPts.push(minX, wY, maxZ + gap * 0.3, minX, wY, wExtZ);
    // right extension line
    wPts.push(maxX, wY, maxZ + gap * 0.3, maxX, wY, wExtZ);
    // dimension line
    wPts.push(minX, wY, wZ, maxX, wY, wZ);

    const wGeo = new THREE.BufferGeometry();
    wGeo.setAttribute("position", new THREE.Float32BufferAttribute(wPts, 3));
    const wLines = new THREE.LineSegments(wGeo, lineMat);
    dimGroup.add(wLines);

    // width arrows (tips at edges, bodies inward)
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

    // width text
    const wText = makeTextSprite(`${widthMM.toFixed(2)} mm`, textScale);
    wText.position.set((minX + maxX) / 2, wY, wZ + textScale * 0.6);
    dimGroup.add(wText);

    // --- Height dimension (right side, along Z) ---
    const hX = maxX + gap;

    const hPts = [];
    // top extension line
    hPts.push(maxX + gap * 0.3, wY, minZ, maxX + gap + ext, wY, minZ);
    // bottom extension line
    hPts.push(maxX + gap * 0.3, wY, maxZ, maxX + gap + ext, wY, maxZ);
    // dimension line
    hPts.push(hX, wY, minZ, hX, wY, maxZ);

    const hGeo = new THREE.BufferGeometry();
    hGeo.setAttribute("position", new THREE.Float32BufferAttribute(hPts, 3));
    const hLines = new THREE.LineSegments(hGeo, lineMat);
    dimGroup.add(hLines);

    // height arrows (tips touch extension lines, bodies extend inward)
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

    // height text
    const hText = makeTextSprite(`${heightMM.toFixed(2)} mm`, textScale);
    hText.position.set(hX + textScale * 0.6, wY, (minZ + maxZ) / 2);
    dimGroup.add(hText);
  }

  $effect(() => {
    const show = showDimensions;
    const b = bodies;
    const bS = boardZScale;
    untrack(() => {
      clearDimGroup();
      if (show && b.length) buildDimensions();
      requestRender();
    });
  });

  // ------- DRC markers -------

  function drcMarkerY() {
    return boardBottomY + (boardTop - boardBottomY) * boardZScale + 1.5;
  }

  function addDrcTube(x1, y1, x2, y2, color) {
    const wx1 = x1 - pcbWorldCenter.x,
      wz1 = -y1 - pcbWorldCenter.z;
    const wx2 = x2 - pcbWorldCenter.x,
      wz2 = -y2 - pcbWorldCenter.z;
    const wy = drcMarkerY();
    const p1 = new THREE.Vector3(wx1, wy, wz1);
    const p2 = new THREE.Vector3(wx2, wy, wz2);
    const len = p1.distanceTo(p2);

    let mesh;
    if (len < 0.8) {
      // Very short segment: sphere marker
      const geo = new THREE.SphereGeometry(0.8, 8, 6);
      mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
      );
      mesh.position.set((wx1 + wx2) / 2, wy, (wz1 + wz2) / 2);
    } else {
      const geo = new THREE.CylinderGeometry(0.35, 0.35, len, 8, 1);
      mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
      );
      mesh.position.set((wx1 + wx2) / 2, wy, (wz1 + wz2) / 2);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        p2.clone().sub(p1).normalize(),
      );
    }
    drcGroup.add(mesh);
  }

  function clearDrcGroup() {
    while (drcGroup.children.length) {
      const m = drcGroup.children[0];
      drcGroup.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
  }

  // Rebuild markers when violations or bodies change
  $effect(() => {
    const violations = drcViolations;
    const b = bodies; // track body changes so we rebuild after fitCamera updates pcbWorldCenter
    if (!drcGroup) return;
    clearDrcGroup();
    if (!violations.length || !b.length) return;

    for (const v of violations) {
      if (v.type === "width") {
        addDrcTube(v.x1, v.y1, v.x2, v.y2, 0xf59e0b);
      } else if (v.type === "clearance") {
        addDrcTube(v.segA.x1, v.segA.y1, v.segA.x2, v.segA.y2, 0xef4444);
        addDrcTube(v.segB.x1, v.segB.y1, v.segB.x2, v.segB.y2, 0xef4444);
      }
    }
    requestRender();
  });

  // Track board scale so markers float above the scaled board
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
        await doSubtractExport(filename);
      } else {
        await doRaiseExport(filter, filename);
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

  async function doRaiseExport(filter, filename) {
    scene.updateMatrixWorld(true);
    const group = new THREE.Group();

    // Check if we have silkscreen data to engrave into the board
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

  const SILK_ENGRAVE_DEPTH = 0.15;

  // Build a 2D closed ring from a thick polyline (miter joins + semicircle caps)
  function polylineOutline2D(pts, hw) {
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

  // Build a 2D stadium polygon (closed ring of [x,y] points) for polygon-clipping
  function stadiumPoly2D(p1x, p1y, p2x, p2y, hw) {
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

  // Extrude a polygon-clipping multipolygon to 3D BufferGeometry
  function extrudeMultiPoly(multiPoly, zBot, zTop) {
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
      // Hole side walls (inward normals for watertight solid)
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

  // Parse packed silkscreen polyline data into { front: [...rings], back: [...rings] }
  function parsePackedPolylines(buf) {
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

  // Build silkscreen engraving cutter geometry per layer using 2D union + extrude
  async function buildSilkCutters(pcUnion) {
    const silk = parsePackedPolylines(silkPolylines);
    if (!silk) return [];
    const thickness = boardThickness;
    const cutters = [];
    for (const [key, polys] of Object.entries(silk)) {
      if (!polys.length) continue;
      const isFront = key === "front";
      // Cutter spans from just above surface to SILK_ENGRAVE_DEPTH into the board
      const zBot = isFront ? thickness - SILK_ENGRAVE_DEPTH : 0;
      const zTop = isFront ? thickness + 0.01 : SILK_ENGRAVE_DEPTH + 0.01;

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
      const merged = level[0];
      if (!merged || !merged.length) continue;
      const geo = extrudeMultiPoly(merged, zBot, zTop);
      if (geo) cutters.push({ geo, key });
    }
    return cutters;
  }

  // Shared: engrave silkscreen text into a CSG base (board brush)
  async function engraveSilkscreen(
    base,
    evaluator,
    Brush,
    SUBTRACTION,
    pcUnion,
    boardMesh,
  ) {
    const cutters = await buildSilkCutters(pcUnion);
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

  function chunkMergeUnion(polys, pcUnion) {
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

  async function doSubtractExport(filename) {
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

    // Subtract traces if traceMode is subtract
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

    // Subtract copper text if textMode is subtract
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

    // Engrave silkscreen text into the board surface
    base = await engraveSilkscreen(
      base,
      evaluator,
      Brush,
      SUBTRACTION,
      pcUnion,
      boardMesh,
    );

    // Build result: CSG'd board + any raised copper bodies
    const resultGeo = base.geometry.clone();
    resultGeo.applyMatrix4(base.matrixWorld);

    const group = new THREE.Group();
    group.add(new THREE.Mesh(resultGeo));

    // Add raised copper bodies (traces in raise mode, text in raise mode)
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

  function triggerDownload(data, filename) {
    const blob = new Blob([data.buffer], { type: "model/stl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
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
