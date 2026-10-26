import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeFakeApi, makeNode, renderPanel } from './testing'
import { Toolbar } from './Toolbar'

vi.setConfig({ testTimeout: 20_000 })

describe('Toolbar', () => {
  it('reflects the active tool and disables undo and redo when unavailable', async () => {
    const user = userEvent.setup()
    const api = makeFakeApi({ tool: 'pan', canUndo: false, canRedo: true })
    renderPanel(<Toolbar api={api} />)

    expect(screen.getByRole('button', { name: 'Pan' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Select' }))
    expect(api.setTool).toHaveBeenCalledWith('select')
    await user.click(screen.getByRole('button', { name: 'Connector' }))
    expect(api.setTool).toHaveBeenCalledWith('connector')
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    expect(api.redo).toHaveBeenCalled()
  })

  it('commits a renamed title on Enter and cancels on Escape', async () => {
    const user = userEvent.setup()
    const api = makeFakeApi()
    renderPanel(<Toolbar api={api} />)

    await user.click(screen.getByRole('button', { name: /Diagram title/ }))
    const input = screen.getByRole('textbox', { name: 'Diagram title' })
    await user.clear(input)
    await user.type(input, 'Production{Enter}')
    expect(api.setTitle).toHaveBeenCalledWith('Production')

    await user.click(screen.getByRole('button', { name: /Diagram title/ }))
    await user.type(screen.getByRole('textbox', { name: 'Diagram title' }), 'zzz{Escape}')
    expect(api.setTitle).toHaveBeenCalledTimes(1)
  })

  it('commits the title on blur', async () => {
    const user = userEvent.setup()
    const api = makeFakeApi()
    renderPanel(<Toolbar api={api} />)
    await user.click(screen.getByRole('button', { name: /Diagram title/ }))
    const input = screen.getByRole('textbox', { name: 'Diagram title' })
    await user.clear(input)
    await user.type(input, 'Blurred')
    await user.tab()
    expect(api.setTitle).toHaveBeenCalledWith('Blurred')
  })

  it('lists every shape in the shapes menu', async () => {
    const user = userEvent.setup()
    const api = makeFakeApi()
    renderPanel(<Toolbar api={api} />)
    await user.click(screen.getByRole('button', { name: 'Shapes' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(9)
    await user.click(within(menu).getByRole('menuitem', { name: /Hexagon/ }))
    expect(api.addShape).toHaveBeenCalledWith('hexagon')
  })

  it('shows zoom as a percentage and zooms from the menu', async () => {
    const user = userEvent.setup()
    const api = makeFakeApi({ zoom: 1.25 })
    renderPanel(<Toolbar api={api} />)
    const level = screen.getByRole('button', { name: 'Zoom level' })
    expect(level).toHaveTextContent('125%')
    await user.click(level)
    await user.click(await screen.findByRole('menuitem', { name: '200%' }))
    expect(api.zoomTo).toHaveBeenCalledWith(2)
    await user.click(screen.getByRole('button', { name: 'Zoom level' }))
    await user.click(await screen.findByRole('menuitem', { name: /Fit to screen/ }))
    expect(api.fitView).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(api.zoomIn).toHaveBeenCalled()
  })

  it('enables selection actions only when there is a selection', async () => {
    const user = userEvent.setup()
    const empty = makeFakeApi()
    const { unmount } = renderPanel(<Toolbar api={empty} />)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Group' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Lock' })).toBeDisabled()
    unmount()

    const api = makeFakeApi({
      selection: { nodes: [makeNode(), makeNode({ id: 'n2', locked: true })], edges: [] },
    })
    renderPanel(<Toolbar api={api} />)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Group' }))
    await user.click(screen.getByRole('button', { name: 'Lock' }))
    expect(api.remove).toHaveBeenCalled()
    expect(api.group).toHaveBeenCalled()
    expect(api.toggleLock).toHaveBeenCalled()
  })

  it('renders the save status, back slot and action slots', () => {
    renderPanel(
      <Toolbar
        api={makeFakeApi()}
        saveStatus="conflict"
        backSlot={<a href="/">Back</a>}
        actions={<button type="button">Export</button>}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Conflict')
    expect(screen.getByRole('link', { name: 'Back' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument()
  })
})
