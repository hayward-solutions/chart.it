import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EditorLayout } from './EditorLayout'
import { makeFakeApi, renderPanel } from './testing'

vi.setConfig({ testTimeout: 20_000 })

describe('EditorLayout', () => {
  it('renders the toolbar, panels and canvas', async () => {
    renderPanel(
      <EditorLayout api={makeFakeApi()}>
        <div>canvas</div>
      </EditorLayout>,
    )
    expect(screen.getByRole('toolbar', { name: 'Editor toolbar' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Shape library' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Properties' })).toBeInTheDocument()
    expect(screen.getByText('canvas')).toBeInTheDocument()
  })

  it('collapses panels and remembers it', async () => {
    const user = userEvent.setup()
    const { unmount } = renderPanel(
      <EditorLayout api={makeFakeApi()}>
        <div>canvas</div>
      </EditorLayout>,
    )
    await user.click(screen.getByRole('button', { name: 'Hide shapes' }))
    expect(screen.queryByRole('complementary', { name: 'Shape library' })).not.toBeInTheDocument()
    unmount()

    renderPanel(
      <EditorLayout api={makeFakeApi()}>
        <div>canvas</div>
      </EditorLayout>,
    )
    expect(screen.queryByRole('complementary', { name: 'Shape library' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show shapes' }))
    expect(screen.getByRole('complementary', { name: 'Shape library' })).toBeInTheDocument()
  })

  it('resizes a panel from the keyboard', async () => {
    const user = userEvent.setup()
    renderPanel(
      <EditorLayout api={makeFakeApi()}>
        <div>canvas</div>
      </EditorLayout>,
    )
    const handle = screen.getByRole('slider', { name: 'Resize shapes' })
    expect(handle).toHaveAttribute('aria-valuenow', '280')
    handle.focus()
    await user.keyboard('{ArrowRight}')
    expect(handle).toHaveAttribute('aria-valuenow', '296')
  })
})
