import type { Edge, Node, NodeStyle, Point, ShapeKind } from '@/model'
import type { EditorApi } from './api'
import {
  buildContainerNode,
  buildIconNode,
  buildShapeNode,
  buildTextNode,
  containerKindForIcon,
  isShapeKind,
} from './defaults'
import type { FlowController } from './flow'
import type { EditorStore } from './store'
import type { EdgePatch, NodePatch } from './types'

export type EditorActions = Omit<
  EditorApi,
  'document' | 'selection' | 'tool' | 'canUndo' | 'canRedo' | 'zoom'
>

const CASCADE_STEP = 16
const CASCADE_LENGTH = 6

export function createEditorActions(store: EditorStore, flow: FlowController): EditorActions {
  let cascade = 0

  const resolveCenter = (position?: Point): Point => {
    if (position) {
      return position
    }
    const center = flow.center()
    const offset = (cascade % CASCADE_LENGTH) * CASCADE_STEP
    cascade += 1
    return { x: center.x + offset, y: center.y + offset }
  }

  const state = () => store.getState()

  return {
    setTool: (tool) => {
      state().setTool(tool)
    },
    undo: () => {
      state().undo()
    },
    redo: () => {
      state().redo()
    },
    zoomIn: () => {
      flow.zoomIn()
    },
    zoomOut: () => {
      flow.zoomOut()
    },
    zoomTo: (level) => {
      flow.zoomTo(level)
    },
    fitView: () => {
      flow.fitView()
    },
    addIcon: (icon, position) => {
      const center = resolveCenter(position)
      const containerKind = icon.kind === 'group' ? containerKindForIcon(icon) : null
      const node = containerKind
        ? buildContainerNode(containerKind, center)
        : buildIconNode(icon, center)
      state().addNode(node, { absolute: true })
      state().setTool('select')
    },
    addShape: (shape, position) => {
      const kind: ShapeKind = isShapeKind(shape) ? shape : 'rect'
      state().addNode(buildShapeNode(kind, resolveCenter(position)), { absolute: true })
      state().setTool('select')
    },
    addContainer: (kind, position) => {
      state().addNode(buildContainerNode(kind, resolveCenter(position)), { absolute: true })
      state().setTool('select')
    },
    addText: (position) => {
      const id = state().addNode(buildTextNode(resolveCenter(position)), { absolute: true })
      state().setTool('select')
      if (id) {
        state().setEditingNode(id)
      }
    },
    updateSelectedNodes: (patch) => {
      const { label, style, icon, containerKind, shape, locked } = patch
      state().updateNodes(state().selection.nodes, (node: Node): NodePatch => {
        const data: NonNullable<NodePatch['data']> = {}
        if (label !== undefined) {
          data.label = label
        }
        if (style) {
          data.style = style as Partial<NodeStyle>
        }
        if (icon && (node.type === 'icon' || node.type === 'container')) {
          data.icon = icon
        }
        if (containerKind !== undefined && node.type === 'container') {
          data.containerKind = containerKind
          if (icon === undefined) {
            data.icon = undefined
          }
        }
        if (shape !== undefined && node.type === 'shape' && isShapeKind(shape)) {
          data.shape = shape
        }
        const result: NodePatch = { data }
        if (locked !== undefined) {
          result.locked = locked
        }
        return result
      })
    },
    updateSelectedEdges: (patch) => {
      const { label, type, markerStart, markerEnd, style, labelPosition } = patch
      const data: NonNullable<EdgePatch['data']> = {}
      if ('label' in patch) {
        data.label = label === '' ? undefined : label
      }
      if (markerStart !== undefined) {
        data.markerStart = markerStart
      }
      if (markerEnd !== undefined) {
        data.markerEnd = markerEnd
      }
      if (labelPosition !== undefined) {
        data.labelPosition = labelPosition
      }
      if (style) {
        data.style = style
      }
      const result: EdgePatch = { data }
      if (type !== undefined) {
        result.type = type
      }
      state().updateEdges(state().selection.edges, result)
    },
    align: (kind) => {
      state().align(kind)
    },
    distribute: (axis) => {
      state().distribute(axis)
    },
    order: (op) => {
      switch (op) {
        case 'forward':
          state().bringForward()
          break
        case 'backward':
          state().sendBackward()
          break
        case 'front':
          state().toFront()
          break
        case 'back':
          state().toBack()
          break
      }
    },
    group: () => {
      state().group()
    },
    ungroup: () => {
      state().ungroup()
    },
    duplicate: () => {
      state().duplicateSelection()
    },
    remove: () => {
      state().removeSelection()
    },
    toggleLock: () => {
      state().toggleLock()
    },
    updateSettings: (patch) => {
      state().updateSettings(patch)
    },
    setTitle: (title) => {
      state().setTitle(title)
    },
    selectAll: () => {
      state().selectAll()
    },
    clearSelection: () => {
      state().clearSelection()
    },
  }
}

export function selectionOf(
  document: { nodes: Node[]; edges: Edge[] },
  ids: { nodes: string[]; edges: string[] },
): { nodes: Node[]; edges: Edge[] } {
  const nodeSet = new Set(ids.nodes)
  const edgeSet = new Set(ids.edges)
  return {
    nodes: document.nodes.filter((node) => nodeSet.has(node.id)),
    edges: document.edges.filter((edge) => edgeSet.has(edge.id)),
  }
}
