import {
  legDirection,
  orthogonalRoute,
  rectSidePoint,
  routeHitsRect,
  sideAxis,
  sideVector,
  simplifyOrthogonal,
  snapOrthogonal,
  stubPoint,
  STUB_LENGTH,
  waypointsOf,
} from '@/editor/edges/geometry'
import { absoluteRect, indexNodes } from '@/editor/geometry'
import type { Rect } from '@/editor/types'
import type { Edge, Node, Point } from '@/model'

export type RouterOptions = { gridSize?: number; padding?: number }

export type EdgeRouter = {
  route: (edge: Edge) => Point[] | undefined
}

const DEFAULT_GRID_SIZE = 20
const DEFAULT_PADDING = 12
const TURN_PENALTY = 3
const MARGIN_CELLS = 6
const MAX_CELLS = 1_000_000
const DX = [1, 0, -1, 0] as const
const DY = [0, 1, 0, -1] as const

type CellRange = { c0: number; c1: number; r0: number; r1: number }

type Obstacle = { id: string; rect: Rect; inflated: Rect }

class MinHeap {
  private keys: number[] = []
  private values: number[] = []

  get size(): number {
    return this.keys.length
  }

  clear(): void {
    this.keys.length = 0
    this.values.length = 0
  }

  push(key: number, value: number): void {
    let i = this.keys.length
    this.keys.push(key)
    this.values.push(value)
    while (i > 0) {
      const parent = (i - 1) >> 1
      const parentKey = this.keys[parent] as number
      if (parentKey <= key) {
        break
      }
      this.keys[i] = parentKey
      this.values[i] = this.values[parent] as number
      i = parent
    }
    this.keys[i] = key
    this.values[i] = value
  }

  popKey = 0

  pop(): number {
    const topValue = this.values[0] as number
    this.popKey = this.keys[0] as number
    const lastKey = this.keys.pop() as number
    const lastValue = this.values.pop() as number
    const length = this.keys.length
    if (length > 0) {
      let i = 0
      for (;;) {
        const left = i * 2 + 1
        if (left >= length) {
          break
        }
        const right = left + 1
        const child =
          right < length && (this.keys[right] as number) < (this.keys[left] as number)
            ? right
            : left
        const childKey = this.keys[child] as number
        if (childKey >= lastKey) {
          break
        }
        this.keys[i] = childKey
        this.values[i] = this.values[child] as number
        i = child
      }
      this.keys[i] = lastKey
      this.values[i] = lastValue
    }
    return topValue
  }
}

function inflate(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  }
}

function directionIndex(vector: Point): number {
  if (vector.x > 0) {
    return 0
  }
  if (vector.y > 0) {
    return 1
  }
  if (vector.x < 0) {
    return 2
  }
  return 3
}

export function createRouter(nodes: readonly Node[], options: RouterOptions = {}): EdgeRouter {
  const padding = options.padding ?? DEFAULT_PADDING
  let cell = Math.max(2, options.gridSize ?? DEFAULT_GRID_SIZE)
  const index = indexNodes(nodes)
  const bodies = new Map<string, Rect>()
  const obstacles: Obstacle[] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    const rect = absoluteRect(node, index)
    bodies.set(node.id, rect)
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.width)
    maxY = Math.max(maxY, rect.y + rect.height)
    if (node.type !== 'container') {
      obstacles.push({ id: node.id, rect, inflated: inflate(rect, padding) })
    }
  }

  if (bodies.size === 0) {
    return { route: () => undefined }
  }

  let originX = 0
  let originY = 0
  let cols = 0
  let rows = 0
  for (;;) {
    originX = Math.floor((minX - MARGIN_CELLS * cell) / cell) * cell
    originY = Math.floor((minY - MARGIN_CELLS * cell) / cell) * cell
    cols = Math.ceil((maxX + MARGIN_CELLS * cell - originX) / cell) + 1
    rows = Math.ceil((maxY + MARGIN_CELLS * cell - originY) / cell) + 1
    if (cols * rows <= MAX_CELLS) {
      break
    }
    cell = Math.ceil(cell * 1.5)
  }

  const blocked = new Uint16Array(cols * rows)
  const gScore = new Float32Array(cols * rows * 4)
  const stamp = new Uint32Array(cols * rows * 4)
  const parent = new Int32Array(cols * rows * 4)
  const heap = new MinHeap()
  let generation = 0

  const clampCol = (value: number) => Math.min(cols - 1, Math.max(0, value))
  const clampRow = (value: number) => Math.min(rows - 1, Math.max(0, value))

  const rangeOf = (rect: Rect, pad: number): CellRange => {
    const c0 = clampCol(Math.floor((rect.x - pad - originX) / cell))
    const r0 = clampRow(Math.floor((rect.y - pad - originY) / cell))
    const c1 = clampCol(Math.ceil((rect.x + rect.width + pad - originX) / cell) - 1)
    const r1 = clampRow(Math.ceil((rect.y + rect.height + pad - originY) / cell) - 1)
    return { c0, c1: Math.max(c0, c1), r0, r1: Math.max(r0, r1) }
  }

  const adjust = (range: CellRange, delta: number) => {
    for (let r = range.r0; r <= range.r1; r += 1) {
      const base = r * cols
      for (let c = range.c0; c <= range.c1; c += 1) {
        blocked[base + c] = (blocked[base + c] as number) + delta
      }
    }
  }

  const ranges = new Map<string, { padded: CellRange; raw: CellRange }>()
  for (const obstacle of obstacles) {
    const padded = rangeOf(obstacle.rect, padding)
    ranges.set(obstacle.id, { padded, raw: rangeOf(obstacle.rect, 0) })
    adjust(padded, 1)
  }

  const cellOf = (point: Point): number =>
    clampRow(Math.floor((point.y - originY) / cell)) * cols +
    clampCol(Math.floor((point.x - originX) / cell))

  const centreOf = (cellIndex: number): Point => ({
    x: originX + ((cellIndex % cols) + 0.5) * cell,
    y: originY + (Math.floor(cellIndex / cols) + 0.5) * cell,
  })

  const search = (
    startCell: number,
    startDirection: number,
    goalCell: number,
    forbiddenDirection: number,
  ): number[] | null => {
    generation += 1
    const goalCol = goalCell % cols
    const goalRow = Math.floor(goalCell / cols)
    const heuristic = (col: number, row: number) =>
      Math.abs(col - goalCol) +
      Math.abs(row - goalRow) +
      (col !== goalCol && row !== goalRow ? TURN_PENALTY : 0)
    heap.clear()
    const startState = startCell * 4 + startDirection
    stamp[startState] = generation
    gScore[startState] = 0
    parent[startState] = -1
    heap.push(heuristic(startCell % cols, Math.floor(startCell / cols)), startState)
    while (heap.size > 0) {
      const state = heap.pop()
      const cellIndex = state >> 2
      const direction = state & 3
      const col = cellIndex % cols
      const row = (cellIndex - col) / cols
      const g = gScore[state] as number
      if (heap.popKey > g + heuristic(col, row) + 1e-4) {
        continue
      }
      if (cellIndex === goalCell && direction !== forbiddenDirection) {
        const cells: number[] = []
        let walk = state
        while (walk >= 0) {
          const walkCell = walk >> 2
          if (cells[cells.length - 1] !== walkCell) {
            cells.push(walkCell)
          }
          walk = parent[walk] as number
        }
        return cells.reverse()
      }
      for (let turn = -1; turn <= 1; turn += 1) {
        const nextDirection = (direction + turn + 4) & 3
        const nextCol = col + (DX[nextDirection] as number)
        const nextRow = row + (DY[nextDirection] as number)
        if (nextCol < 0 || nextRow < 0 || nextCol >= cols || nextRow >= rows) {
          continue
        }
        const nextCell = nextRow * cols + nextCol
        if ((blocked[nextCell] as number) > 0 && nextCell !== goalCell) {
          continue
        }
        const cost = g + 1 + (turn !== 0 ? TURN_PENALTY : 0)
        const nextState = nextCell * 4 + nextDirection
        if (stamp[nextState] !== generation || cost < (gScore[nextState] as number)) {
          stamp[nextState] = generation
          gScore[nextState] = cost
          parent[nextState] = state
          heap.push(cost + heuristic(nextCol, nextRow), nextState)
        }
      }
    }
    return null
  }

  const polylineFromCells = (
    cells: readonly number[],
    source: Point,
    a: Point,
    b: Point,
    target: Point,
    startVector: Point,
    arriveAxis: 'x' | 'y',
  ): Point[] => {
    const corners: number[] = []
    const first = cells[0]
    if (first !== undefined) {
      corners.push(first)
    }
    for (let i = 1; i < cells.length - 1; i += 1) {
      const before = cells[i - 1] as number
      const here = cells[i] as number
      const after = cells[i + 1] as number
      if (here - before !== after - here) {
        corners.push(here)
      }
    }
    const last = cells[cells.length - 1]
    if (last !== undefined && cells.length > 1) {
      corners.push(last)
    }
    const centres = corners.map(centreOf)
    const m = corners.length - 1
    let raw: Point[]
    if (m >= 2) {
      const sameRow = (i: number) =>
        Math.floor((corners[i] as number) / cols) === Math.floor((corners[i + 1] as number) / cols)
      const firstCorner = centres[1] as Point
      centres[1] = sameRow(0) ? { x: firstCorner.x, y: a.y } : { x: a.x, y: firstCorner.y }
      const lastCorner = centres[m - 1] as Point
      centres[m - 1] = sameRow(m - 1) ? { x: lastCorner.x, y: b.y } : { x: b.x, y: lastCorner.y }
      raw = [source, a, ...centres.slice(1, m), b, target]
    } else {
      raw = [source, a, b, target]
    }
    return simplifyOrthogonal(snapOrthogonal(raw, startVector, arriveAxis))
  }

  const route = (edge: Edge): Point[] | undefined => {
    if (edge.type !== 'orthogonal' || edge.source === edge.target) {
      return undefined
    }
    const sourceRect = bodies.get(edge.source)
    const targetRect = bodies.get(edge.target)
    if (!sourceRect || !targetRect) {
      return undefined
    }
    const source = rectSidePoint(sourceRect, edge.sourceHandle)
    const target = rectSidePoint(targetRect, edge.targetHandle)
    const others = obstacles.filter(
      (obstacle) => obstacle.id !== edge.source && obstacle.id !== edge.target,
    )

    const direct = orthogonalRoute({
      source,
      sourceSide: edge.sourceHandle,
      target,
      targetSide: edge.targetHandle,
      sourceRect,
      targetRect,
    })
    if (!others.some((obstacle) => routeHitsRect(direct, obstacle.inflated))) {
      return []
    }

    const startVector = sideVector(edge.sourceHandle)
    const endVector = sideVector(edge.targetHandle)
    const a = stubPoint(source, edge.sourceHandle, STUB_LENGTH)
    const b = stubPoint(target, edge.targetHandle, STUB_LENGTH)

    const own = [...new Set([edge.source, edge.target])]
      .map((id) => ranges.get(id))
      .filter((entry): entry is { padded: CellRange; raw: CellRange } => entry !== undefined)
    for (const entry of own) {
      adjust(entry.padded, -1)
    }
    for (const entry of own) {
      adjust(entry.raw, 1)
    }
    let cells: number[] | null
    try {
      cells = search(cellOf(a), directionIndex(startVector), cellOf(b), directionIndex(endVector))
    } finally {
      for (const entry of own) {
        adjust(entry.raw, -1)
      }
      for (const entry of own) {
        adjust(entry.padded, 1)
      }
    }
    if (!cells) {
      return undefined
    }

    const points = polylineFromCells(
      cells,
      source,
      a,
      b,
      target,
      startVector,
      sideAxis(edge.targetHandle),
    )
    if (points.length < 2) {
      return undefined
    }
    const first = legDirection(points[0] as Point, points[1] as Point)
    const last = legDirection(
      points[points.length - 2] as Point,
      points[points.length - 1] as Point,
    )
    if (
      first.x !== startVector.x ||
      first.y !== startVector.y ||
      last.x !== -endVector.x ||
      last.y !== -endVector.y
    ) {
      return undefined
    }
    if (others.some((obstacle) => routeHitsRect(points, obstacle.rect))) {
      return undefined
    }
    return waypointsOf(points)
  }

  return { route }
}

export function routeEdge(
  nodes: readonly Node[],
  edge: Edge,
  options?: RouterOptions,
): Point[] | undefined {
  return createRouter(nodes, options).route(edge)
}

export function routeEdges(
  nodes: readonly Node[],
  edges: readonly Edge[],
  options?: RouterOptions,
): Edge[] {
  const router = createRouter(nodes, options)
  return edges.map((edge) => {
    if (edge.type !== 'orthogonal') {
      return edge
    }
    const waypoints = router.route(edge)
    const { waypoints: _previous, ...data } = edge.data
    if (waypoints && waypoints.length > 0) {
      return { ...edge, data: { ...data, waypoints } }
    }
    return { ...edge, data }
  })
}
