import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockDb, seedDocument } from '@/api/mocks/db'
import { renderApp } from '@/test/render'

describe('Dashboard', () => {
  it('lists documents from the API', async () => {
    seedDocument(mockDb, { title: 'Production network', tags: ['aws'] })
    seedDocument(mockDb, { title: 'Payments platform', tags: ['k8s'] })
    renderApp('/')
    expect(await screen.findByRole('article', { name: 'Production network' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Payments platform' })).toBeInTheDocument()
    expect(screen.getByText('aws')).toBeInTheDocument()
    expect(screen.getAllByTestId('thumbnail-placeholder')).toHaveLength(2)
  })

  it('shows an empty state when there are no documents', async () => {
    renderApp('/')
    expect(await screen.findByText('No diagrams yet')).toBeInTheDocument()
  })

  it('creates a blank document from the template picker and navigates to it', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(await screen.findByRole('button', { name: /new diagram/i }))
    const dialog = await screen.findByRole('dialog', { name: /new diagram/i })
    expect(await within(dialog).findByText('AWS three-tier web app')).toBeInTheDocument()
    const nameInput = within(dialog).getByLabelText('Name')
    await user.clear(nameInput)
    await user.type(nameInput, 'My new diagram')
    await user.click(within(dialog).getByRole('button', { name: /blank/i }))
    expect(await screen.findByTestId('editor-canvas')).toBeInTheDocument()
    expect(mockDb.documents.size).toBe(1)
    expect([...mockDb.documents.values()][0]?.title).toBe('My new diagram')
  })

  it('moves a document to the trash and restores it', async () => {
    const user = userEvent.setup()
    seedDocument(mockDb, { title: 'Disposable' })
    renderApp('/')
    await user.click(await screen.findByRole('button', { name: 'Actions for Disposable' }))
    await user.click(await screen.findByRole('menuitem', { name: /move to trash/i }))
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Disposable' })).toBeNull())
    await user.click(screen.getByRole('tab', { name: /trash/i }))
    const card = await screen.findByRole('article', { name: 'Disposable' })
    await user.click(within(card).getByRole('button', { name: /restore/i }))
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Disposable' })).toBeNull())
    expect([...mockDb.documents.values()][0]?.deletedAt).toBeNull()
  })

  it('filters by search text', async () => {
    const user = userEvent.setup()
    seedDocument(mockDb, { title: 'Alpha' })
    seedDocument(mockDb, { title: 'Beta' })
    renderApp('/')
    await screen.findByRole('article', { name: 'Alpha' })
    await user.type(screen.getByRole('searchbox', { name: 'Search diagrams' }), 'bet')
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Alpha' })).toBeNull())
    expect(screen.getByRole('article', { name: 'Beta' })).toBeInTheDocument()
  })
})
