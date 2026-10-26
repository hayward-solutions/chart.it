import { saveAs } from 'file-saver'
import { describe, expect, it, vi } from 'vitest'
import { downloadBlob, safeFilename } from './download'

vi.mock('file-saver', () => ({ saveAs: vi.fn() }))

describe('safeFilename', () => {
  it('slugs titles', () => {
    expect(safeFilename('My Diagram: v2 / final?', 'png')).toBe('my-diagram-v2-final.png')
  })

  it('keeps non-latin letters and falls back for empty titles', () => {
    expect(safeFilename('Diagramme réseau', 'svg')).toBe('diagramme-réseau.svg')
    expect(safeFilename('???', '.pdf')).toBe('diagram.pdf')
    expect(safeFilename('', 'json')).toBe('diagram.json')
  })

  it('caps the length', () => {
    expect(safeFilename('a'.repeat(300), 'png').length).toBeLessThanOrEqual(84)
  })
})

describe('downloadBlob', () => {
  it('delegates to file-saver', () => {
    const blob = new Blob(['x'])
    downloadBlob(blob, 'x.txt')
    expect(saveAs).toHaveBeenCalledWith(blob, 'x.txt')
  })
})
