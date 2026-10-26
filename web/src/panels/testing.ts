import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { vi } from 'vitest'
import { TooltipProvider } from '@/components/ui'
import { manifestQueryKey, type Manifest } from '@/icons'
import { fixtureManifest } from '@/icons/testing'
import { createEmptyDocument, type Edge, type Node } from '@/model'
import type { EditorApi } from './api'

export function makeNode(overrides: Partial<Node> & { id?: string } = {}): Node {
  return {
    id: 'n1',
    type: 'shape',
    position: { x: 0, y: 0 },
    size: { width: 120, height: 60 },
    zIndex: 1,
    data: { label: 'Box', shape: 'rect', style: {} },
    ...overrides,
  }
}

export function makeEdge(overrides: Partial<Edge> = {}): Edge {
  return {
    id: 'e1',
    source: 'n1',
    target: 'n2',
    sourceHandle: 'right',
    targetHandle: 'left',
    type: 'orthogonal',
    zIndex: 1,
    data: { label: 'HTTPS', markerStart: 'none', markerEnd: 'arrow', style: {} },
    ...overrides,
  }
}

export function makeFakeApi(overrides: Partial<EditorApi> = {}): EditorApi {
  return {
    document: createEmptyDocument('Untitled diagram'),
    selection: { nodes: [], edges: [] },
    tool: 'select',
    canUndo: false,
    canRedo: false,
    zoom: 1,
    setTool: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomTo: vi.fn(),
    fitView: vi.fn(),
    addIcon: vi.fn(),
    addShape: vi.fn(),
    addContainer: vi.fn(),
    addText: vi.fn(),
    updateSelectedNodes: vi.fn(),
    updateSelectedEdges: vi.fn(),
    align: vi.fn(),
    distribute: vi.fn(),
    order: vi.fn(),
    group: vi.fn(),
    ungroup: vi.fn(),
    duplicate: vi.fn(),
    remove: vi.fn(),
    toggleLock: vi.fn(),
    updateSettings: vi.fn(),
    setTitle: vi.fn(),
    selectAll: vi.fn(),
    clearSelection: vi.fn(),
    ...overrides,
  }
}

export function renderPanel(ui: ReactElement, manifest: Manifest = fixtureManifest) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  })
  client.setQueryData(manifestQueryKey, manifest)
  return render(
    createElement(QueryClientProvider, { client }, createElement(TooltipProvider, null, ui)),
  )
}
