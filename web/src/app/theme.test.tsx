import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { THEME_STORAGE_KEY, ThemeProvider, useTheme } from './theme'

function Probe() {
  const { theme, setTheme } = useTheme()
  return (
    <button type="button" onClick={() => setTheme('dark')}>
      {theme}
    </button>
  )
}

describe('theme', () => {
  it('applies the dark class and persists the choice', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    act(() => screen.getByRole('button').click())
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })
})
