import { describe, expect, test } from 'vitest'
import {
  createDefaultDocument,
  buildPerfboardBodies,
} from './perfboard-geometry.js'

function bodyNames(bodies) {
  return bodies.map((b) => b.name)
}

describe('createDefaultDocument', () => {
  test('has the expected top-level schema', () => {
    const doc = createDefaultDocument()
    expect(doc.version).toBe(1)
    expect(doc.grid).toEqual({ cols: 14, rows: 14, pitch: 2.54 })
    expect(doc.pads).toEqual([])
    expect(doc.headers).toEqual([])
    expect(doc.dips).toEqual([])
    expect(doc.capacitors).toEqual([])
    expect(doc.traces).toEqual([])
    expect(doc.jumpers).toEqual([])
    expect(doc.joints).toEqual([])
    expect(doc.annotations).toEqual([])
  })

  test('includes the geometric dimension knobs the geometry pipeline expects', () => {
    const doc = createDefaultDocument()
    for (const key of [
      'boardThickness',
      'copperThickness',
      'drillDiameter',
      'padDiameter',
      'traceWidth',
    ]) {
      expect(typeof doc[key]).toBe('number')
      expect(doc[key]).toBeGreaterThan(0)
    }
  })
})

describe('buildPerfboardBodies (smoke)', () => {
  test('empty doc yields just the board body (PCB)', () => {
    const bodies = buildPerfboardBodies(createDefaultDocument())
    const names = bodyNames(bodies)
    expect(names).toContain('PCB')
    // No pads, traces, or components in default doc
    expect(names).not.toContain('Pads_F.Cu')
    expect(names).not.toContain('F.Cu')
  })

  test('a single pad adds the Pads_F.Cu body', () => {
    const doc = createDefaultDocument()
    doc.pads.push({ id: 'p1', col: 2, row: 2 })
    const names = bodyNames(buildPerfboardBodies(doc))
    expect(names).toContain('PCB')
    expect(names).toContain('Pads_F.Cu')
  })

  test('a single straight trace adds the F.Cu body', () => {
    const doc = createDefaultDocument()
    doc.pads.push({ id: 'p1', col: 0, row: 0 })
    doc.pads.push({ id: 'p2', col: 5, row: 0 })
    doc.traces.push({
      id: 't1',
      points: [{ col: 0, row: 0 }, { col: 5, row: 0 }],
      width: 0.5,
    })
    const names = bodyNames(buildPerfboardBodies(doc))
    expect(names).toContain('F.Cu')
  })

  test('a header creates a component body alongside Pads_F.Cu', () => {
    const doc = createDefaultDocument()
    doc.headers.push({
      id: 'h1',
      col: 1,
      row: 1,
      count: 3,
      orientation: 'h',
    })
    const names = bodyNames(buildPerfboardBodies(doc))
    expect(names).toContain('Pads_F.Cu')
    expect(names.some((n) => n.startsWith('Component_h'))).toBe(true)
  })

  test('a capacitor creates a Component_cap body and pad rings', () => {
    const doc = createDefaultDocument()
    doc.capacitors.push({
      id: 'c1',
      col: 2,
      row: 2,
      orientation: 'h',
      type: 'ceramic',
    })
    const names = bodyNames(buildPerfboardBodies(doc))
    expect(names).toContain('Pads_F.Cu')
    expect(names.some((n) => n.startsWith('Component_c'))).toBe(true)
  })
})
