import type { Document, Node, Edge, NodeStyle, EdgeStyle } from '@/model'
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
