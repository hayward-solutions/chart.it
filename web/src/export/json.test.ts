import { describe, expect, it } from 'vitest'
import { exportDocumentJson, importDocumentJson } from './json'
import { ExportError } from './errors'
import { makeDocument, makeEdge, makeNode } from './testing'

function fileOf(text: string): File {
  return new File([text], 'diagram.json', { type: 'application/json' })
}

describe('json export and import', () => {
  const doc = makeDocument(
    [makeNode({ id: 'a', label: 'A' }), makeNode({ id: 'b', x: 200, label: 'B' })],
    [makeEdge({ id: 'e', source: 'a', target: 'b', label: 'link' })],
    'Round trip',
  )

  it('exports pretty json', async () => {
    const blob = exportDocumentJson(doc)
    expect(blob.type).toBe('application/json')
    const text = await blob.text()
    expect(text).toContain('\n  "schemaVersion": 1')
  })

  it('round trips a document', async () => {
    const text = await exportDocumentJson(doc).text()
    expect(await importDocumentJson(fileOf(text))).toEqual(doc)
  })

  it('rejects text that is not json', async () => {
    await expect(importDocumentJson(fileOf('not json'))).rejects.toMatchObject({
      name: 'ExportError',
      code: 'import',
    })
  })

  it('rejects documents that do not match the schema', async () => {
    await expect(importDocumentJson(fileOf('{"schemaVersion":1}'))).rejects.toBeInstanceOf(
      ExportError,
    )
    await expect(importDocumentJson(fileOf('{"schemaVersion":99}'))).rejects.toBeInstanceOf(
      ExportError,
    )
    await expect(importDocumentJson(fileOf('[]'))).rejects.toBeInstanceOf(ExportError)
  })
})
