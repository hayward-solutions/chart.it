import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { putThumbnail, queryKeys, saveContent, type DocumentRecord } from '@/api'
import { EditorProvider } from '@/editor'
import type { Document } from '@/model'
import { createAutosave, type AutosaveStatus, type SaveRequest } from './autosave'
import { captureThumbnail, findFlowElement } from './capture'
import { EditorShell } from './EditorShell'
import { LeaveGuard } from './LeaveGuard'
import { createThumbnailer } from './thumbnail'
import { useTitleSync } from './useTitleSync'

function findRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-editor-root]')
}

type EditorSessionProps = {
  record: DocumentRecord
}

export function EditorSession({ record }: EditorSessionProps) {
  const id = record.id
  const client = useQueryClient()
  const [initialDocument] = useState(record.content)
  const [status, setStatus] = useState<AutosaveStatus>('saved')
  const titleSync = useTitleSync(id, record.title)

  const [thumbnailer] = useState(() =>
    createThumbnailer({
      getElement: () => findFlowElement(findRoot()),
      capture: captureThumbnail,
      upload: (png) => putThumbnail(id, png),
    }),
  )

  const [autosave] = useState(() =>
    createAutosave({
      initialVersion: record.version,
      onStatus: setStatus,
      save: async (request: SaveRequest) => {
        const input = {
          version: request.version,
          content: request.content,
          ...(request.label !== undefined ? { label: request.label } : {}),
        }
        if (request.keepalive) {
          try {
            return await saveContent(id, input, { keepalive: true })
          } catch (error) {
            if (!(error instanceof TypeError)) {
              throw error
            }
          }
        }
        return saveContent(id, input)
      },
      onSaved: (_result, content) => {
        void client.invalidateQueries({ queryKey: queryKeys.versions(id) })
        if (content.nodes.length > 0) {
          thumbnailer.markSaved()
        }
      },
    }),
  )

  const handleChange = useCallback(
    (next: Document) => {
      autosave.change(next)
      titleSync.sync(next.title)
    },
    [autosave, titleSync],
  )

  useEffect(() => {
    const flushNow = () => {
      void autosave.flush({ keepalive: true })
      void titleSync.flush()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushNow()
      }
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (autosave.isPending()) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('pagehide', flushNow)
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flushNow)
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('visibilitychange', onVisibility)
      void autosave.flush({ keepalive: true })
      autosave.dispose()
      thumbnailer.dispose()
    }
  }, [autosave, thumbnailer, titleSync])

  return (
    <div data-editor-root className="h-full">
      <EditorProvider document={initialDocument} onChange={handleChange}>
        <EditorShell documentId={id} autosave={autosave} status={status} />
      </EditorProvider>
      <LeaveGuard autosave={autosave} thumbnailer={thumbnailer} />
    </div>
  )
}
