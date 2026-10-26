import { orthogonalRoute, routeHitsRect } from '@/editor/edges/geometry'
import { absoluteRect, indexNodes } from '@/editor/geometry'
import type { Rect } from '@/editor/types'
import type { Edge, HandleSide, Node, Point } from '@/model'
import { createRouter, routeEdge, routeEdges } from './router'

function box(
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 60,
  extra: Partial<Node> = {},
): Node {
  return {
    id,
    type: 'shape',
    position: { x, y },
    size: { width, height },
    zIndex: 1,
    data: { label: id, shape: 'rect', style: {} },
    ...extra,
  }
}

function link(
  id: string,
  source: string,
  target: string,
  sourceHandle: HandleSide = 'right',
  targetHandle: HandleSide = 'left',
  extra: Partial<Edge> = {},
): Edge {
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    type: 'orthogonal',
    zIndex: 0,
    data: { markerStart: 'none', markerEnd: 'arrow', style: {} },
    ...extra,
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

function fullRoute(nodes: Node[], edge: Edge, waypoints: Point[]): Point[] {
  const index = indexNodes(nodes)
  const sourceRect = absoluteRect(index.get(edge.source) as Node, index)
  const targetRect = absoluteRect(index.get(edge.target) as Node, index)
  const side = (rect: Rect, handle: HandleSide): Point => {
    switch (handle) {
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
  return orthogonalRoute({
    source: side(sourceRect, edge.sourceHandle),
    sourceSide: edge.sourceHandle,
    target: side(targetRect, edge.targetHandle),
    targetSide: edge.targetHandle,
    waypoints,
    sourceRect,
    targetRect,
  })
}

describe('routeEdge', () => {
  it('needs no waypoints when nothing is in the way', () => {
    const nodes = [box('a', 0, 0), box('b', 300, 120)]
    expect(routeEdge(nodes, link('e', 'a', 'b'))).toEqual([])
  })

  it('finds a route around a single node', () => {
    const nodes = [box('a', 0, 100), box('b', 400, 100), box('wall', 200, 40, 60, 180)]
    const edge = link('e', 'a', 'b')
    const waypoints = routeEdge(nodes, edge)
    expect(waypoints).toBeDefined()
    expect((waypoints as Point[]).length).toBeGreaterThan(0)
    const route = fullRoute(nodes, edge, waypoints as Point[])
    const wall = nodes[2] as Node
    expect(routeHitsRect(route, inflate(absoluteRect(wall, indexNodes(nodes)), 12))).toBe(false)
    for (let i = 0; i < route.length - 1; i += 1) {
      const a = route[i] as Point
      const b = route[i + 1] as Point
      expect(Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01).toBe(true)
    }
    expect(route[0]).toEqual({ x: 100, y: 130 })
    expect(route[route.length - 1]).toEqual({ x: 400, y: 130 })
  })

  it('prefers few bends when detouring', () => {
    const nodes = [box('a', 0, 100), box('b', 400, 100), box('wall', 200, 40, 60, 180)]
    const waypoints = routeEdge(nodes, link('e', 'a', 'b')) as Point[]
    expect(waypoints.length).toBeLessThanOrEqual(4)
  })

  it('avoids every blocked cell in a field of nodes', () => {
    const nodes: Node[] = [box('a', 0, 0), box('b', 600, 400)]
    for (let col = 0; col < 5; col += 1) {
      for (let row = 0; row < 4; row += 1) {
        nodes.push(box(`o${col}-${row}`, 150 + col * 90, 20 + row * 90, 50, 50))
      }
    }
    const edge = link('e', 'a', 'b', 'bottom', 'top')
    const waypoints = routeEdge(nodes, edge, { gridSize: 10, padding: 8 })
    expect(waypoints).toBeDefined()
    const route = fullRoute(nodes, edge, waypoints as Point[])
    const index = indexNodes(nodes)
    for (const node of nodes.slice(2)) {
      expect(routeHitsRect(route, absoluteRect(node, index))).toBe(false)
    }
  })

  it('returns undefined when the target is boxed in', () => {
    const nodes = [
      box('a', 0, 100),
      box('b', 400, 100),
      box('left', 330, 40, 20, 180),
      box('right', 550, 40, 20, 180),
      box('top', 330, 40, 240, 20),
      box('bottom', 330, 200, 240, 20),
    ]
    expect(routeEdge(nodes, link('e', 'a', 'b'))).toBeUndefined()
  })

  it('does not route self loops or non-orthogonal edges', () => {
    const nodes = [box('a', 0, 0), box('b', 300, 0)]
    expect(routeEdge(nodes, link('e', 'a', 'a'))).toBeUndefined()
    expect(
      routeEdge(nodes, link('e', 'a', 'b', 'right', 'left', { type: 'bezier' })),
    ).toBeUndefined()
    expect(routeEdge(nodes, link('e', 'a', 'missing'))).toBeUndefined()
    expect(routeEdge([], link('e', 'a', 'b'))).toBeUndefined()
  })

  it('resolves absolute positions through parent chains', () => {
    const outer = box('outer', 1000, 1000, 800, 600, {
      type: 'container',
      data: { label: 'outer', containerKind: 'generic', style: {} },
    })
    const inner = box('inner', 40, 40, 700, 500, {
      type: 'container',
      parentId: 'outer',
      data: { label: 'inner', containerKind: 'generic', style: {} },
    })
    const nodes = [
      outer,
      inner,
      box('a', 40, 200, 100, 60, { parentId: 'inner' }),
      box('b', 540, 200, 100, 60, { parentId: 'inner' }),
      box('wall', 280, 120, 60, 220, { parentId: 'inner' }),
    ]
    const edge = link('e', 'a', 'b')
    const waypoints = routeEdge(nodes, edge)
    expect(waypoints).toBeDefined()
    expect((waypoints as Point[]).length).toBeGreaterThan(0)
    const route = fullRoute(nodes, edge, waypoints as Point[])
    expect(route[0]).toEqual({ x: 1000 + 40 + 40 + 100, y: 1000 + 40 + 200 + 30 })
    const wall = absoluteRect(nodes[4] as Node, indexNodes(nodes))
    expect(wall).toEqual({ x: 1320, y: 1160, width: 60, height: 220 })
    expect(routeHitsRect(route, inflate(wall, 12))).toBe(false)
  })

  it('treats containers as free space for their children', () => {
    const nodes = [
      box('c', 0, 0, 600, 300, {
        type: 'container',
        data: { label: 'c', containerKind: 'generic', style: {} },
      }),
      box('a', 40, 100, 100, 60, { parentId: 'c' }),
      box('b', 440, 100, 100, 60, { parentId: 'c' }),
    ]
    expect(routeEdge(nodes, link('e', 'a', 'b'))).toEqual([])
  })
})

describe('routeEdges', () => {
  it('writes waypoints for detoured edges and leaves clear edges unrouted', () => {
    const nodes = [
      box('a', 0, 100),
      box('b', 400, 100),
      box('wall', 200, 40, 60, 180),
      box('c', 0, 400),
      box('d', 400, 400),
    ]
    const stale = link('clear', 'c', 'd', 'right', 'left')
    stale.data = { ...stale.data, waypoints: [{ x: 1, y: 2 }] }
    const edges = [link('blocked', 'a', 'b'), stale]
    const result = routeEdges(nodes, edges)
    expect(result).toHaveLength(2)
    expect(result[0]?.data.waypoints?.length).toBeGreaterThan(0)
    expect(result[1]?.data.waypoints).toBeUndefined()
    expect(result[0]?.id).toBe('blocked')
    expect(edges[1]?.data.waypoints).toEqual([{ x: 1, y: 2 }])
  })

  it('passes non-orthogonal edges through untouched', () => {
    const nodes = [box('a', 0, 0), box('b', 300, 0)]
    const curved = link('e', 'a', 'b', 'right', 'left', { type: 'bezier' })
    expect(routeEdges(nodes, [curved])[0]).toBe(curved)
  })

  it('leaves waypoints undefined when no route exists', () => {
    const nodes = [
      box('a', 0, 100),
      box('b', 400, 100),
      box('left', 330, 40, 20, 180),
      box('right', 550, 40, 20, 180),
      box('top', 330, 40, 240, 20),
      box('bottom', 330, 200, 240, 20),
    ]
    const edge = link('e', 'a', 'b')
    edge.data = { ...edge.data, waypoints: [{ x: 5, y: 5 }] }
    const [result] = routeEdges(nodes, [edge])
    expect(result?.data.waypoints).toBeUndefined()
  })

  it('reuses one router for many edges', () => {
    const nodes = [box('a', 0, 0), box('b', 300, 0), box('c', 150, -40, 40, 140)]
    const router = createRouter(nodes)
    const first = router.route(link('e1', 'a', 'b'))
    const second = router.route(link('e2', 'a', 'b'))
    expect(first).toEqual(second)
  })
})

describe('router performance', () => {
  it('routes 200 nodes and 300 edges in under two seconds', () => {
    const nodes: Node[] = []
    for (let row = 0; row < 10; row += 1) {
      for (let col = 0; col < 20; col += 1) {
        nodes.push(box(`n${row}-${col}`, col * 220, row * 160, 120, 70))
      }
    }
    let seed = 12345
    const next = (limit: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return Math.floor((seed / 4294967296) * limit)
    }
    const sides: HandleSide[] = ['top', 'right', 'bottom', 'left']
    const edges: Edge[] = []
    while (edges.length < 300) {
      const from = next(nodes.length)
      const to = next(nodes.length)
      if (from === to) {
        continue
      }
      edges.push(
        link(
          `e${edges.length}`,
          (nodes[from] as Node).id,
          (nodes[to] as Node).id,
          sides[next(4)] as HandleSide,
          sides[next(4)] as HandleSide,
        ),
      )
    }
    const started = performance.now()
    const routed = routeEdges(nodes, edges)
    const elapsed = performance.now() - started
    expect(routed).toHaveLength(300)
    expect(routed.filter((edge) => (edge.data.waypoints?.length ?? 0) > 0).length).toBeGreaterThan(
      50,
    )
    expect(elapsed).toBeLessThan(2000)
  })
})
