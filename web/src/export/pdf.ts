import type { Document } from '@/model'
import { ExportError } from './errors'
import type { IconLoader } from './icons'
import { fitScale, rasterizeSvg } from './png'
import { renderDocumentSvgDetailed } from './svg'

export type PdfOptions = {
  background?: string | 'transparent'
  selectionIds?: string[]
  padding?: number
  loadIcon?: IconLoader
}

export const PDF_MAX_POINTS = 14400

export function pdfPageSize(width: number, height: number): { width: number; height: number } {
  const ratio = Math.min(1, PDF_MAX_POINTS / Math.max(width, height, 1))
  return { width: Math.max(1, width * ratio), height: Math.max(1, height * ratio) }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(String(reader.result))
    }
    reader.onerror = () => {
      reject(new ExportError('render', 'The PNG could not be read'))
    }
    reader.readAsDataURL(blob)
  })
}

export async function renderDocumentPdf(doc: Document, options: PdfOptions = {}): Promise<Blob> {
  const { svg, width, height } = await renderDocumentSvgDetailed(doc, {
    selectionIds: options.selectionIds,
    padding: options.padding,
    background: options.background,
    loadIcon: options.loadIcon,
    inlineIcons: true,
  })
  const page = pdfPageSize(width, height)
  const png = await rasterizeSvg(svg, width, height, fitScale(width, height, 2))
  const dataUrl = await blobToDataUrl(png)
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({
    orientation: page.width >= page.height ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [page.width, page.height],
    compress: true,
  })
  pdf.setProperties({ title: doc.title, creator: 'Chart.it' })
  pdf.addImage(dataUrl, 'PNG', 0, 0, page.width, page.height, undefined, 'FAST')
  return pdf.output('blob')
}
