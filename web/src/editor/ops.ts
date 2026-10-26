import type { Document, Edge, Node, NodeStyle, Point } from '@/model'
import { GROUP_PADDING } from './defaults'
import {
  absolutePosition,
  absoluteRect,
  collectSubtree,
  hasAncestorIn,
  indexNodes,
  rectsOverlap,
  topLevelIds,
  unionRect,
} from './geometry'
import { newId } from './ids'
import type {
  AlignKind,
  ClipboardPayload,
  DistributeAxis,
  EdgePatch,
  NodePatch,
  OrderOp,
  Rect,
} from './types'

export function nextZIndex(nodes: readonly Node[]): number {
  let max = 0
  for (const node of nodes) {
    max = Math.max(max, node.zIndex)
  }
  return max + 1
}

export function normalizeZ(nodes: readonly Node[]): Node[] {
  const order = nodes.map((node, index) => ({ node, index }))
  order.sort((a, b) => a.node.zIndex - b.node.zIndex || a.index - b.index)
  const assigned = new Map<string, number>()
  order.forEach((entry, rank) => {
    assigned.set(entry.node.id, rank + 1)
  })
  let changed = false
  const result = nodes.map((node) => {
    const z = assigned.get(node.id) as number
    if (z === node.zIndex) {
      return node
    }
    changed = true
    return { ...node, zIndex: z }
  })
  return changed ? result : (nodes as Node[])
}

function mergeDefined<T extends object>(base: T, patch: Partial<T> | undefined): T {
  if (!patch) {
    return base
  }
  const next = { ...base } as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete next[key]
    } else {
      next[key] = value
    }
  }
  return next as T
}

export function patchNode(node: Node, patch: NodePatch): Node {
  const { data, locked, ...rest } = patch
  let next: Node = { ...node }
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) {
      ;(next as Record<string, unknown>)[key] = value
    }
  }
  if ('locked' in patch) {
    if (locked) {
      next.locked = true
    } else {
      const { locked: _locked, ...without } = next
      next = without
    }
  }
  if (data) {
    const { style, ...dataRest } = data
    let nextData = mergeDefined(node.data, dataRest as Partial<Node['data']>)
    if (dataRest.label === undefined && 'label' in dataRest) {
      nextData = { ...nextData, label: node.data.label }
    }
    if (style) {
      nextData = { ...nextData, style: mergeDefined<NodeStyle>(node.data.style, style) }
    }
    next.data = nextData
  }
  return next
}

export function patchEdge(edge: Edge, patch: EdgePatch): Edge {
  const { data, ...rest } = patch
  const next: Edge = { ...edge }
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) {
      ;(next as Record<string, unknown>)[key] = value
    }
  }
  if (data) {
    const { style, ...dataRest } = data
    let nextData = mergeDefined(edge.data, dataRest as Partial<Edge['data']>)
    if (dataRest.markerStart === undefined) {
      nextData = { ...nextData, markerStart: edge.data.markerStart }
    }
    if (dataRest.markerEnd === undefined) {
      nextData = { ...nextData, markerEnd: edge.data.markerEnd }
    }
    if (style) {
      nextData = { ...nextData, style: mergeDefined(edge.data.style, style) }
    }
    next.data = nextData
  }
  return next
}

export function removeNodesFrom(document: Document, ids: readonly string[]): Document {
  const doomed = collectSubtree(document.nodes, ids)
  const existing = document.nodes.some((node) => doomed.has(node.id))
  if (!existing) {
    return document
  }
  return {
    ...document,
    nodes: document.nodes.filter((node) => !doomed.has(node.id)),
    edges: document.edges.filter((edge) => !doomed.has(edge.source) && !doomed.has(edge.target)),
  }
}

export function reparentNode(nodes: Node[], id: string, parentId: string | undefined): Node[] {
  const index = indexNodes(nodes)
  const node = index.get(id)
  if (!node || node.parentId === parentId) {
    return nodes
  }
  let parentOrigin: Point = { x: 0, y: 0 }
  if (parentId) {
    const parent = index.get(parentId)
    if (!parent || parent.type !== 'container' || collectSubtree(nodes, [id]).has(parentId)) {
      return nodes
    }
    parentOrigin = absolutePosition(parent, index)
  }
  const absolute = absolutePosition(node, index)
  const position = { x: absolute.x - parentOrigin.x, y: absolute.y - parentOrigin.y }
  return nodes.map((candidate) => {
    if (candidate.id !== id) {
      return candidate
    }
    const { parentId: _previous, ...rest } = candidate
    return parentId ? { ...rest, parentId, position } : { ...rest, position }
  })
}

function movable(nodes: readonly Node[], ids: readonly string[]): Node[] {
  const index = indexNodes(nodes)
  return topLevelIds(nodes, ids)
    .map((id) => index.get(id) as Node)
    .filter((node) => !node.locked)
}

export function alignNodes(nodes: Node[], ids: readonly string[], kind: AlignKind): Node[] {
  const targets = movable(nodes, ids)
  if (targets.length < 2) {
    return nodes
  }
  const index = indexNodes(nodes)
  const rects = new Map<string, Rect>(targets.map((node) => [node.id, absoluteRect(node, index)]))
  const bounds = unionRect([...rects.values()]) as Rect
  const deltas = new Map<string, Point>()
  for (const [id, rect] of rects) {
    let dx = 0
    let dy = 0
    switch (kind) {
      case 'left':
        dx = bounds.x - rect.x
        break
      case 'right':
        dx = bounds.x + bounds.width - (rect.x + rect.width)
        break
      case 'centerX':
        dx = bounds.x + bounds.width / 2 - (rect.x + rect.width / 2)
        break
      case 'top':
        dy = bounds.y - rect.y
        break
      case 'bottom':
        dy = bounds.y + bounds.height - (rect.y + rect.height)
        break
      case 'centerY':
        dy = bounds.y + bounds.height / 2 - (rect.y + rect.height / 2)
        break
    }
    if (dx !== 0 || dy !== 0) {
      deltas.set(id, { x: dx, y: dy })
    }
  }
  return applyDeltas(nodes, deltas)
}

export function distributeNodes(
  nodes: Node[],
  ids: readonly string[],
  axis: DistributeAxis,
): Node[] {
  const targets = movable(nodes, ids)
  if (targets.length < 3) {
    return nodes
  }
  const index = indexNodes(nodes)
  const entries = targets
    .map((node) => ({ id: node.id, rect: absoluteRect(node, index) }))
    .sort((a, b) => (axis === 'x' ? a.rect.x - b.rect.x : a.rect.y - b.rect.y))
  const size = (rect: Rect) => (axis === 'x' ? rect.width : rect.height)
  const start = (rect: Rect) => (axis === 'x' ? rect.x : rect.y)
  const first = entries[0] as (typeof entries)[number]
  const last = entries[entries.length - 1] as (typeof entries)[number]
  const span = start(last.rect) + size(last.rect) - start(first.rect)
  const total = entries.reduce((sum, entry) => sum + size(entry.rect), 0)
  const gap = (span - total) / (entries.length - 1)
  const deltas = new Map<string, Point>()
  let cursor = start(first.rect)
  for (const entry of entries) {
    const shift = cursor - start(entry.rect)
    if (shift !== 0) {
      deltas.set(entry.id, axis === 'x' ? { x: shift, y: 0 } : { x: 0, y: shift })
    }
    cursor += size(entry.rect) + gap
  }
  return applyDeltas(nodes, deltas)
}

export function applyDeltas(nodes: Node[], deltas: ReadonlyMap<string, Point>): Node[] {
  if (deltas.size === 0) {
    return nodes
  }
  return nodes.map((node) => {
    const delta = deltas.get(node.id)
    if (!delta) {
      return node
    }
    return { ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y } }
  })
}

export function reorderNodes(nodes: Node[], ids: readonly string[], op: OrderOp): Node[] {
  const base = normalizeZ(nodes)
  const index = indexNodes(base)
  const selected = new Set(ids.filter((id) => index.has(id)))
  if (selected.size === 0) {
    return nodes
  }
  const groups = new Map<string, Node[]>()
  for (const node of base) {
    const key = node.parentId ?? ''
    const list = groups.get(key)
    if (list) {
      list.push(node)
    } else {
      groups.set(key, [node])
    }
  }
  const assigned = new Map<string, number>()
  for (const group of groups.values()) {
    if (!group.some((node) => selected.has(node.id))) {
      continue
    }
    const sorted = [...group].sort((a, b) => a.zIndex - b.zIndex)
    const pool = sorted.map((node) => node.zIndex)
    const order = reorderGroup(sorted, selected, op, index)
    order.forEach((node, position) => {
      assigned.set(node.id, pool[position] as number)
    })
  }
  let changed = base !== nodes
  const result = base.map((node) => {
    const z = assigned.get(node.id)
    if (z === undefined || z === node.zIndex) {
      return node
    }
    changed = true
    return { ...node, zIndex: z }
  })
  return changed ? result : nodes
}

function reorderGroup(
  sorted: Node[],
  selected: ReadonlySet<string>,
  op: OrderOp,
  index: ReadonlyMap<string, Node>,
): Node[] {
  if (op === 'front') {
    return [
      ...sorted.filter((n) => !selected.has(n.id)),
      ...sorted.filter((n) => selected.has(n.id)),
    ]
  }
  if (op === 'back') {
    return [
      ...sorted.filter((n) => selected.has(n.id)),
      ...sorted.filter((n) => !selected.has(n.id)),
    ]
  }
  const order = [...sorted]
  const overlaps = (a: Node, b: Node) =>
    rectsOverlap(absoluteRect(a, index), absoluteRect(b, index))
  if (op === 'forward') {
    for (let i = order.length - 2; i >= 0; i -= 1) {
      const current = order[i] as Node
      if (!selected.has(current.id)) {
        continue
      }
      for (let j = i + 1; j < order.length; j += 1) {
        const other = order[j] as Node
        if (selected.has(other.id)) {
          continue
        }
        if (overlaps(current, other)) {
          order.splice(i, 1)
          order.splice(j, 0, current)
          break
        }
      }
    }
    return order
  }
  for (let i = 1; i < order.length; i += 1) {
    const current = order[i] as Node
    if (!selected.has(current.id)) {
      continue
    }
    for (let j = i - 1; j >= 0; j -= 1) {
      const other = order[j] as Node
      if (selected.has(other.id)) {
        continue
      }
      if (overlaps(current, other)) {
        order.splice(i, 1)
        order.splice(j, 0, current)
        break
      }
    }
  }
  return order
}

export function buildClipboard(
  document: Document,
  ids: readonly string[],
): ClipboardPayload | null {
  const subtree = collectSubtree(document.nodes, ids)
  const index = indexNodes(document.nodes)
  const nodes: Node[] = []
  const rootParents: Record<string, string> = {}
  for (const node of document.nodes) {
    if (!subtree.has(node.id)) {
      continue
    }
    if (node.parentId && subtree.has(node.parentId)) {
      nodes.push(node)
    } else {
      if (node.parentId) {
        rootParents[node.id] = node.parentId
      }
      const { parentId: _parent, ...rest } = node
      nodes.push({ ...rest, position: absolutePosition(node, index) })
    }
  }
  if (nodes.length === 0) {
    return null
  }
  const edges = document.edges.filter(
    (edge) => subtree.has(edge.source) && subtree.has(edge.target),
  )
  return { nodes, edges, rootParents }
}

export type Instantiated = { nodes: Node[]; edges: Edge[]; rootIds: string[] }

export function instantiateClipboard(
  document: Document,
  payload: ClipboardPayload,
  offset: Point,
): Instantiated {
  const index = indexNodes(document.nodes)
  const idMap = new Map<string, string>()
  for (const node of payload.nodes) {
    idMap.set(node.id, newId('n'))
  }
  const ordered = payload.nodes
    .map((node, position) => ({ node, position }))
    .sort((a, b) => a.node.zIndex - b.node.zIndex || a.position - b.position)
  let z = nextZIndex(document.nodes) - 1
  const created = new Map<string, Node>()
  const rootIds: string[] = []
  for (const { node } of ordered) {
    z += 1
    const id = idMap.get(node.id) as string
    const isRoot = !node.parentId || !idMap.has(node.parentId)
    if (!isRoot) {
      created.set(id, {
        ...node,
        id,
        parentId: idMap.get(node.parentId as string) as string,
        zIndex: z,
      })
      continue
    }
    rootIds.push(id)
    const { parentId: _stale, ...rest } = node
    const originalParent = payload.rootParents[node.id] ?? node.parentId
    const parent = originalParent ? index.get(originalParent) : undefined
    if (parent && parent.type === 'container') {
      const origin = absolutePosition(parent, index)
      created.set(id, {
        ...rest,
        id,
        parentId: parent.id,
        position: {
          x: node.position.x + offset.x - origin.x,
          y: node.position.y + offset.y - origin.y,
        },
        zIndex: z,
      })
    } else {
      created.set(id, {
        ...rest,
        id,
        position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
        zIndex: z,
      })
    }
  }
  const nodes = payload.nodes.map((node) => created.get(idMap.get(node.id) as string) as Node)
  const edges = payload.edges
    .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
    .map((edge) => ({
      ...edge,
      id: newId('e'),
      source: idMap.get(edge.source) as string,
      target: idMap.get(edge.target) as string,
    }))
  return { nodes, edges, rootIds }
}

export function groupNodes(
  document: Document,
  ids: readonly string[],
): { document: Document; groupId: string } | null {
  const index = indexNodes(document.nodes)
  const tops = topLevelIds(document.nodes, ids).map((id) => index.get(id) as Node)
  if (tops.length === 0) {
    return null
  }
  const bounds = unionRect(tops.map((node) => absoluteRect(node, index))) as Rect
  const origin = { x: bounds.x - GROUP_PADDING, y: bounds.y - GROUP_PADDING }
  const parents = new Set(tops.map((node) => node.parentId ?? ''))
  const commonParent = parents.size === 1 ? (tops[0] as Node).parentId : undefined
  const parentNode = commonParent ? index.get(commonParent) : undefined
  const parentOrigin = parentNode ? absolutePosition(parentNode, index) : { x: 0, y: 0 }
  const groupId = newId('n')
  const minZ = Math.min(...tops.map((node) => node.zIndex))
  const group: Node = {
    id: groupId,
    type: 'container',
    position: { x: origin.x - parentOrigin.x, y: origin.y - parentOrigin.y },
    size: { width: bounds.width + GROUP_PADDING * 2, height: bounds.height + GROUP_PADDING * 2 },
    zIndex: minZ - 0.5,
    data: { label: '', containerKind: 'generic', style: {} },
    ...(parentNode ? { parentId: parentNode.id } : {}),
  }
  const topSet = new Set(tops.map((node) => node.id))
  const nodes: Node[] = []
  let inserted = false
  for (const node of document.nodes) {
    if (!inserted && topSet.has(node.id)) {
      nodes.push(group)
      inserted = true
    }
    if (topSet.has(node.id)) {
      const absolute = absolutePosition(node, index)
      nodes.push({
        ...node,
        parentId: groupId,
        position: { x: absolute.x - origin.x, y: absolute.y - origin.y },
      })
    } else {
      nodes.push(node)
    }
  }
  return { document: { ...document, nodes: normalizeZ(nodes) }, groupId }
}

export function ungroupNodes(
  document: Document,
  ids: readonly string[],
): { document: Document; released: string[] } | null {
  const index = indexNodes(document.nodes)
  const groups = ids.map((id) => index.get(id)).filter((n): n is Node => n?.type === 'container')
  if (groups.length === 0) {
    return null
  }
  const groupIds = new Set(groups.map((group) => group.id))
  const released: string[] = []
  const nodes: Node[] = []
  for (const node of document.nodes) {
    if (groupIds.has(node.id)) {
      continue
    }
    if (node.parentId && groupIds.has(node.parentId)) {
      let newParent = index.get(node.parentId)?.parentId
      while (newParent && groupIds.has(newParent)) {
        newParent = index.get(newParent)?.parentId
      }
      const absolute = absolutePosition(node, index)
      const parentNode = newParent ? index.get(newParent) : undefined
      const origin = parentNode ? absolutePosition(parentNode, index) : { x: 0, y: 0 }
      const { parentId: _gone, ...rest } = node
      nodes.push({
        ...rest,
        ...(parentNode ? { parentId: parentNode.id } : {}),
        position: { x: absolute.x - origin.x, y: absolute.y - origin.y },
      })
      released.push(node.id)
    } else {
      nodes.push(node)
    }
  }
  const edges = document.edges.filter(
    (edge) => !groupIds.has(edge.source) && !groupIds.has(edge.target),
  )
  return { document: { ...document, nodes, edges }, released }
}

export function ancestorsInSelection(nodes: readonly Node[], ids: readonly string[]): Set<string> {
  const index = indexNodes(nodes)
  const set = new Set(ids)
  const result = new Set<string>()
  for (const id of ids) {
    const node = index.get(id)
    if (node && hasAncestorIn(node, set, index)) {
      result.add(id)
    }
  }
  return result
}
