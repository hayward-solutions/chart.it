import { createContext, use } from 'react'
import { useStore } from 'zustand'
import type { EditorState, EditorStore } from './store'

export const EditorStoreContext = createContext<EditorStore | null>(null)

export function useOptionalEditorStoreApi(): EditorStore | null {
  return use(EditorStoreContext)
}

export function useEditorStoreApi(): EditorStore {
  const store = use(EditorStoreContext)
  if (!store) {
    throw new Error('Editor hooks must be used inside an EditorProvider or EditorCanvas')
  }
  return store
}

export function useEditorStore<T>(selector: (state: EditorState) => T): T {
  return useStore(useEditorStoreApi(), selector)
}
