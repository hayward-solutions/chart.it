import type { DragEvent } from 'react'
import type { ManifestIcon } from '@/icons'

export const ICON_MIME = 'application/x-chartit-icon'
export const SHAPE_MIME = 'application/x-chartit-shape'
export const CONTAINER_MIME = 'application/x-chartit-container'
export const TEXT_MIME = 'application/x-chartit-text'

export type IconPayload = { pack: string; id: string; title: string; kind: string }

export function toIconPayload(
  icon: Pick<ManifestIcon, 'pack' | 'id' | 'title' | 'kind'>,
): IconPayload {
  return { pack: icon.pack, id: icon.id, title: icon.title, kind: icon.kind }
}

export function beginDrag(event: DragEvent<HTMLElement>, mime: string, payload: unknown): void {
  const transfer = event.dataTransfer
  transfer.setData(mime, JSON.stringify(payload))
  transfer.effectAllowed = 'copy'
  const preview = event.currentTarget.querySelector<HTMLElement>('[data-drag-preview]')
  if (preview && typeof transfer.setDragImage === 'function') {
    transfer.setDragImage(preview, preview.offsetWidth / 2, preview.offsetHeight / 2)
  }
}
