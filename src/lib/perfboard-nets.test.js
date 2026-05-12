import { describe, expect, test } from 'vitest'
import { computeNets, traceColor, padFillFor } from './perfboard-nets.js'

function mkDoc(overrides = {}) {
  return {
    version: 1,
    name: 'test',
    grid: { cols: 10, rows: 10, pitch: 2.54 },
    pads: [],
    headers: [],
    dips: [],
    capacitors: [],
    traces: [],
    jumpers: [],
    joints: [],
    ...overrides,
  }
}

function sameNet(nets, ...keys) {
  const ids = keys.map((k) => {
    if (typeof k === 'string' && k.includes(',')) return nets.padNetId.get(k)
    return nets.traceNetId.get(k)
  })
  return ids.every((id) => id != null && id === ids[0])
}

describe('computeNets', () => {
  test('single pad is in a trivial net with itself', () => {
    const doc = mkDoc({ pads: [{ id: 'p1', col: 0, row: 0, label: '' }] })
    const nets = computeNets(doc)
    expect(nets.padNetId.get('0,0')).not.toBeUndefined()
    expect(nets.netCount).toBe(1)
  })

  test('straight trace endpoints land on two pads → all unioned', () => {
    const doc = mkDoc({
      pads: [
        { id: 'p1', col: 0, row: 0 },
        { id: 'p2', col: 5, row: 0 },
      ],
      traces: [
        {
          id: 't1',
          points: [{ col: 0, row: 0 }, { col: 5, row: 0 }],
          width: 0.5,
        },
      ],
    })
    const nets = computeNets(doc)
    expect(sameNet(nets, '0,0', '5,0', 't1')).toBe(true)
  })

  test('intermediate pad lying on a straight trace segment is unioned', () => {
    const doc = mkDoc({
      pads: [
        { id: 'p1', col: 0, row: 0 },
        { id: 'pmid', col: 3, row: 0 },
        { id: 'p2', col: 6, row: 0 },
      ],
      traces: [
        {
          id: 't1',
          points: [{ col: 0, row: 0 }, { col: 6, row: 0 }],
          width: 0.5,
        },
      ],
    })
    const nets = computeNets(doc)
    expect(sameNet(nets, '0,0', '3,0', '6,0', 't1')).toBe(true)
  })

  test('two traces sharing only an endpoint are unioned (endpoint-as-DSU-node)', () => {
    const doc = mkDoc({
      pads: [{ id: 'p1', col: 0, row: 0 }],
      traces: [
        {
          id: 't1',
          points: [{ col: 0, row: 0 }, { col: 5, row: 0 }],
          width: 0.5,
        },
        {
          id: 't2',
          points: [{ col: 5, row: 0 }, { col: 5, row: 5 }],
          width: 0.5,
        },
      ],
    })
    const nets = computeNets(doc)
    expect(sameNet(nets, 't1', 't2', '0,0')).toBe(true)
  })

  test('jumper unions its two endpoint pads', () => {
    const doc = mkDoc({
      pads: [
        { id: 'p1', col: 0, row: 0 },
        { id: 'p2', col: 9, row: 9 },
      ],
      jumpers: [
        { id: 'j1', col1: 0, row1: 0, col2: 9, row2: 9, color: '#fff' },
      ],
    })
    const nets = computeNets(doc)
    expect(sameNet(nets, '0,0', '9,9')).toBe(true)
  })

  test('joint at the crossing of two straight traces unions them', () => {
    const doc = mkDoc({
      pads: [
        { id: 'p1', col: 0, row: 5 },
        { id: 'p2', col: 5, row: 0 },
      ],
      traces: [
        {
          id: 'tH',
          points: [{ col: 0, row: 5 }, { col: 9, row: 5 }],
          width: 0.5,
        },
        {
          id: 'tV',
          points: [{ col: 5, row: 0 }, { col: 5, row: 9 }],
          width: 0.5,
        },
      ],
      joints: [{ id: 'jt1', col: 5, row: 5 }],
    })
    const nets = computeNets(doc)
    expect(sameNet(nets, 'tH', 'tV')).toBe(true)
  })

  test('joint on a curve path unions traces passing through it', () => {
    const doc = mkDoc({
      pads: [{ id: 'p1', col: 0, row: 0 }],
      traces: [
        {
          id: 'tC',
          type: 'curve',
          points: [
            { col: 0, row: 0 },
            { col: 5, row: 0 },
            { col: 10, row: 0 },
          ],
          width: 0.5,
          tension: 0.5,
        },
        {
          id: 'tS',
          points: [{ col: 3, row: 5 }, { col: 3, row: 0 }],
          width: 0.5,
        },
      ],
      joints: [{ id: 'jt1', col: 3, row: 0 }],
    })
    const nets = computeNets(doc)
    expect(sameNet(nets, 'tC', 'tS', '0,0')).toBe(true)
  })

  test('first labeled pad in a component names the net', () => {
    const doc = mkDoc({
      pads: [
        { id: 'p1', col: 0, row: 0, label: 'VCC' },
        { id: 'p2', col: 5, row: 0, label: 'unused' },
      ],
      traces: [
        {
          id: 't1',
          points: [{ col: 0, row: 0 }, { col: 5, row: 0 }],
          width: 0.5,
        },
      ],
    })
    const nets = computeNets(doc)
    const netId = nets.padNetId.get('0,0')
    expect(nets.netName.get(netId)).toBe('VCC')
  })

  test('unlabeled components get auto-numbered N1, N2, ...', () => {
    const doc = mkDoc({
      pads: [
        { id: 'p1', col: 0, row: 0 },
        { id: 'p2', col: 5, row: 0 },
      ],
    })
    const nets = computeNets(doc)
    const names = [...nets.netName.values()].sort()
    expect(names).toEqual(['N1', 'N2'])
  })

  test('two disconnected components with the same label share one color', () => {
    const doc = mkDoc({
      pads: [
        { id: 'p1', col: 0, row: 0, label: 'GND' },
        { id: 'p2', col: 9, row: 9, label: 'GND' },
      ],
    })
    const nets = computeNets(doc)
    const id1 = nets.padNetId.get('0,0')
    const id2 = nets.padNetId.get('9,9')
    expect(id1).not.toBe(id2)
    expect(nets.netColor.get(id1)).toBe(nets.netColor.get(id2))
  })

  test('traceColor falls back to gold for a net with no pads', () => {
    const doc = mkDoc({
      traces: [
        {
          id: 'tFloat',
          points: [{ col: 1, row: 1 }, { col: 3, row: 3 }],
          width: 0.5,
        },
      ],
    })
    const nets = computeNets(doc)
    expect(traceColor(nets, 'tFloat')).toBe(nets.unconnectedColor)
  })

  test('padFillFor returns net color for a labeled net but default for a trivial one', () => {
    const doc = mkDoc({
      pads: [
        { id: 'p1', col: 0, row: 0, label: 'VCC' },
        { id: 'p2', col: 5, row: 0 },
      ],
      traces: [
        {
          id: 't1',
          points: [{ col: 0, row: 0 }, { col: 5, row: 0 }],
          width: 0.5,
        },
        // p3 (isolated) added in pads below; no trace touches it
      ],
    })
    doc.pads.push({ id: 'p3', col: 9, row: 9 })
    const nets = computeNets(doc)
    const vcc = padFillFor(nets, 0, 0, false, 'VCC')
    const trivial = padFillFor(nets, 9, 9, false, '')
    expect(vcc).toBe(nets.netColor.get(nets.padNetId.get('0,0')))
    expect(trivial).toBe('#d4a534')
  })

  test('padFillFor honors the selected override', () => {
    const doc = mkDoc({
      pads: [{ id: 'p1', col: 0, row: 0, label: 'VCC' }],
    })
    const nets = computeNets(doc)
    expect(padFillFor(nets, 0, 0, true, 'VCC')).toBe('#fbbf24')
  })

  test('joint on a roundtrace path unions traces passing through it', () => {
    const doc = mkDoc({
      pads: [{ id: 'p1', col: 0, row: 0 }],
      traces: [
        {
          id: 'tR',
          type: 'roundtrace',
          points: [
            { col: 0, row: 0 },
            { col: 5, row: 0 },
            { col: 10, row: 0 },
          ],
          width: 0.5,
          radius: 1.0,
          mode: 'arc',
          passes: 2,
        },
        {
          id: 'tS',
          points: [{ col: 3, row: 5 }, { col: 3, row: 0 }],
          width: 0.5,
        },
      ],
      joints: [{ id: 'jt1', col: 3, row: 0 }],
    })
    const nets = computeNets(doc)
    expect(sameNet(nets, 'tR', 'tS', '0,0')).toBe(true)
  })

  test('joint sitting nowhere near any trace does NOT union with it', () => {
    const doc = mkDoc({
      pads: [
        { id: 'p1', col: 0, row: 0 },
        { id: 'p2', col: 5, row: 0 },
      ],
      traces: [
        {
          id: 't1',
          points: [{ col: 0, row: 0 }, { col: 5, row: 0 }],
          width: 0.5,
        },
      ],
      joints: [{ id: 'jt1', col: 8, row: 8 }],
    })
    const nets = computeNets(doc)
    const traceNetId = nets.padNetId.get('0,0')
    const jointNetId = nets.padNetId.get('8,8')
    expect(traceNetId).not.toBeUndefined()
    expect(jointNetId).not.toBeUndefined()
    expect(traceNetId).not.toBe(jointNetId)
  })

  test('joint coincident with a labeled pad inherits the pad net name', () => {
    const doc = mkDoc({
      pads: [{ id: 'p1', col: 0, row: 0, label: 'VCC' }],
      traces: [
        {
          id: 't1',
          points: [{ col: 0, row: 0 }, { col: 5, row: 0 }],
          width: 0.5,
        },
      ],
      joints: [{ id: 'jt1', col: 5, row: 0 }],
    })
    const nets = computeNets(doc)
    const jointNetId = nets.padNetId.get('5,0')
    expect(nets.netName.get(jointNetId)).toBe('VCC')
  })
})
