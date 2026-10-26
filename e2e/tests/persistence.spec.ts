import {
  addShapeByKey,
  api,
  docId,
  expect,
  expectSaved,
  flowNodes,
  openNewDiagram,
  saveIndicator,
  savedContent,
  test,
  uniqueTitle,
  waitForSaved,
  type DocContent,
  type DocNode,
} from '../fixtures'

test.describe.configure({ mode: 'parallel' })

function serverNode(id: string): DocNode {
  return {
    id,
    type: 'shape',
    position: { x: 40, y: 40 },
    size: { width: 140, height: 80 },
    zIndex: 1,
    data: { label: 'From elsewhere', shape: 'rect', style: { fill: '#ffffff', stroke: '#374151' } },
  }
}

async function remoteEdit(page: import('@playwright/test').Page, id: string, mutate: (content: DocContent) => DocContent) {
  const client = api(page)
  const current = await client.get(id)
  const response = await client.putContent(id, current.version, mutate(current.content))
  expect(response.ok()).toBe(true)
}

test.describe('persistence', () => {
  test('autosave reports Saved and a reload keeps the content', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Autosave'))
    await expect(saveIndicator(page)).toHaveText('Saved')

    const rect = await addShapeByKey(page, 'r', 260, 220)
    const ellipse = await addShapeByKey(page, 'o', 560, 220)
    await expect(saveIndicator(page)).toHaveAttribute('data-status', /unsaved|saving|saved/)
    await expect(saveIndicator(page)).toHaveText('Saved', { timeout: 15_000 })

    await page.reload()
    await expect(flowNodes(page)).toHaveCount(2)
    await expect(saveIndicator(page)).toHaveText('Saved')
    const content = await savedContent(page)
    expect(content.nodes.map((node) => node.id).sort()).toEqual([rect, ellipse].sort())
  })

  test('the viewport is remembered across reloads', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Viewport'))
    await addShapeByKey(page, 'r', 260, 220)
    await page.getByRole('toolbar', { name: 'Editor toolbar' }).getByRole('button', { name: 'Zoom in' }).click()
    await expectSaved(page, (doc) => doc.viewport.zoom > 1)
    const saved = (await savedContent(page)).viewport.zoom
    await page.reload()
    await expect(flowNodes(page)).toHaveCount(1)
    await expect(page.getByRole('toolbar', { name: 'Editor toolbar' }).getByRole('button', { name: 'Zoom level' })).toHaveText(
      `${Math.round(saved * 100)}%`,
    )
  })

  test('renaming from the toolbar persists and shows on the dashboard', async ({ loggedInPage: page }) => {
    const title = uniqueTitle('Original name')
    const renamed = uniqueTitle('Renamed in editor')
    const id = await openNewDiagram(page, title)
    await page.getByRole('button', { name: /^Diagram title:/ }).click()
    const input = page.getByRole('toolbar', { name: 'Editor toolbar' }).getByRole('textbox', { name: 'Diagram title' })
    await input.fill(renamed)
    await input.press('Enter')
    await expect(page.getByRole('button', { name: `Diagram title: ${renamed}. Click to rename` })).toBeVisible()
    await expect.poll(async () => (await api(page).get(id)).title, { timeout: 15_000 }).toBe(renamed)

    await page.getByRole('link', { name: 'Back to diagrams' }).click()
    await expect(page.getByRole('article', { name: renamed, exact: true })).toBeVisible()
  })

  test('a stale version shows the conflict banner and Reload resolves it', async ({ loggedInPage: page, consoleErrors }) => {
    consoleErrors.allow(/409/)
    const id = await openNewDiagram(page, uniqueTitle('Conflict reload'))
    await addShapeByKey(page, 'r', 260, 220)
    await waitForSaved(page)

    await remoteEdit(page, id, (content) => ({ ...content, nodes: [...content.nodes, serverNode('n_remote_one')] }))

    await addShapeByKey(page, 'o', 560, 220)
    const banner = page.getByRole('alert').filter({ hasText: 'changed elsewhere' })
    await expect(banner).toBeVisible({ timeout: 15_000 })
    await expect(saveIndicator(page)).toHaveAttribute('data-status', 'conflict')

    await banner.getByRole('button', { name: 'Reload' }).click()
    await expect(banner).toBeHidden()
    await expect(saveIndicator(page)).toHaveAttribute('data-status', 'saved')
    await expect(flowNodes(page)).toHaveCount(2)
    await expect(page.locator('.react-flow__node[data-id="n_remote_one"]')).toBeVisible()

    const stored = await api(page).content(id)
    expect(stored.nodes).toHaveLength(2)
  })

  test('Overwrite keeps the local edits and replaces the server copy', async ({ loggedInPage: page, consoleErrors }) => {
    consoleErrors.allow(/409/)
    const id = await openNewDiagram(page, uniqueTitle('Conflict overwrite'))
    const local = await addShapeByKey(page, 'r', 260, 220)
    await waitForSaved(page)

    await remoteEdit(page, id, (content) => ({ ...content, nodes: [...content.nodes, serverNode('n_remote_two')] }))

    const second = await addShapeByKey(page, 'o', 560, 220)
    const banner = page.getByRole('alert').filter({ hasText: 'changed elsewhere' })
    await expect(banner).toBeVisible({ timeout: 15_000 })
    await banner.getByRole('button', { name: 'Overwrite' }).click()
    await expect(banner).toBeHidden()
    await expect(saveIndicator(page)).toHaveAttribute('data-status', 'saved', { timeout: 15_000 })

    await expectSaved(page, (doc) => {
      const ids = doc.nodes.map((node) => node.id).sort()
      return ids.join() === [local, second].sort().join()
    })
    expect(docId(page)).toBe(id)
  })
})
