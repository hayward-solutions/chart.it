import { describe, expect, it } from 'vitest'
import { createEditorStore } from '@/editor'
import { makeDocument, makeNode } from '@/export/testing'

describe('applyLayout', () => {
  it('applies a layout as one undoable step and keeps the viewport', () => {
    const doc = {
      ...makeDocument([
        makeNode({ id: 'a', type: 'shape', shape: 'rect', x: 0, y: 0 }),
        makeNode({ id: 'b', type: 'shape', shape: 'rect', x: 10, y: 10 }),
      ]),
      viewport: { x: 5, y: 6, zoom: 1.5 },
    }
    const changes: unknown[] = []
    const store = createEditorStore({ document: doc, onChange: (next) => changes.push(next) })
    const arranged = {
      ...doc,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: doc.nodes.map((node, i) => ({ ...node, position: { x: 200 * i, y: 300 } })),
    }

    store.getState().applyLayout(arranged)
    const after = store.getState().document
    expect(after.nodes.map((node) => node.position)).toEqual([
      { x: 0, y: 300 },
      { x: 200, y: 300 },
    ])
    expect(after.viewport).toEqual({ x: 5, y: 6, zoom: 1.5 })
    expect(changes).toHaveLength(1)
    expect(store.temporal.getState().pastStates).toHaveLength(1)

    store.getState().undo()
    expect(store.getState().document.nodes.map((node) => node.position)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ])
    store.getState().redo()
    expect(store.getState().document.nodes[1]?.position).toEqual({ x: 200, y: 300 })
  })

  it('does nothing in read-only mode', () => {
    const doc = makeDocument([makeNode({ id: 'a', type: 'shape', shape: 'rect' })])
    const store = createEditorStore({ document: doc, readOnly: true })
    store.getState().applyLayout({ ...doc, nodes: [] })
    expect(store.getState().document.nodes).toHaveLength(1)
  })
})
