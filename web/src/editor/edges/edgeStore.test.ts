import { createEmptyDocument, type Document, type Edge, type Node } from '@/model'
import type { EditorActions } from '../actions'
import { createCommands } from '../commands'
import { createEditorStore } from '../store'

function box(id: string, x: number, y: number, width = 100, height = 60): Node {
  return {
    id,
    type: 'shape',
    position: { x, y },
    size: { width, height },
    zIndex: 1,
    data: { label: id, shape: 'rect', style: {} },
  }
}

function link(id: string, source: string, target: string, type: Edge['type'] = 'orthogonal'): Edge {
  return {
    id,
    source,
    target,
    sourceHandle: 'right',
    targetHandle: 'left',
    type,
    zIndex: 0,
    data: { markerStart: 'none', markerEnd: 'arrow', style: {} },
  }
}

function setup(nodes: Node[], edges: Edge[]) {
  const doc: Document = { ...createEmptyDocument('test'), nodes, edges }
  const store = createEditorStore({ document: doc })
  const commands = createCommands(store, {} as EditorActions)
  const run = (id: string) => {
    const command = commands.find((candidate) => candidate.id === id)
    if (!command) {
      throw new Error(`missing command ${id}`)
    }
    command.run()
  }
  return { store, commands, run }
}

const walled = () => [box('a', 0, 100), box('b', 400, 100), box('wall', 200, 40, 60, 180)]

describe('edge waypoints in the store', () => {
  it('writes waypoints for several edges as one history entry', () => {
    const { store } = setup(walled(), [link('e1', 'a', 'b'), link('e2', 'b', 'a')])
    store.getState().setEdgeWaypoints([
      { id: 'e1', waypoints: [{ x: 10, y: 10 }] },
      {
        id: 'e2',
        waypoints: [
          { x: 20, y: 20 },
          { x: 20, y: 40 },
        ],
      },
    ])
    const edges = store.getState().document.edges
    expect(edges[0]?.data.waypoints).toEqual([{ x: 10, y: 10 }])
    expect(edges[1]?.data.waypoints).toHaveLength(2)
    expect(store.temporal.getState().pastStates).toHaveLength(1)
    store.getState().undo()
    expect(store.getState().document.edges[0]?.data.waypoints).toBeUndefined()
    expect(store.getState().document.edges[1]?.data.waypoints).toBeUndefined()
    store.getState().redo()
    expect(store.getState().document.edges[0]?.data.waypoints).toEqual([{ x: 10, y: 10 }])
  })

  it('removes the key when waypoints are empty or undefined', () => {
    const { store } = setup(walled(), [link('e1', 'a', 'b')])
    store.getState().setEdgeWaypoints([{ id: 'e1', waypoints: [{ x: 1, y: 1 }] }])
    store.getState().setEdgeWaypoints([{ id: 'e1', waypoints: [] }])
    expect('waypoints' in (store.getState().document.edges[0]?.data ?? {})).toBe(false)
  })

  it('ignores no-op updates', () => {
    const { store } = setup(walled(), [link('e1', 'a', 'b')])
    store.getState().setEdgeWaypoints([{ id: 'e1' }])
    expect(store.temporal.getState().pastStates).toHaveLength(0)
  })

  it('keeps labelPosition and waypoints through updateEdge', () => {
    const { store } = setup(walled(), [link('e1', 'a', 'b')])
    store.getState().updateEdge('e1', { data: { labelPosition: 0.3 } })
    store.getState().updateEdge('e1', { data: { waypoints: [{ x: 5, y: 5 }] } })
    store.getState().updateEdge('e1', { data: { label: 'HTTPS' } })
    const data = store.getState().document.edges[0]?.data
    expect(data?.labelPosition).toBe(0.3)
    expect(data?.waypoints).toEqual([{ x: 5, y: 5 }])
    expect(data?.label).toBe('HTTPS')
    store.getState().updateEdge('e1', { data: { label: undefined } })
    expect(store.getState().document.edges[0]?.data.label).toBeUndefined()
  })

  it('reconnects an endpoint and drops stale waypoints in one step', () => {
    const { store } = setup([...walled(), box('c', 400, 400)], [link('e1', 'a', 'b')])
    store.getState().updateEdge('e1', { data: { waypoints: [{ x: 5, y: 5 }] } })
    store.getState().updateEdge('e1', {
      target: 'c',
      targetHandle: 'top',
      data: { waypoints: undefined },
    })
    const edge = store.getState().document.edges[0]
    expect(edge?.target).toBe('c')
    expect(edge?.targetHandle).toBe('top')
    expect(edge?.data.waypoints).toBeUndefined()
  })
})

describe('edge route commands', () => {
  it('registers reroute and reset commands without default shortcuts', () => {
    const { commands } = setup(walled(), [])
    const reroute = commands.find((command) => command.id === 'edges.reroute')
    const reset = commands.find((command) => command.id === 'edges.resetRoute')
    expect(reroute?.shortcut).toBeUndefined()
    expect(reset?.shortcut).toBeUndefined()
    expect(reroute?.mutates).toBe(true)
  })

  it('reroutes all orthogonal edges when nothing is selected', () => {
    const { store, run } = setup(walled(), [
      link('e1', 'a', 'b'),
      link('curve', 'a', 'b', 'bezier'),
    ])
    run('edges.reroute')
    const [orthogonal, curve] = store.getState().document.edges
    expect(orthogonal?.data.waypoints?.length).toBeGreaterThan(0)
    expect(curve?.data.waypoints).toBeUndefined()
    expect(store.temporal.getState().pastStates).toHaveLength(1)
  })

  it('reroutes only the selected edges', () => {
    const { store, run } = setup(walled(), [link('e1', 'a', 'b'), link('e2', 'a', 'b')])
    store.getState().setSelection({ edges: ['e2'] })
    run('edges.reroute')
    const [first, second] = store.getState().document.edges
    expect(first?.data.waypoints).toBeUndefined()
    expect(second?.data.waypoints?.length).toBeGreaterThan(0)
  })

  it('resets routes for the selection or everything', () => {
    const { store, run } = setup(walled(), [link('e1', 'a', 'b'), link('e2', 'a', 'b')])
    run('edges.reroute')
    store.getState().setSelection({ edges: ['e1'] })
    run('edges.resetRoute')
    let [first, second] = store.getState().document.edges
    expect(first?.data.waypoints).toBeUndefined()
    expect(second?.data.waypoints?.length).toBeGreaterThan(0)
    store.getState().setSelection({ edges: [] })
    run('edges.resetRoute')
    ;[first, second] = store.getState().document.edges
    expect(second?.data.waypoints).toBeUndefined()
  })
})
