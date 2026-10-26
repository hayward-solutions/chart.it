import { ReactFlowProvider } from '@xyflow/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { TooltipProvider } from '@/components/ui'
import type { Document } from '@/model'
import { EditorStoreContext } from './context'
import { createEditorStore } from './store'

export type EditorProviderProps = {
  document: Document
  onChange?: (document: Document) => void
  readOnly?: boolean
  children: ReactNode
}

const RECENT_LIMIT = 10

export function EditorProvider({
  document,
  onChange,
  readOnly = false,
  children,
}: EditorProviderProps) {
  const [store] = useState(() => createEditorStore({ document, onChange, readOnly }))
  const recent = useRef<Document[]>([document])
  const lastProp = useRef<Document>(document)

  useEffect(() => {
    store.getState().setOnChange(onChange)
  }, [store, onChange])

  useEffect(() => {
    store.getState().setReadOnly(readOnly)
  }, [store, readOnly])

  useEffect(() => {
    return store.subscribe((state, previous) => {
      if (state.document !== previous.document) {
        recent.current = [state.document, ...recent.current].slice(0, RECENT_LIMIT)
      }
    })
  }, [store])

  useEffect(() => {
    if (document === lastProp.current) {
      return
    }
    lastProp.current = document
    if (recent.current.includes(document)) {
      return
    }
    const incoming = JSON.stringify(document)
    if (recent.current.some((candidate) => JSON.stringify(candidate) === incoming)) {
      return
    }
    store.getState().replaceDocument(document, { silent: true })
    recent.current = [document]
  }, [store, document])

  return (
    <EditorStoreContext value={store}>
      <TooltipProvider>
        <ReactFlowProvider>{children}</ReactFlowProvider>
      </TooltipProvider>
    </EditorStoreContext>
  )
}
