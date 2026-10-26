import { useStore as useFlowStore } from '@xyflow/react'
import { useMemo } from 'react'
import { useStore } from 'zustand'
import type { Document, Edge, EdgeStyle, Node, NodeStyle } from '@/model'
import { createEditorActions, selectionOf } from './actions'
import { useEditorStore, useEditorStoreApi } from './context'
import { useFlowController } from './flow'

export type EditorApi = {
  document: Document
  selection: { nodes: Node[]; edges: Edge[] }
  tool: string
  canUndo: boolean
  canRedo: boolean
  setTool(tool: string): void
  undo(): void
  redo(): void
  zoomIn(): void
  zoomOut(): void
  zoomTo(level: number): void
  fitView(): void
  zoom: number
  addIcon(
    icon: { pack: string; id: string; title: string; kind: string },
    position?: { x: number; y: number },
  ): void
  addShape(shape: string, position?: { x: number; y: number }): void
  addContainer(kind: string, position?: { x: number; y: number }): void
  addText(position?: { x: number; y: number }): void
  updateSelectedNodes(patch: {
    label?: string
    style?: Partial<NodeStyle>
    icon?: { pack: string; id: string }
    containerKind?: string
    shape?: string
    locked?: boolean
  }): void
  updateSelectedEdges(patch: {
    label?: string
    type?: Edge['type']
    markerStart?: Edge['data']['markerStart']
    markerEnd?: Edge['data']['markerEnd']
    style?: Partial<EdgeStyle>
    labelPosition?: number
  }): void
  align(kind: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom'): void
  distribute(axis: 'x' | 'y'): void
  order(op: 'forward' | 'backward' | 'front' | 'back'): void
  group(): void
  ungroup(): void
  duplicate(): void
  remove(): void
  toggleLock(): void
  updateSettings(patch: Partial<Document['settings']>): void
  setTitle(title: string): void
  selectAll(): void
  clearSelection(): void
}

export function useEditorActions() {
  const store = useEditorStoreApi()
  const flow = useFlowController(() => {
    store.getState().markPersistMove()
  })
  return useMemo(() => createEditorActions(store, flow), [store, flow])
}

export function useEditorApi(): EditorApi {
  const store = useEditorStoreApi()
  const actions = useEditorActions()
  const document = useEditorStore((state) => state.document)
  const selectionIds = useEditorStore((state) => state.selection)
  const tool = useEditorStore((state) => state.tool)
  const canUndo = useStore(store.temporal, (state) => state.pastStates.length > 0)
  const canRedo = useStore(store.temporal, (state) => state.futureStates.length > 0)
  const zoom = useFlowStore((state) => Math.round((state.transform[2] ?? 1) * 100) / 100)

  const selection = useMemo(() => selectionOf(document, selectionIds), [document, selectionIds])

  return useMemo(
    () => ({ ...actions, document, selection, tool, canUndo, canRedo, zoom }),
    [actions, document, selection, tool, canUndo, canRedo, zoom],
  )
}
