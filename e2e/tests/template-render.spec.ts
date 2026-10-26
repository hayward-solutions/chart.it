import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { api, canvas, expect, flowEdges, flowNodes, openNewDiagram, test, uniqueTitle } from '../fixtures'

test.describe.configure({ mode: 'parallel' })

const here = path.dirname(fileURLToPath(import.meta.url))
const templatesDir = path.resolve(here, '..', '..', 'templates')

const TEMPLATES = [
  { key: 'aws-three-tier', title: 'AWS three-tier web app', file: 'aws-three-tier.json' },
  { key: 'aws-eks', title: 'AWS EKS cluster', file: 'aws-eks.json' },
  { key: 'azure-hub-spoke', title: 'Azure hub and spoke network', file: 'azure-hub-spoke.json' },
  { key: 'gcp-gke', title: 'GCP GKE cluster', file: 'gcp-gke.json' },
  { key: 'k8s-namespace', title: 'Kubernetes namespace', file: 'k8s-namespace.json' },
]

function expected(file: string) {
  const parsed = JSON.parse(fs.readFileSync(path.join(templatesDir, file), 'utf8')) as {
    nodes: { id: string; type: string }[]
    edges: unknown[]
  }
  return { nodes: parsed.nodes.length, edges: parsed.edges.length, icons: parsed.nodes.filter((node) => node.type === 'icon').length }
}

test.describe('starter templates', () => {
  test('the templates endpoint lists all five', async ({ loggedInPage: page }) => {
    const response = await page.request.get('/api/v1/templates')
    expect(response.ok()).toBe(true)
    const list = (await response.json()) as { key: string; title: string }[]
    expect(list.map((entry) => entry.key).sort()).toEqual(TEMPLATES.map((entry) => entry.key).sort())
  })

  for (const template of TEMPLATES) {
    test(`${template.title} renders every node and edge without console errors`, async ({ loggedInPage: page }) => {
      const counts = expected(template.file)
      expect(counts.nodes).toBeGreaterThan(5)

      const id = await openNewDiagram(page, uniqueTitle(template.key), template.key)
      await expect(flowNodes(page)).toHaveCount(counts.nodes)
      await expect(flowEdges(page)).toHaveCount(counts.edges)

      const stored = await api(page).get(id)
      expect(stored.templateKey).toBe(template.key)
      expect(stored.content.nodes).toHaveLength(counts.nodes)
      expect(stored.content.edges).toHaveLength(counts.edges)

      const icons = canvas(page).locator('.react-flow__node-icon img')
      await expect(icons).toHaveCount(counts.icons)
      await expect
        .poll(async () =>
          icons.evaluateAll((images) =>
            images.filter((image) => !(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth === 0).length,
          ),
        )
        .toBe(0)

      await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0)
    })
  }
})
