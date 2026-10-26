import { createEmptyDocument, type Document, type Node } from '@/model'
import { buildSampleDocument } from './sample'
import { createEditorStore, type EditorStore } from './store'

function box(
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 50,
  extra: Partial<Node> = {},
): Node {
  return {
    id,
    type: 'shape',
    position: { x, y },
    size: { width, height },
    zIndex: 0,
    data: { label: id, shape: 'rect', style: {} },
    ...extra,
  }
}

function docWith(nodes: Node[], edges: Document['edges'] = []): Document {
  const doc = createEmptyDocument('test')
  doc.nodes = nodes.map((node, index) => ({
    ...node,
    zIndex: node.zIndex || index + 1,
  }))
  doc.edges = edges
  return doc
}

function setup(nodes: Node[], edges: Document['edges'] = []) {
  const changes: Document[] = []
  const store = createEditorStore({
    document: docWith(nodes, edges),
    onChange: (doc) => changes.push(doc),
  })
  return { store, changes }
}

function node(store: EditorStore, id: string): Node {
  const found = store.getState().document.nodes.find((n) => n.id === id)
  if (!found) {
    throw new Error(`missing node ${id}`)
  }
  return found
}

function select(store: EditorStore, ...ids: string[]) {
  store.getState().setSelection({ nodes: ids, edges: [] })
}

describe('addNode', () => {
  it('materialises defaults, assigns the next z-index and selects the node', () => {
    const { store, changes } = setup([box('a', 0, 0)])
    const id = store.getState().addNode({
      type: 'icon',
      position: { x: 10, y: 20 },
      data: { label: 'EC2', icon: { pack: 'aws', id: 'ec2' }, style: {} },
    })
    expect(id).not.toBeNull()
    const created = node(store, id as string)
    expect(created.size).toEqual({ width: 64, height: 64 })
    expect(created.zIndex).toBe(2)
    expect(store.getState().selection.nodes).toEqual([id])
    expect(changes).toHaveLength(1)
  })

  it('parents an absolute node into the deepest container under its centre', () => {
    const outer = box('outer', 100, 100, 400, 400, { type: 'container' })
    const inner = box('inner', 50, 50, 200, 200, { type: 'container', parentId: 'outer' })
    const { store } = setup([outer, inner])
    const id = store.getState().addNode(
      {
        type: 'shape',
        position: { x: 200, y: 200 },
        size: { width: 40, height: 40 },
        data: { label: '', shape: 'rect', style: {} },
      },
      { absolute: true },
    ) as string
    const created = node(store, id)
    expect(created.parentId).toBe('inner')
    expect(created.position).toEqual({ x: 50, y: 50 })
  })

  it('does nothing when read only', () => {
    const changes: Document[] = []
    const store = createEditorStore({
      document: docWith([]),
      readOnly: true,
      onChange: (doc) => changes.push(doc),
    })
    expect(store.getState().addNode({ type: 'text' })).toBeNull()
    expect(changes).toHaveLength(0)
  })
})

describe('updateNodes', () => {
  it('merges style, removes undefined keys and keeps the label when unset', () => {
    const { store } = setup([
      box('a', 0, 0, 100, 50, {
        data: { label: 'A', shape: 'rect', style: { fill: '#fff', stroke: '#000' } },
      }),
    ])
    store.getState().updateNodes(['a'], { data: { style: { fill: undefined, strokeWidth: 3 } } })
    const updated = node(store, 'a')
    expect(updated.data.style).toEqual({ stroke: '#000', strokeWidth: 3 })
    expect(updated.data.label).toBe('A')
  })

  it('does not emit when nothing changes', () => {
    const { store, changes } = setup([box('a', 0, 0)])
    store.getState().updateNodes(['a'], { data: { label: 'a' } })
    expect(changes).toHaveLength(0)
  })
})

describe('removeNodes', () => {
  it('removes descendants and attached edges and prunes selection', () => {
    const { store } = setup(
      [
        box('c', 0, 0, 300, 300, { type: 'container' }),
        box('k', 10, 10, 50, 50, { parentId: 'c' }),
        box('o', 400, 0),
      ],
      [
        {
          id: 'e1',
          source: 'k',
          target: 'o',
          sourceHandle: 'right',
          targetHandle: 'left',
          type: 'straight',
          zIndex: 0,
          data: { markerStart: 'none', markerEnd: 'arrow', style: {} },
        },
      ],
    )
    select(store, 'c', 'o')
    store.getState().removeNodes(['c'])
    const state = store.getState()
    expect(state.document.nodes.map((n) => n.id)).toEqual(['o'])
    expect(state.document.edges).toHaveLength(0)
    expect(state.selection.nodes).toEqual(['o'])
  })

  it('removeSelection skips locked nodes and removes selected edges', () => {
    const { store } = setup(
      [box('a', 0, 0, 100, 50, { locked: true }), box('b', 200, 0)],
      [
        {
          id: 'e1',
          source: 'a',
          target: 'b',
          sourceHandle: 'right',
          targetHandle: 'left',
          type: 'straight',
          zIndex: 0,
          data: { markerStart: 'none', markerEnd: 'none', style: {} },
        },
      ],
    )
    store.getState().setSelection({ nodes: ['a', 'b'], edges: ['e1'] })
    store.getState().removeSelection()
    expect(store.getState().document.nodes.map((n) => n.id)).toEqual(['a'])
    expect(store.getState().document.edges).toHaveLength(0)
  })
})

describe('moveNodes', () => {
  it('moves unlocked top-level nodes only', () => {
    const { store } = setup([
      box('c', 0, 0, 300, 300, { type: 'container' }),
      box('k', 10, 10, 50, 50, { parentId: 'c' }),
      box('l', 400, 0, 100, 50, { locked: true }),
    ])
    store.getState().moveNodes(['c', 'k', 'l'], { x: 5, y: -5 })
    expect(node(store, 'c').position).toEqual({ x: 5, y: -5 })
    expect(node(store, 'k').position).toEqual({ x: 10, y: 10 })
    expect(node(store, 'l').position).toEqual({ x: 400, y: 0 })
  })
})

describe('setParent', () => {
  it('keeps the absolute position when entering and leaving a container', () => {
    const { store } = setup([
      box('c', 100, 100, 300, 300, { type: 'container' }),
      box('a', 150, 170),
    ])
    store.getState().setParent('a', 'c')
    expect(node(store, 'a').parentId).toBe('c')
    expect(node(store, 'a').position).toEqual({ x: 50, y: 70 })
    store.getState().setParent('a', null)
    expect(node(store, 'a').parentId).toBeUndefined()
    expect(node(store, 'a').position).toEqual({ x: 150, y: 170 })
  })

  it('converts through nested parents', () => {
    const { store } = setup([
      box('outer', 100, 100, 500, 500, { type: 'container' }),
      box('inner', 50, 60, 300, 300, { type: 'container', parentId: 'outer' }),
      box('a', 400, 400),
    ])
    store.getState().setParent('a', 'inner')
    expect(node(store, 'a').position).toEqual({ x: 250, y: 240 })
  })

  it('refuses to create a cycle or to parent into a non-container', () => {
    const { store } = setup([
      box('outer', 0, 0, 500, 500, { type: 'container' }),
      box('inner', 10, 10, 100, 100, { type: 'container', parentId: 'outer' }),
      box('s', 600, 0),
    ])
    store.getState().setParent('outer', 'inner')
    expect(node(store, 'outer').parentId).toBeUndefined()
    store.getState().setParent('inner', 's')
    expect(node(store, 'inner').parentId).toBe('outer')
  })
})

describe('finishDrag', () => {
  it('re-parents by node centre and un-parents when dropped outside', () => {
    const { store } = setup([
      box('c', 0, 0, 300, 300, { type: 'container' }),
      box('a', 400, 400, 40, 40),
    ])
    store.getState().moveNodes(['a'], { x: -300, y: -300 })
    store.getState().finishDrag(['a'])
    expect(node(store, 'a').parentId).toBe('c')
    expect(node(store, 'a').position).toEqual({ x: 100, y: 100 })
    store.getState().moveNodes(['a'], { x: 500, y: 0 })
    store.getState().finishDrag(['a'])
    expect(node(store, 'a').parentId).toBeUndefined()
    expect(node(store, 'a').position).toEqual({ x: 600, y: 100 })
  })

  it('never drops a container into its own descendant', () => {
    const { store } = setup([
      box('outer', 0, 0, 300, 300, { type: 'container' }),
      box('inner', 50, 50, 200, 200, { type: 'container', parentId: 'outer' }),
    ])
    store.getState().finishDrag(['outer'])
    expect(node(store, 'outer').parentId).toBeUndefined()
  })
})

describe('align and distribute', () => {
  const nodes = () => [
    box('a', 0, 0, 100, 40),
    box('b', 150, 30, 60, 80),
    box('c', 300, 200, 20, 20),
  ]

  it.each([
    ['left', { a: 0, b: 0, c: 0 }, 'x'],
    ['right', { a: 220, b: 260, c: 300 }, 'x'],
    ['centerX', { a: 110, b: 130, c: 150 }, 'x'],
    ['top', { a: 0, b: 0, c: 0 }, 'y'],
    ['bottom', { a: 180, b: 140, c: 200 }, 'y'],
    ['centerY', { a: 90, b: 70, c: 100 }, 'y'],
  ] as const)('align %s', (kind, expected, axis) => {
    const { store } = setup(nodes())
    select(store, 'a', 'b', 'c')
    store.getState().align(kind)
    for (const [id, value] of Object.entries(expected)) {
      expect(node(store, id).position[axis]).toBe(value)
    }
  })

  it('needs two unlocked nodes to align', () => {
    const { store, changes } = setup([box('a', 0, 0), box('b', 50, 50, 100, 50, { locked: true })])
    select(store, 'a', 'b')
    store.getState().align('left')
    expect(changes).toHaveLength(0)
  })

  it('distributes with equal gaps and fixed outer nodes', () => {
    const { store } = setup([
      box('a', 0, 0, 100, 40),
      box('b', 130, 0, 60, 40),
      box('c', 400, 0, 100, 40),
    ])
    select(store, 'c', 'a', 'b')
    store.getState().distribute('x')
    expect(node(store, 'a').position.x).toBe(0)
    expect(node(store, 'b').position.x).toBe(220)
    expect(node(store, 'c').position.x).toBe(400)
  })

  it('distributes vertically and ignores fewer than three nodes', () => {
    const { store, changes } = setup([
      box('a', 0, 0, 40, 40),
      box('b', 0, 10, 40, 40),
      box('c', 0, 200, 40, 40),
    ])
    select(store, 'a', 'b')
    store.getState().distribute('y')
    expect(changes).toHaveLength(0)
    select(store, 'a', 'b', 'c')
    store.getState().distribute('y')
    expect(node(store, 'b').position.y).toBe(100)
  })
})

describe('z-order', () => {
  const stack = () => [box('a', 0, 0), box('b', 10, 10), box('c', 20, 20), box('far', 900, 900)]
  const order = (store: EditorStore) =>
    [...store.getState().document.nodes].sort((x, y) => x.zIndex - y.zIndex).map((n) => n.id)

  it('brings forward past the next overlapping node only', () => {
    const { store } = setup(stack())
    select(store, 'a')
    store.getState().bringForward()
    expect(order(store)).toEqual(['b', 'a', 'c', 'far'])
  })

  it('skips non-overlapping siblings when moving forward', () => {
    const { store } = setup([box('a', 0, 0), box('far', 900, 900), box('b', 10, 10)])
    select(store, 'a')
    store.getState().bringForward()
    expect(order(store)).toEqual(['far', 'b', 'a'])
  })

  it('sends backward, to front and to back', () => {
    const { store } = setup(stack())
    select(store, 'c')
    store.getState().sendBackward()
    expect(order(store)).toEqual(['a', 'c', 'b', 'far'])
    select(store, 'a', 'b')
    store.getState().toFront()
    expect(order(store)).toEqual(['c', 'far', 'a', 'b'])
    select(store, 'far')
    store.getState().toBack()
    expect(order(store)).toEqual(['far', 'c', 'a', 'b'])
  })

  it('normalises z-indexes to consecutive integers', () => {
    const { store } = setup([
      box('a', 0, 0, 100, 50, { zIndex: 10 }),
      box('b', 0, 0, 100, 50, { zIndex: 40 }),
      box('c', 0, 0, 100, 50, { zIndex: 40 }),
    ])
    select(store, 'a')
    store.getState().toFront()
    const zs = store
      .getState()
      .document.nodes.map((n) => n.zIndex)
      .sort((x, y) => x - y)
    expect(zs).toEqual([1, 2, 3])
    expect(order(store)).toEqual(['b', 'c', 'a'])
  })

  it('reorders only within the same parent', () => {
    const { store } = setup([
      box('c', 0, 0, 400, 400, { type: 'container' }),
      box('k1', 10, 10, 50, 50, { parentId: 'c' }),
      box('k2', 20, 20, 50, 50, { parentId: 'c' }),
      box('top', 0, 0, 40, 40),
    ])
    select(store, 'k1')
    store.getState().toFront()
    const z = (id: string) => node(store, id).zIndex
    expect(z('k1')).toBeGreaterThan(z('k2'))
    expect(z('top')).toBeGreaterThan(z('c'))
  })
})

describe('history', () => {
  it('collapses a paused batch into one undo step and one onChange', () => {
    const { store, changes } = setup([box('a', 0, 0)])
    store.getState().pauseHistory()
    for (let i = 1; i <= 10; i += 1) {
      store.getState().setNodeGeometry([{ id: 'a', position: { x: i * 5, y: i } }])
    }
    expect(changes).toHaveLength(0)
    store.getState().resumeHistory()
    expect(changes).toHaveLength(1)
    expect(store.temporal.getState().pastStates).toHaveLength(1)
    expect(node(store, 'a').position).toEqual({ x: 50, y: 10 })
    store.getState().undo()
    expect(node(store, 'a').position).toEqual({ x: 0, y: 0 })
    expect(changes).toHaveLength(2)
    store.getState().redo()
    expect(node(store, 'a').position).toEqual({ x: 50, y: 10 })
  })

  it('records each unbatched action separately and caps history at 100', () => {
    const { store } = setup([box('a', 0, 0)])
    for (let i = 1; i <= 120; i += 1) {
      store.getState().moveNodes(['a'], { x: 1, y: 0 })
    }
    expect(store.temporal.getState().pastStates).toHaveLength(100)
    store.getState().undo()
    expect(node(store, 'a').position.x).toBe(119)
  })

  it('does not record selection, tool or viewport changes and keeps the viewport on undo', () => {
    const { store } = setup([box('a', 0, 0)])
    store.getState().setSelection({ nodes: ['a'] })
    store.getState().setTool('pan')
    store.getState().setViewport({ x: 40, y: 50, zoom: 2 })
    expect(store.temporal.getState().pastStates).toHaveLength(0)
    store.getState().moveNodes(['a'], { x: 10, y: 0 })
    store.getState().setViewport({ x: 90, y: 90, zoom: 1.5 })
    store.getState().undo()
    expect(node(store, 'a').position.x).toBe(0)
    expect(store.getState().document.viewport).toEqual({ x: 90, y: 90, zoom: 1.5 })
  })

  it('clears the redo stack after a new change and prunes selection after undo', () => {
    const { store } = setup([box('a', 0, 0)])
    const id = store.getState().addNode({ type: 'text' }) as string
    expect(store.getState().selection.nodes).toEqual([id])
    store.getState().undo()
    expect(store.getState().selection.nodes).toEqual([])
    expect(store.temporal.getState().futureStates).toHaveLength(1)
    store.getState().moveNodes(['a'], { x: 1, y: 1 })
    expect(store.temporal.getState().futureStates).toHaveLength(0)
  })

  it('replaceDocument clears history and can stay silent', () => {
    const { store, changes } = setup([box('a', 0, 0)])
    store.getState().moveNodes(['a'], { x: 1, y: 1 })
    expect(changes).toHaveLength(1)
    store.getState().replaceDocument(docWith([box('z', 0, 0)]), { silent: true })
    expect(changes).toHaveLength(1)
    expect(store.temporal.getState().pastStates).toHaveLength(0)
    expect(store.getState().document.nodes.map((n) => n.id)).toEqual(['z'])
  })
})

describe('copy, paste and duplicate', () => {
  it('pastes with an explicit offset and a fresh id', () => {
    const { store } = setup([box('a', 100, 100)])
    select(store, 'a')
    store.getState().copy()
    const ids = store.getState().paste({ x: 20, y: 30 })
    expect(ids).toHaveLength(1)
    expect(ids[0]).not.toBe('a')
    expect(node(store, ids[0] as string).position).toEqual({ x: 120, y: 130 })
    expect(store.getState().selection.nodes).toEqual(ids)
  })

  it('cascades the default offset on repeated pastes', () => {
    const { store } = setup([box('a', 0, 0)])
    select(store, 'a')
    store.getState().copy()
    const first = store.getState().paste() as string[]
    const second = store.getState().paste() as string[]
    expect(node(store, first[0] as string).position).toEqual({ x: 16, y: 16 })
    expect(node(store, second[0] as string).position).toEqual({ x: 32, y: 32 })
  })

  it('copies containers with children, remaps parents and edges', () => {
    const { store } = setup(
      [
        box('c', 100, 100, 300, 300, { type: 'container' }),
        box('k1', 10, 10, 50, 50, { parentId: 'c' }),
        box('k2', 100, 10, 50, 50, { parentId: 'c' }),
      ],
      [
        {
          id: 'e',
          source: 'k1',
          target: 'k2',
          sourceHandle: 'right',
          targetHandle: 'left',
          type: 'straight',
          zIndex: 0,
          data: { markerStart: 'none', markerEnd: 'arrow', style: {} },
        },
      ],
    )
    select(store, 'c')
    store.getState().copy()
    const roots = store.getState().paste({ x: 500, y: 0 }) as string[]
    const state = store.getState()
    expect(state.document.nodes).toHaveLength(6)
    const copy = node(store, roots[0] as string)
    expect(copy.position).toEqual({ x: 600, y: 100 })
    const kids = state.document.nodes.filter((n) => n.parentId === copy.id)
    expect(kids.map((k) => k.position)).toEqual([
      { x: 10, y: 10 },
      { x: 100, y: 10 },
    ])
    const newEdge = state.document.edges.find((e) => e.id !== 'e')
    expect(newEdge?.source).toBe(kids[0]?.id)
    expect(newEdge?.target).toBe(kids[1]?.id)
  })

  it('keeps pasted nodes inside their original parent', () => {
    const { store } = setup([
      box('c', 100, 100, 300, 300, { type: 'container' }),
      box('k', 20, 30, 50, 50, { parentId: 'c' }),
    ])
    select(store, 'k')
    store.getState().copy()
    const [id] = store.getState().paste({ x: 10, y: 10 }) as string[]
    const pasted = node(store, id as string)
    expect(pasted.parentId).toBe('c')
    expect(pasted.position).toEqual({ x: 30, y: 40 })
  })

  it('duplicates in place offset by 16 and leaves the clipboard alone', () => {
    const { store } = setup([box('a', 0, 0)])
    select(store, 'a')
    const [id] = store.getState().duplicateSelection() as string[]
    expect(node(store, id as string).position).toEqual({ x: 16, y: 16 })
    expect(store.getState().clipboard).toBeNull()
  })

  it('cut removes the selection and keeps it on the clipboard', () => {
    const { store } = setup([box('a', 0, 0), box('b', 200, 0)])
    select(store, 'a')
    store.getState().cut()
    expect(store.getState().document.nodes.map((n) => n.id)).toEqual(['b'])
    expect(store.getState().clipboard?.nodes).toHaveLength(1)
  })
})

describe('group and ungroup', () => {
  it('wraps the selection in a generic container sized to the padded bounds', () => {
    const { store } = setup([
      box('a', 100, 100, 100, 50),
      box('b', 300, 220, 60, 80),
      box('x', 900, 900),
    ])
    select(store, 'a', 'b')
    const groupId = store.getState().group() as string
    const group = node(store, groupId)
    expect(group.type).toBe('container')
    expect(group.data.containerKind).toBe('generic')
    expect(group.position).toEqual({ x: 76, y: 76 })
    expect(group.size).toEqual({ width: 260 + 48, height: 200 + 48 })
    expect(node(store, 'a').parentId).toBe(groupId)
    expect(node(store, 'a').position).toEqual({ x: 24, y: 24 })
    expect(node(store, 'b').position).toEqual({ x: 224, y: 144 })
    expect(group.zIndex).toBeLessThan(node(store, 'a').zIndex)
    expect(store.getState().selection.nodes).toEqual([groupId])
  })

  it('groups inside a shared parent using relative coordinates', () => {
    const { store } = setup([
      box('c', 100, 100, 600, 600, { type: 'container' }),
      box('a', 50, 50, 100, 50, { parentId: 'c' }),
      box('b', 200, 50, 100, 50, { parentId: 'c' }),
    ])
    select(store, 'a', 'b')
    const groupId = store.getState().group() as string
    const group = node(store, groupId)
    expect(group.parentId).toBe('c')
    expect(group.position).toEqual({ x: 26, y: 26 })
  })

  it('ungroup releases children to the group parent at the same absolute position', () => {
    const { store } = setup([box('a', 100, 100, 100, 50), box('b', 300, 220, 60, 80)])
    select(store, 'a', 'b')
    const groupId = store.getState().group() as string
    select(store, groupId)
    const released = store.getState().ungroup()
    expect(released.sort()).toEqual(['a', 'b'])
    expect(
      store
        .getState()
        .document.nodes.map((n) => n.id)
        .sort(),
    ).toEqual(['a', 'b'])
    expect(node(store, 'a').parentId).toBeUndefined()
    expect(node(store, 'a').position).toEqual({ x: 100, y: 100 })
    expect(node(store, 'b').position).toEqual({ x: 300, y: 220 })
    expect(store.getState().selection.nodes.sort()).toEqual(['a', 'b'])
  })
})

describe('edges', () => {
  it('adds, updates and removes edges', () => {
    const { store } = setup([box('a', 0, 0), box('b', 200, 0)])
    const id = store.getState().addEdge({ source: 'a', target: 'b' }) as string
    const added = store.getState().document.edges[0]
    expect(added?.type).toBe('orthogonal')
    expect(added?.data.markerEnd).toBe('arrow')
    store
      .getState()
      .updateEdge(id, { type: 'bezier', data: { label: 'x', style: { stroke: '#f00' } } })
    expect(store.getState().document.edges[0]?.type).toBe('bezier')
    expect(store.getState().document.edges[0]?.data.label).toBe('x')
    store.getState().updateEdges([id], { data: { label: undefined, markerEnd: 'circle' } })
    expect(store.getState().document.edges[0]?.data.label).toBeUndefined()
    expect(store.getState().document.edges[0]?.data.markerEnd).toBe('circle')
    store.getState().removeEdges([id])
    expect(store.getState().document.edges).toHaveLength(0)
  })
})

describe('misc actions', () => {
  it('toggles lock for the selection', () => {
    const { store } = setup([box('a', 0, 0), box('b', 0, 0, 10, 10, { locked: true })])
    select(store, 'a', 'b')
    store.getState().toggleLock()
    expect(node(store, 'a').locked).toBe(true)
    expect(node(store, 'b').locked).toBe(true)
    store.getState().toggleLock()
    expect(node(store, 'a').locked).toBeUndefined()
    expect(node(store, 'b').locked).toBeUndefined()
  })

  it('resizes nodes and updates labels, settings and title', () => {
    const { store, changes } = setup([box('a', 0, 0)])
    store.getState().resizeNode('a', { width: 200, height: 90 }, { x: -10, y: -5 })
    expect(node(store, 'a').size).toEqual({ width: 200, height: 90 })
    expect(node(store, 'a').position).toEqual({ x: -10, y: -5 })
    store.getState().setNodeLabel('a', 'Renamed', 41.2)
    expect(node(store, 'a').data.label).toBe('Renamed')
    expect(node(store, 'a').size.height).toBe(42)
    store.getState().updateSettings({ grid: 'lines', snap: false })
    store.getState().setTitle('New title')
    const doc = store.getState().document
    expect(doc.settings.grid).toBe('lines')
    expect(doc.settings.snap).toBe(false)
    expect(doc.title).toBe('New title')
    expect(changes).toHaveLength(4)
  })

  it('selectAll and clearSelection', () => {
    const { store } = setup([box('a', 0, 0), box('b', 50, 0)])
    store.getState().selectAll()
    expect(store.getState().selection.nodes).toEqual(['a', 'b'])
    store.getState().clearSelection()
    expect(store.getState().selection).toEqual({ nodes: [], edges: [] })
  })

  it('ignores mutations while read only but still allows replaceDocument', () => {
    const store = createEditorStore({ document: docWith([box('a', 0, 0)]), readOnly: true })
    store.getState().moveNodes(['a'], { x: 5, y: 5 })
    store.getState().setTitle('nope')
    expect(node(store, 'a').position).toEqual({ x: 0, y: 0 })
    store.getState().replaceDocument(docWith([box('z', 1, 1)]))
    expect(store.getState().document.nodes[0]?.id).toBe('z')
  })

  it('works on the sample document', () => {
    const store = createEditorStore({ document: buildSampleDocument() })
    store.getState().selectAll()
    expect(store.getState().selection.nodes).toHaveLength(8)
    store.getState().removeSelection()
    expect(store.getState().document.nodes).toHaveLength(0)
    store.getState().undo()
    expect(store.getState().document.nodes).toHaveLength(8)
  })
})
