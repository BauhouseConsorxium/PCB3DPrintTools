import { describe, expect, test } from 'vitest'
import {
  catmullRomToCubicBeziers,
  catmullRomSVGPath,
  sampleCatmullRom,
  sampleCatmullRomWithWidth,
  variableWidthOutlinePath,
} from './catmull-rom.js'

describe('catmull-rom', () => {
  test('empty / single-point input returns empty results', () => {
    expect(catmullRomToCubicBeziers([])).toEqual([])
    expect(catmullRomToCubicBeziers([{ x: 0, y: 0 }])).toEqual([])
    expect(sampleCatmullRom([], 4)).toEqual([])
    expect(catmullRomSVGPath([])).toBe('')
    expect(variableWidthOutlinePath([], 1, 2)).toBe('')
  })

  test('2-point input produces one bezier segment with anchors at the endpoints', () => {
    const a = { x: 0, y: 0 }, b = { x: 10, y: 0 }
    const segs = catmullRomToCubicBeziers([a, b])
    expect(segs).toHaveLength(1)
    expect(segs[0].p0).toEqual(a)
    expect(segs[0].p3).toEqual(b)
  })

  test('sample count is deterministic: (N-1)*S + 1', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 15, y: 0 },
    ]
    const samples = sampleCatmullRom(pts, 8)
    expect(samples).toHaveLength((pts.length - 1) * 8 + 1)
  })

  test('first and last samples coincide with first and last control points', () => {
    const pts = [
      { x: 1, y: 2 },
      { x: 5, y: 4 },
      { x: 9, y: 1 },
    ]
    const samples = sampleCatmullRom(pts, 8)
    expect(samples[0].x).toBeCloseTo(1)
    expect(samples[0].y).toBeCloseTo(2)
    const last = samples[samples.length - 1]
    expect(last.x).toBeCloseTo(9)
    expect(last.y).toBeCloseTo(1)
  })

  test('collinear horizontal control points produce samples with y = 0', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
    ]
    const samples = sampleCatmullRom(pts, 16)
    for (const s of samples) expect(s.y).toBeCloseTo(0)
    // x advances monotonically
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].x).toBeGreaterThanOrEqual(samples[i - 1].x)
    }
  })

  test('catmullRomSVGPath returns a valid M/C-prefixed SVG path string', () => {
    const d = catmullRomSVGPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ])
    expect(d.startsWith('M0,0')).toBe(true)
    expect(d).toContain(' C')
  })

  test('sampleCatmullRomWithWidth assigns a width to every sample', () => {
    const samples = sampleCatmullRomWithWidth(
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      1.0,
      2.0,
      8,
      0.5,
      0,
      2.0,
    )
    for (const s of samples) {
      expect(typeof s.w).toBe('number')
      expect(s.w).toBeGreaterThan(0)
    }
  })

  test('variableWidthOutlinePath returns a closed SVG path with end-cap arcs', () => {
    const d = variableWidthOutlinePath(
      [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }],
      1.0,
      2.0,
    )
    expect(d).toContain('M')
    expect(d).toContain('A')
    expect(d).toContain('Z')
  })
})
