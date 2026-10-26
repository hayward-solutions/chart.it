import { saveAs } from 'file-saver'

export function downloadBlob(blob: Blob, filename: string): void {
  saveAs(blob, filename)
}

export function safeFilename(title: string, ext: string): string {
  const base = title
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s._-]+/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80)
    .toLowerCase()
  return `${base || 'diagram'}.${ext.replace(/^\./, '')}`
}
