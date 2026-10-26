import { api, createBlankDiagram, expect, test, uniqueTitle, type Page } from '../fixtures'

test.describe.configure({ mode: 'parallel' })

const TEMPLATES = [
  'AWS three-tier web app',
  'AWS EKS cluster',
  'Azure hub and spoke network',
  'GCP GKE cluster',
  'Kubernetes namespace',
]

function card(page: Page, title: string) {
  return page.getByRole('article', { name: title, exact: true })
}

async function cardMenu(page: Page, title: string, item: string) {
  await card(page, title).getByRole('button', { name: `Actions for ${title}` }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

test.describe('dashboard', () => {
  test('creates a blank diagram and lists it on return', async ({ loggedInPage: page }) => {
    const title = uniqueTitle('Blank')
    const id = await createBlankDiagram(page, title)
    await expect(page.getByRole('button', { name: new RegExp(`Diagram title: ${title}`) })).toBeVisible()

    await page.getByRole('link', { name: 'Back to diagrams' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(card(page, title)).toBeVisible()

    const stored = await api(page).get(id)
    expect(stored.title).toBe(title)
    expect(stored.content.nodes).toHaveLength(0)
  })

  test('renames a diagram from the card menu', async ({ loggedInPage: page }) => {
    const title = uniqueTitle('Rename me')
    const renamed = uniqueTitle('Renamed')
    const { id } = await api(page).create(title)
    await page.goto('/')
    await expect(card(page, title)).toBeVisible()

    await cardMenu(page, title, 'Rename')
    const dialog = page.getByRole('dialog', { name: 'Rename diagram' })
    await dialog.getByLabel('Diagram name').fill(renamed)
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect(card(page, renamed)).toBeVisible()
    await expect(card(page, title)).toHaveCount(0)
    expect((await api(page).get(id)).title).toBe(renamed)
  })

  test('duplicates a diagram', async ({ loggedInPage: page }) => {
    const title = uniqueTitle('Original')
    const original = await api(page).create(title, 'k8s-namespace')
    await page.goto('/')
    await expect(card(page, title)).toBeVisible()

    await cardMenu(page, title, 'Duplicate')
    await expect
      .poll(async () => (await api(page).list({ q: title })).length)
      .toBe(2)

    const copies = (await api(page).list({ q: title })).filter((doc) => doc.id !== original.id)
    expect(copies).toHaveLength(1)
    const copy = await api(page).get(copies[0]!.id)
    expect(copy.content.nodes.length).toBe(original.content.nodes.length)
    expect(copy.content.nodes.length).toBeGreaterThan(0)
  })

  test('moves a diagram to the trash and restores it', async ({ loggedInPage: page }) => {
    const title = uniqueTitle('Trash me')
    const { id } = await api(page).create(title)
    await page.goto('/')
    await expect(card(page, title)).toBeVisible()

    await cardMenu(page, title, 'Move to trash')
    await expect(card(page, title)).toHaveCount(0)
    expect((await api(page).list({ q: title })).map((doc) => doc.id)).not.toContain(id)
    expect((await api(page).list({ q: title, trashed: true })).map((doc) => doc.id)).toContain(id)

    await page.getByRole('tab', { name: 'Trash' }).click()
    await expect(card(page, title)).toBeVisible()
    await card(page, title).getByRole('button', { name: 'Restore' }).click()
    await expect(card(page, title)).toHaveCount(0)

    await page.getByRole('tab', { name: 'Diagrams' }).click()
    await expect(card(page, title)).toBeVisible()
    expect((await api(page).list({ q: title })).map((doc) => doc.id)).toContain(id)
  })

  test('undo from the trash toast restores the diagram', async ({ loggedInPage: page }) => {
    const title = uniqueTitle('Undo trash')
    await api(page).create(title)
    await page.goto('/')
    await cardMenu(page, title, 'Move to trash')
    await expect(card(page, title)).toHaveCount(0)
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(card(page, title)).toBeVisible()
  })

  test('searches diagrams by title', async ({ loggedInPage: page }) => {
    const token = uniqueTitle('findme').replace(/\s/g, '-')
    const a = `Alpha ${token}`
    const b = `Beta ${token}`
    const other = uniqueTitle('Unrelated')
    await api(page).create(a)
    await api(page).create(b)
    await api(page).create(other)
    await page.goto('/')
    await expect(card(page, other)).toBeVisible()

    const search = page.getByRole('searchbox', { name: 'Search diagrams' })
    await search.fill(token)
    await expect(card(page, a)).toBeVisible()
    await expect(card(page, b)).toBeVisible()
    await expect(card(page, other)).toHaveCount(0)

    await search.fill(`Alpha ${token}`)
    await expect(card(page, a)).toBeVisible()
    await expect(card(page, b)).toHaveCount(0)

    await search.fill(`no-such-diagram-${token}`)
    await expect(page.getByText('No matching diagrams')).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(card(page, other)).toBeVisible()
  })

  test('the template picker lists every starter template and Blank', async ({ loggedInPage: page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'New diagram' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'New diagram' })
    await expect(dialog).toBeVisible()

    await expect(dialog.getByRole('button', { name: /Blank\s+Start from an empty canvas/ })).toBeVisible()
    for (const title of TEMPLATES) {
      await expect(dialog.getByRole('button', { name: new RegExp(title) })).toBeVisible()
    }
    await expect(dialog.locator('ul > li')).toHaveCount(TEMPLATES.length + 1)
  })

  test('a template starts with content and the chosen name', async ({ loggedInPage: page }) => {
    const title = uniqueTitle('From template')
    await page.goto('/')
    await page.getByRole('button', { name: 'New diagram' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'New diagram' })
    await dialog.getByLabel('Name').fill(title)
    await dialog.getByRole('button', { name: /Kubernetes namespace/ }).click()
    await page.waitForURL(/\/d\/[^/]+$/)
    const found = (await api(page).list({ q: title }))[0]
    expect(found).toBeDefined()
    const record = await api(page).get(found!.id)
    expect(record.templateKey).toBe('k8s-namespace')
    expect(record.content.nodes.length).toBeGreaterThan(3)
  })
})
