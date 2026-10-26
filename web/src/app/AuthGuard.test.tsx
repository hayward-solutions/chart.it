import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockDb } from '@/api/mocks/db'
import { renderApp } from '@/test/render'

describe('AuthGuard', () => {
  it('redirects to the login page on 401', async () => {
    mockDb.authenticated = false
    const { router } = renderApp('/')
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/auth/login',
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('renders the app shell for a signed-in user', async () => {
    renderApp('/')
    expect(await screen.findByRole('button', { name: 'Account menu' })).toBeInTheDocument()
    expect(screen.getAllByText('Chart.it').length).toBeGreaterThan(0)
  })
})
