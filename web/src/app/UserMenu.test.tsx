import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockDb } from '@/api/mocks/db'
import { renderApp } from '@/test/render'

describe('UserMenu', () => {
  it('offers sign out to a signed-in user', async () => {
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Account menu' }))
    expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
  })

  it('hides sign out in single-user mode', async () => {
    mockDb.user = { ...mockDb.user, name: 'Local user', email: '', singleUser: true }
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Account menu' }))
    expect(await screen.findByText('Single-user mode')).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Sign out' })).not.toBeInTheDocument()
  })
})
