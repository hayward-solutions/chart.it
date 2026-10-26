import { describe, expect, it } from 'vitest'
import {
  absolutePosition,
  absoluteRect,
  collectSubtree,
  edgeGeometry,
  estimateTextWidth,
  handlePoint,
  iconLabelLayout,
  indexNodes,
  nodeVisualBounds,
  orthogonalRoute,
  pointAlong,
  roundedPath,
  routeThroughWaypoints,
  simplifyPoints,
  truncateText,
  unionRects,
  wrapText,
} from './geometry'
import { makeEdge, makeNode } from './testing'

const nodes = [
  makeNode({ id: 'vpc', type: 'container', x: 100, y: 50, width: 400, height: 300 }),
  makeNode({
    id: 'subnet',
    type: 'container',
    x: 20,
    y: 40,
    width: 200,
    height: 200,
    parentId: 'vpc',
  }),
  makeNode({ id: 'ec2', x: 10, y: 30, parentId: 'subnet', label: 'Web server' }),
]

describe('absolute positions', () => {
  const index = indexNodes(nodes)

  it('sums parent offsets through the chain', () => {
    expect(absolutePosition(index.get('ec2') as never, index)).toEqual({ x: 130, y: 120 })
    expect(absoluteRect(index.get('subnet') as never, index)).toEqual({
      x: 120,
      y: 90,
      width: 200,
      height: 200,
    })
  })

  it('survives a parent cycle', () => {
    const cyclic = indexNodes([
      makeNode({ id: 'a', parentId: 'b' }),
      makeNode({ id: 'b', parentId: 'a' }),
    ])
    expect(Number.isFinite(absolutePosition(cyclic.get('a') as never, cyclic).x)).toBe(true)
  })

  it('collects descendants of a selection', () => {
    expect([...collectSubtree(nodes, ['subnet'])].sort()).toEqual(['ec2', 'subnet'])
  })
})

describe('bounds', () => {
  it('unions rectangles', () => {
    expect(
      unionRects([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: -5, width: 10, height: 10 },
      ]),
    ).toEqual({ x: 0, y: -5, width: 30, height: 15 })
    expect(unionRects([])).toBeNull()
  })

  it('includes the icon label below the icon', () => {
    const index = indexNodes(nodes)
    const bounds = nodeVisualBounds(index.get('ec2') as never, index)
    expect(bounds.x).toBeLessThanOrEqual(130)
    expect(bounds.y).toBe(120)
    expect(bounds.height).toBeGreaterThan(64)
  })

  it('places labels by position', () => {
    const base = makeNode({ id: 'i', label: 'Label', x: 0, y: 0 })
    const left = iconLabelLayout(
      { ...base, data: { ...base.data, style: { labelPosition: 'left' } } },
      { x: 100, y: 100 },
    )
    expect(left?.box.x).toBeLessThan(100)
    expect(left?.anchor).toBe('end')
    expect(iconLabelLayout(makeNode({ id: 'e' }), { x: 0, y: 0 })).toBeNull()
  })
})

describe('text', () => {
  it('wraps on words and newlines', () => {
    expect(wrapText('one two three four', estimateTextWidth('three four', 12) + 1, 12)).toEqual([
      'one two',
      'three four',
    ])
    expect(wrapText('a\nb', 500, 12)).toEqual(['a', 'b'])
  })

  it('truncates with an ellipsis', () => {
    const text = truncateText('A very long container title indeed', 80, 13)
    expect(text.endsWith('...')).toBe(true)
    expect(truncateText('short', 200, 13)).toBe('short')
  })
})

describe('routes', () => {
  it('uses stubs and a single jog for facing sides', () => {
    const route = orthogonalRoute({ x: 0, y: 0 }, 'right', { x: 200, y: 100 }, 'left')
    expect(route[0]).toEqual({ x: 0, y: 0 })
    expect(route[route.length - 1]).toEqual({ x: 200, y: 100 })
    expect(route).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ])
  })

  it('collapses aligned endpoints to a straight line', () => {
    expect(orthogonalRoute({ x: 0, y: 0 }, 'bottom', { x: 0, y: 200 }, 'top')).toHaveLength(2)
  })

  it('makes an L for perpendicular sides', () => {
    const route = orthogonalRoute({ x: 0, y: 0 }, 'right', { x: 200, y: 200 }, 'top')
    expect(route).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
    ])
  })

  it('inserts elbows between unaligned waypoints', () => {
    const route = routeThroughWaypoints({ x: 0, y: 0 }, 'right', { x: 100, y: 100 }, 'top', [
      { x: 50, y: 40 },
    ])
    for (let i = 1; i < route.length; i += 1) {
      const a = route[i - 1] as { x: number; y: number }
      const b = route[i] as { x: number; y: number }
      expect(a.x === b.x || a.y === b.y).toBe(true)
    }
  })

  it('simplifies collinear points and duplicates', () => {
    expect(
      simplifyPoints([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ])
  })

  it('rounds corners and finds points along a path', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]
    expect(roundedPath(points, 6)).toContain('Q100 0')
    expect(pointAlong(points, 0.5)).toEqual({ x: 100, y: 0 })
    expect(handlePoint({ x: 0, y: 0, width: 10, height: 20 }, 'bottom')).toEqual({ x: 5, y: 20 })
  })

  it('computes geometry for each edge type', () => {
    const source = { x: 0, y: 0, width: 64, height: 64 }
    const target = { x: 300, y: 200, width: 64, height: 64 }
    const base = { id: 'e', source: 'a', target: 'b' }
    expect(edgeGeometry(makeEdge({ ...base, type: 'straight' }), source, target).d).toMatch(/^M/)
    expect(edgeGeometry(makeEdge({ ...base, type: 'bezier' }), source, target).d).toContain('C')
    const orth = edgeGeometry(makeEdge({ ...base, labelPosition: 0 }), source, target)
    expect(orth.label).toEqual({ x: 64, y: 32 })
    const withWaypoints = edgeGeometry(
      makeEdge({
        ...base,
        waypoints: [
          { x: 200, y: 32 },
          { x: 200, y: 232 },
        ],
      }),
      source,
      target,
    )
    expect(withWaypoints.samples).toContainEqual({ x: 200, y: 32 })
  })
})
