import { createEmptyDocument } from '@/model'
import {
  createFlowEdgeAdapter,
  createFlowNodeAdapter,
  fromFlowEdge,
  fromFlowNode,
  orderParentsFirst,
  toFlowEdge,
  toFlowNode,
} from './adapters'
import { buildSampleDocument } from './sample'

describe('adapters', () => {
  it('round-trips every sample node and edge exactly', () => {
    const doc = buildSampleDocument()
    for (const node of doc.nodes) {
      expect(fromFlowNode(toFlowNode(node, false, false))).toEqual(node)
    }
    for (const edge of doc.edges) {
      expect(fromFlowEdge(toFlowEdge(edge, false, false))).toEqual(edge)
    }
  })

  it('round-trips locked nodes', () => {
    const [first] = buildSampleDocument().nodes
    const locked = { ...first!, locked: true }
    const flow = toFlowNode(locked, true, false)
    expect(flow.draggable).toBe(false)
    expect(flow.selectable).toBe(true)
    expect(fromFlowNode(flow)).toEqual(locked)
  })

  it('maps parenting, sizes and z-index without clamping to the parent', () => {
    const doc = buildSampleDocument()
    const child = doc.nodes.find((node) => node.id === 'alb')!
    const flow = toFlowNode(child, false, false)
    expect(flow.parentId).toBe('subnet-public')
    expect(flow.extent).toBeUndefined()
    expect(flow.position).toEqual(child.position)
    expect(flow.width).toBe(64)
    expect(flow.height).toBe(64)
    expect(flow.zIndex).toBe(child.zIndex)
  })

  it('makes everything non-interactive when read only', () => {
    const doc = buildSampleDocument()
    const flow = toFlowNode(doc.nodes[0]!, false, true)
    expect(flow.draggable).toBe(false)
    expect(flow.selectable).toBe(false)
    expect(flow.connectable).toBe(false)
    const edge = toFlowEdge(doc.edges[0]!, false, true)
    expect(edge.selectable).toBe(false)
  })

  it('lets text nodes size their own height', () => {
    const text = buildSampleDocument().nodes.find((node) => node.type === 'text')!
    const flow = toFlowNode(text, false, false)
    expect(flow.height).toBeUndefined()
    expect(flow.initialHeight).toBe(text.size.height)
  })

  it('orders parents before children', () => {
    const doc = buildSampleDocument()
    const shuffled = [...doc.nodes].reverse()
    const ordered = orderParentsFirst(shuffled)
    const seen = new Set<string>()
    for (const node of ordered) {
      if (node.parentId) {
        expect(seen.has(node.parentId)).toBe(true)
      }
      seen.add(node.id)
    }
    expect(ordered).toHaveLength(doc.nodes.length)
  })

  it('reuses flow node objects for unchanged nodes', () => {
    const adapt = createFlowNodeAdapter()
    const doc = buildSampleDocument()
    const first = adapt(doc.nodes, new Set(), false)
    const changed = doc.nodes.map((node, index) =>
      index === 0 ? { ...node, position: { x: 1, y: 1 } } : node,
    )
    const second = adapt(changed, new Set(), false)
    expect(second[0]).not.toBe(first[0])
    expect(second.slice(1).every((flow, index) => flow === first[index + 1])).toBe(true)
    const selected = adapt(changed, new Set([changed[1]!.id]), false)
    expect(selected[1]!.selected).toBe(true)
    expect(selected[2]).toBe(second[2])
  })

  it('reuses flow edge objects for unchanged edges', () => {
    const adapt = createFlowEdgeAdapter()
    const doc = buildSampleDocument()
    const first = adapt(doc.edges, new Set(), false)
    const second = adapt(doc.edges, new Set(), false)
    expect(second.every((flow, index) => flow === first[index])).toBe(true)
    expect(adapt([], new Set(), false)).toEqual([])
    expect(createEmptyDocument('x').nodes).toEqual([])
  })
})
