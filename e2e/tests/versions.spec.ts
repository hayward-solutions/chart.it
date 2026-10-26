import {
  addShapeByKey,
  api,
  docId,
  expect,
  expectSaved,
  flowNodes,
  openMenuItem,
  openNewDiagram,
  test,
  uniqueTitle,
  waitForSaved,
  type Page,
} from '../fixtures'

test.describe.configure({ mode: 'parallel' })

async function saveNamedVersion(page: Page, label: string) {
  await openMenuItem(page, 'File', /Save named version/)
  const dialog = page.getByRole('dialog', { name: 'Save named version' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Version name').fill(label)
  await dialog.getByRole('button', { name: 'Save version' }).click()
  await expect(dialog).toBeHidden()
  await waitForSaved(page)
}

async function openHistory(page: Page) {
  await openMenuItem(page, 'File', 'Version history')
  const sheet = page.getByRole('dialog', { name: 'Version history' })
  await expect(sheet).toBeVisible()
  return sheet
}

test.describe('version history', () => {
  test('saves named versions, lists both, and restores the older one', async ({ loggedInPage: page }) => {
    const id = await openNewDiagram(page, uniqueTitle('Versions'))

    await addShapeByKey(page, 'r', 240, 220)
    await saveNamedVersion(page, 'Alpha one-node')
    await addShapeByKey(page, 'o', 560, 220)
    await expect(flowNodes(page)).toHaveCount(2)
    await saveNamedVersion(page, 'Beta two-nodes')

    await expect
      .poll(async () => (await api(page).versions(id)).map((entry) => entry.label).filter(Boolean).sort())
      .toEqual(['Alpha one-node', 'Beta two-nodes'])

    const sheet = await openHistory(page)
    const list = sheet.getByRole('list', { name: 'Versions' })
    await expect(list.getByRole('button', { name: /Alpha one-node/ })).toBeVisible()
    await expect(list.getByRole('button', { name: /Beta two-nodes/ })).toBeVisible()

    await list.getByRole('button', { name: /Alpha one-node/ }).click()
    const preview = page.getByRole('dialog', { name: /^Version \d+$/ })
    await expect(preview).toBeVisible()
    await expect(page.getByTestId('version-preview').locator('.react-flow__node')).toHaveCount(1)
    await preview.getByRole('button', { name: 'Restore this version' }).click()
    await expect(preview).toBeHidden()

    await expect(flowNodes(page)).toHaveCount(1)
    await expectSaved(page, (doc) => doc.nodes.length === 1)
    expect(docId(page)).toBe(id)

    const versions = await api(page).versions(id)
    expect(versions.length).toBeGreaterThanOrEqual(3)
  })

  test('a new diagram starts with an initial version and offers to save a named one', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('No versions'))
    const sheet = await openHistory(page)
    await expect(sheet.getByRole('list', { name: 'Versions' }).getByRole('button', { name: /Version 1/ })).toBeVisible()
    await sheet.getByRole('button', { name: 'Save named version' }).click()
    await expect(page.getByRole('dialog', { name: 'Save named version' })).toBeVisible()
  })

  test('the preview of an older version does not change the live diagram until restored', async ({ loggedInPage: page }) => {
    const id = await openNewDiagram(page, uniqueTitle('Preview only'))
    await addShapeByKey(page, 'r', 240, 220)
    await saveNamedVersion(page, 'Keep me')
    await addShapeByKey(page, 'o', 560, 220)
    await expectSaved(page, (doc) => doc.nodes.length === 2)

    const sheet = await openHistory(page)
    await sheet.getByRole('list', { name: 'Versions' }).getByRole('button', { name: /Keep me/ }).click()
    const preview = page.getByRole('dialog', { name: /^Version \d+$/ })
    await expect(preview).toBeVisible()
    await preview.getByRole('button', { name: 'Close', exact: true }).first().click()
    await expect(preview).toBeHidden()
    expect((await api(page).content(id)).nodes).toHaveLength(2)
  })
})
