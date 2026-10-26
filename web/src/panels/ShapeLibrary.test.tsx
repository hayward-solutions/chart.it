import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CONTAINER_MIME, ICON_MIME, SHAPE_MIME } from './drag'
import { ShapeLibrary } from './ShapeLibrary'
import { makeFakeApi, renderPanel } from './testing'

function dragData() {
  const store = new Map<string, string>()
  return {
    store,
    dataTransfer: {
      setData: (type: string, value: string) => store.set(type, value),
      effectAllowed: 'none',
    },
  }
}

vi.setConfig({ testTimeout: 20_000 })

describe('ShapeLibrary', () => {
  it('finds icons across packs by search and adds them on click', async () => {
    const user = userEvent.setup()
    const api = makeFakeApi()
    renderPanel(<ShapeLibrary api={api} />)

    await user.type(screen.getByRole('textbox', { name: 'Search shapes' }), 'ec2')

    const results = await screen.findByRole('group', { name: 'Search results' })
    const tile = within(results).getByRole('button', { name: /Amazon EC2/ })
    await user.click(tile)

    expect(api.addIcon).toHaveBeenCalledWith({
      pack: 'aws',
      id: 'ec2',
      title: 'Amazon EC2',
      kind: 'service',
    })
  })

  it('reports an empty search and clears it', async () => {
    const user = userEvent.setup()
    renderPanel(<ShapeLibrary api={makeFakeApi()} />)
    const input = screen.getByRole('textbox', { name: 'Search shapes' })
    await user.type(input, 'zzzzqqqq')
    expect(await screen.findByText(/No icons match/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(input).toHaveValue('')
    expect(await screen.findByRole('tab', { name: 'AWS' })).toBeInTheDocument()
  })

  it('lists the categories of the active pack and persists collapsed state', async () => {
    const user = userEvent.setup()
    const { unmount } = renderPanel(<ShapeLibrary api={makeFakeApi()} />)
    const compute = await screen.findByRole('button', { name: /Compute/ })
    expect(compute).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'AWS Lambda' })).toBeInTheDocument()
    await user.click(compute)
    expect(screen.queryByRole('button', { name: 'AWS Lambda' })).not.toBeInTheDocument()
    unmount()

    renderPanel(<ShapeLibrary api={makeFakeApi()} />)
    expect(await screen.findByRole('button', { name: /Compute/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('activates a tile from the keyboard', async () => {
    const user = userEvent.setup()
    const api = makeFakeApi()
    renderPanel(<ShapeLibrary api={api} />)
    const tile = await screen.findByRole('button', { name: 'AWS Lambda' })
    tile.focus()
    await user.keyboard('{Enter}')
    expect(api.addIcon).toHaveBeenCalledWith(expect.objectContaining({ id: 'lambda' }))
  })

  it('remembers recently used icons', async () => {
    const user = userEvent.setup()
    renderPanel(<ShapeLibrary api={makeFakeApi()} />)
    await user.click(await screen.findByRole('button', { name: 'AWS Lambda' }))
    const recent = await screen.findByRole('group', { name: 'Recent icons' })
    expect(within(recent).getByRole('button', { name: /AWS Lambda/ })).toBeInTheDocument()
  })

  it('sets drag payloads for icons, shapes and containers', async () => {
    const user = userEvent.setup()
    renderPanel(<ShapeLibrary api={makeFakeApi()} />)

    const icon = dragData()
    fireEvent.dragStart(await screen.findByRole('button', { name: 'Amazon EC2' }), {
      dataTransfer: icon.dataTransfer,
    })
    expect(JSON.parse(icon.store.get(ICON_MIME) ?? '{}')).toEqual({
      pack: 'aws',
      id: 'ec2',
      title: 'Amazon EC2',
      kind: 'service',
    })

    await user.click(screen.getByRole('tab', { name: 'Shapes' }))
    const shape = dragData()
    fireEvent.dragStart(screen.getByRole('button', { name: 'Cylinder' }), {
      dataTransfer: shape.dataTransfer,
    })
    expect(JSON.parse(shape.store.get(SHAPE_MIME) ?? '{}')).toEqual({ shape: 'cylinder' })

    const container = dragData()
    fireEvent.dragStart(screen.getByRole('button', { name: 'VPC container' }), {
      dataTransfer: container.dataTransfer,
    })
    expect(JSON.parse(container.store.get(CONTAINER_MIME) ?? '{}')).toEqual({
      containerKind: 'aws.vpc',
    })
  })

  it('adds shapes, text and containers from the shapes tab', async () => {
    const user = userEvent.setup()
    const api = makeFakeApi()
    renderPanel(<ShapeLibrary api={api} />)
    await user.click(await screen.findByRole('tab', { name: 'Shapes' }))
    await user.click(screen.getByRole('button', { name: 'Diamond' }))
    expect(api.addShape).toHaveBeenCalledWith('diamond')
    await user.click(screen.getByRole('button', { name: 'Text' }))
    expect(api.addText).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Namespace container' }))
    expect(api.addContainer).toHaveBeenCalledWith('k8s.namespace')
  })
})
