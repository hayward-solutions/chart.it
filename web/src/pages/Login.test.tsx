import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render'

describe('Login', () => {
  it('shows a friendly message when sign-in failed', async () => {
    renderApp('/login?error=access_denied')
    expect(await screen.findByRole('alert')).toHaveTextContent(/cancelled|not allowed/i)
  })

  it('shows a generic message for unknown error codes', async () => {
    renderApp('/login?error=weird')
    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i)
  })

  it('shows no alert on a clean visit', async () => {
    renderApp('/login')
    await screen.findByRole('link', { name: 'Sign in' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
