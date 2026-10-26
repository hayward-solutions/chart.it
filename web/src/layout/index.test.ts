import { describe, expect, it } from 'vitest'
import { makeDocument, makeEdge, makeNode } from '@/export/testing'
import { tidyEdges } from './index'

describe('tidyEdges', () => {
  it('routes an edge around an obstacle with waypoints', async () => {
    const doc = makeDocument(
      [
        makeNode({ id: 'a', type: 'shape', shape: 'rect', x: 0, y: 0, width: 100, height: 60 }),
        makeNode({
          id: 'wall',
          type: 'shape',
          shape: 'rect',
          x: 200,
          y: -80,
          width: 100,
          height: 220,
        }),
        makeNode({ id: 'b', type: 'shape', shape: 'rect', x: 400, y: 0, width: 100, height: 60 }),
      ],
      [makeEdge({ id: 'e', source: 'a', target: 'b' })],
    )
    const tidied = await tidyEdges(doc)
    const waypoints = tidied.edges[0]?.data.waypoints
    expect(waypoints?.length).toBeGreaterThan(0)
    expect(tidied.nodes).toEqual(doc.nodes)
  })

  it('leaves non-orthogonal edges alone', async () => {
    const doc = makeDocument(
      [
        makeNode({ id: 'a', type: 'shape', shape: 'rect', x: 0, y: 0 }),
        makeNode({ id: 'b', type: 'shape', shape: 'rect', x: 300, y: 0 }),
      ],
      [makeEdge({ id: 'e', source: 'a', target: 'b', type: 'bezier' })],
    )
    const tidied = await tidyEdges(doc)
    expect(tidied.edges[0]).toEqual(doc.edges[0])
  })
})
