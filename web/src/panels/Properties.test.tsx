import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Properties } from './Properties'
import { makeEdge, makeFakeApi, makeNode, renderPanel } from './testing'

vi.setConfig({ testTimeout: 20_000 })

describe('Properties', () => {
  it('shows document settings when nothing is selected', async () => {
    const user = userEvent.setup()
    const api = makeFakeApi()
    renderPanel(<Properties api={api} />)
    expect(screen.getByRole('textbox', { name: 'Diagram title' })).toHaveValue('Untitled diagram')
    await user.click(screen.getByRole('switch', { name: 'Snap to grid' }))
    expect(api.updateSettings).toHaveBeenCalledWith({ snap: false })
    await user.click(screen.getByRole('button', { name: 'Increase Grid size' }))
    expect(api.updateSettings).toHaveBeenCalledWith({ gridSize: 18 })
  })

  it('applies a fill change from a swatch to the selected nodes', async () => {
    const user = userEvent.setup()
    const api = makeFakeApi({
      selection: { nodes: [makeNode(), makeNode({ id: 'n2' })], edges: [] },
    })
    renderPanel(<Properties api={api} />)
    expect(screen.getByText('2 objects selected')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Fill' }))
    await user.click(await screen.findByRole('button', { name: 'AWS orange' }))
    expect(api.updateSelectedNodes).toHaveBeenCalledWith({ style: { fill: '#ED7100' } })
  })

  it('applies a typed hex colour and rejects invalid input', async () => {
    const user = userEvent.setup()
    const api = makeFakeApi({ selection: { nodes: [makeNode()], edges: [] } })
    renderPanel(<Properties api={api} />)
    const hex = screen.getByRole('textbox', { name: 'Fill hex' })
    await user.clear(hex)
    await user.type(hex, '#112233{Enter}')
    expect(api.updateSelectedNodes).toHaveBeenCalledWith({ style: { fill: '#112233' } })
    await user.clear(hex)
    await user.type(hex, 'nope{Enter}')
    expect(api.updateSelectedNodes).toHaveBeenCalledTimes(1)
    expect(hex).toHaveValue('#ffffff')
  })

  it('updates label, stroke width and opacity for nodes', async () => {
    const user = userEvent.setup()
    const api = makeFakeApi({
      selection: {
        nodes: [makeNode({ data: { label: 'Box', shape: 'rect', style: { strokeWidth: 2 } } })],
        edges: [],
      },
    })
    renderPanel(<Properties api={api} />)
    const label = screen.getByRole('textbox', { name: 'Label' })
    expect(label).toHaveValue('Box')
    await user.type(label, 'x')
    expect(api.updateSelectedNodes).toHaveBeenCalledWith({ label: 'Boxx' })
    await user.click(screen.getByRole('button', { name: 'Increase Stroke width' }))
    expect(api.updateSelectedNodes).toHaveBeenCalledWith({ style: { strokeWidth: 2.5 } })
    const slider = screen.getByRole('slider', { name: 'Opacity' })
    slider.focus()
    await user.keyboard('{ArrowLeft}')
    expect(api.updateSelectedNodes).toHaveBeenCalledWith({ style: { opacity: 0.99 } })
  })

  it('only offers the container kind for containers and toggles lock', async () => {
    const user = userEvent.setup()
    const shapeApi = makeFakeApi({ selection: { nodes: [makeNode()], edges: [] } })
    const { unmount } = renderPanel(<Properties api={shapeApi} />)
    expect(screen.queryByRole('combobox', { name: 'Container kind' })).not.toBeInTheDocument()
    unmount()

    const api = makeFakeApi({
      selection: {
        nodes: [
          makeNode({
            type: 'container',
            data: { label: 'VPC', containerKind: 'aws.vpc', style: {} },
          }),
        ],
        edges: [],
      },
    })
    renderPanel(<Properties api={api} />)
    expect(screen.getByRole('combobox', { name: 'Container kind' })).toHaveTextContent('VPC')
    await user.click(screen.getByRole('switch', { name: 'Locked' }))
    expect(api.toggleLock).toHaveBeenCalled()
  })

  it('changes the icon through the search popover', async () => {
    const user = userEvent.setup()
    const api = makeFakeApi({
      selection: {
        nodes: [
          makeNode({
            type: 'icon',
            data: { label: 'Web', icon: { pack: 'aws', id: 'ec2' }, style: {} },
          }),
        ],
        edges: [],
      },
    })
    renderPanel(<Properties api={api} />)
    expect(screen.getByText('Amazon EC2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Change/ }))
    const search = await screen.findByRole('searchbox', { name: 'Search icons' })
    await user.type(search, 'lambda')
    const results = await screen.findByRole('group', { name: 'Icon results' })
    await user.click(within(results).getByRole('button', { name: /AWS Lambda/ }))
    expect(api.updateSelectedNodes).toHaveBeenCalledWith({ icon: { pack: 'aws', id: 'lambda' } })
  })

  it('enables arrange actions according to the selection size', async () => {
    const user = userEvent.setup()
    const one = makeFakeApi({ selection: { nodes: [makeNode()], edges: [] } })
    const { unmount } = renderPanel(<Properties api={one} />)
    expect(screen.getByRole('button', { name: 'Align left' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Bring to front' })).toBeEnabled()
    unmount()

    const three = makeFakeApi({
      selection: {
        nodes: [makeNode(), makeNode({ id: 'n2' }), makeNode({ id: 'n3' })],
        edges: [],
      },
    })
    renderPanel(<Properties api={three} />)
    await user.click(screen.getByRole('button', { name: 'Align left' }))
    await user.click(screen.getByRole('button', { name: 'Distribute horizontally' }))
    await user.click(screen.getByRole('button', { name: 'Send to back' }))
    expect(three.align).toHaveBeenCalledWith('left')
    expect(three.distribute).toHaveBeenCalledWith('x')
    expect(three.order).toHaveBeenCalledWith('back')
  })

  it('shows edge fields for an edge selection and applies changes', async () => {
    const user = userEvent.setup()
    const api = makeFakeApi({ selection: { nodes: [], edges: [makeEdge()] } })
    renderPanel(<Properties api={api} />)

    expect(screen.getByRole('textbox', { name: 'Label' })).toHaveValue('HTTPS')
    expect(screen.queryByRole('textbox', { name: 'Fill hex' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Align left' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Curved' }))
    expect(api.updateSelectedEdges).toHaveBeenCalledWith({ type: 'bezier' })

    const end = screen.getByRole('group', { name: 'End marker' })
    expect(within(end).getByRole('button', { name: 'Arrow' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(within(end).getByRole('button', { name: 'Circle' }))
    expect(api.updateSelectedEdges).toHaveBeenCalledWith({ markerEnd: 'circle' })

    const start = screen.getByRole('group', { name: 'Start marker' })
    await user.click(within(start).getByRole('button', { name: 'Diamond' }))
    expect(api.updateSelectedEdges).toHaveBeenCalledWith({ markerStart: 'diamond' })

    const position = screen.getByRole('slider', { name: 'Label position' })
    expect(position).toHaveAttribute('aria-valuenow', '50')
    fireEvent.keyDown(position, { key: 'ArrowRight' })
    expect(api.updateSelectedEdges).toHaveBeenCalledWith({ labelPosition: 0.51 })

    await user.click(screen.getByRole('button', { name: 'Stroke' }))
    await user.click(await screen.findByRole('button', { name: 'AWS red' }))
    expect(api.updateSelectedEdges).toHaveBeenCalledWith({ style: { stroke: '#DD344C' } })
  })

  it('shows only common fields for a mixed selection and applies them to both kinds', async () => {
    const user = userEvent.setup()
    const api = makeFakeApi({
      selection: { nodes: [makeNode()], edges: [makeEdge()] },
    })
    renderPanel(<Properties api={api} />)
    expect(screen.queryByRole('button', { name: 'Fill' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'End marker' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Increase Stroke width' }))
    expect(api.updateSelectedNodes).toHaveBeenCalledWith({ style: { strokeWidth: 2 } })
    expect(api.updateSelectedEdges).toHaveBeenCalledWith({ style: { strokeWidth: 2 } })
  })
})
