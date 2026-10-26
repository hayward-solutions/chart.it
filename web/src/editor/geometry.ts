import type { Node, Point } from '@/model'
import type { Rect } from './types'

export function indexNodes(nodes: readonly Node[]): Map<string, Node> {
  const index = new Map<string, Node>()
  for (const node of nodes) {
    index.set(node.id, node)
  }
  return index
}

export function absolutePosition(node: Node, index: ReadonlyMap<string, Node>): Point {
  let x = node.position.x
  let y = node.position.y
  let current = node.parentId ? index.get(node.parentId) : undefined
  let guard = 0
  while (current && guard < 64) {
    x += current.position.x
    y += current.position.y
    current = current.parentId ? index.get(current.parentId) : undefined
    guard += 1
  }
  return { x, y }
}

export function absoluteRect(node: Node, index: ReadonlyMap<string, Node>): Rect {
  const position = absolutePosition(node, index)
  return { x: position.x, y: position.y, width: node.size.width, height: node.size.height }
}

export function nodeDepth(node: Node, index: ReadonlyMap<string, Node>): number {
  let depth = 0
  let current = node.parentId ? index.get(node.parentId) : undefined
  while (current && depth < 64) {
    depth += 1
    current = current.parentId ? index.get(current.parentId) : undefined
  }
  return depth
}

export function childrenByParent(nodes: readonly Node[]): Map<string, Node[]> {
  const map = new Map<string, Node[]>()
  for (const node of nodes) {
    if (node.parentId) {
      const list = map.get(node.parentId)
      if (list) {
        list.push(node)
      } else {
        map.set(node.parentId, [node])
      }
    }
  }
  return map
}

export function collectSubtree(nodes: readonly Node[], ids: Iterable<string>): Set<string> {
  const children = childrenByParent(nodes)
  const result = new Set<string>()
  const stack = [...ids]
  while (stack.length > 0) {
    const id = stack.pop() as string
    if (result.has(id)) {
      continue
    }
    result.add(id)
    for (const child of children.get(id) ?? []) {
      stack.push(child.id)
    }
  }
  return result
}

export function hasAncestorIn(
  node: Node,
  ids: ReadonlySet<string>,
  index: ReadonlyMap<string, Node>,
): boolean {
  let current = node.parentId ? index.get(node.parentId) : undefined
  let guard = 0
  while (current && guard < 64) {
    if (ids.has(current.id)) {
      return true
    }
    current = current.parentId ? index.get(current.parentId) : undefined
    guard += 1
  }
  return false
}

export function topLevelIds(nodes: readonly Node[], ids: readonly string[]): string[] {
  const index = indexNodes(nodes)
  const set = new Set(ids)
  return ids.filter((id) => {
    const node = index.get(id)
    return node !== undefined && !hasAncestorIn(node, set, index)
  })
}

export function unionRect(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) {
    return null
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const rect of rects) {
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.width)
    maxY = Math.max(maxY, rect.y + rect.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

export function rectContains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export function findContainerAt(
  nodes: readonly Node[],
  index: ReadonlyMap<string, Node>,
  point: Point,
  exclude: ReadonlySet<string>,
): Node | null {
  let best: Node | null = null
  let bestDepth = -1
  for (const node of nodes) {
    if (node.type !== 'container' || exclude.has(node.id)) {
      continue
    }
    if (!rectContains(absoluteRect(node, index), point)) {
      continue
    }
    const depth = nodeDepth(node, index)
    if (depth > bestDepth || (depth === bestDepth && best !== null && node.zIndex > best.zIndex)) {
      best = node
      bestDepth = depth
    }
  }
  return best
}
