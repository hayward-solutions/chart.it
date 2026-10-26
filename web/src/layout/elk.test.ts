import { describe, expect, it } from 'vitest'
import { absoluteRect, indexNodes, type Rect } from '@/export/geometry'
import { makeDocument, makeEdge, makeNode } from '@/export/testing'
import type { Document } from '@/model'
import { chooseSides, layoutDocument } from './elk'
import { layoutDocument as fromIndex, tidyEdges } from './index'

function inside(child: Rect, parent: Rect): boolean {
  return (
    child.x >= parent.x &&
    child.y >= parent.y &&
    child.x + child.width <= parent.x + parent.width &&
    child.y + child.height <= parent.y + parent.height
  )
}

function compoundDocument(): Document {
  return makeDocument(
    [
      makeNode({ id: 'user', x: 900, y: 700, label: 'Users' }),
      makeNode({
        id: 'vpc',
        type: 'container',
        containerKind: 'aws.vpc',
        label: 'VPC',
        x: 10,
        y: 10,
        width: 80,
        height: 80,
      }),
      makeNode({ id: 'alb', x: 5, y: 5, parentId: 'vpc', label: 'ALB' }),
      makeNode({
        id: 'sub',
        type: 'container',
        containerKind: 'aws.subnet.private',
        label: 'Private',
        x: 300,
        y: 5,
        width: 40,
        height: 40,
        parentId: 'vpc',
      }),
      makeNode({ id: 'app1', x: 2, y: 2, parentId: 'sub', label: 'App 1' }),
      makeNode({ id: 'app2', x: 2, y: 4, parentId: 'sub', label: 'App 2' }),
      makeNode({ id: 'db', x: 400, y: 400, label: 'Database' }),
    ],
    [
      makeEdge({ id: 'e1', source: 'user', target: 'alb' }),
      makeEdge({ id: 'e2', source: 'alb', target: 'app1' }),
      makeEdge({ id: 'e3', source: 'alb', target: 'app2' }),
      makeEdge({ id: 'e4', source: 'app1', target: 'db' }),
      makeEdge({ id: 'e5', source: 'app2', target: 'db' }),
    ],
  )
}

describe('layoutDocument', () => {
  it('is exported from the index alongside tidyEdges and delegates to the lazy module', async () => {
    const doc = compoundDocument()
    const options = { algorithm: 'layered', direction: 'DOWN' } as const
    expect(await fromIndex(doc, options)).toEqual(await layoutDocument(doc, options))
    const tidied = await tidyEdges(doc)
    expect(tidied.nodes).toBe(doc.nodes)
    expect(tidied.edges).toHaveLength(doc.edges.length)
  })

  it('moves nodes, keeps children inside parents and grows containers', async () => {
    const doc = compoundDocument()
    const before = JSON.stringify(doc)
    const result = await layoutDocument(doc, { algorithm: 'layered', direction: 'DOWN' })
    expect(JSON.stringify(doc)).toBe(before)

    const index = indexNodes(result.nodes)
    for (const node of result.nodes) {
      if (node.parentId) {
        const parent = index.get(node.parentId)
        expect(inside(absoluteRect(node, index), absoluteRect(parent as never, index))).toBe(true)
      }
    }
    const moved = result.nodes.filter((node, i) => {
      const original = doc.nodes[i]
      return (
        original &&
        (node.position.x !== original.position.x || node.position.y !== original.position.y)
      )
    })
    expect(moved.length).toBeGreaterThan(3)
    expect(index.get('vpc')?.size.width).toBeGreaterThan(80)
    expect(index.get('sub')?.size.height).toBeGreaterThan(64)
    expect(result.viewport).toEqual(doc.viewport)
    expect(result.settings).toEqual(doc.settings)
  })

  it('leaves top-level nodes non-overlapping', async () => {
    const result = await layoutDocument(compoundDocument(), { algorithm: 'layered' })
    const index = indexNodes(result.nodes)
    const tops = result.nodes
      .filter((node) => !node.parentId)
      .map((node) => absoluteRect(node, index))
    for (let i = 0; i < tops.length; i += 1) {
      for (let j = i + 1; j < tops.length; j += 1) {
        const a = tops[i] as Rect
        const b = tops[j] as Rect
        const overlap =
          a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
        expect(overlap).toBe(false)
      }
    }
  })

  it('assigns handle sides from the resulting positions', async () => {
    const down = await layoutDocument(compoundDocument(), {
      algorithm: 'layered',
      direction: 'DOWN',
    })
    const e1 = down.edges.find((edge) => edge.id === 'e1')
    expect(e1?.sourceHandle).toBe('bottom')
    expect(e1?.targetHandle).toBe('top')
    const right = await layoutDocument(compoundDocument(), {
      algorithm: 'layered',
      direction: 'RIGHT',
    })
    const index = indexNodes(right.nodes)
    const e5 = right.edges.find((edge) => edge.id === 'e5')
    const source = absoluteRect(index.get('app2') as never, index)
    const target = absoluteRect(index.get('db') as never, index)
    expect(target.x).toBeGreaterThan(source.x)
    expect(e5?.sourceHandle).toBe('right')
    expect(e5?.targetHandle).toBe('left')
  })

  it('clears waypoints for layered and fills them for orthogonal', async () => {
    const seeded = compoundDocument()
    seeded.edges = seeded.edges.map((edge) => ({
      ...edge,
      data: { ...edge.data, waypoints: [{ x: 1, y: 1 }] },
    }))
    const layered = await layoutDocument(seeded, { algorithm: 'layered' })
    expect(layered.edges.every((edge) => edge.data.waypoints === undefined)).toBe(true)

    const orthogonal = await layoutDocument(compoundDocument(), { algorithm: 'orthogonal' })
    const withBends = orthogonal.edges.filter((edge) => (edge.data.waypoints?.length ?? 0) > 0)
    expect(withBends.length).toBeGreaterThan(0)
    for (const edge of withBends) {
      const points = edge.data.waypoints ?? []
      for (const point of points) {
        expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
      }
    }
  })

  it('keeps locked nodes where they are', async () => {
    const doc = compoundDocument()
    doc.nodes = doc.nodes.map((node) => (node.id === 'db' ? { ...node, locked: true } : node))
    const result = await layoutDocument(doc, { algorithm: 'orthogonal' })
    const db = result.nodes.find((node) => node.id === 'db')
    expect(db?.position).toEqual({ x: 400, y: 400 })
    const touching = result.edges.filter((edge) => edge.target === 'db')
    expect(touching.every((edge) => edge.data.waypoints === undefined)).toBe(true)
  })

  it('lays out only the selection and leaves the rest alone', async () => {
    const doc = compoundDocument()
    const result = await layoutDocument(doc, { algorithm: 'layered', onlySelected: ['sub'] })
    const untouched = ['user', 'alb', 'db']
    for (const id of untouched) {
      expect(result.nodes.find((node) => node.id === id)).toEqual(
        doc.nodes.find((node) => node.id === id),
      )
    }
    const vpc = result.nodes.find((node) => node.id === 'vpc')
    expect(vpc?.position).toEqual({ x: 10, y: 10 })
    expect(vpc?.size.width).toBeGreaterThanOrEqual(80)
    const index = indexNodes(result.nodes)
    const sub = absoluteRect(index.get('sub') as never, index)
    const originalIndex = indexNodes(doc.nodes)
    const originalSub = absoluteRect(originalIndex.get('sub') as never, originalIndex)
    expect(sub.x).toBe(originalSub.x)
    expect(sub.y).toBe(originalSub.y)
    const a = absoluteRect(index.get('app1') as never, index)
    const b = absoluteRect(index.get('app2') as never, index)
    expect(inside(a, sub) && inside(b, sub)).toBe(true)
    expect(result.edges.find((edge) => edge.id === 'e1')).toEqual(
      doc.edges.find((edge) => edge.id === 'e1'),
    )
  })

  it('returns the document unchanged when nothing can be laid out', async () => {
    const empty = makeDocument([])
    expect(await layoutDocument(empty, { algorithm: 'layered' })).toBe(empty)
    const doc = compoundDocument()
    expect(await layoutDocument(doc, { algorithm: 'layered', onlySelected: ['nope'] })).toBe(doc)
  })

  it('ignores edges between a container and its own descendants', async () => {
    const doc = compoundDocument()
    doc.edges.push(makeEdge({ id: 'loop', source: 'vpc', target: 'alb' }))
    const result = await layoutDocument(doc, { algorithm: 'orthogonal' })
    expect(result.edges.find((edge) => edge.id === 'loop')?.data.waypoints).toBeUndefined()
  })
})

describe('chooseSides', () => {
  const a = { x: 0, y: 0, width: 64, height: 64 }

  it('prefers the separating axis', () => {
    expect(chooseSides(a, { x: 0, y: 200, width: 64, height: 64 })).toEqual({
      sourceHandle: 'bottom',
      targetHandle: 'top',
    })
    expect(chooseSides(a, { x: 300, y: 10, width: 64, height: 64 })).toEqual({
      sourceHandle: 'right',
      targetHandle: 'left',
    })
    expect(chooseSides({ x: 300, y: 300, width: 64, height: 64 }, a)).toEqual({
      sourceHandle: 'top',
      targetHandle: 'bottom',
    })
  })

  it('uses the layout direction for diagonal neighbours', () => {
    const diagonal = { x: 300, y: 300, width: 64, height: 64 }
    expect(chooseSides(a, diagonal, 'DOWN').sourceHandle).toBe('bottom')
    expect(chooseSides(a, diagonal, 'RIGHT').sourceHandle).toBe('right')
  })

  it('goes backwards when the target is to the left', () => {
    expect(chooseSides({ x: 300, y: 0, width: 64, height: 64 }, a)).toEqual({
      sourceHandle: 'left',
      targetHandle: 'right',
    })
  })
})
