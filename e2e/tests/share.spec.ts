import {
  addShapeByKey,
  api,
  canvas,
  docId,
  expect,
  flowNodes,
  openNewDiagram,
  test,
  uniqueTitle,
  waitForSaved,
  watchConsole,
  type Page,
} from '../fixtures'

async function createLink(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Share diagram' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Create view-only link' }).click()
  const link = dialog.getByRole('textbox', { name: 'Share link' })
  await expect(link).toBeVisible()
  const url = await link.inputValue()
  expect(url).toMatch(/\/s\/[A-Za-z0-9_-]+$/)
  return url
}

test.describe.configure({ mode: 'parallel' })

test.describe('sharing', () => {
  test('a share link opens a read-only view without signing in, and revoking invalidates it', async ({
    loggedInPage: page,
    browser,
  }) => {
    const title = uniqueTitle('Shared diagram')
    const id = await openNewDiagram(page, title)
    await addShapeByKey(page, 'r', 240, 220)
    await addShapeByKey(page, 'o', 560, 220)
    await waitForSaved(page)
    await expect.poll(async () => (await api(page).content(id)).nodes.length).toBe(2)

    const url = await createLink(page)
    expect(docId(page)).toBe(id)
    await expect.poll(async () => (await api(page).shares(id)).length).toBe(1)
    const token = url.split('/s/')[1]!

    const anonymous = await browser.newContext()
    try {
      const viewer = await anonymous.newPage()
      const errors = watchConsole(viewer)
      await viewer.goto(new URL(new URL(url).pathname, page.url()).toString())
      await expect(viewer.getByRole('heading', { name: title })).toBeVisible()
      await expect(viewer.getByText('View only')).toBeVisible()
      await expect(canvas(viewer)).toHaveAttribute('data-readonly', 'true')
      await expect(flowNodes(viewer)).toHaveCount(2)
      await expect(viewer.getByRole('toolbar', { name: 'Editor toolbar' })).toHaveCount(0)

      await viewer.keyboard.press('Delete')
      await viewer.keyboard.press('ControlOrMeta+a')
      await viewer.keyboard.press('Delete')
      await expect(flowNodes(viewer)).toHaveCount(2)
      expect(errors.collected).toEqual([])

      const apiResponse = await anonymous.request.get(`/api/v1/shared/${token}`)
      expect(apiResponse.status()).toBe(200)
      const noAuth = await anonymous.request.get(`/api/v1/documents/${id}`)
      expect(noAuth.status()).toBe(401)

      const dialog = page.getByRole('dialog', { name: 'Share diagram' })
      await dialog.getByRole('button', { name: 'Revoke link' }).click()
      await expect(dialog.getByText('No links yet')).toBeVisible()
      await expect.poll(async () => (await api(page).shares(id)).length).toBe(0)

      const revoked = await anonymous.request.get(`/api/v1/shared/${token}`)
      expect(revoked.status()).toBe(404)

      errors.allow(/404/)
      await viewer.reload()
      await expect(viewer.getByText('This link is no longer valid')).toBeVisible()
      await expect(flowNodes(viewer)).toHaveCount(0)
      expect(errors.collected).toEqual([])
    } finally {
      await anonymous.close()
    }
  })

  test('an unknown share token shows the invalid link page', async ({ browser, baseURL }) => {
    const anonymous = await browser.newContext({ baseURL })
    try {
      const viewer = await anonymous.newPage()
      const errors = watchConsole(viewer)
      errors.allow(/404/)
      await viewer.goto('/s/not-a-real-token')
      await expect(viewer.getByText('This link is no longer valid')).toBeVisible()
      expect(errors.collected).toEqual([])
    } finally {
      await anonymous.close()
    }
  })

  test('several links can exist and be revoked independently', async ({ loggedInPage: page }) => {
    const id = await openNewDiagram(page, uniqueTitle('Two links'))
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Share diagram' })
    await dialog.getByRole('button', { name: 'Create view-only link' }).click()
    await expect(dialog.getByRole('textbox', { name: 'Share link' })).toHaveCount(1)
    await dialog.getByRole('button', { name: 'Create view-only link' }).click()
    await expect(dialog.getByRole('textbox', { name: 'Share link' })).toHaveCount(2)
    await dialog.getByRole('button', { name: 'Revoke link' }).first().click()
    await expect(dialog.getByRole('textbox', { name: 'Share link' })).toHaveCount(1)
    await expect.poll(async () => (await api(page).shares(id)).length).toBe(1)
  })
})
