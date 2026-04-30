importScripts('/occt-import-js.js')

let occtInstance = null

async function getOcct() {
  if (!occtInstance) {
    occtInstance = await occtimportjs()
  }
  return occtInstance
}

// Walk the STEP hierarchy and map mesh index → nearest named ancestor
function buildIndexNameMap(node, map, inheritedName) {
  const name = (node.name || '').trim() || inheritedName
  for (const idx of (node.meshes || [])) {
    if (map[idx] === undefined) map[idx] = name
  }
  for (const child of (node.children || [])) {
    buildIndexNameMap(child, map, name)
  }
}

self.onmessage = async ({ data }) => {
  if (data.type !== 'PROCESS') return

  try {
    self.postMessage({ type: 'PROGRESS', message: 'Loading OCCT engine…' })
    const occt = await getOcct()

    self.postMessage({ type: 'PROGRESS', message: 'Parsing STEP file…' })
    const result = occt.ReadStepFile(new Uint8Array(data.buffer), null)

    if (!result.success) {
      self.postMessage({ type: 'ERROR', message: 'Failed to parse STEP file' })
      return
    }

    self.postMessage({ type: 'PROGRESS', message: 'Processing geometry…' })

    // Build index → product name map from STEP hierarchy
    const indexToName = {}
    if (result.root) buildIndexNameMap(result.root, indexToName, '')

    // First pass: determine base names
    const baseNames = result.meshes.map((mesh, i) => {
      const hierName = indexToName[i] || ''
      return (hierName || mesh.name || '').trim() || 'Body'
    })

    // Second pass: make names unique (e.g. "copper", "copper 2", "copper 3")
    const seen = {}
    baseNames.forEach((n) => { seen[n] = (seen[n] || 0) + 1 })
    const counter = {}
    const uniqueNames = baseNames.map((n) => {
      if (seen[n] === 1) return n
      counter[n] = (counter[n] || 0) + 1
      return `${n} ${counter[n]}`
    })

    const bodies = result.meshes.map((mesh, i) => {
      const positions = new Float32Array(mesh.attributes.position.array)
      const normals = mesh.attributes.normal
        ? new Float32Array(mesh.attributes.normal.array)
        : null
      const indices = mesh.index ? new Uint32Array(mesh.index.array) : null
      return {
        name: uniqueNames[i],
        positions,
        normals,
        indices,
        color: mesh.color || null,
      }
    })

    const transferables = bodies.flatMap((b) => {
      const bufs = [b.positions.buffer]
      if (b.normals) bufs.push(b.normals.buffer)
      if (b.indices) bufs.push(b.indices.buffer)
      return bufs
    })

    self.postMessage({ type: 'RESULT', bodies }, transferables)
  } catch (err) {
    self.postMessage({ type: 'ERROR', message: String(err) })
  }
}
