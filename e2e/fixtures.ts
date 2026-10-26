import { expect, test as base, type APIRequestContext, type Locator, type Page } from '@playwright/test'

export type NodeData = {
  label: string
  icon?: { pack: string; id: string }
  shape?: string
  containerKind?: string
  style: Record<string, unknown>
}

export type DocNode = {
  id: string
  type: 'icon' | 'container' | 'shape' | 'text'
  position: { x: number; y: number }
  size: { width: number; height: number }
  parentId?: string
  zIndex: number
  locked?: boolean
  data: NodeData
}

export type DocEdge = {
  id: string
  source: string
  target: string
  sourceHandle: string
  targetHandle: string
  type: 'orthogonal' | 'straight' | 'bezier'
  zIndex: number
  data: {
    label?: string
    labelPosition?: number
    markerStart: string
    markerEnd: string
    waypoints?: { x: number; y: number }[]
    style: Record<string, unknown>
  }
}

export type DocContent = {
  schemaVersion: 1
  title: string
  settings: Record<string, unknown>
  viewport: { x: number; y: number; zoom: number }
  nodes: DocNode[]
  edges: DocEdge[]
}

export type DocRecord = {
  id: string
  title: string
  tags: string[]
  version: number
  content: DocContent
  templateKey?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

export type DocSummary = {
  id: string
  title: string
  tags: string[]
  version: number
  updatedAt: string
  createdAt: string
  hasThumbnail: boolean
}

export type VersionSummary = { version: number; label?: string | null; createdAt: string; createdBy?: string }

export type Share = { token: string; url: string; createdAt: string }

export type ConsoleErrors = {
  allow: (pattern: RegExp) => void
  readonly collected: string[]
}

const BENIGN_CONSOLE: RegExp[] = []

export function watchConsole(page: Page): ConsoleErrors {
  const collected: string[] = []
  const allowed: RegExp[] = [...BENIGN_CONSOLE]
  const record = (text: string) => {
    if (!allowed.some((pattern) => pattern.test(text))) {
      collected.push(text)
    }
  }
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const location = message.location()
      record(`${message.text()}${location.url ? ` (${location.url})` : ''}`)
    }
  })
  page.on('pageerror', (error) => {
    record(`pageerror: ${error.message}`)
  })
  return {
    allow: (pattern) => {
      allowed.push(pattern)
    },
    get collected() {
      return collected.filter((entry) => !allowed.some((pattern) => pattern.test(entry)))
    },
  }
}

export function uniqueTitle(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function docId(page: Page): string {
  const match = /\/d\/([^/?#]+)/.exec(new URL(page.url()).pathname)
  if (!match?.[1]) {
    throw new Error(`not on an editor page: ${page.url()}`)
  }
  return match[1]
}

const HEADERS = { 'X-Requested-With': 'chartit' }

export function apiFor(request: APIRequestContext) {
  const json = async <T>(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> => {
    if (!response.ok()) {
      throw new Error(`${response.url()} -> ${response.status()} ${await response.text()}`)
    }
    return (await response.json()) as T
  }
  return {
    request,
    me: async () => json<{ id: string; name: string; email: string }>(await request.get('/api/v1/me')),
    list: async (params: { q?: string; tag?: string; trashed?: boolean } = {}) => {
      const query = new URLSearchParams()
      if (params.q) query.set('q', params.q)
      if (params.tag) query.set('tag', params.tag)
      if (params.trashed) query.set('trashed', 'true')
      return json<DocSummary[]>(await request.get(`/api/v1/documents?${query.toString()}`))
    },
    create: async (title: string, templateKey?: string) =>
      json<DocRecord>(
        await request.post('/api/v1/documents', {
          headers: HEADERS,
          data: { title, ...(templateKey ? { templateKey } : {}) },
        }),
      ),
    get: async (id: string) => json<DocRecord>(await request.get(`/api/v1/documents/${id}`)),
    content: async (id: string) => (await json<DocRecord>(await request.get(`/api/v1/documents/${id}`))).content,
    putContent: async (id: string, version: number, content: DocContent, label?: string) =>
      request.put(`/api/v1/documents/${id}/content`, {
        headers: HEADERS,
        data: { version, content, ...(label ? { label } : {}) },
      }),
    versions: async (id: string) => json<VersionSummary[]>(await request.get(`/api/v1/documents/${id}/versions`)),
    version: async (id: string, version: number) =>
      json<{ version: number; label?: string | null; content: DocContent }>(
        await request.get(`/api/v1/documents/${id}/versions/${version}`),
      ),
    shares: async (id: string) => json<Share[]>(await request.get(`/api/v1/documents/${id}/shares`)),
    createShare: async (id: string) =>
      json<Share>(await request.post(`/api/v1/documents/${id}/shares`, { headers: HEADERS })),
    trash: async (id: string) => request.delete(`/api/v1/documents/${id}`, { headers: HEADERS }),
    restore: async (id: string) =>
      json<DocRecord>(await request.post(`/api/v1/documents/${id}/restore`, { headers: HEADERS })),
  }
}

export type Api = ReturnType<typeof apiFor>

export function api(page: Page): Api {
  return apiFor(page.context().request)
}

type Fixtures = {
  consoleErrors: ConsoleErrors
  loggedInPage: Page
}

export const test = base.extend<Fixtures>({
  consoleErrors: [
    async ({ page }, use) => {
      const watcher = watchConsole(page)
      await use(watcher)
      expect(watcher.collected, 'browser console errors').toEqual([])
    },
    { auto: true },
  ],
  loggedInPage: async ({ page }, use, testInfo) => {
    await login(page, `e2e-${testInfo.workerIndex}`)
    await use(page)
  },
})

export { expect }
export type { Page, Locator }

export async function login(page: Page, user: string) {
  await page.goto(`/auth/test-login?user=${encodeURIComponent(user)}`)
  await expect(page.getByRole('heading', { name: 'Diagrams', level: 1 })).toBeVisible()
}

export function canvas(page: Page): Locator {
  return page.getByTestId('editor-canvas')
}

export function flowNodes(page: Page): Locator {
  return canvas(page).locator('.react-flow__node')
}

export function flowEdges(page: Page): Locator {
  return canvas(page).locator('.react-flow__edge')
}

export function flowNode(page: Page, id: string): Locator {
  return canvas(page).locator(`.react-flow__node[data-id="${id}"]`)
}

export function flowEdge(page: Page, id: string): Locator {
  return canvas(page).locator(`.react-flow__edge[data-id="${id}"]`)
}

export async function nodeIds(page: Page): Promise<string[]> {
  return flowNodes(page).evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-id') ?? ''),
  )
}

export async function edgeIds(page: Page): Promise<string[]> {
  return flowEdges(page).evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-id') ?? ''),
  )
}

export async function waitForEditor(page: Page) {
  await expect(canvas(page)).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Editor toolbar' })).toBeVisible()
  await expect(saveIndicator(page)).toBeVisible()
}

export function saveIndicator(page: Page): Locator {
  return page.locator('[role="status"][data-status]')
}

export async function waitForSaved(page: Page) {
  const indicator = saveIndicator(page)
  await indicator.waitFor({ state: 'visible' })
  await expect
    .poll(async () => indicator.getAttribute('data-status'), { timeout: 400, intervals: [50] })
    .not.toBe('saved')
    .catch(() => undefined)
  await expect(indicator).toHaveAttribute('data-status', 'saved', { timeout: 15_000 })
}

export async function savedContent(page: Page): Promise<DocContent> {
  await waitForSaved(page)
  return api(page).content(docId(page))
}

export async function expectSaved(page: Page, predicate: (content: DocContent) => boolean, message = 'saved content') {
  const id = docId(page)
  const client = api(page)
  await expect
    .poll(async () => predicate(await client.content(id)), { message, timeout: 20_000, intervals: [250, 500, 1000] })
    .toBe(true)
}

export async function openNewDiagram(page: Page, title: string, templateKey?: string): Promise<string> {
  const record = await api(page).create(title, templateKey)
  await page.goto(`/d/${record.id}`)
  await waitForEditor(page)
  if (templateKey) {
    await expect(flowNodes(page).first()).toBeVisible()
  }
  return record.id
}

export async function createBlankDiagram(page: Page, title: string): Promise<string> {
  await page.goto('/')
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New diagram' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Name').fill(title)
  await dialog.getByRole('button', { name: /Blank\s+Start from an empty canvas/ }).click()
  await page.waitForURL(/\/d\/[^/]+$/)
  await waitForEditor(page)
  return docId(page)
}

export async function createFromTemplate(page: Page, templateTitle: string, name?: string): Promise<string> {
  await page.goto('/')
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New diagram' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Name').fill(name ?? templateTitle)
  await dialog.getByRole('button', { name: new RegExp(templateTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()
  await page.waitForURL(/\/d\/[^/]+$/)
  await waitForEditor(page)
  await expect(flowNodes(page).first()).toBeVisible()
  return docId(page)
}

export async function canvasBox(page: Page) {
  const box = await page.locator('.react-flow__pane').boundingBox()
  if (!box) {
    throw new Error('canvas pane has no bounding box')
  }
  return box
}

export async function addShapeByKey(page: Page, key: string, x: number, y: number): Promise<string> {
  const before = new Set(await nodeIds(page))
  const box = await canvasBox(page)
  await blurActiveElement(page)
  await page.keyboard.press(key)
  await page.mouse.click(box.x + x, box.y + y)
  return newNodeId(page, before)
}

export async function blurActiveElement(page: Page) {
  await page.evaluate(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body) {
      active.blur()
    }
  })
}

export async function newNodeId(page: Page, before: Set<string>): Promise<string> {
  let found = ''
  await expect
    .poll(async () => {
      const now = await nodeIds(page)
      found = now.find((id) => !before.has(id)) ?? ''
      return found
    })
    .not.toBe('')
  return found
}

export async function addIconFromLibrary(page: Page, query: string, title?: string): Promise<string> {
  const before = new Set(await nodeIds(page))
  const search = page.getByRole('textbox', { name: 'Search shapes' })
  await search.fill(query)
  const library = page.getByRole('complementary', { name: 'Shape library' })
  const tile = title
    ? library.getByRole('button', { name: title, exact: true })
    : library.getByRole('button').filter({ has: page.locator('img') }).first()
  await tile.click()
  await search.fill('')
  await blurActiveElement(page)
  return newNodeId(page, before)
}

export async function nodeCenter(node: Locator) {
  const box = await node.boundingBox()
  if (!box) {
    throw new Error('node has no bounding box')
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box }
}

export async function dragBy(page: Page, from: { x: number; y: number }, dx: number, dy: number, steps = 12) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps })
  await page.mouse.move(from.x + dx, from.y + dy, { steps })
  await page.mouse.up()
}

export const SELECTED = /(^|\s)selected(\s|$)/

export async function selectNode(page: Page, id: string) {
  const node = flowNode(page, id)
  const { x, y } = await nodeCenter(node)
  await page.mouse.click(x, y)
  await expect(node).toHaveClass(SELECTED)
}

export async function addToSelection(page: Page, id: string) {
  const node = flowNode(page, id)
  const { x, y } = await nodeCenter(node)
  await page.keyboard.down('Shift')
  await page.mouse.click(x, y)
  await page.keyboard.up('Shift')
  await expect(node).toHaveClass(SELECTED)
}

type Side = 'top' | 'right' | 'bottom' | 'left'

export async function handleCenter(page: Page, nodeId: string, side: Side) {
  const handle = flowNode(page, nodeId).locator(`.react-flow__handle[data-handleid="${side}"]`)
  const box = await handle.boundingBox()
  if (!box) {
    throw new Error(`no handle ${side} on ${nodeId}`)
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

export async function connectNodes(
  page: Page,
  a: string,
  b: string,
  sides: { from?: Side; to?: Side } = {},
): Promise<string> {
  const before = new Set(await edgeIds(page))
  const from = await handleCenter(page, a, sides.from ?? 'right')
  const to = await handleCenter(page, b, sides.to ?? 'left')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 8 })
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
  let found = ''
  await expect
    .poll(async () => {
      found = (await edgeIds(page)).find((id) => !before.has(id)) ?? ''
      return found
    })
    .not.toBe('')
  return found
}

export async function openMenuItem(page: Page, menu: string, item: string | RegExp) {
  await page.getByRole('toolbar', { name: 'Editor toolbar' }).getByRole('button', { name: menu, exact: true }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

export function zoomLabel(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Editor toolbar' }).getByRole('button', { name: 'Zoom level' })
}

export async function clearSelection(page: Page) {
  const box = await canvasBox(page)
  await page.keyboard.press('Escape')
  await page.mouse.click(box.x + box.width - 40, box.y + 40)
}

export async function edgePoint(page: Page, id: string, t = 0.5) {
  const path = flowEdge(page, id).locator('path.react-flow__edge-path').first()
  return path.evaluate((element: SVGPathElement, at: number) => {
    const length = element.getTotalLength()
    const point = element.getPointAtLength(length * at)
    const matrix = element.getScreenCTM()
    if (!matrix) {
      throw new Error('edge path has no screen matrix')
    }
    const mapped = new DOMPoint(point.x, point.y).matrixTransform(matrix)
    return { x: mapped.x, y: mapped.y }
  }, t)
}

export async function selectEdge(page: Page, id: string, t = 0.5) {
  const { x, y } = await edgePoint(page, id, t)
  await page.mouse.click(x, y)
  await expect(flowEdge(page, id)).toHaveClass(SELECTED)
}

export function properties(page: Page): Locator {
  return page.getByRole('complementary', { name: 'Properties' })
}
