<script>
  import { onMount, untrack } from 'svelte'
  import * as THREE from 'three'
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
  import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
  import earcut from 'earcut'

  let { bodies = [], visibility = {}, zScale = 8, boardZScale = 1, previewFilter = null, traceMode = 'raise', drcViolations = [], isRebuild = false, encSideBySide = false, rawSegments = null, boardThickness = 0 } = $props()

  let canvas
  let renderer, scene, camera, controls, grid
  let meshMap = {}
  let animId
  let needsRender = true

  function requestRender() { needsRender = true }

  let pcbWorldCenter = new THREE.Vector3()
  let drcGroup

  // board geometry metrics — computed after centering
  let boardOriginalPosY = 0
  let boardBottomY = 0
  let boardTop = 0
  let copperOriginalY = {}
  // distance from copper mesh's position.y to its world Y top at scale.z=1 — invariant to centering
  let copperNaturalTopOffset = {}

  let bodiesVersion = $state(0)

  // materials
  let originalMaterials = {}

  const previewMat = new THREE.MeshPhongMaterial({
    color: 0xd4d4d4, specular: 0x888888, shininess: 60, side: THREE.DoubleSide,
  })
  const subtractCutterMat = new THREE.MeshPhongMaterial({
    color: 0xff6b35, specular: 0x884422, shininess: 80, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  })
  const subtractBoardMat = new THREE.MeshPhongMaterial({
    color: 0x27ae60, specular: 0x5dade2, shininess: 40, side: THREE.DoubleSide,
    transparent: true, opacity: 0.72, depthWrite: false,
  })
  // Grey semi-transparent board used in export-preview + subtract mode combined
  const previewSubtractBoardMat = new THREE.MeshPhongMaterial({
    color: 0xd4d4d4, specular: 0x888888, shininess: 60, side: THREE.DoubleSide,
    transparent: true, opacity: 0.72, depthWrite: false,
  })

  // ------- helpers -------

  function isCopper(name) {
    const n = name.toLowerCase()
    return n.includes('copper') || n.includes('.cu') || n.includes('_cu')
  }

  function isPcbBoard(name) {
    const n = name.toLowerCase()
    return !isCopper(name) && (n.includes('_pcb') || n.endsWith('pcb'))
  }

  function isSilkscreen(name) {
    const n = name.toLowerCase()
    return n.includes('silks')
  }

  function isEnclosure(name) {
    return name.toLowerCase() === 'enclosure'
  }

  function isComponent(name) {
    return !isCopper(name) && !isPcbBoard(name) && !isEnclosure(name) && !isSilkscreen(name)
  }

  function makeMaterial(name) {
    if (isCopper(name)) {
      return new THREE.MeshPhongMaterial({
        color: 0xf5c842, specular: 0xffffff, shininess: 120, side: THREE.DoubleSide,
      })
    }
    if (isSilkscreen(name)) {
      return new THREE.MeshPhongMaterial({
        color: 0xf0f0f0, specular: 0x444444, shininess: 30, side: THREE.DoubleSide,
      })
    }
    if (isEnclosure(name)) {
      return new THREE.MeshPhongMaterial({
        color: 0x5a8fa8, specular: 0x334455, shininess: 20, side: THREE.DoubleSide,
        transparent: true, opacity: 0.7, depthWrite: false,
      })
    }
    if (isComponent(name)) {
      return new THREE.MeshPhongMaterial({
        color: 0xe0609a, specular: 0xffaad4, shininess: 80, side: THREE.DoubleSide,
      })
    }
    return new THREE.MeshPhongMaterial({
      color: 0x27ae60, specular: 0x5dade2, shininess: 40, side: THREE.DoubleSide,
    })
  }

  function applyState() {
    for (const [name, mesh] of Object.entries(meshMap)) {
      mesh.visible = visibility[name] !== false
    }
  }

  function fitCamera() {
    const box = new THREE.Box3()
    for (const mesh of Object.values(meshMap)) box.expandByObject(mesh)
    if (box.isEmpty()) return

    const center = box.getCenter(new THREE.Vector3())
    pcbWorldCenter.copy(center)
    for (const mesh of Object.values(meshMap)) mesh.position.sub(center)

    const box2 = new THREE.Box3()
    for (const mesh of Object.values(meshMap)) box2.expandByObject(mesh)
    if (grid) grid.position.y = box2.min.y - 0.05

    const size = box2.getSize(new THREE.Vector3())
    const span = Math.max(size.x, size.z)
    camera.position.set(0, span * 1.0, -span * 0.7)
    controls.target.set(0, 0, 0)
    controls.update()
  }

  // Apply board mesh scale + pin bottom, grid stays fixed
  function applyBoardScale(bS) {
    for (const [name, mesh] of Object.entries(meshMap)) {
      if (isCopper(name) || isComponent(name) || isEnclosure(name)) continue
      mesh.scale.z = bS
      mesh.position.y = boardBottomY + (boardOriginalPosY - boardBottomY) * bS
    }
    if (grid) grid.position.y = boardBottomY - 0.05
  }

  // Apply copper scale + position
  function applyCopperScale(zS, bS, mode) {
    const boardHeight = boardTop - boardBottomY
    const boardTopCurrent = boardTop + boardHeight * (bS - 1)
    for (const [name, mesh] of Object.entries(meshMap)) {
      if (!isCopper(name)) continue
      mesh.scale.z = zS
      if (mode === 'subtract') {
        // Top of copper flush with board surface, copper grows downward (channel preview)
        const offset = copperNaturalTopOffset[name] ?? 0
        mesh.position.y = boardTopCurrent - offset * zS
      } else {
        // Traces raised above board surface
        mesh.position.y = (copperOriginalY[name] ?? 0) + boardHeight * (bS - 1)
      }
    }
  }

  // ------- Three.js init (once) -------

  onMount(() => {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x2a2a3e)

    camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.01, 5000)
    camera.position.set(0, 60, 120)

    scene.add(new THREE.AmbientLight(0xffffff, 2.2))
    const sun = new THREE.DirectionalLight(0xfffbe8, 3.0)
    sun.position.set(80, 160, 100)
    scene.add(sun)
    const fill = new THREE.DirectionalLight(0xd0e8ff, 1.2)
    fill.position.set(-60, 40, -80)
    scene.add(fill)
    const back = new THREE.DirectionalLight(0xffffff, 0.6)
    back.position.set(0, -60, -100)
    scene.add(back)

    grid = new THREE.GridHelper(300, 30, 0x6060a8, 0x3e3e62)
    scene.add(grid)

    drcGroup = new THREE.Group()
    scene.add(drcGroup)

    controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 0.5
    controls.maxDistance = 2000
    controls.addEventListener('change', requestRender)

    const obs = new ResizeObserver(() => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      requestRender()
    })
    obs.observe(canvas)

    function loop() {
      animId = requestAnimationFrame(loop)
      // must run every frame for damping; fires 'change' event which sets needsRender
      controls.update()
      if (needsRender) {
        renderer.render(scene, camera)
        needsRender = false
      }
    }
    loop()

    return () => {
      cancelAnimationFrame(animId)
      obs.disconnect()
      renderer.dispose()
    }
  })

  // ------- rebuild when bodies change -------

  $effect(() => {
    if (!scene) return
    const currentBodies = bodies

    for (const m of Object.values(meshMap)) {
      scene.remove(m)
      m.geometry.dispose()
      m.material.dispose()
    }
    meshMap = {}

    for (const body of currentBodies) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(body.positions, 3))
      if (body.normals) geo.setAttribute('normal', new THREE.BufferAttribute(body.normals, 3))
      if (body.indices) geo.setIndex(new THREE.BufferAttribute(body.indices, 1))
      if (!body.normals) geo.computeVertexNormals()

      const mesh = new THREE.Mesh(geo, makeMaterial(body.name))
      mesh.rotation.x = Math.PI / 2
      scene.add(mesh)
      meshMap[body.name] = mesh
    }

    untrack(() => {
      const rebuild = isRebuild
      applyState()

      if (currentBodies.length) {
        // Compute copper natural top offset at scale.z=1 (before any scale is applied)
        // box.max.y - mesh.position.y is invariant to the centering that fitCamera will do
        scene.updateMatrixWorld(true)
        copperNaturalTopOffset = {}
        for (const [name, mesh] of Object.entries(meshMap)) {
          if (isCopper(name)) {
            const box = new THREE.Box3().setFromObject(mesh)
            copperNaturalTopOffset[name] = box.max.y - mesh.position.y
          }
        }

        if (rebuild) {
          // Re-center meshes using the stored pcbWorldCenter (skip camera reset)
          for (const mesh of Object.values(meshMap)) mesh.position.sub(pcbWorldCenter)
          const box2 = new THREE.Box3()
          for (const mesh of Object.values(meshMap)) box2.expandByObject(mesh)
          if (grid) grid.position.y = box2.min.y - 0.05
        } else {
          fitCamera()
        }

        originalMaterials = {}
        copperOriginalY = {}
        boardOriginalPosY = 0
        boardBottomY = 0
        boardTop = 0
        encBaseZ = 0
        for (const [name, mesh] of Object.entries(meshMap)) {
          originalMaterials[name] = mesh.material
          if (isEnclosure(name)) {
            encBaseZ = mesh.position.z
          } else if (isPcbBoard(name)) {
            const box = new THREE.Box3().setFromObject(mesh)
            boardOriginalPosY = mesh.position.y
            boardBottomY = box.min.y
            boardTop = box.max.y
          } else if (isCopper(name)) {
            copperOriginalY[name] = mesh.position.y
          }
        }

        applyBoardScale(boardZScale)
        applyCopperScale(zScale, boardZScale, traceMode)
        sideBySideOffsets = {}
        bodiesVersion++
      }
      requestRender()
    })
  })

  // ------- visibility + material (normal / preview / subtract) -------

  $effect(() => {
    const filter = previewFilter
    const vis = visibility
    const mode = traceMode

    for (const [name, mesh] of Object.entries(meshMap)) {
      if (filter !== null && mode === 'subtract') {
        // Subtract export preview: grey translucent board + orange channel markers
        mesh.visible = vis[name] !== false
        mesh.material = isCopper(name) ? subtractCutterMat : previewSubtractBoardMat
      } else if (filter !== null) {
        const inExport = filter(name)
        mesh.visible = inExport && (vis[name] !== false)
        mesh.material = inExport ? previewMat : (originalMaterials[name] || mesh.material)
      } else if (mode === 'subtract') {
        mesh.visible = vis[name] !== false
        mesh.material = isCopper(name) ? subtractCutterMat : subtractBoardMat
      } else {
        mesh.visible = vis[name] !== false
        mesh.material = originalMaterials[name] || mesh.material
      }
    }
    requestRender()
  })

  // ------- board z-scale -------

  $effect(() => {
    applyBoardScale(boardZScale)
    requestRender()
  })

  // ------- copper z-scale + position -------

  $effect(() => {
    applyCopperScale(zScale, boardZScale, traceMode)
    requestRender()
  })

  // ------- enclosure side-by-side -------

  let sideBySideOffsets = {}
  let encBaseZ = 0

  $effect(() => {
    const side = encSideBySide
    const _v = bodiesVersion
    if (!Object.keys(meshMap).length) return

    // Reset all positions to base (undo previous side-by-side shift)
    for (const [name, mesh] of Object.entries(meshMap)) {
      if (sideBySideOffsets[name] !== undefined) {
        mesh.position.x -= sideBySideOffsets[name]
      }
    }
    sideBySideOffsets = {}

    // Restore enclosure state when leaving side-by-side
    const encMesh = meshMap['Enclosure']
    if (encMesh) {
      if (originalMaterials['Enclosure']) encMesh.material = originalMaterials['Enclosure']
      encMesh.rotation.x = Math.PI / 2
      encMesh.position.z = encBaseZ
      if (copperOriginalY['Enclosure'] !== undefined) {
        encMesh.position.y = copperOriginalY['Enclosure']
      }
    }

    if (!side || !encMesh) {
      requestRender()
      return
    }

    // Opaque material
    encMesh.material = new THREE.MeshPhongMaterial({
      color: 0x5a8fa8, specular: 0x334455, shininess: 20, side: THREE.DoubleSide,
    })

    // Flip enclosure upside down — compensate Z for the rotation inversion
    encMesh.rotation.x = -Math.PI / 2
    encMesh.position.z = -encBaseZ
    encMesh.updateMatrixWorld(true)
    const flippedBox = new THREE.Box3().setFromObject(encMesh)
    encMesh.position.y += boardBottomY - flippedBox.min.y

    // Measure widths after flip
    encMesh.updateMatrixWorld(true)
    const encBox = new THREE.Box3().setFromObject(encMesh)
    const encWidthX = encBox.max.x - encBox.min.x

    let boardWidthX = 0
    for (const [name, mesh] of Object.entries(meshMap)) {
      if (isEnclosure(name)) continue
      const b = new THREE.Box3().setFromObject(mesh)
      boardWidthX = Math.max(boardWidthX, b.max.x - b.min.x)
    }

    const gap = 2
    const boardShift = -(gap + encWidthX) / 2
    const encShift = (gap + boardWidthX) / 2

    for (const [name, mesh] of Object.entries(meshMap)) {
      const offset = isEnclosure(name) ? encShift : boardShift
      mesh.position.x += offset
      sideBySideOffsets[name] = offset
    }

    // Reposition grid
    if (grid) {
      const box = new THREE.Box3()
      for (const mesh of Object.values(meshMap)) box.expandByObject(mesh)
      grid.position.y = box.min.y - 0.05
    }
    requestRender()
  })

  // ------- DRC markers -------

  function drcMarkerY() {
    return boardBottomY + (boardTop - boardBottomY) * boardZScale + 1.5
  }

  function addDrcTube(x1, y1, x2, y2, color) {
    const wx1 = x1 - pcbWorldCenter.x, wz1 = -y1 - pcbWorldCenter.z
    const wx2 = x2 - pcbWorldCenter.x, wz2 = -y2 - pcbWorldCenter.z
    const wy = drcMarkerY()
    const p1 = new THREE.Vector3(wx1, wy, wz1)
    const p2 = new THREE.Vector3(wx2, wy, wz2)
    const len = p1.distanceTo(p2)

    let mesh
    if (len < 0.8) {
      // Very short segment: sphere marker
      const geo = new THREE.SphereGeometry(0.8, 8, 6)
      mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }))
      mesh.position.set((wx1 + wx2) / 2, wy, (wz1 + wz2) / 2)
    } else {
      const geo = new THREE.CylinderGeometry(0.35, 0.35, len, 8, 1)
      mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }))
      mesh.position.set((wx1 + wx2) / 2, wy, (wz1 + wz2) / 2)
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p2.clone().sub(p1).normalize())
    }
    drcGroup.add(mesh)
  }

  function clearDrcGroup() {
    while (drcGroup.children.length) {
      const m = drcGroup.children[0]
      drcGroup.remove(m)
      m.geometry.dispose()
      m.material.dispose()
    }
  }

  // Rebuild markers when violations or bodies change
  $effect(() => {
    const violations = drcViolations
    const b = bodies  // track body changes so we rebuild after fitCamera updates pcbWorldCenter
    if (!drcGroup) return
    clearDrcGroup()
    if (!violations.length || !b.length) return

    for (const v of violations) {
      if (v.type === 'width') {
        addDrcTube(v.x1, v.y1, v.x2, v.y2, 0xf59e0b)
      } else if (v.type === 'clearance') {
        addDrcTube(v.segA.x1, v.segA.y1, v.segA.x2, v.segA.y2, 0xef4444)
        addDrcTube(v.segB.x1, v.segB.y1, v.segB.x2, v.segB.y2, 0xef4444)
      }
    }
    requestRender()
  })

  // Track board scale so markers float above the scaled board
  $effect(() => {
    if (!drcGroup) return
    const wy = drcMarkerY()
    for (const m of drcGroup.children) m.position.y = wy
    requestRender()
  })

  // ------- public API -------

  export function exportSTL(filter, filename) {
    if (!scene) return
    if (traceMode === 'subtract') {
      doSubtractExport(filename)
    } else {
      doRaiseExport(filter, filename)
    }
  }

  function doRaiseExport(filter, filename) {
    scene.updateMatrixWorld(true)
    const group = new THREE.Group()
    for (const [name, mesh] of Object.entries(meshMap)) {
      if (!mesh.visible) continue
      if (filter && !filter(name)) continue
      const clone = mesh.clone()
      clone.applyMatrix4(mesh.matrixWorld)
      group.add(clone)
    }
    if (!group.children.length) {
      alert('No visible bodies match the selected export target.')
      return
    }
    triggerDownload(new STLExporter().parse(group, { binary: true }), filename || 'pcb-export.stl')
  }

  // Build a single stadium prism BufferGeometry (no drill holes) for CSG cutter use
  function buildStadiumCutterGeo(p1x, p1y, p2x, p2y, hw, zBot, zTop) {
    const HALF = 16
    const dx = p2x - p1x, dy = p2y - p1y
    const theta = Math.atan2(dy, dx)
    const outline = []
    for (let i = 0; i <= HALF; i++) {
      const a = theta - Math.PI / 2 + Math.PI * i / HALF
      outline.push([p2x + hw * Math.cos(a), p2y + hw * Math.sin(a)])
    }
    for (let i = 1; i < HALF; i++) {
      const a = theta + Math.PI / 2 + Math.PI * i / HALF
      outline.push([p1x + hw * Math.cos(a), p1y + hw * Math.sin(a)])
    }
    const outN = outline.length
    const flat = []
    for (const [x, y] of outline) flat.push(x, y)
    const triIdx = earcut(flat, null, 2)

    const pos = [], nrm = [], idx = []
    let vi = 0
    // Top
    for (let i = 0; i < outN; i++) { pos.push(flat[i * 2], flat[i * 2 + 1], zTop); nrm.push(0, 0, 1); vi++ }
    for (const t of triIdx) idx.push(t)
    // Bottom
    const bOff = vi
    for (let i = 0; i < outN; i++) { pos.push(flat[i * 2], flat[i * 2 + 1], zBot); nrm.push(0, 0, -1); vi++ }
    for (let i = 0; i < triIdx.length; i += 3) idx.push(bOff + triIdx[i + 2], bOff + triIdx[i + 1], bOff + triIdx[i])
    // Side walls
    for (let i = 0; i < outN; i++) {
      const j = (i + 1) % outN
      const x0 = outline[i][0], y0 = outline[i][1], x1 = outline[j][0], y1 = outline[j][1]
      const edx = x1 - x0, edy = y1 - y0, edL = Math.hypot(edx, edy) || 1
      const nx = edy / edL, ny = -edx / edL
      const a0 = vi, a1 = vi + 1, b0 = vi + 2, b1 = vi + 3
      pos.push(x0, y0, zBot); nrm.push(nx, ny, 0); vi++
      pos.push(x0, y0, zTop); nrm.push(nx, ny, 0); vi++
      pos.push(x1, y1, zBot); nrm.push(nx, ny, 0); vi++
      pos.push(x1, y1, zTop); nrm.push(nx, ny, 0); vi++
      idx.push(a0, b0, b1, a0, b1, a1)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
    geo.setIndex(idx)
    return geo
  }

  async function doSubtractExport(filename) {
    const { Brush, Evaluator, SUBTRACTION } = await import('three-bvh-csg')
    scene.updateMatrixWorld(true)

    const boardMesh = Object.entries(meshMap).find(([n, m]) => isPcbBoard(n) && m.visible)?.[1]
    if (!boardMesh || !rawSegments || !rawSegments.length) {
      alert('Need board and trace data for subtract export.')
      return
    }

    // Find the copper meshes to copy their transforms (rotation + scale + position in subtract mode)
    const fCuMesh = meshMap['F.Cu']
    const bCuMesh = meshMap['B.Cu']
    if (!fCuMesh && !bCuMesh) {
      alert('No copper bodies found for subtract export.')
      return
    }

    const evaluator = new Evaluator()
    evaluator.attributes = ['position', 'normal']

    const boardBrush = new Brush(boardMesh.geometry.clone())
    boardBrush.position.copy(boardMesh.position)
    boardBrush.rotation.copy(boardMesh.rotation)
    boardBrush.scale.copy(boardMesh.scale)
    boardBrush.updateMatrixWorld()
    let base = boardBrush

    const thickness = boardThickness
    const copperH = 0.035
    const PIERCE = 0.01

    let subtractCount = 0, failCount = 0
    const segCount = rawSegments.length / 6
    for (let i = 0; i < segCount; i++) {
      const p1x = rawSegments[i * 6]
      const p1y = rawSegments[i * 6 + 1]
      const p2x = rawSegments[i * 6 + 2]
      const p2y = rawSegments[i * 6 + 3]
      const width = rawSegments[i * 6 + 4]
      const layerFlag = rawSegments[i * 6 + 5]
      const hw = width / 2

      const isFront = layerFlag < 0.5
      const zBot = isFront ? thickness : -copperH
      const zTop = isFront ? thickness + copperH : 0
      const refMesh = isFront ? fCuMesh : bCuMesh
      if (!refMesh) continue

      const geo = buildStadiumCutterGeo(p1x, p1y, p2x, p2y, hw, zBot, zTop)
      const cutter = new Brush(geo)
      // Copy the exact transform from the copper mesh (already in subtract mode position)
      cutter.rotation.copy(refMesh.rotation)
      cutter.scale.copy(refMesh.scale)
      cutter.position.copy(refMesh.position)
      cutter.position.y += PIERCE
      cutter.updateMatrixWorld()
      try {
        base = evaluator.evaluate(base, cutter, SUBTRACTION)
        subtractCount++
      } catch (e) {
        failCount++
        console.warn('CSG skip segment', i, e.message)
      }
    }

    if (subtractCount === 0) {
      alert('CSG subtraction failed for all traces.')
      return
    }
    if (failCount > 0) console.warn(`CSG: ${failCount} segment(s) failed, ${subtractCount} succeeded`)

    const resultGeo = base.geometry.clone()
    resultGeo.applyMatrix4(base.matrixWorld)
    const resultMesh = new THREE.Mesh(resultGeo)
    triggerDownload(new STLExporter().parse(resultMesh, { binary: true }), filename || 'pcb-channel.stl')
  }

  function triggerDownload(data, filename) {
    const blob = new Blob([data.buffer], { type: 'model/stl' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
</script>

<canvas bind:this={canvas} class="w-full h-full block"></canvas>
