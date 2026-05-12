import { describe, expect, test } from 'vitest'
import {
  simplifyPath,
  enforceMinDistance,
  computeRoundedCorners,
  computeSubdivisionRounding,
  sampleRoundedPath,
  roundedPathToSVG,
} from './round-trace.js'

describe('simplifyPath (Ramer-Douglas-Peucker)', () => {
  test('returns input unchanged for 0, 1, or 2 points', () => {
    expect(simplifyPath([], 1)).toEqual([])
    const one = [{ col: 0, row: 0 }]
    expect(simplifyPath(one, 1)).toEqual(one)
    const two = [{ col: 0, row: 0 }, { col: 5, row: 5 }]
    expect(simplifyPath(two, 1)).toEqual(two)
  })

  test('collinear points are reduced to endpoints', () => {
    const pts = [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
      { col: 3, row: 0 },
      { col: 4, row: 0 },
    ]
    const result = simplifyPath(pts, 0.01)
    expect(result).toEqual([pts[0], pts[4]])
  })

  test('preserves sharp corners above epsilon', () => {
    const pts = [
      { col: 0, row: 0 },
      { col: 5, row: 0 },
      { col: 5, row: 5 },
    ]
    const result = simplifyPath(pts, 0.1)
    expect(result).toHaveLength(3)
    expect(result[1]).toEqual({ col: 5, row: 0 })
  })

  test('removes intermediate points within epsilon of the line', () => {
    const pts = [
      { col: 0, row: 0 },
      { col: 1, row: 0.01 },
      { col: 2, row: -0.01 },
      { col: 3, row: 0.02 },
      { col: 4, row: 0 },
    ]
    const result = simplifyPath(pts, 0.1)
    expect(result).toEqual([pts[0], pts[4]])
  })

  test('handles all-same-point input', () => {
    const pts = [
      { col: 3, row: 3 },
      { col: 3, row: 3 },
      { col: 3, row: 3 },
    ]
    const result = simplifyPath(pts, 0.1)
    expect(result).toHaveLength(2)
  })

  test('always preserves first and last points', () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({
      col: i * 0.5,
      row: Math.sin(i * 0.3) * 0.05,
    }))
    const result = simplifyPath(pts, 1)
    expect(result[0]).toEqual(pts[0])
    expect(result[result.length - 1]).toEqual(pts[pts.length - 1])
  })
})

describe('enforceMinDistance', () => {
  test('returns input unchanged for 0, 1, or 2 points', () => {
    expect(enforceMinDistance([], 1)).toEqual([])
    const one = [{ col: 0, row: 0 }]
    expect(enforceMinDistance(one, 1)).toEqual(one)
    const two = [{ col: 0, row: 0 }, { col: 0.01, row: 0 }]
    expect(enforceMinDistance(two, 1)).toEqual(two)
  })

  test('removes points closer than minDist', () => {
    const pts = [
      { col: 0, row: 0 },
      { col: 0.01, row: 0 },
      { col: 0.02, row: 0 },
      { col: 1, row: 0 },
      { col: 1.01, row: 0 },
      { col: 2, row: 0 },
    ]
    const result = enforceMinDistance(pts, 0.5)
    expect(result[0]).toEqual(pts[0])
    expect(result[result.length - 1]).toEqual(pts[pts.length - 1])
    expect(result).toHaveLength(3)
    expect(result).toEqual([pts[0], pts[3], pts[5]])
  })

  test('always preserves first and last points', () => {
    const pts = [
      { col: 0, row: 0 },
      { col: 0.001, row: 0 },
      { col: 0.002, row: 0 },
    ]
    const result = enforceMinDistance(pts, 100)
    expect(result).toEqual([pts[0], pts[2]])
  })
})

describe('freetrace integration with subdivision rounding', () => {
  test('subdivision rounding produces smooth path from freehand-like points', () => {
    const pts = [
      { col: 0, row: 0 },
      { col: 1.3, row: 0.2 },
      { col: 2.7, row: 1.1 },
      { col: 3.5, row: 2.8 },
      { col: 4, row: 4 },
    ]
    const pitch = 2.54
    const segs = computeSubdivisionRounding(pts, 1.0, 2, pitch)
    expect(segs.length).toBeGreaterThan(pts.length)
    for (const s of segs) {
      expect(s.type).toBe('line')
      expect(typeof s.x1).toBe('number')
      expect(typeof s.y1).toBe('number')
    }
  })

  test('roundedPathToSVG produces valid path from subdivision output', () => {
    const pts = [
      { col: 0, row: 0 },
      { col: 2, row: 1 },
      { col: 4, row: 0 },
    ]
    const segs = computeSubdivisionRounding(pts, 1.0, 2, 2.54)
    const svg = roundedPathToSVG(segs)
    expect(svg).toMatch(/^M/)
    expect(svg.length).toBeGreaterThan(10)
  })

  test('simplify → enforceMinDistance → subdivision pipeline', () => {
    const raw = Array.from({ length: 100 }, (_, i) => ({
      col: i * 0.1,
      row: Math.sin(i * 0.15) * 2,
    }))
    let pts = enforceMinDistance(raw, 0.05)
    pts = simplifyPath(pts, 0.15)
    expect(pts.length).toBeGreaterThanOrEqual(2)
    expect(pts.length).toBeLessThan(raw.length)

    const segs = computeSubdivisionRounding(pts, 1.0, 2, 2.54)
    expect(segs.length).toBeGreaterThan(0)
    const svg = roundedPathToSVG(segs)
    expect(svg).toMatch(/^M/)
  })
})
