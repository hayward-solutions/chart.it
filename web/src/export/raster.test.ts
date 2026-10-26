import { describe, expect, it, vi } from 'vitest'
import type * as PngModule from './png'
import { ExportError } from './errors'
import { copyPngToClipboard, fitScale, MAX_CANVAS_SIDE } from './png'
import { pdfPageSize, PDF_MAX_POINTS, renderDocumentPdf } from './pdf'
import { makeDocument, makeNode, stubIconLoader } from './testing'

const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

vi.mock('./png', async (importOriginal) => {
  const original = await importOriginal<typeof PngModule>()
  return {
    ...original,
    rasterizeSvg: vi.fn(() => {
      const bytes = Uint8Array.from(atob(ONE_PIXEL_PNG), (char) => char.charCodeAt(0))
      return Promise.resolve(new Blob([bytes], { type: 'image/png' }))
    }),
  }
})

describe('fitScale', () => {
  it('keeps the requested scale for small diagrams', () => {
    expect(fitScale(800, 600, 2)).toBe(2)
  })

  it('shrinks to the canvas side limit', () => {
    const scale = fitScale(10000, 500, 4)
    expect(10000 * scale).toBeLessThanOrEqual(MAX_CANVAS_SIDE)
  })

  it('shrinks to the pixel budget', () => {
    const scale = fitScale(8000, 8000, 4)
    expect(8000 * 8000 * scale * scale).toBeLessThanOrEqual(100_000_001)
  })
})

describe('clipboard', () => {
  it('reports unsupported browsers', async () => {
    await expect(copyPngToClipboard(new Blob(['x']))).rejects.toMatchObject({ code: 'unsupported' })
  })

  it('wraps write failures', async () => {
    vi.stubGlobal('ClipboardItem', class {})
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write: vi.fn(() => Promise.reject(new Error('denied'))) },
    })
    await expect(copyPngToClipboard(new Blob(['x']))).rejects.toBeInstanceOf(ExportError)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    vi.unstubAllGlobals()
  })

  it('writes a png clipboard item', async () => {
    const write = vi.fn(() => Promise.resolve())
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public items: unknown) {}
      },
    )
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write } })
    await copyPngToClipboard(new Blob(['x'], { type: 'image/png' }))
    expect(write).toHaveBeenCalledTimes(1)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    vi.unstubAllGlobals()
  })
})

describe('pdf', () => {
  it('caps the page size', () => {
    expect(pdfPageSize(500, 300)).toEqual({ width: 500, height: 300 })
    const big = pdfPageSize(28800, 14400)
    expect(big.width).toBe(PDF_MAX_POINTS)
    expect(big.height).toBe(PDF_MAX_POINTS / 2)
  })

  it('renders a pdf blob', async () => {
    const doc = makeDocument([makeNode({ id: 'a', label: 'A' })], [], 'PDF title')
    const blob = await renderDocumentPdf(doc, { loadIcon: stubIconLoader })
    expect(blob.type).toBe('application/pdf')
    const head = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer())
    expect(head).toBe('%PDF-')
    const text = new TextDecoder('latin1').decode(await blob.arrayBuffer())
    expect(text).toContain('PDF title')
  })
})
