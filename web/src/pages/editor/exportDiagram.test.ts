import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { copySelectionAsPng, exportDocument } from '@/export'
import { makeDocument, makeNode } from '@/export/testing'
import type { ExportOptions } from '@/panels'
import { copyDiagramAsPng, exportDiagram } from './exportDiagram'

vi.mock('@/export', () => ({
  exportDocument: vi.fn(async () => {}),
  copySelectionAsPng: vi.fn(async () => {}),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const doc = makeDocument([
  makeNode({ id: 'a', type: 'shape', shape: 'rect' }),
  makeNode({ id: 'b', type: 'shape', shape: 'rect' }),
])

function options(overrides: Partial<ExportOptions> = {}): ExportOptions {
  return {
    format: 'png',
    scale: 2,
    transparent: false,
    selectionOnly: false,
    filename: 'my-diagram',
    ...overrides,
  }
}

describe('exportDiagram', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(['png', 'svg', 'pdf', 'json'] as const)(
    'exports %s through exportDocument',
    async (format) => {
      await exportDiagram(options({ format, scale: 4, transparent: true }), doc, [])
      expect(exportDocument).toHaveBeenCalledWith(doc, {
        format,
        scale: 4,
        transparent: true,
        selectionIds: undefined,
        filename: 'my-diagram',
      })
    },
  )

  it('passes the selection only when selection only is ticked', async () => {
    await exportDiagram(options({ selectionOnly: true }), doc, ['a'])
    expect(vi.mocked(exportDocument).mock.calls[0]?.[1].selectionIds).toEqual(['a'])
    await exportDiagram(options({ selectionOnly: false }), doc, ['a'])
    expect(vi.mocked(exportDocument).mock.calls[1]?.[1].selectionIds).toBeUndefined()
    await exportDiagram(options({ selectionOnly: true }), doc, [])
    expect(vi.mocked(exportDocument).mock.calls[2]?.[1].selectionIds).toBeUndefined()
  })

  it('reports export failures', async () => {
    vi.mocked(exportDocument).mockRejectedValueOnce(new Error('boom'))
    await exportDiagram(options(), doc, [])
    expect(toast.error).toHaveBeenCalledWith('Could not export: boom')
  })
})

describe('copyDiagramAsPng', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('copies the selection, or everything when nothing is selected', async () => {
    await copyDiagramAsPng(doc, ['b'])
    expect(copySelectionAsPng).toHaveBeenLastCalledWith(doc, ['b'])
    await copyDiagramAsPng(doc, [])
    expect(copySelectionAsPng).toHaveBeenLastCalledWith(doc, ['a', 'b'])
    expect(toast.success).toHaveBeenCalledTimes(2)
  })

  it('toasts when the copy fails', async () => {
    vi.mocked(copySelectionAsPng).mockRejectedValueOnce(new Error('denied'))
    await copyDiagramAsPng(doc, ['a'])
    expect(toast.error).toHaveBeenCalledWith('Could not copy: denied')
  })

  it('refuses an empty diagram', async () => {
    await copyDiagramAsPng(makeDocument([]), [])
    expect(copySelectionAsPng).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Nothing to copy yet')
  })
})
