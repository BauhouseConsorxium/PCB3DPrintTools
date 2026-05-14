import { getModulePinPositions } from './perfboard-modules.js'

export function nodeKey(col, row) {
  return `${col},${row}`
}

export function enumerateConductorNodes(doc) {
  const nodes = []
  const seen = new Map()
  const pitch = doc.grid?.pitch ?? 2.54

  function add(col, row, source, sourceId, label) {
    const key = nodeKey(col, row)
    const existing = seen.get(key)
    if (existing) {
      if (!existing.label && label) existing.label = label
      return
    }
    const node = {
      key,
      col,
      row,
      x: col * pitch,
      y: row * pitch,
      source,
      sourceId,
      label: label ?? '',
    }
    seen.set(key, node)
    nodes.push(node)
  }

  for (const pad of doc.pads ?? []) {
    add(pad.col, pad.row, 'pad', pad.id, pad.label)
  }
  for (const hdr of doc.headers ?? []) {
    for (let i = 0; i < hdr.count; i++) {
      const c = hdr.orientation === 'h' ? hdr.col + i : hdr.col
      const r = hdr.orientation === 'v' ? hdr.row + i : hdr.row
      add(c, r, 'header', hdr.id, hdr.labels?.[i] ?? '')
    }
  }
  for (const dip of doc.dips ?? []) {
    const spacing = dip.rowSpacing ?? 3
    for (let i = 0; i < dip.count; i++) {
      if (dip.orientation === 'v') {
        add(dip.col, dip.row + i, 'dip', dip.id, '')
        add(dip.col + spacing, dip.row + i, 'dip', dip.id, '')
      } else {
        add(dip.col + i, dip.row, 'dip', dip.id, '')
        add(dip.col + i, dip.row + spacing, 'dip', dip.id, '')
      }
    }
  }
  for (const cap of doc.capacitors ?? []) {
    add(cap.col, cap.row, 'cap', cap.id, '')
    if (cap.orientation === 'h') add(cap.col + 1, cap.row, 'cap', cap.id, '')
    else add(cap.col, cap.row + 1, 'cap', cap.id, '')
  }
  for (const res of doc.resistors ?? []) {
    const spacing = res.spacing ?? 4
    add(res.col, res.row, 'resistor', res.id, '')
    if (res.orientation === 'h') add(res.col + spacing, res.row, 'resistor', res.id, '')
    else add(res.col, res.row + spacing, 'resistor', res.id, '')
  }
  for (const ph of doc.pinHousings ?? []) {
    const isH = ph.orientation === 'h'
    for (let i = 0; i < (ph.count ?? 2); i++) {
      const c = isH ? ph.col + i : ph.col
      const r = isH ? ph.row : ph.row + i
      add(c, r, 'pinhousing', ph.id, '')
    }
  }
  for (const sw of doc.keyswitches ?? []) {
    // Cherry MX electrical pin positions (relative to switch center)
    if (sw.orientation === 'h') {
      add(sw.col - 1.5, sw.row - 1, 'keyswitch', sw.id, '')
      add(sw.col + 1, sw.row - 2, 'keyswitch', sw.id, '')
    } else {
      add(sw.col + 1, sw.row - 1.5, 'keyswitch', sw.id, '')
      add(sw.col + 2, sw.row + 1, 'keyswitch', sw.id, '')
    }
  }
  for (const m of doc.modules ?? []) {
    for (const pin of getModulePinPositions(m)) {
      add(pin.col, pin.row, 'module', m.id, pin.label)
    }
  }

  return nodes
}
