import type { Edge } from '@/model'
import { createFlowEdgeAdapter, fromFlowEdge, toFlowEdge } from './adapters'

function routed(): Edge {
  return {
    id: 'e1',
    source: 'a',
    target: 'b',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    type: 'orthogonal',
    zIndex: 4,
    data: {
      label: 'HTTPS',
      labelPosition: 0.3,
      markerStart: 'diamond',
      markerEnd: 'openArrow',
      waypoints: [
        { x: 120, y: 80 },
        { x: 120, y: 240 },
      ],
      style: { stroke: '#ff0000', strokeWidth: 3, labelBackground: '#ffffff' },
    },
  }
}

describe('edge adapters', () => {
  it('round-trips waypoints and labelPosition', () => {
    const edge = routed()
    const flow = toFlowEdge(edge, true, false)
    expect(flow.data?.waypoints).toEqual(edge.data.waypoints)
    expect(flow.data?.labelPosition).toBe(0.3)
    expect(fromFlowEdge(flow)).toEqual(edge)
  })

  it('round-trips every handle side, marker kind and edge type', () => {
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      for (const type of ['orthogonal', 'straight', 'bezier'] as const) {
        const edge = { ...routed(), sourceHandle: side, targetHandle: side, type }
        expect(fromFlowEdge(toFlowEdge(edge, false, false))).toEqual(edge)
      }
    }
  })

  it('makes edges reconnectable unless the editor is read only', () => {
    expect(toFlowEdge(routed(), false, false).reconnectable).toBe(true)
    expect(toFlowEdge(routed(), false, true).reconnectable).toBe(false)
  })

  it('carries the z-index through for stacking above nodes', () => {
    expect(toFlowEdge(routed(), false, false).zIndex).toBe(4)
  })

  it('reuses flow edges until the source edge, selection or mode changes', () => {
    const adapt = createFlowEdgeAdapter()
    const edge = routed()
    const first = adapt([edge], new Set(), false)[0]
    expect(adapt([edge], new Set(), false)[0]).toBe(first)
    const next = { ...edge, data: { ...edge.data, waypoints: [{ x: 1, y: 1 }] } }
    const second = adapt([next], new Set(), false)[0]
    expect(second).not.toBe(first)
    expect(second?.data?.waypoints).toEqual([{ x: 1, y: 1 }])
    expect(adapt([next], new Set(['e1']), false)[0]?.selected).toBe(true)
  })
})
