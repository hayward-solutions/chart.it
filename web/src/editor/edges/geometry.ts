import type { HandleSide, Point } from '@/model'
import type { Rect } from '../types'

export type Axis = 'x' | 'y'

export const STUB_LENGTH = 24
export const CORNER_RADIUS = 8
export const MIN_LEG = 8

const EPSILON = 0.01
const MAX_LEGS = 5

export type RouteInput = {
  source: Point
  sourceSide: HandleSide
  target: Point
  targetSide: HandleSide
  waypoints?: readonly Point[]
  sourceRect?: Rect
  targetRect?: Rect
  stub?: number
}

export type SegmentHandle = { index: number; point: Point; axis: Axis }

export type Bezier = { start: Point; c1: Point; c2: Point; end: Point }

export function sideVector(side: HandleSide): Point {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 }
    case 'right':
      return { x: 1, y: 0 }
    case 'bottom':
      return { x: 0, y: 1 }
    case 'left':
      return { x: -1, y: 0 }
  }
}

export function sideAxis(side: HandleSide): Axis {
  return side === 'left' || side === 'right' ? 'x' : 'y'
}

export function oppositeSide(side: HandleSide): HandleSide {
  switch (side) {
    case 'top':
      return 'bottom'
    case 'right':
      return 'left'
    case 'bottom':
      return 'top'
    case 'left':
      return 'right'
  }
}

export function rectSidePoint(rect: Rect, side: HandleSide): Point {
  switch (side) {
    case 'top':
      return { x: rect.x + rect.width / 2, y: rect.y }
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
    case 'bottom':
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height }
    case 'left':
      return { x: rect.x, y: rect.y + rect.height / 2 }
  }
}

export function stubPoint(point: Point, side: HandleSide, distance: number = STUB_LENGTH): Point {
  const vector = sideVector(side)
  return { x: point.x + vector.x * distance, y: point.y + vector.y * distance }
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON
}

function samePoint(a: Point, b: Point): boolean {
  return near(a.x, b.x) && near(a.y, b.y)
}

function sign(value: number): number {
  return Math.abs(value) < EPSILON ? 0 : Math.sign(value)
}

export function legDirection(from: Point, to: Point): Point {
  return { x: sign(to.x - from.x), y: sign(to.y - from.y) }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function isOrthogonalLeg(a: Point, b: Point): boolean {
  return near(a.x, b.x) || near(a.y, b.y)
}

function collinear(a: Point, b: Point, c: Point): boolean {
  return (near(a.x, b.x) && near(b.x, c.x)) || (near(a.y, b.y) && near(b.y, c.y))
}

export function dedupePoints(points: readonly Point[]): Point[] {
  const result: Point[] = []
  for (const point of points) {
    const last = result[result.length - 1]
    if (!last || !samePoint(last, point)) {
      result.push(point)
    }
  }
  return result
}

export function simplifyOrthogonal(points: readonly Point[]): Point[] {
  const result: Point[] = []
  for (const point of dedupePoints(points)) {
    result.push(point)
    while (result.length >= 3) {
      const c = result[result.length - 1] as Point
      const b = result[result.length - 2] as Point
      const a = result[result.length - 3] as Point
      if (!collinear(a, b, c)) {
        break
      }
      result.splice(result.length - 2, 1)
    }
  }
  return result
}

export function snapOrthogonal(
  points: readonly Point[],
  startDirection: Point,
  arriveAxis: Axis,
): Point[] {
  const first = points[0]
  if (!first) {
    return []
  }
  const result: Point[] = [first]
  let previous = startDirection
  for (let i = 1; i < points.length; i += 1) {
    const target = points[i] as Point
    const current = result[result.length - 1] as Point
    if (samePoint(current, target)) {
      continue
    }
    if (isOrthogonalLeg(current, target)) {
      result.push(target)
      previous = legDirection(current, target)
      continue
    }
    const horizontalFirst: Point = { x: target.x, y: current.y }
    const verticalFirst: Point = { x: current.x, y: target.y }
    let preferred: Point
    if (i === points.length - 2) {
      preferred = arriveAxis === 'x' ? verticalFirst : horizontalFirst
    } else {
      preferred = previous.x !== 0 ? horizontalFirst : verticalFirst
    }
    const other = preferred === horizontalFirst ? verticalFirst : horizontalFirst
    const reverses = (corner: Point) => {
      const direction = legDirection(current, corner)
      return direction.x * previous.x + direction.y * previous.y < 0
    }
    const corner = reverses(preferred) && !reverses(other) ? other : preferred
    result.push(corner, target)
    previous = legDirection(corner, target)
  }
  return result
}

function segmentHitsRect(a: Point, b: Point, rect: Rect): boolean {
  const left = rect.x + 1
  const right = rect.x + rect.width - 1
  const top = rect.y + 1
  const bottom = rect.y + rect.height - 1
  if (near(a.y, b.y)) {
    return a.y > top && a.y < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right
  }
  return a.x > left && a.x < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom
}

export function routeHitsRect(points: readonly Point[], rect: Rect): boolean {
  for (let i = 0; i < points.length - 1; i += 1) {
    if (segmentHitsRect(points[i] as Point, points[i + 1] as Point, rect)) {
      return true
    }
  }
  return false
}

export function polylineLength(points: readonly Point[]): number {
  let total = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    total += distance(points[i] as Point, points[i + 1] as Point)
  }
  return total
}

function unique(values: readonly number[]): number[] {
  const result: number[] = []
  for (const value of values) {
    if (!result.some((existing) => near(existing, value))) {
      result.push(value)
    }
  }
  return result
}

function isValidRoute(
  points: readonly Point[],
  ns: Point,
  nt: Point,
  rects: readonly Rect[],
): boolean {
  if (points.length < 2) {
    return false
  }
  const first = legDirection(points[0] as Point, points[1] as Point)
  if (first.x !== ns.x || first.y !== ns.y) {
    return false
  }
  const lastFrom = points[points.length - 2] as Point
  const lastTo = points[points.length - 1] as Point
  const last = legDirection(lastFrom, lastTo)
  if (last.x !== -nt.x || last.y !== -nt.y) {
    return false
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i] as Point
    const to = points[i + 1] as Point
    if (!isOrthogonalLeg(from, to)) {
      return false
    }
    if (i > 0) {
      const before = legDirection(points[i - 1] as Point, from)
      const here = legDirection(from, to)
      if (before.x * here.x + before.y * here.y < 0) {
        return false
      }
    }
  }
  if (
    distance(points[0] as Point, points[1] as Point) < MIN_LEG ||
    distance(lastFrom, lastTo) < MIN_LEG
  ) {
    return false
  }
  return !rects.some((rect) => routeHitsRect(points, rect))
}

function defaultRoute(input: RouteInput): Point[] {
  const stub = input.stub ?? STUB_LENGTH
  const { source, target, sourceSide, targetSide } = input
  const ns = sideVector(sourceSide)
  const nt = sideVector(targetSide)
  const a = stubPoint(source, sourceSide, stub)
  const b = stubPoint(target, targetSide, stub)
  const rects = [input.sourceRect, input.targetRect].filter(
    (rect): rect is Rect => rect !== undefined,
  )
  const lefts = [source.x, target.x, a.x, b.x, ...rects.map((rect) => rect.x)]
  const rights = [source.x, target.x, a.x, b.x, ...rects.map((rect) => rect.x + rect.width)]
  const tops = [source.y, target.y, a.y, b.y, ...rects.map((rect) => rect.y)]
  const bottoms = [source.y, target.y, a.y, b.y, ...rects.map((rect) => rect.y + rect.height)]
  const xs = unique([
    (source.x + target.x) / 2,
    (a.x + b.x) / 2,
    a.x,
    b.x,
    source.x,
    target.x,
    Math.min(...lefts) - stub,
    Math.max(...rights) + stub,
  ])
  const ys = unique([
    (source.y + target.y) / 2,
    (a.y + b.y) / 2,
    a.y,
    b.y,
    source.y,
    target.y,
    Math.min(...tops) - stub,
    Math.max(...bottoms) + stub,
  ])
  const firstAxis = sideAxis(sourceSide)
  const lastAxis = sideAxis(targetSide)
  const axisAt = (leg: number): Axis =>
    (leg - 1) % 2 === 0 ? firstAxis : firstAxis === 'x' ? 'y' : 'x'

  const found: { route: Point[] | null; score: number } = { route: null, score: Infinity }

  const consider = (raw: Point[]) => {
    const points = simplifyOrthogonal(raw)
    if (!isValidRoute(points, ns, nt, rects)) {
      return
    }
    const firstLength = distance(points[0] as Point, points[1] as Point)
    const lastLength = distance(
      points[points.length - 2] as Point,
      points[points.length - 1] as Point,
    )
    const score =
      polylineLength(points) +
      (points.length - 2) * 1000 +
      Math.max(0, stub - firstLength) * 3 +
      Math.max(0, stub - lastLength) * 3
    if (score < found.score) {
      found.score = score
      found.route = points
    }
  }

  for (let legs = 1; legs <= MAX_LEGS && found.route === null; legs += 1) {
    if ((legs % 2 === 1) !== (firstAxis === lastAxis)) {
      continue
    }
    const build = (lines: readonly number[]): Point[] => {
      const points: Point[] = [source]
      let current = source
      for (let leg = 1; leg < legs; leg += 1) {
        const value = lines[leg - 1] as number
        current = axisAt(leg) === 'x' ? { x: value, y: current.y } : { x: current.x, y: value }
        points.push(current)
      }
      points.push(target)
      return points
    }
    if (legs === 1) {
      consider(build([]))
      continue
    }
    const choose = (leg: number, lines: number[]) => {
      if (leg === legs - 1) {
        consider(build([...lines, target[axisAt(leg)]]))
        return
      }
      for (const value of axisAt(leg) === 'x' ? xs : ys) {
        choose(leg + 1, [...lines, value])
      }
    }
    choose(1, [])
  }

  if (found.route !== null) {
    return found.route
  }
  return simplifyOrthogonal(snapOrthogonal([source, a, b, target], ns, lastAxis))
}

function waypointRoute(input: RouteInput, waypoints: readonly Point[]): Point[] {
  const stub = input.stub ?? STUB_LENGTH
  const a = stubPoint(input.source, input.sourceSide, stub)
  const b = stubPoint(input.target, input.targetSide, stub)
  const raw = [input.source, a, ...waypoints, b, input.target]
  return simplifyOrthogonal(
    snapOrthogonal(raw, sideVector(input.sourceSide), sideAxis(input.targetSide)),
  )
}

export function orthogonalRoute(input: RouteInput): Point[] {
  if (input.waypoints && input.waypoints.length > 0) {
    return waypointRoute(input, input.waypoints)
  }
  return defaultRoute(input)
}

export function waypointsOf(route: readonly Point[]): Point[] {
  return route.slice(1, -1).map((point) => ({ x: point.x, y: point.y }))
}

export function segmentHandles(route: readonly Point[], minLength = 12): SegmentHandle[] {
  const handles: SegmentHandle[] = []
  for (let i = 1; i <= route.length - 3; i += 1) {
    const from = route[i] as Point
    const to = route[i + 1] as Point
    if (distance(from, to) < minLength) {
      continue
    }
    handles.push({
      index: i,
      point: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
      axis: near(from.y, to.y) ? 'x' : 'y',
    })
  }
  return handles
}

export function clampSegmentValue(
  route: readonly Point[],
  index: number,
  value: number,
  sourceSide: HandleSide,
  targetSide: HandleSide,
  minLeg: number = MIN_LEG,
): number {
  const from = route[index]
  const to = route[index + 1]
  const source = route[0]
  const target = route[route.length - 1]
  if (!from || !to || !source || !target) {
    return value
  }
  const key: Axis = near(from.y, to.y) ? 'y' : 'x'
  let low = -Infinity
  let high = Infinity
  if (index === 1) {
    const direction = sideVector(sourceSide)[key]
    if (direction > 0) {
      low = Math.max(low, source[key] + minLeg)
    } else if (direction < 0) {
      high = Math.min(high, source[key] - minLeg)
    }
  }
  if (index === route.length - 3) {
    const direction = sideVector(targetSide)[key]
    if (direction > 0) {
      low = Math.max(low, target[key] + minLeg)
    } else if (direction < 0) {
      high = Math.min(high, target[key] - minLeg)
    }
  }
  if (low > high) {
    return from[key]
  }
  return Math.min(high, Math.max(low, value))
}

export function moveSegment(route: readonly Point[], index: number, value: number): Point[] {
  const from = route[index]
  const to = route[index + 1]
  if (!from || !to) {
    return route.map((point) => ({ ...point }))
  }
  const key: Axis = near(from.y, to.y) ? 'y' : 'x'
  return route.map((point, i) =>
    i === index || i === index + 1 ? { ...point, [key]: value } : { ...point },
  )
}

export function removeSegmentWaypoints(route: readonly Point[], index: number): Point[] {
  return waypointsOf(route).filter((_, i) => i !== index - 1 && i !== index)
}

export function trimPolyline(
  points: readonly Point[],
  startTrim: number,
  endTrim: number,
): Point[] {
  if (points.length < 2) {
    return points.map((point) => ({ ...point }))
  }
  const result = points.map((point) => ({ ...point }))
  const lastIndex = result.length - 1
  const firstLength = distance(result[0] as Point, result[1] as Point)
  const lastLength = distance(result[lastIndex - 1] as Point, result[lastIndex] as Point)
  let start = Math.max(0, startTrim)
  let end = Math.max(0, endTrim)
  if (result.length === 2) {
    const budget = firstLength * 0.9
    if (start + end > budget && start + end > 0) {
      const scale = budget / (start + end)
      start *= scale
      end *= scale
    }
  } else {
    start = Math.min(start, firstLength * 0.9)
    end = Math.min(end, lastLength * 0.9)
  }
  if (start > 0 && firstLength > 0) {
    const a = result[0] as Point
    const b = result[1] as Point
    result[0] = {
      x: a.x + ((b.x - a.x) / firstLength) * start,
      y: a.y + ((b.y - a.y) / firstLength) * start,
    }
  }
  if (end > 0 && lastLength > 0) {
    const a = result[lastIndex] as Point
    const b = result[lastIndex - 1] as Point
    result[lastIndex] = {
      x: a.x + ((b.x - a.x) / lastLength) * end,
      y: a.y + ((b.y - a.y) / lastLength) * end,
    }
  }
  return result
}

function format(value: number): string {
  return String(Math.round(value * 100) / 100)
}

function formatPoint(point: Point): string {
  return `${format(point.x)} ${format(point.y)}`
}

function towards(from: Point, to: Point, length: number): Point {
  const total = distance(from, to)
  if (total === 0) {
    return { ...from }
  }
  return {
    x: from.x + ((to.x - from.x) / total) * length,
    y: from.y + ((to.y - from.y) / total) * length,
  }
}

export function roundedPath(points: readonly Point[], radius: number = CORNER_RADIUS): string {
  const first = points[0]
  if (!first) {
    return ''
  }
  let d = `M ${formatPoint(first)}`
  for (let i = 1; i < points.length - 1; i += 1) {
    const previous = points[i - 1] as Point
    const current = points[i] as Point
    const next = points[i + 1] as Point
    const r = Math.min(radius, distance(previous, current) / 2, distance(current, next) / 2)
    if (r < 0.5) {
      d += ` L ${formatPoint(current)}`
      continue
    }
    d += ` L ${formatPoint(towards(current, previous, r))} Q ${formatPoint(current)} ${formatPoint(towards(current, next, r))}`
  }
  const last = points[points.length - 1]
  if (last && points.length > 1) {
    d += ` L ${formatPoint(last)}`
  }
  return d
}

export function pointAtLength(points: readonly Point[], length: number): Point {
  const first = points[0]
  if (!first) {
    return { x: 0, y: 0 }
  }
  let remaining = Math.max(0, length)
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i] as Point
    const b = points[i + 1] as Point
    const leg = distance(a, b)
    if (remaining <= leg) {
      return leg === 0 ? { ...a } : towards(a, b, remaining)
    }
    remaining -= leg
  }
  const last = points[points.length - 1] as Point
  return { ...last }
}

export function pointAtT(points: readonly Point[], t: number): Point {
  const clamped = Math.min(1, Math.max(0, t))
  return pointAtLength(points, polylineLength(points) * clamped)
}

export function projectOnPolyline(
  points: readonly Point[],
  target: Point,
): { t: number; point: Point; distance: number } {
  const first = points[0]
  if (!first) {
    return { t: 0, point: { x: 0, y: 0 }, distance: 0 }
  }
  const total = polylineLength(points)
  let best = { length: 0, point: { ...first }, distance: distance(first, target) }
  let travelled = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i] as Point
    const b = points[i + 1] as Point
    const leg = distance(a, b)
    if (leg > 0) {
      const ratio = Math.min(
        1,
        Math.max(
          0,
          ((target.x - a.x) * (b.x - a.x) + (target.y - a.y) * (b.y - a.y)) / (leg * leg),
        ),
      )
      const point = { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio }
      const gap = distance(point, target)
      if (gap < best.distance) {
        best = { length: travelled + leg * ratio, point, distance: gap }
      }
    }
    travelled += leg
  }
  return {
    t: total === 0 ? 0 : Math.min(1, Math.max(0, best.length / total)),
    point: best.point,
    distance: best.distance,
  }
}

function controlOffset(gap: number, curvature: number): number {
  return gap >= 0 ? 0.5 * gap : curvature * 25 * Math.sqrt(-gap)
}

function controlPoint(side: HandleSide, from: Point, to: Point, curvature: number): Point {
  switch (side) {
    case 'left':
      return { x: from.x - controlOffset(from.x - to.x, curvature), y: from.y }
    case 'right':
      return { x: from.x + controlOffset(to.x - from.x, curvature), y: from.y }
    case 'top':
      return { x: from.x, y: from.y - controlOffset(from.y - to.y, curvature) }
    case 'bottom':
      return { x: from.x, y: from.y + controlOffset(to.y - from.y, curvature) }
  }
}

export function bezierCurve(
  source: Point,
  sourceSide: HandleSide,
  target: Point,
  targetSide: HandleSide,
  curvature = 0.25,
): Bezier {
  return {
    start: source,
    c1: controlPoint(sourceSide, source, target, curvature),
    c2: controlPoint(targetSide, target, source, curvature),
    end: target,
  }
}

export function bezierPath(curve: Bezier): string {
  return `M ${formatPoint(curve.start)} C ${formatPoint(curve.c1)} ${formatPoint(curve.c2)} ${formatPoint(curve.end)}`
}

export function sampleBezier(curve: Bezier, segments = 32): Point[] {
  const points: Point[] = []
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments
    const u = 1 - t
    const w0 = u * u * u
    const w1 = 3 * u * u * t
    const w2 = 3 * u * t * t
    const w3 = t * t * t
    points.push({
      x: w0 * curve.start.x + w1 * curve.c1.x + w2 * curve.c2.x + w3 * curve.end.x,
      y: w0 * curve.start.y + w1 * curve.c1.y + w2 * curve.c2.y + w3 * curve.end.y,
    })
  }
  return points
}
