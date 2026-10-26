import type { HandleSide, Point } from '@/model'
import type { Rect } from '../types'
import {
  bezierCurve,
  bezierPath,
  clampSegmentValue,
  legDirection,
  moveSegment,
  orthogonalRoute,
  pointAtT,
  polylineLength,
  projectOnPolyline,
  rectSidePoint,
  removeSegmentWaypoints,
  roundedPath,
  routeHitsRect,
  sampleBezier,
  segmentHandles,
  sideAxis,
  sideVector,
  simplifyOrthogonal,
  snapOrthogonal,
  stubPoint,
  trimPolyline,
  waypointsOf,
} from './geometry'

const SIDES: HandleSide[] = ['top', 'right', 'bottom', 'left']

function isOrthogonal(route: readonly Point[]): boolean {
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = route[i] as Point
    const b = route[i + 1] as Point
    if (Math.abs(a.x - b.x) > 0.01 && Math.abs(a.y - b.y) > 0.01) {
      return false
    }
  }
  return true
}

function endpoints(route: readonly Point[]) {
  return {
    first: legDirection(route[0] as Point, route[1] as Point),
    last: legDirection(route[route.length - 2] as Point, route[route.length - 1] as Point),
  }
}

describe('sides and stubs', () => {
  it('points outwards from each side', () => {
    expect(sideVector('top')).toEqual({ x: 0, y: -1 })
    expect(sideVector('right')).toEqual({ x: 1, y: 0 })
    expect(sideVector('bottom')).toEqual({ x: 0, y: 1 })
    expect(sideVector('left')).toEqual({ x: -1, y: 0 })
    expect(sideAxis('left')).toBe('x')
    expect(sideAxis('top')).toBe('y')
  })

  it('places a 24px stub perpendicular to the side by default', () => {
    expect(stubPoint({ x: 100, y: 50 }, 'right')).toEqual({ x: 124, y: 50 })
    expect(stubPoint({ x: 100, y: 50 }, 'top')).toEqual({ x: 100, y: 26 })
    expect(stubPoint({ x: 100, y: 50 }, 'left', 10)).toEqual({ x: 90, y: 50 })
  })

  it('finds the midpoint of a rect side', () => {
    const rect: Rect = { x: 10, y: 20, width: 100, height: 60 }
    expect(rectSidePoint(rect, 'top')).toEqual({ x: 60, y: 20 })
    expect(rectSidePoint(rect, 'right')).toEqual({ x: 110, y: 50 })
    expect(rectSidePoint(rect, 'bottom')).toEqual({ x: 60, y: 80 })
    expect(rectSidePoint(rect, 'left')).toEqual({ x: 10, y: 50 })
  })
})

describe('default orthogonal routes', () => {
  it('draws a straight line for aligned opposite handles', () => {
    const route = orthogonalRoute({
      source: { x: 0, y: 0 },
      sourceSide: 'right',
      target: { x: 200, y: 0 },
      targetSide: 'left',
    })
    expect(route).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ])
  })

  it('draws a three segment Z with the bend midway', () => {
    const route = orthogonalRoute({
      source: { x: 0, y: 0 },
      sourceSide: 'right',
      target: { x: 200, y: 100 },
      targetSide: 'left',
    })
    expect(route).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ])
  })

  it('draws a two segment L for perpendicular handles', () => {
    const route = orthogonalRoute({
      source: { x: 0, y: 0 },
      sourceSide: 'right',
      target: { x: 200, y: 100 },
      targetSide: 'top',
    })
    expect(route).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
    ])
  })

  it('goes around when both handles face the same way', () => {
    const route = orthogonalRoute({
      source: { x: 0, y: 0 },
      sourceSide: 'right',
      target: { x: 0, y: 100 },
      targetSide: 'right',
    })
    expect(route.length).toBe(4)
    expect((route[1] as Point).x).toBeGreaterThan(0)
    expect(endpoints(route).first).toEqual({ x: 1, y: 0 })
    expect(endpoints(route).last).toEqual({ x: -1, y: 0 })
  })

  it('leaves the source with at least a stub when there is room', () => {
    const route = orthogonalRoute({
      source: { x: 0, y: 0 },
      sourceSide: 'bottom',
      target: { x: 60, y: 300 },
      targetSide: 'top',
    })
    const first = route[1] as Point
    expect(first.x).toBe(0)
    expect(first.y).toBeGreaterThanOrEqual(24)
  })

  it('never crosses the source or target rect for any side combination', () => {
    const size = { width: 120, height: 80 }
    const offsets: Point[] = [
      { x: 300, y: 0 },
      { x: -300, y: 0 },
      { x: 0, y: 260 },
      { x: 0, y: -260 },
      { x: 260, y: 200 },
      { x: -260, y: -200 },
      { x: 260, y: -200 },
      { x: -260, y: 200 },
      { x: 160, y: 40 },
      { x: 150, y: 90 },
    ]
    for (const sourceSide of SIDES) {
      for (const targetSide of SIDES) {
        for (const offset of offsets) {
          const sourceRect: Rect = { x: 0, y: 0, ...size }
          const targetRect: Rect = { x: offset.x, y: offset.y, ...size }
          const route = orthogonalRoute({
            source: rectSidePoint(sourceRect, sourceSide),
            sourceSide,
            target: rectSidePoint(targetRect, targetSide),
            targetSide,
            sourceRect,
            targetRect,
          })
          const label = `${sourceSide}->${targetSide} @${offset.x},${offset.y}`
          expect(isOrthogonal(route), label).toBe(true)
          expect(endpoints(route).first, label).toEqual(sideVector(sourceSide))
          const arrival = sideVector(targetSide)
          expect(endpoints(route).last, label).toEqual({ x: -arrival.x || 0, y: -arrival.y || 0 })
          const inner = (rect: Rect) => ({
            x: rect.x + 1,
            y: rect.y + 1,
            width: rect.width - 2,
            height: rect.height - 2,
          })
          expect(routeHitsRect(route, inner(sourceRect)), label).toBe(false)
          expect(routeHitsRect(route, inner(targetRect)), label).toBe(false)
          expect(route.length - 1, label).toBeLessThanOrEqual(5)
        }
      }
    }
  })
})

describe('waypoint routes', () => {
  const base = {
    source: { x: 0, y: 0 },
    sourceSide: 'right' as const,
    target: { x: 200, y: 100 },
    targetSide: 'left' as const,
  }

  it('routes source stub, waypoint and target stub with axis aligned segments', () => {
    const route = orthogonalRoute({ ...base, waypoints: [{ x: 100, y: 50 }] })
    expect(isOrthogonal(route)).toBe(true)
    expect(route[0]).toEqual({ x: 0, y: 0 })
    expect(route[route.length - 1]).toEqual({ x: 200, y: 100 })
    expect(routeHitsRect(route, { x: 98, y: 48, width: 4, height: 4 })).toBe(true)
  })

  it('inserts a corner when consecutive points share neither axis', () => {
    const snapped = snapOrthogonal(
      [
        { x: 0, y: 0 },
        { x: 50, y: 40 },
      ],
      { x: 1, y: 0 },
      'x',
    )
    expect(snapped).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
    ])
  })

  it('prefers the corner that does not reverse the previous leg', () => {
    const snapped = snapOrthogonal(
      [
        { x: 24, y: 0 },
        { x: 10, y: 40 },
      ],
      { x: 1, y: 0 },
      'x',
    )
    expect(snapped).toEqual([
      { x: 24, y: 0 },
      { x: 24, y: 40 },
      { x: 10, y: 40 },
    ])
  })

  it('follows a vertical dogleg through two waypoints', () => {
    const route = orthogonalRoute({
      ...base,
      waypoints: [
        { x: 100, y: -60 },
        { x: 150, y: -60 },
      ],
    })
    expect(isOrthogonal(route)).toBe(true)
    expect(route.some((p) => p.x === 100 && p.y === -60)).toBe(true)
    expect(route.some((p) => p.x === 150 && p.y === -60)).toBe(true)
    expect(endpoints(route).first).toEqual({ x: 1, y: 0 })
    expect(endpoints(route).last).toEqual({ x: 1, y: 0 })
  })

  it('removes spurs when a waypoint sits inside the stub', () => {
    const route = orthogonalRoute({
      ...base,
      waypoints: [
        { x: 10, y: 0 },
        { x: 10, y: 100 },
      ],
    })
    expect(isOrthogonal(route)).toBe(true)
    expect(endpoints(route).first).toEqual({ x: 1, y: 0 })
    expect(route.some((p) => p.x === 10 && p.y === 100)).toBe(true)
  })

  it('simplifies collinear points', () => {
    expect(
      simplifyOrthogonal([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 20 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 20 },
    ])
  })
})

describe('segment editing', () => {
  const z: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 200, y: 100 },
  ]

  it('offers one handle on the middle segment of a Z route', () => {
    const handles = segmentHandles(z)
    expect(handles).toHaveLength(1)
    expect(handles[0]).toEqual({ index: 1, point: { x: 100, y: 50 }, axis: 'y' })
  })

  it('offers no handles on an L route', () => {
    expect(
      segmentHandles([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ]),
    ).toEqual([])
  })

  it('moves a segment perpendicular to its direction', () => {
    expect(moveSegment(z, 1, 140)).toEqual([
      { x: 0, y: 0 },
      { x: 140, y: 0 },
      { x: 140, y: 100 },
      { x: 200, y: 100 },
    ])
  })

  it('keeps the first and last legs at least the minimum length', () => {
    expect(clampSegmentValue(z, 1, -50, 'right', 'left')).toBe(8)
    expect(clampSegmentValue(z, 1, 500, 'right', 'left')).toBe(192)
    expect(clampSegmentValue(z, 1, 120, 'right', 'left')).toBe(120)
  })

  it('round trips a dragged segment into waypoints that reproduce the route', () => {
    const moved = simplifyOrthogonal(moveSegment(z, 1, 140))
    const waypoints = waypointsOf(moved)
    const route = orthogonalRoute({
      source: { x: 0, y: 0 },
      sourceSide: 'right',
      target: { x: 200, y: 100 },
      targetSide: 'left',
      waypoints,
    })
    expect(route).toEqual(moved)
  })

  it('drops the waypoints at both ends of a segment', () => {
    const route: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 80 },
      { x: 120, y: 80 },
      { x: 120, y: 20 },
      { x: 200, y: 20 },
    ]
    expect(removeSegmentWaypoints(route, 2)).toEqual([
      { x: 50, y: 0 },
      { x: 120, y: 20 },
    ])
    expect(
      removeSegmentWaypoints(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ],
        1,
      ),
    ).toEqual([])
  })
})

describe('trimming and paths', () => {
  it('shortens both ends of a polyline along its legs', () => {
    const trimmed = trimPolyline(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      10,
      20,
    )
    expect(trimmed).toEqual([
      { x: 10, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
    ])
  })

  it('never trims past the end of a short leg', () => {
    const trimmed = trimPolyline(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      30,
      30,
    )
    const [a, b] = trimmed as [Point, Point]
    expect(b.x - a.x).toBeGreaterThan(0)
    expect(a.x).toBeGreaterThanOrEqual(0)
    expect(b.x).toBeLessThanOrEqual(10)
  })

  it('rounds corners with quadratic curves limited by leg length', () => {
    const d = roundedPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      8,
    )
    expect(d).toBe('M 0 0 L 92 0 Q 100 0 100 8 L 100 100')
    const tight = roundedPath(
      [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 6, y: 100 },
      ],
      8,
    )
    expect(tight).toContain('Q 6 0 6 3')
  })
})

describe('label geometry', () => {
  const line: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ]

  it('measures polyline length', () => {
    expect(polylineLength(line)).toBe(200)
  })

  it('finds the point at t along the path length', () => {
    expect(pointAtT(line, 0)).toEqual({ x: 0, y: 0 })
    expect(pointAtT(line, 0.25)).toEqual({ x: 50, y: 0 })
    expect(pointAtT(line, 0.5)).toEqual({ x: 100, y: 0 })
    expect(pointAtT(line, 0.75)).toEqual({ x: 100, y: 50 })
    expect(pointAtT(line, 1)).toEqual({ x: 100, y: 100 })
    expect(pointAtT(line, 2)).toEqual({ x: 100, y: 100 })
    expect(pointAtT(line, -1)).toEqual({ x: 0, y: 0 })
  })

  it('projects a pointer onto the nearest part of the path', () => {
    const projected = projectOnPolyline(line, { x: 130, y: 75 })
    expect(projected.point).toEqual({ x: 100, y: 75 })
    expect(projected.t).toBeCloseTo(0.875)
    expect(projected.distance).toBe(30)
    expect(projectOnPolyline(line, { x: -40, y: -10 }).t).toBe(0)
  })
})

describe('bezier geometry', () => {
  it('leaves each handle along its side normal', () => {
    const curve = bezierCurve({ x: 0, y: 0 }, 'right', { x: 200, y: 100 }, 'left')
    expect(curve.c1.y).toBe(0)
    expect(curve.c1.x).toBeGreaterThan(0)
    expect(curve.c2.y).toBe(100)
    expect(curve.c2.x).toBeLessThan(200)
    expect(bezierPath(curve)).toMatch(/^M 0 0 C .* 200 100$/)
  })

  it('samples a curve that starts and ends at the handles', () => {
    const points = sampleBezier(bezierCurve({ x: 0, y: 0 }, 'bottom', { x: 80, y: 120 }, 'top'))
    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points[points.length - 1]).toEqual({ x: 80, y: 120 })
    expect(polylineLength(points)).toBeGreaterThan(Math.hypot(80, 120) - 0.001)
  })
})
