import {
  api,
  createFromTemplate,
  docId,
  expect,
  expectSaved,
  flowNodes,
  openMenuItem,
  test,
  uniqueTitle,
  waitForSaved,
  type DocContent,
  type Page,
} from '../fixtures'

test.describe.configure({ mode: 'parallel' })

function positions(doc: DocContent): Record<string, string> {
  return Object.fromEntries(
    doc.nodes.map((node) => [node.id, `${node.position.x},${node.position.y},${node.size.width},${node.size.height},${node.parentId ?? ''}`]),
  )
}

async function runLayout(page: Page, item: string | RegExp) {
  await openMenuItem(page, 'Layout', item)
}

async function shuffle(page: Page, id: string) {
  const client = api(page)
  const current = await client.get(id)
  const content: DocContent = {
    ...current.content,
    nodes: current.content.nodes.map((node, index) =>
      node.parentId ? node : { ...node, position: { x: node.position.x + ((index * 37) % 90), y: node.position.y + ((index * 53) % 70) } },
    ),
  }
  const response = await client.putContent(id, current.version, content)
  expect(response.ok()).toBe(true)
  return content
}

test.describe('layout', () => {
  test('Auto layout rearranges the EKS template and undo restores the original positions', async ({ loggedInPage: page }) => {
    const id = await createFromTemplate(page, 'AWS EKS cluster', uniqueTitle('Layout'))
    const count = await flowNodes(page).count()
    expect(count).toBeGreaterThan(5)
    await waitForSaved(page)

    await shuffle(page, id)
    await page.reload()
    await expect(flowNodes(page)).toHaveCount(count)
    const before = positions(await api(page).content(id))

    await runLayout(page, /Auto layout: Top to bottom/)
    await expectSaved(page, (doc) => {
      const after = positions(doc)
      return Object.keys(before).some((key) => before[key] !== after[key])
    })
    const arranged = positions(await api(page).content(id))
    expect(Object.keys(arranged).sort()).toEqual(Object.keys(before).sort())
    const changed = Object.keys(before).filter((key) => before[key] !== arranged[key])
    expect(changed.length).toBeGreaterThan(1)

    await page.getByRole('toolbar', { name: 'Editor toolbar' }).getByRole('button', { name: 'Undo', exact: true }).click()
    await expectSaved(page, (doc) => {
      const restored = positions(doc)
      return Object.keys(before).every((key) => before[key] === restored[key])
    })
    await page.getByRole('toolbar', { name: 'Editor toolbar' }).getByRole('button', { name: 'Redo', exact: true }).click()
    await expectSaved(page, (doc) => {
      const again = positions(doc)
      return Object.keys(arranged).every((key) => arranged[key] === again[key])
    })
    expect(docId(page)).toBe(id)
  })

  test('layout direction changes the overall shape of the diagram', async ({ loggedInPage: page }) => {
    const id = await createFromTemplate(page, 'AWS three-tier web app', uniqueTitle('Direction'))
    await waitForSaved(page)

    await runLayout(page, /Auto layout: Top to bottom/)
    let vertical = { width: 0, height: 0 }
    await expectSaved(page, (doc) => {
      const roots = doc.nodes.filter((node) => !node.parentId)
      const xs = roots.map((node) => node.position.x + node.size.width)
      const ys = roots.map((node) => node.position.y + node.size.height)
      vertical = { width: Math.max(...xs) - Math.min(...roots.map((node) => node.position.x)), height: Math.max(...ys) - Math.min(...roots.map((node) => node.position.y)) }
      return vertical.width > 0
    })
    await waitForSaved(page)

    await runLayout(page, /Auto layout: Left to right/)
    await expectSaved(page, (doc) => {
      const roots = doc.nodes.filter((node) => !node.parentId)
      const xs = roots.map((node) => node.position.x + node.size.width)
      const ys = roots.map((node) => node.position.y + node.size.height)
      const width = Math.max(...xs) - Math.min(...roots.map((node) => node.position.x))
      const height = Math.max(...ys) - Math.min(...roots.map((node) => node.position.y))
      return Math.abs(width - vertical.width) > 20 || Math.abs(height - vertical.height) > 20
    })
    expect(docId(page)).toBe(id)
  })

  test('Tidy edges and Reset edge routes run without errors', async ({ loggedInPage: page }) => {
    const id = await createFromTemplate(page, 'Kubernetes namespace', uniqueTitle('Tidy'))
    await waitForSaved(page)
    await openMenuItem(page, 'Layout', 'Tidy edges')
    await waitForSaved(page)
    await openMenuItem(page, 'Layout', 'Reset edge routes')
    await expectSaved(page, (doc) => doc.edges.every((edge) => (edge.data.waypoints?.length ?? 0) === 0))
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0)
    expect(docId(page)).toBe(id)
  })
})
