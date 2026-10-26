import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExportDialog } from './ExportDialog'
import { renderPanel } from './testing'

describe('ExportDialog', () => {
  it('submits the chosen options', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    const onOpenChange = vi.fn()
    renderPanel(
      <ExportDialog
        open
        onOpenChange={onOpenChange}
        defaultFilename="my-diagram"
        hasSelection
        onExport={onExport}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: 'Export diagram' })
    await user.click(within(dialog).getByRole('button', { name: '4x' }))
    await user.click(within(dialog).getByRole('switch', { name: 'Transparent background' }))
    await user.click(within(dialog).getByRole('switch', { name: /selection only/i }))
    const name = within(dialog).getByLabelText('File name')
    await user.clear(name)
    await user.type(name, 'prod')
    await user.click(within(dialog).getByRole('button', { name: /^export$/i }))

    await waitFor(() => expect(onExport).toHaveBeenCalledTimes(1))
    expect(onExport).toHaveBeenCalledWith({
      format: 'png',
      scale: 4,
      transparent: true,
      selectionOnly: true,
      filename: 'prod',
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('switches format and disables image-only options for JSON', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    renderPanel(
      <ExportDialog open onOpenChange={() => {}} defaultFilename="d" onExport={onExport} />,
    )
    await user.click(screen.getByRole('tab', { name: 'JSON' }))
    expect(screen.getByRole('switch', { name: 'Transparent background' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '2x' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /^export$/i }))
    await waitFor(() =>
      expect(onExport).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'json', filename: 'd', selectionOnly: false }),
      ),
    )
  })

  it('disables selection only without a selection', () => {
    renderPanel(
      <ExportDialog open onOpenChange={() => {}} defaultFilename="d" onExport={() => {}} />,
    )
    expect(screen.getByRole('switch', { name: /selection only/i })).toBeDisabled()
  })
})
