import type { Edge as FlowEdge, Node as FlowNode } from '@xyflow/react'
import type { CSSProperties } from 'react'
import { getContainerKind } from '@/model'
import type { Edge, EdgeData, EdgeType, Node, NodeData, NodeType } from '@/model'

export type FlowNodeData = NodeData & { locked?: boolean }
export type EditorFlowNode = FlowNode<FlowNodeData, NodeType>
export type EditorFlowEdge = FlowEdge<EdgeData, EdgeType>

function hasVisibleFill(node: Node): boolean {
  if (node.type !== 'container') {
    return true
  }
  const fill = node.data.style.fill
  if (fill !== undefined) {
    return fill !== 'none' && fill !== 'transparent'
  }
  return getContainerKind(node.data.containerKind).fill !== undefined
}

export function toFlowNode(node: Node, selected: boolean, readOnly: boolean): EditorFlowNode {
  const style: CSSProperties = {
    width: node.size.width,
    height: node.type === 'text' ? undefined : node.size.height,
  }
  if (node.type === 'container' && !hasVisibleFill(node)) {
    style.pointerEvents = 'none'
  }
  const flow: EditorFlowNode = {
    id: node.id,
    type: node.type,
    position: node.position,
    width: node.size.width,
    zIndex: node.zIndex,
    selected,
    draggable: !readOnly && !node.locked,
    selectable: !readOnly,
    connectable: !readOnly,
    deletable: !readOnly,
    focusable: false,
    style,
    data: node.locked ? { ...node.data, locked: true } : node.data,
  }
  if (node.type === 'text') {
    flow.initialHeight = node.size.height
  } else {
    flow.height = node.size.height
  }
  if (node.parentId) {
    flow.parentId = node.parentId
  }
  return flow
}

export function fromFlowNode(flow: EditorFlowNode): Node {
  const { locked, ...data } = flow.data
  const node: Node = {
    id: flow.id,
    type: flow.type as NodeType,
    position: { x: flow.position.x, y: flow.position.y },
    size: {
      width: flow.width ?? flow.measured?.width ?? 0,
      height: flow.height ?? flow.initialHeight ?? flow.measured?.height ?? 0,
    },
    zIndex: flow.zIndex ?? 0,
    data,
  }
  if (flow.parentId) {
    node.parentId = flow.parentId
  }
  if (locked) {
    node.locked = true
  }
  return node
}

export function orderParentsFirst(nodes: readonly Node[]): Node[] {
  const seen = new Set<string>()
  let ordered = true
  for (const node of nodes) {
    if (node.parentId && !seen.has(node.parentId)) {
      ordered = false
      break
    }
    seen.add(node.id)
  }
  if (ordered) {
    return nodes as Node[]
  }
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const result: Node[] = []
  const placed = new Set<string>()
  const place = (node: Node, depth: number) => {
    if (placed.has(node.id)) {
      return
    }
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    if (parent && depth < 64) {
      place(parent, depth + 1)
    }
    placed.add(node.id)
    result.push(node)
  }
  for (const node of nodes) {
    place(node, 0)
  }
  return result
}

type NodeCacheEntry = { source: Node; selected: boolean; readOnly: boolean; flow: EditorFlowNode }

export function createFlowNodeAdapter() {
  let cache = new Map<string, NodeCacheEntry>()
  return (
    nodes: readonly Node[],
    selected: ReadonlySet<string>,
    readOnly: boolean,
  ): EditorFlowNode[] => {
    const next = new Map<string, NodeCacheEntry>()
    const result = orderParentsFirst(nodes).map((node) => {
      const isSelected = selected.has(node.id)
      const hit = cache.get(node.id)
      if (hit && hit.source === node && hit.selected === isSelected && hit.readOnly === readOnly) {
        next.set(node.id, hit)
        return hit.flow
      }
      const flow = toFlowNode(node, isSelected, readOnly)
      next.set(node.id, { source: node, selected: isSelected, readOnly, flow })
      return flow
    })
    cache = next
    return result
  }
}

export function toFlowEdge(edge: Edge, selected: boolean, readOnly: boolean): EditorFlowEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    type: edge.type,
    zIndex: edge.zIndex,
    selected,
    selectable: !readOnly,
    deletable: !readOnly,
    reconnectable: !readOnly,
    focusable: false,
    data: edge.data,
  }
}

export function fromFlowEdge(flow: EditorFlowEdge): Edge {
  return {
    id: flow.id,
    source: flow.source,
    target: flow.target,
    sourceHandle: (flow.sourceHandle ?? 'right') as Edge['sourceHandle'],
    targetHandle: (flow.targetHandle ?? 'left') as Edge['targetHandle'],
    type: (flow.type ?? 'orthogonal') as EdgeType,
    zIndex: flow.zIndex ?? 0,
    data: flow.data as EdgeData,
  }
}

type EdgeCacheEntry = { source: Edge; selected: boolean; readOnly: boolean; flow: EditorFlowEdge }

export function createFlowEdgeAdapter() {
  let cache = new Map<string, EdgeCacheEntry>()
  return (
    edges: readonly Edge[],
    selected: ReadonlySet<string>,
    readOnly: boolean,
  ): EditorFlowEdge[] => {
    const next = new Map<string, EdgeCacheEntry>()
    const result = edges.map((edge) => {
      const isSelected = selected.has(edge.id)
      const hit = cache.get(edge.id)
      if (hit && hit.source === edge && hit.selected === isSelected && hit.readOnly === readOnly) {
        next.set(edge.id, hit)
        return hit.flow
      }
      const flow = toFlowEdge(edge, isSelected, readOnly)
      next.set(edge.id, { source: edge, selected: isSelected, readOnly, flow })
      return flow
    })
    cache = next
    return result
  }
}
