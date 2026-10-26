import { expect, test, api, login } from '../fixtures'

test.describe('authentication', () => {
  test('unauthenticated visitors are sent to the login page', async ({ page, consoleErrors }) => {
    consoleErrors.allow(/401/)
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
  })

  test('unauthenticated editor deep links redirect to login', async ({ page, consoleErrors }) => {
    consoleErrors.allow(/401/)
    await page.goto('/d/doesnotexist')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('unauthenticated API calls are rejected', async ({ request }) => {
    const response = await request.get('/api/v1/me')
    expect(response.status()).toBe(401)
  })

  test('test login lands on the dashboard with the user menu', async ({ page }, testInfo) => {
    const user = `e2e-auth-${testInfo.workerIndex}`
    await login(page, user)
    await expect(page).toHaveURL(/\/$/)
    await page.getByRole('button', { name: 'Account menu' }).click()
    await expect(page.getByRole('menu').getByText(user, { exact: true })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible()
    expect((await api(page).me()).name).toBe(user)
  })

  test('signing out returns to the login page', async ({ page, consoleErrors }, testInfo) => {
    consoleErrors.allow(/401/)
    await login(page, `e2e-auth-out-${testInfo.workerIndex}`)
    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)
    const response = await page.request.get('/api/v1/me')
    expect(response.status()).toBe(401)
  })

  test('sessions are isolated between users', async ({ browser }) => {
    const first = await browser.newContext()
    const second = await browser.newContext()
    try {
      const a = await first.newPage()
      const b = await second.newPage()
      await login(a, 'e2e-iso-a')
      await login(b, 'e2e-iso-b')
      const created = await api(a).create(`Private ${Date.now()}`)
      const response = await second.request.get(`/api/v1/documents/${created.id}`)
      expect(response.status()).toBe(404)
    } finally {
      await first.close()
      await second.close()
    }
  })
})
