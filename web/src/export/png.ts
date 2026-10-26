import type { Document } from '@/model'
import { ExportError } from './errors'
import type { IconLoader } from './icons'
import { renderDocumentSvgDetailed } from './svg'

export type PngScale = 1 | 2 | 4

export type PngOptions = {
  scale?: PngScale
  background?: string | 'transparent'
  selectionIds?: string[]
  padding?: number
  loadIcon?: IconLoader
}

export const MAX_CANVAS_SIDE = 16384
export const MAX_CANVAS_PIXELS = 100_000_000

export function fitScale(width: number, height: number, scale: number): number {
  let fitted = scale
  const longest = Math.max(width, height, 1)
  if (longest * fitted > MAX_CANVAS_SIDE) {
    fitted = MAX_CANVAS_SIDE / longest
  }
  const pixels = width * height * fitted * fitted
  if (pixels > MAX_CANVAS_PIXELS) {
    fitted *= Math.sqrt(MAX_CANVAS_PIXELS / pixels)
  }
  return fitted
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      resolve(image)
    }
    image.onerror = () => {
      reject(new ExportError('render', 'The diagram could not be rasterised'))
    }
    image.src = url
  })
}

export async function rasterizeSvg(
  svg: string,
  width: number,
  height: number,
  scale: number,
): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = await loadImage(url)
    const factor = fitScale(width, height, scale)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * factor))
    canvas.height = Math.max(1, Math.round(height * factor))
    const context = canvas.getContext('2d')
    if (!context) {
      throw new ExportError('render', 'A 2D canvas is not available in this browser')
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png')
    })
    if (!blob) {
      throw new ExportError('render', 'The PNG could not be encoded')
    }
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function renderDocumentPng(doc: Document, options: PngOptions = {}): Promise<Blob> {
  const { svg, width, height } = await renderDocumentSvgDetailed(doc, {
    selectionIds: options.selectionIds,
    padding: options.padding,
    background: options.background,
    loadIcon: options.loadIcon,
    inlineIcons: true,
  })
  return rasterizeSvg(svg, width, height, options.scale ?? 2)
}

export async function copyPngToClipboard(blob: Blob): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || typeof navigator.clipboard?.write !== 'function') {
    throw new ExportError('unsupported', 'Copying images is not supported in this browser')
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  } catch (error) {
    throw new ExportError('clipboard', 'The image could not be copied to the clipboard', {
      cause: error,
    })
  }
}
