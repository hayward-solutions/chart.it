import { describe, expect, it } from 'vitest'
import { CONTAINER_KINDS, DocumentSchema, type Document } from '@/model'
import { createRepoIconLoader, listRepoIconKeys } from './testing'
import { absoluteRect, indexNodes } from './geometry'
import { layoutDocument } from '@/layout'
import { renderDocumentSvg } from './svg'

const fs = await import(['node', 'fs'].join(':'))
const nodeProcess = (
  globalThis as unknown as {
    process: { env: Record<string, string | undefined>; cwd: () => string }
  }
).process
const templatesDir = `${nodeProcess.cwd()}/../templates/`

const byKey = new Map<string, string>(
  (fs.readdirSync(templatesDir) as string[])
    .filter((name) => name.endsWith('.json'))
    .map((name) => [
      name.replace(/\.json$/, ''),
      fs.readFileSync(`${templatesDir}${name}`, 'utf8'),
    ]),
)

const index = JSON.parse(byKey.get('index') as string) as {
  key: string
  title: string
  description: string
  pack: string
}[]

const SCRATCH = nodeProcess.env.CHARTIT_WRITE_SVG

describe('starter templates', () => {
  const iconKeys = listRepoIconKeys()
  const loader = createRepoIconLoader()

  it('lists the five expected templates', () => {
    expect(index.map((entry) => entry.key)).toEqual([
      'aws-three-tier',
      'aws-eks',
      'azure-hub-spoke',
      'gcp-gke',
      'k8s-namespace',
    ])
  })

  describe.each(index.map((entry) => [entry.key, entry] as const))('%s', (key, entry) => {
    const text = byKey.get(key)

    it('is a valid schema v1 document with the indexed title', () => {
      expect(text).toBeDefined()
      const parsed = DocumentSchema.safeParse(JSON.parse(text as string))
      expect(parsed.success).toBe(true)
      expect((parsed.data as Document).title).toBe(entry.title)
    })

    it('is a non-trivial, internally consistent diagram', () => {
      const doc = DocumentSchema.parse(JSON.parse(text as string))
      expect(doc.nodes.length).toBeGreaterThan(12)
      expect(doc.edges.length).toBeGreaterThan(5)
      const ids = new Set(doc.nodes.map((node) => node.id))
      expect(ids.size).toBe(doc.nodes.length)
      expect(new Set(doc.edges.map((edge) => edge.id)).size).toBe(doc.edges.length)
      for (const node of doc.nodes) {
        if (node.parentId) {
          expect(ids.has(node.parentId)).toBe(true)
        }
        if (node.type === 'container') {
          expect(CONTAINER_KINDS[node.data.containerKind ?? '']).toBeDefined()
        }
        if (node.data.icon) {
          expect(iconKeys.has(`${node.data.icon.pack}/${node.data.icon.id}`)).toBe(true)
        }
      }
      for (const edge of doc.edges) {
        expect(ids.has(edge.source)).toBe(true)
        expect(ids.has(edge.target)).toBe(true)
        expect(edge.type).toBe('orthogonal')
      }
    })

    it('survives an automatic layout with valid output', async () => {
      const doc = DocumentSchema.parse(JSON.parse(text as string))
      const laid = await layoutDocument(doc, { algorithm: 'orthogonal', direction: 'RIGHT' })
      expect(DocumentSchema.safeParse(laid).success).toBe(true)
      const nodeIndex = indexNodes(laid.nodes)
      for (const node of laid.nodes) {
        const parent = node.parentId ? nodeIndex.get(node.parentId) : undefined
        if (parent) {
          const child = absoluteRect(node, nodeIndex)
          const box = absoluteRect(parent, nodeIndex)
          expect(child.x).toBeGreaterThanOrEqual(box.x)
          expect(child.y).toBeGreaterThanOrEqual(box.y)
          expect(child.x + child.width).toBeLessThanOrEqual(box.x + box.width)
          expect(child.y + child.height).toBeLessThanOrEqual(box.y + box.height)
        }
      }
    })

    it('renders to a well-formed svg with every icon resolved', async () => {
      const doc = DocumentSchema.parse(JSON.parse(text as string))
      const svg = await renderDocumentSvg(doc, { loadIcon: loader })
      const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
      expect(parsed.querySelector('parsererror')).toBeNull()
      expect(svg).not.toContain('fill="#e5e7eb"')
      for (const node of doc.nodes) {
        expect(svg).toContain(`data-node-id="${node.id}"`)
      }
      for (const edge of doc.edges) {
        expect(svg).toContain(`data-edge-id="${edge.id}"`)
      }
      if (SCRATCH) {
        fs.mkdirSync(SCRATCH, { recursive: true })
        fs.writeFileSync(`${SCRATCH}/${key}.svg`, svg)
      }
    })
  })
})
