import fs from 'node:fs'
import {
  addIconFromLibrary,
  addShapeByKey,
  api,
  connectNodes,
  expect,
  expectSaved,
  flowEdges,
  flowNodes,
  openMenuItem,
  openNewDiagram,
  test,
  uniqueTitle,
  waitForSaved,
  type DocContent,
  type Page,
} from '../fixtures'

test.describe.configure({ mode: 'parallel' })

type Format = 'PNG' | 'SVG' | 'PDF' | 'JSON'

async function buildDiagram(page: Page, title: string) {
  const id = await openNewDiagram(page, title)
  const icon = await addIconFromLibrary(page, 'ec2', 'Amazon EC2 (aws)')
  const rect = await addShapeByKey(page, 'r', 560, 240)
  await connectNodes(page, icon, rect)
  await expect(flowNodes(page)).toHaveCount(2)
  await expect(flowEdges(page)).toHaveCount(1)
  await expectSaved(page, (doc) => doc.nodes.length === 2 && doc.edges.length === 1)
  return { id, icon, rect }
}

async function exportAs(page: Page, format: Format, filename = 'e2e-export') {
  await openMenuItem(page, 'File', /Export/)
  const dialog = page.getByRole('dialog', { name: 'Export diagram' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('tab', { name: format }).click()
  await dialog.getByLabel('File name').fill(filename)
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export' }).click()
  const download = await downloadPromise
  const path = await download.path()
  const bytes = fs.readFileSync(path)
  await expect(dialog).toBeHidden()
  return { name: download.suggestedFilename(), bytes }
}

test.describe('export', () => {
  test('PNG download is a non-empty PNG', async ({ loggedInPage: page }) => {
    await buildDiagram(page, uniqueTitle('Export png'))
    const { name, bytes } = await exportAs(page, 'PNG')
    expect(name).toBe('e2e-export.png')
    expect(bytes.length).toBeGreaterThan(1000)
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0)
  })

  test('PDF download is a non-empty PDF', async ({ loggedInPage: page }) => {
    await buildDiagram(page, uniqueTitle('Export pdf'))
    const { name, bytes } = await exportAs(page, 'PDF')
    expect(name).toBe('e2e-export.pdf')
    expect(bytes.length).toBeGreaterThan(1000)
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0)
  })

  test('SVG download contains an svg root and an inlined icon', async ({ loggedInPage: page }) => {
    await buildDiagram(page, uniqueTitle('Export svg'))
    const { name, bytes } = await exportAs(page, 'SVG')
    expect(name).toBe('e2e-export.svg')
    const text = bytes.toString('utf8')
    expect(text.length).toBeGreaterThan(500)
    expect(text).toContain('<svg')
    expect(text).toContain('</svg>')
    expect(text).not.toMatch(/(?:href|src)="\/icons\//)
    expect((text.match(/<svg/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(text).toMatch(/data-node-id="[^"]+"[^>]*><svg /)
    expect(text).toContain('#ED7100')
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0)
  })

  test('JSON download is the document and can be re-imported into a new diagram', async ({ loggedInPage: page }) => {
    const source = await buildDiagram(page, uniqueTitle('Export json'))
    const { name, bytes } = await exportAs(page, 'JSON')
    expect(name).toBe('e2e-export.json')
    const exported = JSON.parse(bytes.toString('utf8')) as DocContent
    expect(exported.schemaVersion).toBe(1)
    expect(exported.nodes).toHaveLength(2)
    expect(exported.edges).toHaveLength(1)
    expect(exported.nodes.find((node) => node.id === source.icon)?.data.icon).toEqual({ pack: 'aws', id: 'ec2' })

    const targetId = await openNewDiagram(page, uniqueTitle('Import target'))
    await page.getByTestId('import-input').setInputFiles({
      name: 'diagram.json',
      mimeType: 'application/json',
      buffer: bytes,
    })
    await expect(flowNodes(page)).toHaveCount(2)
    await expect(flowEdges(page)).toHaveCount(1)
    await waitForSaved(page)
    await expectSaved(page, (doc) => doc.nodes.length === 2 && doc.edges.length === 1)

    const imported = await api(page).content(targetId)
    const strip = (doc: DocContent) => ({
      nodes: doc.nodes.map(({ id, type, position, size, parentId, data }) => ({ id, type, position, size, parentId, data })),
      edges: doc.edges.map(({ id, source, target, sourceHandle, targetHandle, type, data }) => ({
        id,
        source,
        target,
        sourceHandle,
        targetHandle,
        type,
        data,
      })),
    })
    expect(strip(imported)).toEqual(strip(exported))
  })

  test('importing into a non-empty diagram asks for confirmation and keeps a backup version', async ({
    loggedInPage: page,
  }) => {
    const exportedFrom = await buildDiagram(page, uniqueTitle('Import source'))
    const { bytes } = await exportAs(page, 'JSON')

    const targetId = await openNewDiagram(page, uniqueTitle('Import over'))
    await addShapeByKey(page, 'o', 300, 240)
    await addShapeByKey(page, 'o', 560, 240)
    await addShapeByKey(page, 'o', 300, 420)
    await expectSaved(page, (doc) => doc.nodes.length === 3)

    await page.getByTestId('import-input').setInputFiles({ name: 'diagram.json', mimeType: 'application/json', buffer: bytes })
    const confirm = page.getByRole('dialog', { name: 'Replace this diagram?' })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Replace' }).click()

    await expect(flowNodes(page)).toHaveCount(2)
    await expectSaved(page, (doc) => doc.nodes.length === 2 && doc.nodes.some((node) => node.id === exportedFrom.icon))
    await expect
      .poll(async () => (await api(page).versions(targetId)).some((entry) => entry.label === 'Before import'))
      .toBe(true)
  })

  test('importing a file that is not a diagram reports an error', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Bad import'))
    await page.getByTestId('import-input').setInputFiles({
      name: 'nope.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"hello":"world"}'),
    })
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toContainText('Could not import')
    await expect(flowNodes(page)).toHaveCount(0)
  })
})
