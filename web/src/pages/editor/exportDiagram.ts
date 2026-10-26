import { toast } from 'sonner'
import { copySelectionAsPng, exportDocument } from '@/export'
import type { Document } from '@/model'
import type { ExportOptions } from '@/panels'

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error'
}

export async function exportDiagram(
  options: ExportOptions,
  document: Document,
  selectedIds: string[],
): Promise<void> {
  try {
    await exportDocument(document, {
      format: options.format,
      scale: options.scale,
      transparent: options.transparent,
      selectionIds: options.selectionOnly && selectedIds.length > 0 ? selectedIds : undefined,
      filename: options.filename,
    })
  } catch (error) {
    toast.error(`Could not export: ${describe(error)}`)
  }
}

export async function copyDiagramAsPng(document: Document, selectedIds: string[]): Promise<void> {
  const ids = selectedIds.length > 0 ? selectedIds : document.nodes.map((node) => node.id)
  if (ids.length === 0) {
    toast.error('Nothing to copy yet')
    return
  }
  try {
    await copySelectionAsPng(document, ids)
    toast.success(selectedIds.length > 0 ? 'Copied selection as PNG' : 'Copied diagram as PNG')
  } catch (error) {
    toast.error(`Could not copy: ${describe(error)}`)
  }
}
