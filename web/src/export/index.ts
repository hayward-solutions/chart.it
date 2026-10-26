import type { Document } from '@/model'
import { downloadBlob, safeFilename } from './download'
import { exportDocumentJson } from './json'
import { renderDocumentPdf } from './pdf'
import { copyPngToClipboard, renderDocumentPng, type PngScale } from './png'
import { renderDocumentSvg } from './svg'

export type ExportFormat = 'png' | 'svg' | 'pdf' | 'json'

export type ExportOptions = {
  format: ExportFormat
  scale?: PngScale
  transparent?: boolean
  selectionIds?: string[]
  filename?: string
}

function withExtension(filename: string, ext: string): string {
  return filename.toLowerCase().endsWith(`.${ext}`) ? filename : `${filename}.${ext}`
}

export async function exportDocument(doc: Document, options: ExportOptions): Promise<void> {
  const { format } = options
  const filename = options.filename
    ? withExtension(options.filename, format)
    : safeFilename(doc.title, format)
  const shared = {
    selectionIds: options.selectionIds,
    background: options.transparent ? ('transparent' as const) : undefined,
  }
  switch (format) {
    case 'png':
      downloadBlob(await renderDocumentPng(doc, { ...shared, scale: options.scale ?? 2 }), filename)
      break
    case 'svg': {
      const svg = await renderDocumentSvg(doc, { ...shared, inlineIcons: true })
      downloadBlob(
        new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], {
          type: 'image/svg+xml;charset=utf-8',
        }),
        filename,
      )
      break
    }
    case 'pdf':
      downloadBlob(await renderDocumentPdf(doc, shared), filename)
      break
    case 'json':
      downloadBlob(exportDocumentJson(doc), filename)
      break
  }
}

export async function copySelectionAsPng(doc: Document, selectionIds: string[]): Promise<void> {
  const blob = await renderDocumentPng(doc, { scale: 2, selectionIds, padding: 16 })
  await copyPngToClipboard(blob)
}

export { downloadBlob, safeFilename } from './download'
export { ExportError, isExportError, type ExportErrorCode } from './errors'
export { exportDocumentJson, importDocumentJson } from './json'
export { renderDocumentPdf, type PdfOptions } from './pdf'
export { copyPngToClipboard, renderDocumentPng, type PngOptions, type PngScale } from './png'
export {
  renderDocumentSvg,
  renderDocumentSvgDetailed,
  type SvgOptions,
  type SvgResult,
} from './svg'
export type { IconAsset, IconLoader } from './icons'
