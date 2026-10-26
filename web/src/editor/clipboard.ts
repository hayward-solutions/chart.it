import { z } from 'zod'
import { EdgeSchema, NodeSchema } from '@/model'
import type { ClipboardPayload } from './types'

export const CLIPBOARD_PREFIX = 'chartit/'

const PayloadSchema = z.object({
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  rootParents: z.record(z.string(), z.string()),
})

export function serializeClipboard(payload: ClipboardPayload): string {
  return `${CLIPBOARD_PREFIX}${JSON.stringify(payload)}`
}

export function parseClipboard(text: string | null | undefined): ClipboardPayload | null {
  if (!text || !text.startsWith(CLIPBOARD_PREFIX)) {
    return null
  }
  try {
    const parsed = PayloadSchema.safeParse(JSON.parse(text.slice(CLIPBOARD_PREFIX.length)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
