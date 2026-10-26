import { useMemo } from 'react'
import { useEditorStore, useEditorStoreApi } from '../context'
import type { EdgePatch } from '../types'

export type EdgeEditing = {
  readOnly: boolean
  snapSize: number
  update: (id: string, patch: EdgePatch) => void
  select: (id: string, additive: boolean) => void
}

export function useEdgeEditing(): EdgeEditing {
  const store = useEditorStoreApi()
  const readOnly = useEditorStore((state) => state.readOnly)
  const snapSize = useEditorStore((state) =>
    state.document.settings.snap ? state.document.settings.gridSize : 0,
  )
  return useMemo(
    () => ({
      readOnly,
      snapSize,
      update: (id, patch) => {
        store.getState().updateEdge(id, patch)
      },
      select: (id, additive) => {
        const state = store.getState()
        if (additive) {
          const current = state.selection.edges
          state.setSelection({
            edges: current.includes(id) ? current : [...current, id],
          })
        } else if (!state.selection.edges.includes(id) || state.selection.nodes.length > 0) {
          state.setSelection({ nodes: [], edges: [id] })
        }
      },
    }),
    [store, readOnly, snapSize],
  )
}
