import type {
  ELK,
  ElkExtendedEdge,
  ElkNode,
  LayoutOptions as ElkLayoutOptions,
} from 'elkjs/lib/elk-api'
import {
  absolutePosition,
  collectSubtree,
  estimateTextWidth,
  handlePoint,
  iconLabelLayout,
  indexNodes,
  routeThroughWaypoints,
  simplifyPoints,
  unionRects,
  type Rect,
} from '@/export/geometry'
import type { Document, Edge, HandleSide, Node, Point } from '@/model'

export type LayoutOptions = {
  algorithm: 'layered' | 'orthogonal'
  direction?: 'DOWN' | 'RIGHT'
  spacing?: number
  onlySelected?: string[]
}

export const CONTAINER_PADDING = { top: 40, left: 24, bottom: 24, right: 24 }
export const DEFAULT_SPACING = 48

let elkPromise: Promise<ELK> | null = null
let bundledPromise: Promise<ELK> | null = null

async function createBundledElk(): Promise<ELK> {
  const { default: Bundled } = await import('elkjs/lib/elk.bundled.js')
  return new Bundled()
}

function getBundledElk(): Promise<ELK> {
  bundledPromise ??= createBundledElk()
  return bundledPromise
}

async function createWorkerElk(): Promise<ELK> {
  const [{ default: ElkApi }, { default: ElkWorker }] = await Promise.all([
    import('elkjs/lib/elk-api'),
    import('elkjs/lib/elk-worker.min.js?worker'),
  ])
  return new ElkApi({ workerFactory: () => new ElkWorker() })
}

async function getElk(): Promise<ELK> {
  if (!elkPromise) {
    elkPromise = (typeof Worker === 'undefined' ? getBundledElk() : createWorkerElk()).catch(() =>
      getBundledElk(),
    )
  }
  return elkPromise
}

async function runLayout(graph: ElkNode): Promise<ElkNode> {
  const elk = await getElk()
  try {
    return await elk.layout(structuredClone(graph))
  } catch (error) {
    const bundled = await getBundledElk()
    if (bundled === elk) {
      throw error
    }
    elkPromise = Promise.resolve(bundled)
    return bundled.layout(structuredClone(graph))
  }
}

type Box = { width: number; height: number; dx: number; dy: number }

function elkBox(node: Node): Box {
  const base: Box = { width: node.size.width, height: node.size.height, dx: 0, dy: 0 }
  if (node.type !== 'icon') {
    return base
  }
  const label = iconLabelLayout(node, { x: 0, y: 0 })
  if (!label) {
    return base
  }
  const rect = unionRects([
    { x: 0, y: 0, width: node.size.width, height: node.size.height },
    label.box,
  ]) as Rect
  return { width: rect.width, height: rect.height, dx: -rect.x, dy: -rect.y }
}

function containerMinSize(node: Node): { width: number; height: number } {
  const fontSize = node.data.style.fontSize ?? 13
  const title = estimateTextWidth(node.data.label, fontSize, true)
  return {
    width: Math.max(120, Math.ceil(title) + 32 + 8 + 8 + 24),
    height: CONTAINER_PADDING.top + CONTAINER_PADDING.bottom,
  }
}

function ancestorIds(node: Node, index: ReadonlyMap<string, Node>): Set<string> {
  const result = new Set<string>()
  let current = node.parentId ? index.get(node.parentId) : undefined
  while (current && result.size < 64) {
    result.add(current.id)
    current = current.parentId ? index.get(current.parentId) : undefined
  }
  return result
}

function gap(aStart: number, aSize: number, bStart: number, bSize: number): number {
  return Math.max(bStart - (aStart + aSize), aStart - (bStart + bSize))
}

export function chooseSides(
  source: Rect,
  target: Rect,
  direction: 'DOWN' | 'RIGHT' = 'DOWN',
): { sourceHandle: HandleSide; targetHandle: HandleSide } {
  const gapX = gap(source.x, source.width, target.x, target.width)
  const gapY = gap(source.y, source.height, target.y, target.height)
  const dx = target.x + target.width / 2 - (source.x + source.width / 2)
  const dy = target.y + target.height / 2 - (source.y + source.height / 2)
  let vertical: boolean
  if (gapY > 0 && gapX <= 0) {
    vertical = true
  } else if (gapX > 0 && gapY <= 0) {
    vertical = false
  } else if (gapX > 0 && gapY > 0) {
    vertical = direction === 'DOWN'
  } else {
    vertical = Math.abs(dy) >= Math.abs(dx)
  }
  if (vertical) {
    return dy >= 0
      ? { sourceHandle: 'bottom', targetHandle: 'top' }
      : { sourceHandle: 'top', targetHandle: 'bottom' }
  }
  return dx >= 0
    ? { sourceHandle: 'right', targetHandle: 'left' }
    : { sourceHandle: 'left', targetHandle: 'right' }
}

function padding(): string {
  const { top, left, bottom, right } = CONTAINER_PADDING
  return `[top=${top},left=${left},bottom=${bottom},right=${right}]`
}

function rootOptions(options: LayoutOptions): ElkLayoutOptions {
  const spacing = options.spacing ?? DEFAULT_SPACING
  return {
    'elk.algorithm': 'layered',
    'elk.direction': options.direction ?? 'DOWN',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.padding': '[top=0,left=0,bottom=0,right=0]',
    'elk.json.edgeCoords': 'ROOT',
    'elk.spacing.nodeNode': String(spacing),
    'elk.spacing.edgeNode': String(Math.round(spacing / 2)),
    'elk.spacing.edgeEdge': String(Math.round(spacing / 3)),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(Math.round(spacing * 1.5)),
    'elk.layered.spacing.edgeNodeBetweenLayers': String(Math.round(spacing / 2)),
    'elk.layered.spacing.edgeEdgeBetweenLayers': String(Math.round(spacing / 3)),
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  }
}

type Plan = {
  graph: ElkNode
  boxes: Map<string, Box>
  compound: Set<string>
  origin: Point
}

function buildGraph(
  doc: Document,
  scope: ReadonlySet<string>,
  options: LayoutOptions,
): { plan: Plan; edges: Edge[] } {
  const index = indexNodes(doc.nodes)
  const inScope = doc.nodes.filter((node) => scope.has(node.id))
  const children = new Map<string, Node[]>()
  const roots: Node[] = []
  for (const node of inScope) {
    if (node.parentId && scope.has(node.parentId)) {
      const list = children.get(node.parentId)
      if (list) {
        list.push(node)
      } else {
        children.set(node.parentId, [node])
      }
    } else {
      roots.push(node)
    }
  }
  const origin = unionRects(
    roots.map((node) => {
      const position = absolutePosition(node, index)
      return { x: position.x, y: position.y, width: node.size.width, height: node.size.height }
    }),
  ) ?? { x: 0, y: 0, width: 0, height: 0 }
  const boxes = new Map<string, Box>()
  const compound = new Set<string>()

  const build = (node: Node, isRoot: boolean): ElkNode => {
    const kids = children.get(node.id) ?? []
    if (kids.length > 0) {
      compound.add(node.id)
      return {
        id: `n:${node.id}`,
        layoutOptions: { 'elk.padding': padding() },
        children: kids.map((kid) => build(kid, false)),
      }
    }
    const box = elkBox(node)
    boxes.set(node.id, box)
    const elkNode: ElkNode = { id: `n:${node.id}`, width: box.width, height: box.height }
    if (node.locked) {
      const position = isRoot
        ? {
            x: absolutePosition(node, index).x - origin.x,
            y: absolutePosition(node, index).y - origin.y,
          }
        : node.position
      elkNode.x = position.x - box.dx
      elkNode.y = position.y - box.dy
      elkNode.layoutOptions = { 'elk.noLayout': 'true' }
    }
    return elkNode
  }

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: rootOptions(options),
    children: roots.map((node) => build(node, true)),
    edges: [],
  }

  const edges: Edge[] = []
  for (const edge of doc.edges) {
    const source = index.get(edge.source)
    const target = index.get(edge.target)
    if (
      !source ||
      !target ||
      source.id === target.id ||
      !scope.has(source.id) ||
      !scope.has(target.id)
    ) {
      continue
    }
    if (ancestorIds(source, index).has(target.id) || ancestorIds(target, index).has(source.id)) {
      continue
    }
    edges.push(edge)
    ;(graph.edges as ElkExtendedEdge[]).push({
      id: `e:${edge.id}`,
      sources: [`n:${source.id}`],
      targets: [`n:${target.id}`],
    })
  }
  return { plan: { graph, boxes, compound, origin }, edges }
}

type Placed = { x: number; y: number; width: number; height: number }

function collectPlaced(elkNode: ElkNode, result: Map<string, Placed>): void {
  for (const child of elkNode.children ?? []) {
    result.set(child.id.slice(2), {
      x: child.x ?? 0,
      y: child.y ?? 0,
      width: child.width ?? 0,
      height: child.height ?? 0,
    })
    collectPlaced(child, result)
  }
}

function anchorBends(points: Point[], source: Point, target: Point): Point[] {
  const pts = points.map((point) => ({ ...point }))
  const last = pts.length - 1
  if (last < 2) {
    return pts
  }
  const first = pts[0] as Point
  const second = pts[1] as Point
  if (Math.abs(first.x - second.x) < 0.5) {
    first.x = source.x
    second.x = source.x
  } else {
    first.y = source.y
    second.y = source.y
  }
  const end = pts[last] as Point
  const beforeEnd = pts[last - 1] as Point
  if (Math.abs(end.x - beforeEnd.x) < 0.5) {
    end.x = target.x
    beforeEnd.x = target.x
  } else {
    end.y = target.y
    beforeEnd.y = target.y
  }
  return pts
}

function withWaypoints(edge: Edge, waypoints: Point[] | undefined): Edge {
  const data = { ...edge.data }
  delete data.waypoints
  if (waypoints && waypoints.length > 0) {
    data.waypoints = waypoints
  }
  return { ...edge, data }
}

function growToFitChildren(nodes: Node[]): void {
  const byId = new Map(nodes.map((node, i) => [node.id, i]))
  const depth = (node: Node): number => {
    let d = 0
    let current = node.parentId ? nodes[byId.get(node.parentId) ?? -1] : undefined
    while (current && d < 64) {
      d += 1
      current = current.parentId ? nodes[byId.get(current.parentId) ?? -1] : undefined
    }
    return d
  }
  const order = nodes.map((node, i) => ({ i, d: depth(node) })).sort((a, b) => b.d - a.d)
  for (const { i } of order) {
    const node = nodes[i] as Node
    if (!node.parentId) {
      continue
    }
    const parentIndex = byId.get(node.parentId)
    const parent = parentIndex === undefined ? undefined : nodes[parentIndex]
    if (!parent || parentIndex === undefined) {
      continue
    }
    const width = Math.max(
      parent.size.width,
      node.position.x + node.size.width + CONTAINER_PADDING.right,
    )
    const height = Math.max(
      parent.size.height,
      node.position.y + node.size.height + CONTAINER_PADDING.bottom,
    )
    if (width !== parent.size.width || height !== parent.size.height) {
      nodes[parentIndex] = { ...parent, size: { width, height } }
    }
  }
}

export async function layoutDocument(doc: Document, options: LayoutOptions): Promise<Document> {
  const index = indexNodes(doc.nodes)
  const selected = options.onlySelected?.filter((id) => index.has(id)) ?? []
  const scope =
    options.onlySelected && options.onlySelected.length > 0
      ? collectSubtree(doc.nodes, selected)
      : new Set(doc.nodes.map((node) => node.id))
  if (scope.size === 0) {
    return doc
  }
  const direction = options.direction ?? 'DOWN'
  const { plan, edges } = buildGraph(doc, scope, options)
  const laidOut = await runLayout(plan.graph)
  const placed = new Map<string, Placed>()
  collectPlaced(laidOut, placed)

  const nodes = doc.nodes.map((node): Node => {
    const spot = placed.get(node.id)
    if (!scope.has(node.id) || !spot) {
      return node
    }
    const box = plan.boxes.get(node.id)
    const isRoot = !node.parentId || !scope.has(node.parentId)
    let x = spot.x + (box?.dx ?? 0)
    let y = spot.y + (box?.dy ?? 0)
    if (isRoot) {
      const parent = node.parentId ? index.get(node.parentId) : undefined
      const parentOrigin = parent ? absolutePosition(parent, index) : { x: 0, y: 0 }
      x += plan.origin.x - parentOrigin.x
      y += plan.origin.y - parentOrigin.y
    }
    if (node.locked) {
      x = node.position.x
      y = node.position.y
    }
    let size = node.size
    if (plan.compound.has(node.id)) {
      const min = containerMinSize(node)
      size = {
        width: Math.round(Math.max(spot.width, min.width)),
        height: Math.round(Math.max(spot.height, min.height)),
      }
    }
    return { ...node, position: { x: Math.round(x), y: Math.round(y) }, size }
  })

  growToFitChildren(nodes)
  const nextIndex = indexNodes(nodes)
  const rectOf = (id: string): Rect => {
    const node = nextIndex.get(id) as Node
    const position = absolutePosition(node, nextIndex)
    return { x: position.x, y: position.y, width: node.size.width, height: node.size.height }
  }
  const laidEdges = new Map(edges.map((edge) => [edge.id, edge]))
  const routed = new Map<string, ElkExtendedEdge>()
  for (const edge of laidOut.edges ?? []) {
    routed.set(edge.id.slice(2), edge as ElkExtendedEdge)
  }

  const nextEdges = doc.edges.map((edge): Edge => {
    if (!laidEdges.has(edge.id)) {
      const touchesScope = scope.has(edge.source) || scope.has(edge.target)
      return touchesScope ? withWaypoints(edge, undefined) : edge
    }
    const sourceRect = rectOf(edge.source)
    const targetRect = rectOf(edge.target)
    const sides = chooseSides(sourceRect, targetRect, direction)
    const next: Edge = { ...edge, ...sides }
    const section = routed.get(edge.id)?.sections?.[0]
    const locked = nextIndex.get(edge.source)?.locked || nextIndex.get(edge.target)?.locked
    if (options.algorithm !== 'orthogonal' || !section || locked) {
      return withWaypoints(next, undefined)
    }
    const raw: Point[] = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(
      (point) => ({ x: point.x + plan.origin.x, y: point.y + plan.origin.y }),
    )
    if (raw.length <= 2) {
      return withWaypoints(next, undefined)
    }
    const sourcePoint = handlePoint(sourceRect, sides.sourceHandle)
    const targetPoint = handlePoint(targetRect, sides.targetHandle)
    const anchored = anchorBends(raw, sourcePoint, targetPoint)
    const route = routeThroughWaypoints(
      sourcePoint,
      sides.sourceHandle,
      targetPoint,
      sides.targetHandle,
      anchored.slice(1, -1),
    )
    const interior = simplifyPoints(route).slice(1, -1)
    return withWaypoints(
      next,
      interior.map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) })),
    )
  })

  return { ...doc, nodes, edges: nextEdges }
}
