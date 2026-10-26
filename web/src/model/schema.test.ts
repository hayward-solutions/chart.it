import { describe, expect, it } from 'vitest'
import { CONTAINER_KINDS, getContainerKind } from './containers'
import { DocumentMigrationError, isDocumentMigrationError, migrateDocument } from './migrate'
import { DocumentSchema, EdgeSchema, NodeSchema, createEmptyDocument } from './schema'
import { SHAPES } from './shapes'

const node = {
  id: 'n1',
  type: 'icon',
  position: { x: 10, y: 20 },
  size: { width: 64, height: 64 },
  zIndex: 1,
  data: { label: 'EC2', icon: { pack: 'aws', id: 'ec2' }, style: { fill: '#fff' } },
}

const edge = {
  id: 'e1',
  source: 'n1',
  target: 'n2',
  sourceHandle: 'right',
  targetHandle: 'left',
  type: 'orthogonal',
  zIndex: 0,
  data: { markerStart: 'none', markerEnd: 'arrow', style: {} },
}

describe('createEmptyDocument', () => {
  it('produces a valid schema v1 document', () => {
    const doc = createEmptyDocument('Untitled')
    expect(doc.schemaVersion).toBe(1)
    expect(doc.title).toBe('Untitled')
    expect(doc.nodes).toEqual([])
    expect(doc.edges).toEqual([])
    expect(DocumentSchema.parse(doc)).toEqual(doc)
  })
})

describe('schema', () => {
  it('accepts a full node and edge', () => {
    expect(NodeSchema.parse(node)).toEqual(node)
    expect(EdgeSchema.parse(edge)).toEqual(edge)
  })

  it('rejects unknown node types and shapes', () => {
    expect(NodeSchema.safeParse({ ...node, type: 'blob' }).success).toBe(false)
    expect(NodeSchema.safeParse({ ...node, data: { ...node.data, shape: 'star' } }).success).toBe(
      false,
    )
  })

  it('rejects out-of-range edge label position and bad handles', () => {
    expect(
      EdgeSchema.safeParse({ ...edge, data: { ...edge.data, labelPosition: 1.5 } }).success,
    ).toBe(false)
    expect(EdgeSchema.safeParse({ ...edge, sourceHandle: 'middle' }).success).toBe(false)
  })

  it('requires schemaVersion literal 1', () => {
    const doc = { ...createEmptyDocument('x'), schemaVersion: 2 }
    expect(DocumentSchema.safeParse(doc).success).toBe(false)
  })
})

describe('migrateDocument', () => {
  it('returns a validated v1 document', () => {
    const input = { ...createEmptyDocument('Hello'), nodes: [node], edges: [edge] }
    const result = migrateDocument(JSON.parse(JSON.stringify(input)))
    expect(result).toEqual(input)
  })

  it('throws a typed error for non-objects', () => {
    expect(() => migrateDocument('nope')).toThrow(DocumentMigrationError)
    expect(() => migrateDocument(null)).toThrow(DocumentMigrationError)
  })

  it('throws for a missing or unsupported version', () => {
    try {
      migrateDocument({ title: 'x' })
      expect.unreachable()
    } catch (error) {
      expect(isDocumentMigrationError(error) && error.code).toBe('missingVersion')
    }
    try {
      migrateDocument({ ...createEmptyDocument('x'), schemaVersion: 99 })
      expect.unreachable()
    } catch (error) {
      expect(isDocumentMigrationError(error) && error.code).toBe('unsupportedVersion')
    }
  })

  it('throws with issues for invalid v1 content', () => {
    try {
      migrateDocument({ ...createEmptyDocument('x'), nodes: [{ id: 1 }] })
      expect.unreachable()
    } catch (error) {
      expect(isDocumentMigrationError(error)).toBe(true)
      if (isDocumentMigrationError(error)) {
        expect(error.code).toBe('invalid')
        expect(error.issues.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('container kinds and shapes', () => {
  it('lists every kind from the contract', () => {
    expect(Object.keys(CONTAINER_KINDS)).toHaveLength(22)
    expect(CONTAINER_KINDS['aws.vpc']).toMatchObject({
      border: 'solid',
      colour: '#8C4FFF',
      title: 'top-left',
    })
    expect(CONTAINER_KINDS['aws.autoScaling']?.title).toBe('top-centre')
    expect(CONTAINER_KINDS['aws.subnet.public']?.fill).toBe('#E9F3E6')
    expect(CONTAINER_KINDS['aws.region']?.border).toBe('dashed')
  })

  it('falls back to generic for unknown kinds', () => {
    expect(getContainerKind('nope').kind).toBe('generic')
    expect(getContainerKind(undefined).kind).toBe('generic')
  })

  it('exposes the nine shapes', () => {
    expect(SHAPES.map((s) => s.kind)).toEqual([
      'rect',
      'roundedRect',
      'ellipse',
      'diamond',
      'cylinder',
      'hexagon',
      'parallelogram',
      'cloud',
      'note',
    ])
  })
})
