import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { updateDocumentMeta } from '@/api'

const DEBOUNCE_MS = 600

export type TitleSync = {
  sync: (title: string) => void
  flush: () => Promise<void>
}

export function useTitleSync(id: string, initialTitle: string): TitleSync {
  const state = useRef({
    synced: initialTitle,
    pending: null as string | null,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
  })

  const [controls] = useState<TitleSync>(() => {
    const flush = async () => {
      const current = state.current
      clearTimeout(current.timer)
      current.timer = undefined
      const title = current.pending
      current.pending = null
      if (title === null || title === current.synced) {
        return
      }
      try {
        await updateDocumentMeta(id, { title })
        current.synced = title
      } catch (error) {
        toast.error(`Could not rename: ${error instanceof Error ? error.message : 'unknown error'}`)
      }
    }
    return {
      flush,
      sync: (title) => {
        const current = state.current
        if (title === current.synced && current.pending === null) {
          return
        }
        current.pending = title
        clearTimeout(current.timer)
        current.timer = setTimeout(() => {
          void flush()
        }, DEBOUNCE_MS)
      },
    }
  })

  useEffect(() => {
    return () => {
      void controls.flush()
    }
  }, [controls])

  return controls
}
