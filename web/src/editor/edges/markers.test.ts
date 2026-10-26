import { MARKER_KINDS, markerId, markerUrl } from './markerIds'
import { markerMetrics, markerTrim } from './markerMetrics'

describe('marker ids', () => {
  it('derives ids from kind, end and an optional scope', () => {
    expect(markerId('arrow', 'end')).toBe('chartit-marker-arrow-end')
    expect(markerId('diamond', 'start', 'edge 1/a')).toBe('chartit-marker-diamond-start-edge_1_a')
    expect(markerUrl('none', 'end')).toBeUndefined()
    expect(markerUrl('circle', 'start', 'e1')).toBe('url(#chartit-marker-circle-start-e1)')
  })

  it('lists every drawable kind', () => {
    expect([...MARKER_KINDS].sort()).toEqual(['arrow', 'circle', 'diamond', 'openArrow'])
  })
})

describe('marker metrics', () => {
  it('scales every marker with the stroke width', () => {
    for (const kind of MARKER_KINDS) {
      const thin = markerMetrics(kind, 2)
      const thick = markerMetrics(kind, 6)
      expect(thick.length).toBeCloseTo(thin.length * 3)
      expect(thick.height).toBeCloseTo(thin.height * 3)
    }
  })

  it('keeps hairline edges visible', () => {
    expect(markerMetrics('arrow', 0.5).length).toBeGreaterThan(5)
  })

  it('stops filled markers at their base and open arrows at their vertex', () => {
    expect(markerTrim('arrow', 2)).toBe(markerMetrics('arrow', 2).length)
    expect(markerTrim('diamond', 2)).toBe(markerMetrics('diamond', 2).length)
    expect(markerTrim('circle', 2)).toBe(markerMetrics('circle', 2).length)
    expect(markerTrim('openArrow', 2)).toBe(1)
    expect(markerTrim('none', 2)).toBe(0)
  })
})
