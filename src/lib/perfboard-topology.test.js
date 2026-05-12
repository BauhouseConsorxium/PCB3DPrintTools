import { describe, expect, test } from 'vitest'
import { enumerateConductorNodes, nodeKey } from './perfboard-topology.js'

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

describe('enumerateConductorNodes', () => {
  test('empty doc → empty array', () => {
    expect(enumerateConductorNodes(mkDoc())).toEqual([])
  })

  test('pad emits a node with source=pad and its label', () => {
    const doc = mkDoc({
      pads: [{ id: 'p1', col: 2, row: 3, label: 'VCC' }],
    })
    const nodes = enumerateConductorNodes(doc)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({
      key: '2,3',
      col: 2,
      row: 3,
      x: 2 * 2.54,
      y: 3 * 2.54,
      source: 'pad',
      sourceId: 'p1',
      label: 'VCC',
    })
  })

  test('horizontal header expands across columns', () => {
    const doc = mkDoc({
      headers: [{ id: 'h1', col: 0, row: 0, count: 3, orientation: 'h' }],
    })
    const keys = enumerateConductorNodes(doc).map((n) => n.key)
    expect(keys).toEqual(['0,0', '1,0', '2,0'])
  })

  test('vertical header expands down rows and applies per-pin labels', () => {
    const doc = mkDoc({
      headers: [
        {
          id: 'h1',
          col: 5,
          row: 0,
          count: 3,
          orientation: 'v',
          labels: ['VCC', '', 'GND'],
        },
      ],
    })
    const nodes = enumerateConductorNodes(doc)
    expect(nodes.map((n) => [n.key, n.label])).toEqual([
      ['5,0', 'VCC'],
      ['5,1', ''],
      ['5,2', 'GND'],
    ])
  })

  test('DIP emits two parallel rows of pins', () => {
    const doc = mkDoc({
      dips: [
        { id: 'd1', col: 0, row: 0, count: 4, orientation: 'h', rowSpacing: 3 },
      ],
    })
    const keys = enumerateConductorNodes(doc)
      .map((n) => n.key)
      .sort()
    expect(keys).toEqual([
      '0,0', '0,3', '1,0', '1,3', '2,0', '2,3', '3,0', '3,3',
    ])
  })

  test('capacitor emits both pad positions', () => {
    const hCap = mkDoc({
      capacitors: [{ id: 'c1', col: 4, row: 4, orientation: 'h' }],
    })
    expect(enumerateConductorNodes(hCap).map((n) => n.key)).toEqual([
      '4,4', '5,4',
    ])

    const vCap = mkDoc({
      capacitors: [{ id: 'c2', col: 4, row: 4, orientation: 'v' }],
    })
    expect(enumerateConductorNodes(vCap).map((n) => n.key)).toEqual([
      '4,4', '4,5',
    ])
  })

  test('colocated pad + header pin deduplicates, label promoted to the unlabeled first', () => {
    const doc = mkDoc({
      pads: [{ id: 'p1', col: 0, row: 0 }],
      headers: [
        {
          id: 'h1',
          col: 0,
          row: 0,
          count: 1,
          orientation: 'h',
          labels: ['VCC'],
        },
      ],
    })
    const nodes = enumerateConductorNodes(doc)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].source).toBe('pad')
    expect(nodes[0].label).toBe('VCC')
  })

  test('nodeKey is the canonical "col,row" string', () => {
    expect(nodeKey(2, 3)).toBe('2,3')
    expect(nodeKey(0.5, 0)).toBe('0.5,0')
  })
})
