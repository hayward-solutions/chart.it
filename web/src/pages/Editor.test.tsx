import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { mockDb, nowIso, seedDocument } from '@/api/mocks/db'
import { server as mswServer } from '@/api/mocks/server'
import type * as LayoutModule from '@/layout'
import { createEmptyDocument, type Document } from '@/model'
import { renderApp } from '@/test/render'

vi.mock('html-to-image', () => ({
  toPng: vi.fn(async () => 'data:image/png;base64,iVBORw0KGgo='),
}))

vi.mock('@/layout', async (importOriginal) => {
  const original = await importOriginal<typeof LayoutModule>()
  return {
    ...original,
    layoutDocument: vi.fn(async (doc: Document) => ({
      ...doc,
      nodes: doc.nodes.map((node) => ({
        ...node,
        position: { x: node.position.x + 100, y: node.position.y },
      })),
    })),
  }
})

vi.setConfig({ testTimeout: 20_000 })

class DOMMatrixReadOnlyStub {
  m22 = 1
  constructor(_transform?: string) {}
}

beforeAll(async () => {
  ;(globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly =
    DOMMatrixReadOnlyStub
  configure({ asyncUtilTimeout: 5000 })
  await Promise.all([import('@/pages/Editor'), import('@/pages/Share')])
}, 60_000)

type User = ReturnType<typeof userEvent.setup>

async function rename(user: User, name: string) {
  await user.click(await screen.findByRole('button', { name: /^Diagram title:/ }))
  const input = within(screen.getByRole('toolbar')).getByRole('textbox', { name: 'Diagram title' })
  await user.clear(input)
  await user.type(input, name)
  await user.keyboard('{Enter}')
}

function stored(id: string) {
  const doc = mockDb.documents.get(id)
  if (!doc) {
    throw new Error('missing document')
  }
  return doc
}

const SAVE_WAIT = { timeout: 5000 }

describe('Editor autosave', () => {
  it('saves after the debounce, bumps the version and uploads a thumbnail', async () => {
    const user = userEvent.setup()
    const doc = seedDocument(mockDb, { title: 'Net', templateKey: 'k8s-app' })
    renderApp(`/d/${doc.id}`)
    await rename(user, 'Net v2')

    expect(await screen.findByText('Unsaved changes')).toBeInTheDocument()
    expect(stored(doc.id).version).toBe(1)
    await waitFor(() => expect(stored(doc.id).version).toBe(2), SAVE_WAIT)
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(stored(doc.id).content.title).toBe('Net v2')
    await waitFor(() => expect(stored(doc.id).title).toBe('Net v2'))
    await waitFor(() => expect(stored(doc.id).hasThumbnail).toBe(true))

    await rename(user, 'Net v3')
    await waitFor(() => expect(stored(doc.id).version).toBe(3), SAVE_WAIT)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the conflict banner on 409 and overwrites with the server version', async () => {
    const user = userEvent.setup()
    const doc = seedDocument(mockDb, { title: 'Shared' })
    renderApp(`/d/${doc.id}`)
    await screen.findByTestId('editor-canvas')
    stored(doc.id).version = 5

    await rename(user, 'Mine')
    const banner = await screen.findByRole('alert', {}, SAVE_WAIT)
    expect(within(banner).getByText('This diagram was changed elsewhere')).toBeInTheDocument()
    expect(screen.getByText('Conflict')).toBeInTheDocument()
    expect(stored(doc.id).version).toBe(5)

    await user.click(within(banner).getByRole('button', { name: 'Overwrite' }))
    await waitFor(() => expect(stored(doc.id).version).toBe(6), SAVE_WAIT)
    expect(stored(doc.id).content.title).toBe('Mine')
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('reloads the server copy from the conflict banner', async () => {
    const user = userEvent.setup()
    const doc = seedDocument(mockDb, { title: 'Shared' })
    renderApp(`/d/${doc.id}`)
    await screen.findByTestId('editor-canvas')
    const remote = stored(doc.id)
    remote.version = 4
    remote.title = 'Server copy'
    remote.content = { ...remote.content, title: 'Server copy' }
    mswServer.use(
      http.patch('/api/v1/documents/:id', ({ params }) =>
        HttpResponse.json({
          id: params.id,
          title: 'Mine',
          tags: [],
          version: 4,
          templateKey: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          deletedAt: null,
        }),
      ),
    )

    await rename(user, 'Mine')
    const banner = await screen.findByRole('alert', {}, SAVE_WAIT)
    await user.click(within(banner).getByRole('button', { name: 'Reload' }))

    expect(
      await screen.findByRole('button', { name: 'Diagram title: Server copy. Click to rename' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(stored(doc.id).version).toBe(4)
  })

  it('shows a retryable error when the save fails', async () => {
    const user = userEvent.setup()
    const doc = seedDocument(mockDb, { title: 'Flaky' })
    let failing = true
    mswServer.use(
      http.put('/api/v1/documents/:id/content', async ({ request, params }) => {
        if (failing) {
          return HttpResponse.json(
            { title: 'Internal Server Error', status: 500 },
            { status: 500, headers: { 'Content-Type': 'application/problem+json' } },
          )
        }
        const body = (await request.json()) as { version: number }
        stored(String(params.id)).version = body.version + 1
        return HttpResponse.json({ version: body.version + 1, updatedAt: nowIso() })
      }),
    )
    renderApp(`/d/${doc.id}`)
    await rename(user, 'Flaky 2')
    expect(await screen.findByText('Save failed', {}, SAVE_WAIT)).toBeInTheDocument()
    failing = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Saved', {}, SAVE_WAIT)).toBeInTheDocument()
    expect(stored(doc.id).version).toBe(2)
  })
})

describe('Editor unsaved guard', () => {
  it('saves pending edits before navigating away', async () => {
    const user = userEvent.setup()
    const doc = seedDocument(mockDb, { title: 'Leaving' })
    const { router } = renderApp(`/d/${doc.id}`)
    await rename(user, 'Left')
    await user.click(screen.getByRole('link', { name: 'Back to diagrams' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'), SAVE_WAIT)
    expect(stored(doc.id).version).toBe(2)
    expect(stored(doc.id).content.title).toBe('Left')
  })

  it('asks before leaving when the save keeps failing', async () => {
    const user = userEvent.setup()
    const doc = seedDocument(mockDb, { title: 'Stuck' })
    mswServer.use(
      http.put('/api/v1/documents/:id/content', () =>
        HttpResponse.json(
          { title: 'Internal Server Error', status: 500 },
          { status: 500, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    const { router } = renderApp(`/d/${doc.id}`)
    await rename(user, 'Stuck 2')
    await user.click(screen.getByRole('link', { name: 'Back to diagrams' }))

    const dialog = await screen.findByRole('dialog', { name: 'Unsaved changes' }, SAVE_WAIT)
    expect(router.state.location.pathname).toBe(`/d/${doc.id}`)
    await user.click(within(dialog).getByRole('button', { name: 'Stay' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe(`/d/${doc.id}`)

    await user.click(screen.getByRole('link', { name: 'Back to diagrams' }))
    await user.click(
      await within(await screen.findByRole('dialog', { name: 'Unsaved changes' })).findByRole(
        'button',
        { name: 'Leave without saving' },
      ),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})

describe('Share page', () => {
  it('renders a shared diagram read-only without signing in', async () => {
    const doc = seedDocument(mockDb, { title: 'Public diagram', templateKey: 'k8s-app' })
    mockDb.shares.push({
      token: 'tok123',
      url: 'http://localhost/s/tok123',
      createdAt: nowIso(),
      documentId: doc.id,
      revokedAt: null,
    })
    mockDb.authenticated = false
    const { router } = renderApp('/s/tok123')
    expect(await screen.findByText('View only')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Public diagram' })).toBeInTheDocument()
    expect(await screen.findByTestId('editor-canvas')).toHaveAttribute('data-readonly', 'true')
    expect(screen.queryByRole('button', { name: 'Account menu' })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/s/tok123')
  })

  it('shows a friendly message for a revoked link', async () => {
    mockDb.authenticated = false
    renderApp('/s/missing')
    expect(await screen.findByText('This link is no longer valid')).toBeInTheDocument()
  })
})

describe('Share dialog', () => {
  it('creates, lists and revokes view-only links', async () => {
    const user = userEvent.setup()
    const doc = seedDocument(mockDb, { title: 'Sharable' })
    renderApp(`/d/${doc.id}`)
    await user.click(await screen.findByRole('button', { name: 'Share' }))
    const dialog = await screen.findByRole('dialog', { name: 'Share diagram' })
    expect(await within(dialog).findByText(/No links yet/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /create view-only link/i }))
    const link = await within(dialog).findByRole('textbox', { name: 'Share link' })
    expect((link as HTMLInputElement).value).toMatch(/\/s\/[a-z0-9]+$/)
    expect(mockDb.shares).toHaveLength(1)

    await user.click(within(dialog).getByRole('button', { name: 'Revoke link' }))
    await waitFor(() => expect(mockDb.shares[0]?.revokedAt).not.toBeNull())
    expect(await within(dialog).findByText(/No links yet/)).toBeInTheDocument()
  })
})

describe('Version history', () => {
  it('previews a version and restores it through the API', async () => {
    const user = userEvent.setup()
    const doc = seedDocument(mockDb, { title: 'Current title' })
    const old = createEmptyDocument('Old title')
    mockDb.versions.set(doc.id, [
      {
        version: 1,
        label: 'Baseline',
        createdAt: nowIso(),
        createdBy: mockDb.user.id,
        content: old,
      },
    ])
    renderApp(`/d/${doc.id}`)
    await user.click(await screen.findByRole('button', { name: 'Version history' }))
    const drawer = await screen.findByRole('dialog', { name: 'Version history' })
    await user.click(await within(drawer).findByRole('button', { name: /Baseline/ }))

    const preview = await screen.findByRole('dialog', { name: 'Version 1' })
    await within(preview).findByTestId('editor-canvas')
    await user.click(within(preview).getByRole('button', { name: /restore this version/i }))

    await waitFor(() => expect(stored(doc.id).version).toBe(2))
    expect(stored(doc.id).content.title).toBe('Old title')
    expect(
      await screen.findByRole('button', { name: 'Diagram title: Old title. Click to rename' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('saves a named version with a label', async () => {
    const user = userEvent.setup()
    const doc = seedDocument(mockDb, { title: 'Labelled' })
    renderApp(`/d/${doc.id}`)
    await user.click(await screen.findByRole('button', { name: 'File' }))
    await user.click(await screen.findByRole('menuitem', { name: /save named version/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Save named version' })
    await user.type(within(dialog).getByLabelText('Version name'), 'Before launch')
    await user.click(within(dialog).getByRole('button', { name: 'Save version' }))
    await waitFor(() => expect(stored(doc.id).version).toBe(2))
    expect(mockDb.versions.get(doc.id)?.some((entry) => entry.label === 'Before launch')).toBe(true)
  })
})

describe('Layout menu', () => {
  it('applies an auto layout as one undoable step', async () => {
    const user = userEvent.setup()
    const doc = seedDocument(mockDb, { title: 'Arrange me', templateKey: 'k8s-app' })
    const originalX = stored(doc.id).content.nodes.map((node) => node.position.x)
    renderApp(`/d/${doc.id}`)
    await screen.findByTestId('editor-canvas')

    await user.click(await screen.findByRole('button', { name: 'Layout' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Auto layout: Top to bottom' }))
    await waitFor(
      () =>
        expect(stored(doc.id).content.nodes.map((node) => node.position.x)).toEqual(
          originalX.map((x) => x + 100),
        ),
      { timeout: 6000 },
    )
    expect(stored(doc.id).version).toBe(2)

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(
      () => expect(stored(doc.id).content.nodes.map((node) => node.position.x)).toEqual(originalX),
      { timeout: 6000 },
    )
    expect(stored(doc.id).version).toBe(3)
  })

  it('tidies edges with routed waypoints and resets them', async () => {
    const user = userEvent.setup()
    const doc = seedDocument(mockDb, { title: 'Edges', templateKey: 'k8s-app' })
    renderApp(`/d/${doc.id}`)
    await screen.findByTestId('editor-canvas')

    await user.click(await screen.findByRole('button', { name: 'Layout' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Reset edge routes' }))
    await user.click(await screen.findByRole('button', { name: 'Layout' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Tidy edges' }))
    await waitFor(() => expect(stored(doc.id).version).toBeGreaterThanOrEqual(2), SAVE_WAIT)
    expect(await screen.findByText('Saved', {}, SAVE_WAIT)).toBeInTheDocument()
  })
})

describe('Editor menus and dialogs', () => {
  it('opens the shortcut reference with the question mark key', async () => {
    const user = userEvent.setup()
    const doc = seedDocument(mockDb, { title: 'Keys' })
    renderApp(`/d/${doc.id}`)
    await screen.findByTestId('editor-canvas')
    await user.keyboard('?')
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })
    expect(within(dialog).getByText('Undo')).toBeInTheDocument()
  })

  it('imports a JSON file into the empty canvas', async () => {
    const user = userEvent.setup()
    const doc = seedDocument(mockDb, { title: 'Blank' })
    renderApp(`/d/${doc.id}`)
    await screen.findByTestId('editor-canvas')
    const imported = createEmptyDocument('Imported diagram')
    const file = new File([JSON.stringify(imported)], 'diagram.json', { type: 'application/json' })
    await user.upload(screen.getByTestId('import-input'), file)
    expect(
      await screen.findByRole('button', {
        name: 'Diagram title: Imported diagram. Click to rename',
      }),
    ).toBeInTheDocument()
    await waitFor(() => expect(stored(doc.id).content.title).toBe('Imported diagram'), SAVE_WAIT)
  })

  it('rejects a file that is not a diagram', async () => {
    const user = userEvent.setup()
    const doc = seedDocument(mockDb, { title: 'Blank' })
    renderApp(`/d/${doc.id}`)
    await screen.findByTestId('editor-canvas')
    const file = new File(['{"hello":1}'], 'nope.json', { type: 'application/json' })
    await user.upload(screen.getByTestId('import-input'), file)
    expect(await screen.findByText(/Could not import/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Diagram title: Blank. Click to rename' }),
    ).toBeInTheDocument()
  })
})
