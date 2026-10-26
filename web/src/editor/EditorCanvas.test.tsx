import { useEffect } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/api/mocks/server'
import { createEmptyDocument, type Document } from '@/model'
import { EditorCanvas } from './EditorCanvas'
import { EditorProvider } from './EditorProvider'
import { useEditorApi, type EditorApi } from './api'
import { useEditorStoreApi } from './context'
import { resetIconFiles } from './iconFiles'
import { buildSampleDocument } from './sample'
import type { EditorStore } from './store'

class DOMMatrixReadOnlyStub {
  m22 = 1
  constructor(_transform?: string) {}
}

beforeAll(() => {
  ;(globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly =
    DOMMatrixReadOnlyStub
})

beforeEach(() => {
  resetIconFiles()
  server.use(
    http.get('*/icons/manifest.json', () =>
      HttpResponse.json({
        icons: [
          { pack: 'aws', id: 'ec2', file: 'aws/compute/ec2.svg' },
          { pack: 'aws', id: 'rds', file: 'aws/databases/rds.svg' },
          { pack: 'aws', id: 'elb-application-load-balancer', file: 'aws/elb.svg' },
          { pack: 'aws', id: 'group-vpc', file: 'aws/groups/group-vpc.svg' },
        ],
      }),
    ),
  )
})

let captured: { api: EditorApi; store: EditorStore } | null = null

function Capture() {
  const api = useEditorApi()
  const store = useEditorStoreApi()
  useEffect(() => {
    captured = { api, store }
  })
  return null
}

describe('EditorCanvas', () => {
  it('mounts every node and edge of the sample document', async () => {
    const doc = buildSampleDocument()
    render(<EditorCanvas document={doc} />)
    for (const node of doc.nodes) {
      expect(await screen.findByTestId(`rf__node-${node.id}`)).toBeInTheDocument()
    }
    expect(screen.getByText('Production VPC')).toBeInTheDocument()
    expect(screen.getByText('Orders DB')).toBeInTheDocument()
    expect(screen.getByLabelText('Zoom')).toBeInTheDocument()
  })

  it('loads icon images from the manifest', async () => {
    const doc = buildSampleDocument()
    const { container } = render(<EditorCanvas document={doc} />)
    await waitFor(() => {
      expect(container.querySelector('img[src="/icons/aws/compute/ec2.svg"]')).not.toBeNull()
    })
    expect(container.querySelector('img[src="/icons/aws/groups/group-vpc.svg"]')).not.toBeNull()
  })

  it('applies the document background and hides the grid when none', () => {
    const doc: Document = {
      ...createEmptyDocument('empty'),
      settings: { ...createEmptyDocument('x').settings, background: '#102030', grid: 'none' },
    }
    const { container } = render(<EditorCanvas document={doc} />)
    const flow = container.querySelector('.react-flow') as HTMLElement
    expect(flow.style.background).toContain('rgb(16, 32, 48)')
    expect(container.querySelector('.react-flow__background')).toBeNull()
  })

  it('edits a label inline on double click and reports the change', async () => {
    const onChange = vi.fn()
    render(<EditorCanvas document={buildSampleDocument()} onChange={onChange} />)
    const node = await screen.findByTestId('rf__node-ec2-a')
    fireEvent.doubleClick(node)
    const box = await screen.findByLabelText('Edit label')
    fireEvent.change(box, { target: { value: 'Frontend' } })
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true })
    await waitFor(() => {
      expect(screen.queryByLabelText('Edit label')).toBeNull()
    })
    expect(screen.getByText('Frontend')).toBeInTheDocument()
    expect(onChange).toHaveBeenCalledTimes(1)
    const emitted = onChange.mock.calls[0]![0] as Document
    expect(emitted.nodes.find((n) => n.id === 'ec2-a')!.data.label).toBe('Frontend')
  })

  it('commits on blur and on Escape', async () => {
    const onChange = vi.fn()
    render(<EditorCanvas document={buildSampleDocument()} onChange={onChange} />)
    fireEvent.doubleClick(await screen.findByTestId('rf__node-rds'))
    const first = await screen.findByLabelText('Edit label')
    fireEvent.change(first, { target: { value: 'Primary' } })
    fireEvent.blur(first)
    expect(await screen.findByText('Primary')).toBeInTheDocument()
    fireEvent.doubleClick(screen.getByTestId('rf__node-ec2-b'))
    const second = await screen.findByLabelText('Edit label')
    fireEvent.change(second, { target: { value: 'Web two' } })
    fireEvent.keyDown(second, { key: 'Escape' })
    expect(await screen.findByText('Web two')).toBeInTheDocument()
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('never edits in read-only mode', async () => {
    render(<EditorCanvas document={buildSampleDocument()} readOnly />)
    fireEvent.doubleClick(await screen.findByTestId('rf__node-ec2-a'))
    expect(screen.queryByLabelText('Edit label')).toBeNull()
  })

  it('handles keyboard shortcuts through the shared registry', async () => {
    const onChange = vi.fn()
    render(
      <EditorProvider document={buildSampleDocument()} onChange={onChange}>
        <EditorCanvas />
        <Capture />
      </EditorProvider>,
    )
    await screen.findByTestId('rf__node-alb')
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true })
    expect(captured!.api.selection.nodes).toHaveLength(8)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(captured!.api.selection.nodes).toHaveLength(0)
    fireEvent.keyDown(window, { key: 'r' })
    expect(captured!.api.tool).toBe('shape:rect')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(captured!.api.tool).toBe('select')
    act(() => {
      captured!.store.getState().setSelection({ nodes: ['alb'] })
    })
    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true })
    expect(captured!.api.document.nodes.find((n) => n.id === 'alb')!.position.x).toBe(108)
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(captured!.api.document.nodes.find((n) => n.id === 'alb')!.position.x).toBe(98)
    expect(captured!.api.canRedo).toBe(true)
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(captured!.api.document.nodes.some((n) => n.id === 'alb')).toBe(false)
    expect(screen.queryByTestId('rf__node-alb')).toBeNull()
  })

  it('ignores shortcuts while typing in an input', async () => {
    render(
      <>
        <input aria-label="outside" />
        <EditorProvider document={buildSampleDocument()}>
          <EditorCanvas />
          <Capture />
        </EditorProvider>
      </>,
    )
    await screen.findByTestId('rf__node-alb')
    const input = screen.getByLabelText('outside')
    input.focus()
    fireEvent.keyDown(input, { key: 'r' })
    expect(captured!.api.tool).toBe('select')
    fireEvent.keyDown(input, { key: 'a', ctrlKey: true })
    expect(captured!.api.selection.nodes).toHaveLength(0)
  })

  it('exposes a working api for panels', async () => {
    const onChange = vi.fn()
    render(
      <EditorProvider document={createEmptyDocument('api')} onChange={onChange}>
        <EditorCanvas />
        <Capture />
      </EditorProvider>,
    )
    act(() => {
      captured!.api.addShape('ellipse', { x: 200, y: 200 })
    })
    expect(captured!.api.document.nodes).toHaveLength(1)
    expect(captured!.api.selection.nodes[0]!.data.shape).toBe('ellipse')
    const stable = captured!.api.undo
    act(() => {
      captured!.api.updateSelectedNodes({
        label: 'Hello',
        style: { fill: '#ff0000' },
        locked: true,
      })
    })
    const updated = captured!.api.document.nodes[0]!
    expect(updated.data.label).toBe('Hello')
    expect(updated.data.style.fill).toBe('#ff0000')
    expect(updated.locked).toBe(true)
    act(() => {
      captured!.api.addContainer('aws.vpc', { x: 600, y: 200 })
      captured!.api.addIcon(
        { pack: 'aws', id: 'group-region', title: 'Region', kind: 'group' },
        { x: 900, y: 600 },
      )
      captured!.api.addIcon(
        { pack: 'aws', id: 'ec2', title: 'EC2', kind: 'service' },
        { x: 100, y: 600 },
      )
    })
    const types = captured!.api.document.nodes.map((n) => [n.type, n.data.containerKind])
    expect(types).toContainEqual(['container', 'aws.vpc'])
    expect(types).toContainEqual(['container', 'aws.region'])
    expect(types).toContainEqual(['icon', undefined])
    act(() => {
      captured!.api.addText({ x: 0, y: 0 })
    })
    expect(await screen.findByLabelText('Edit label')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByLabelText('Edit label'), { key: 'Escape' })
    act(() => {
      captured!.api.undo()
    })
    expect(captured!.api.canRedo).toBe(true)
    expect(captured!.api.undo).toBe(stable)
    expect(onChange).toHaveBeenCalled()
  })

  it('opens the command palette with the keyboard and runs a command', async () => {
    render(
      <EditorProvider document={buildSampleDocument()}>
        <EditorCanvas />
        <Capture />
      </EditorProvider>,
    )
    await screen.findByTestId('rf__node-alb')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const input = await screen.findByPlaceholderText('Type a command')
    fireEvent.change(input, { target: { value: 'select all' } })
    const item = await screen.findByText('Select all')
    fireEvent.click(item)
    await waitFor(() => {
      expect(captured!.api.selection.nodes).toHaveLength(8)
    })
  })

  it('keeps independent state for two canvases on one page', async () => {
    const first = buildSampleDocument()
    const second = createEmptyDocument('second')
    render(
      <>
        <div data-testid="one">
          <EditorCanvas document={first} />
        </div>
        <div data-testid="two">
          <EditorCanvas document={second} readOnly />
        </div>
      </>,
    )
    await waitFor(() => {
      expect(screen.getAllByTestId('editor-canvas')).toHaveLength(2)
    })
    expect(screen.getAllByTestId(/^rf__node-/)).toHaveLength(first.nodes.length)
  })

  it('adopts a new document prop but ignores echoes of its own changes', async () => {
    const onChange = vi.fn()
    const doc = buildSampleDocument()
    const { rerender } = render(
      <EditorProvider document={doc} onChange={onChange}>
        <EditorCanvas />
        <Capture />
      </EditorProvider>,
    )
    await screen.findByTestId('rf__node-alb')
    act(() => {
      captured!.store.getState().moveNodes(['alb'], { x: 5, y: 0 })
    })
    const echoed = onChange.mock.calls[0]![0] as Document
    rerender(
      <EditorProvider document={structuredClone(echoed)} onChange={onChange}>
        <EditorCanvas />
        <Capture />
      </EditorProvider>,
    )
    expect(captured!.api.canUndo).toBe(true)
    rerender(
      <EditorProvider document={createEmptyDocument('fresh')} onChange={onChange}>
        <EditorCanvas />
        <Capture />
      </EditorProvider>,
    )
    await waitFor(() => {
      expect(captured!.api.document.title).toBe('fresh')
    })
    expect(captured!.api.canUndo).toBe(false)
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
