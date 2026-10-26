import { createStore, type StoreApi } from 'zustand'
import { temporal, type TemporalState } from 'zundo'
import type { Document, Edge, Node, Point, Settings, Viewport } from '@/model'
import { materializeEdge, materializeNode } from './defaults'
import {
  absoluteRect,
  collectSubtree,
  findContainerAt,
  indexNodes,
  rectCenter,
  topLevelIds,
} from './geometry'
import {
  alignNodes,
  applyDeltas,
  buildClipboard,
  distributeNodes,
  groupNodes,
  instantiateClipboard,
  nextZIndex,
  patchEdge,
  patchNode,
  removeNodesFrom,
  reorderNodes,
  reparentNode,
  ungroupNodes,
} from './ops'
import type {
  AddNodeOptions,
  AlignKind,
  ClipboardPayload,
  DistributeAxis,
  DocumentChangeHandler,
  EdgePatch,
  GeometryUpdate,
  NewEdge,
  NewNode,
  NodePatch,
  SelectionState,
} from './types'

export const HISTORY_LIMIT = 100
export const DEFAULT_PASTE_OFFSET = 16

type HistorySlice = { document: Document }

export type EditorState = {
  document: Document
  readOnly: boolean
  selection: SelectionState
  tool: string
  clipboard: ClipboardPayload | null
  pasteCount: number
  hover: string | null
  editingNodeId: string | null
  dropTargetId: string | null
  spaceHeld: boolean
  paletteOpen: boolean
  persistNextMove: boolean

  setOnChange: (handler: DocumentChangeHandler | undefined) => void
  setReadOnly: (readOnly: boolean) => void
  setTool: (tool: string) => void
  setHover: (id: string | null) => void
  setEditingNode: (id: string | null) => void
  setDropTarget: (id: string | null) => void
  setSpaceHeld: (held: boolean) => void
  setPaletteOpen: (open: boolean) => void
  markPersistMove: () => void

  setSelection: (selection: Partial<SelectionState>) => void
  selectAll: () => void
  clearSelection: () => void

  addNode: (node: NewNode, options?: AddNodeOptions) => string | null
  updateNode: (id: string, patch: NodePatch) => void
  updateNodes: (ids: readonly string[], patch: NodePatch | ((node: Node) => NodePatch)) => void
  removeNodes: (ids: readonly string[]) => void
  removeSelection: () => void
  moveNodes: (ids: readonly string[], delta: Point) => void
  setNodeGeometry: (updates: readonly GeometryUpdate[]) => void
  resizeNode: (id: string, size: { width: number; height: number }, position?: Point) => void
  setParent: (id: string, parentId: string | null) => void
  setNodeLabel: (id: string, label: string, height?: number) => void
  updateDropTarget: (ids: readonly string[]) => void
  finishDrag: (ids: readonly string[]) => void

  addEdge: (edge: NewEdge) => string | null
  updateEdge: (id: string, patch: EdgePatch) => void
  updateEdges: (ids: readonly string[], patch: EdgePatch) => void
  setEdgeWaypoints: (updates: readonly { id: string; waypoints?: readonly Point[] }[]) => void
  removeEdges: (ids: readonly string[]) => void

  copy: () => ClipboardPayload | null
  cut: () => ClipboardPayload | null
  paste: (offset?: Point, payload?: ClipboardPayload | null) => string[]
  duplicateSelection: (offset?: Point) => string[]
  group: () => string | null
  ungroup: () => string[]
  align: (kind: AlignKind) => void
  distribute: (axis: DistributeAxis) => void
  bringForward: () => void
  sendBackward: () => void
  toFront: () => void
  toBack: () => void
  toggleLock: (ids?: readonly string[]) => void

  setViewport: (viewport: Viewport) => void
  updateSettings: (patch: Partial<Settings>) => void
  setTitle: (title: string) => void
  replaceDocument: (
    document: Document,
    options?: { silent?: boolean; keepHistory?: boolean },
  ) => void
  applyLayout: (document: Document) => void

  undo: () => void
  redo: () => void
  pauseHistory: () => void
  resumeHistory: () => void
}

export type EditorStore = StoreApi<EditorState> & {
  temporal: StoreApi<TemporalState<HistorySlice>>
}

export type EditorStoreInit = {
  document: Document
  onChange?: DocumentChangeHandler
  readOnly?: boolean
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false
    }
  }
  return true
}

function pruneSelection(document: Document, selection: SelectionState): SelectionState {
  const nodeIds = new Set(document.nodes.map((node) => node.id))
  const edgeIds = new Set(document.edges.map((edge) => edge.id))
  const nodes = selection.nodes.filter((id) => nodeIds.has(id))
  const edges = selection.edges.filter((id) => edgeIds.has(id))
  if (nodes.length === selection.nodes.length && edges.length === selection.edges.length) {
    return selection
  }
  return { nodes, edges }
}

export function createEditorStore(init: EditorStoreInit): EditorStore {
  let onChange = init.onChange
  let batchDepth = 0
  let batchBase: Document | null = null
  let batchDirty = false

  const store = createStore<EditorState>()(
    temporal(
      (set, get) => {
        const emit = (document: Document) => {
          if (batchDepth > 0) {
            batchDirty = true
            return
          }
          onChange?.(document)
        }

        const silently = (fn: () => void) => {
          const history = store.temporal.getState()
          const wasTracking = history.isTracking
          if (wasTracking) {
            history.pause()
          }
          try {
            fn()
          } finally {
            if (wasTracking) {
              history.resume()
            }
          }
        }

        const apply = (
          update: (document: Document) => Document,
          extra?: (next: Document) => Partial<EditorState>,
        ): boolean => {
          const state = get()
          if (state.readOnly) {
            return false
          }
          const next = update(state.document)
          if (next === state.document) {
            return false
          }
          set({ document: next, ...(extra ? extra(next) : {}) })
          emit(next)
          return true
        }

        const selectedNodeIds = () => get().selection.nodes

        const travel = (direction: 'undo' | 'redo') => {
          const state = get()
          if (state.readOnly || batchDepth > 0) {
            return
          }
          const history = store.temporal.getState()
          const available =
            direction === 'undo' ? history.pastStates.length : history.futureStates.length
          if (available === 0) {
            return
          }
          const viewport = state.document.viewport
          history[direction]()
          const restored = get().document
          const next = restored.viewport === viewport ? restored : { ...restored, viewport }
          silently(() => {
            set({
              document: next,
              selection: pruneSelection(next, get().selection),
              editingNodeId: null,
              dropTargetId: null,
            })
          })
          emit(next)
        }

        return {
          document: init.document,
          readOnly: init.readOnly ?? false,
          selection: { nodes: [], edges: [] },
          tool: 'select',
          clipboard: null,
          pasteCount: 0,
          hover: null,
          editingNodeId: null,
          dropTargetId: null,
          spaceHeld: false,
          paletteOpen: false,
          persistNextMove: false,

          setOnChange: (handler) => {
            onChange = handler
          },
          setReadOnly: (readOnly) => {
            if (get().readOnly !== readOnly) {
              set({ readOnly, editingNodeId: readOnly ? null : get().editingNodeId })
            }
          },
          setTool: (tool) => {
            if (get().tool !== tool) {
              set({ tool, editingNodeId: null })
            }
          },
          setHover: (id) => {
            if (get().hover !== id) {
              set({ hover: id })
            }
          },
          setEditingNode: (id) => {
            if (id !== null && get().readOnly) {
              return
            }
            if (get().editingNodeId !== id) {
              set({ editingNodeId: id })
            }
          },
          setDropTarget: (id) => {
            if (get().dropTargetId !== id) {
              set({ dropTargetId: id })
            }
          },
          setSpaceHeld: (held) => {
            if (get().spaceHeld !== held) {
              set({ spaceHeld: held })
            }
          },
          setPaletteOpen: (open) => {
            if (get().paletteOpen !== open) {
              set({ paletteOpen: open })
            }
          },
          markPersistMove: () => {
            set({ persistNextMove: true })
          },

          setSelection: (next) => {
            const current = get().selection
            const nodes = next.nodes ?? current.nodes
            const edges = next.edges ?? current.edges
            if (sameIds(nodes, current.nodes) && sameIds(edges, current.edges)) {
              return
            }
            set({ selection: { nodes: [...nodes], edges: [...edges] } })
          },
          selectAll: () => {
            const { document } = get()
            get().setSelection({
              nodes: document.nodes.map((node) => node.id),
              edges: document.edges.map((edge) => edge.id),
            })
          },
          clearSelection: () => {
            get().setSelection({ nodes: [], edges: [] })
          },

          addNode: (input, options = {}) => {
            if (get().readOnly) {
              return null
            }
            const { absolute = false, select = true } = options
            const result: { node: Node | null } = { node: null }
            apply(
              (document) => {
                let node = materializeNode(input, nextZIndex(document.nodes))
                if (absolute && !node.parentId) {
                  const index = indexNodes(document.nodes)
                  const center = rectCenter({
                    x: node.position.x,
                    y: node.position.y,
                    width: node.size.width,
                    height: node.size.height,
                  })
                  const parent = findContainerAt(document.nodes, index, center, new Set())
                  if (parent) {
                    const parentRect = absoluteRect(parent, index)
                    node = {
                      ...node,
                      parentId: parent.id,
                      position: {
                        x: node.position.x - parentRect.x,
                        y: node.position.y - parentRect.y,
                      },
                    }
                  }
                }
                result.node = node
                return { ...document, nodes: [...document.nodes, node] }
              },
              () =>
                select && result.node ? { selection: { nodes: [result.node.id], edges: [] } } : {},
            )
            return result.node ? result.node.id : null
          },
          updateNode: (id, patch) => {
            get().updateNodes([id], patch)
          },
          updateNodes: (ids, patch) => {
            const set_ = new Set(ids)
            apply((document) => {
              let changed = false
              const nodes = document.nodes.map((node) => {
                if (!set_.has(node.id)) {
                  return node
                }
                const resolved = typeof patch === 'function' ? patch(node) : patch
                const next = patchNode(node, resolved)
                if (JSON.stringify(next) === JSON.stringify(node)) {
                  return node
                }
                changed = true
                return next
              })
              return changed ? { ...document, nodes } : document
            })
          },
          removeNodes: (ids) => {
            apply(
              (document) => removeNodesFrom(document, ids),
              (next) => ({
                selection: pruneSelection(next, get().selection),
                editingNodeId: null,
                dropTargetId: null,
              }),
            )
          },
          removeSelection: () => {
            const { selection, document } = get()
            const index = indexNodes(document.nodes)
            const nodeIds = selection.nodes.filter((id) => !index.get(id)?.locked)
            apply(
              (doc) => {
                const withoutNodes = removeNodesFrom(doc, nodeIds)
                const edgeSet = new Set(selection.edges)
                const edges = withoutNodes.edges.filter((edge) => !edgeSet.has(edge.id))
                return edges.length === withoutNodes.edges.length
                  ? withoutNodes
                  : { ...withoutNodes, edges }
              },
              (next) => ({
                selection: pruneSelection(next, get().selection),
                editingNodeId: null,
                dropTargetId: null,
              }),
            )
          },
          moveNodes: (ids, delta) => {
            if (delta.x === 0 && delta.y === 0) {
              return
            }
            apply((document) => {
              const deltas = new Map<string, Point>()
              const index = indexNodes(document.nodes)
              for (const id of topLevelIds(document.nodes, ids)) {
                if (!index.get(id)?.locked) {
                  deltas.set(id, delta)
                }
              }
              const nodes = applyDeltas(document.nodes, deltas)
              return nodes === document.nodes ? document : { ...document, nodes }
            })
          },
          setNodeGeometry: (updates) => {
            const byId = new Map(updates.map((update) => [update.id, update]))
            apply((document) => {
              let changed = false
              const nodes = document.nodes.map((node) => {
                const update = byId.get(node.id)
                if (!update) {
                  return node
                }
                const position = update.position ?? node.position
                const size = update.size ?? node.size
                if (
                  position.x === node.position.x &&
                  position.y === node.position.y &&
                  size.width === node.size.width &&
                  size.height === node.size.height
                ) {
                  return node
                }
                changed = true
                return { ...node, position, size }
              })
              return changed ? { ...document, nodes } : document
            })
          },
          resizeNode: (id, size, position) => {
            get().setNodeGeometry([{ id, size, ...(position ? { position } : {}) }])
          },
          setParent: (id, parentId) => {
            apply((document) => {
              const nodes = reparentNode(document.nodes, id, parentId ?? undefined)
              return nodes === document.nodes ? document : { ...document, nodes }
            })
          },
          setNodeLabel: (id, label, height) => {
            apply((document) => {
              let changed = false
              const nodes = document.nodes.map((node) => {
                if (node.id !== id) {
                  return node
                }
                const nextHeight =
                  height !== undefined ? Math.max(1, Math.ceil(height)) : node.size.height
                if (label === node.data.label && nextHeight === node.size.height) {
                  return node
                }
                changed = true
                return {
                  ...node,
                  size: { width: node.size.width, height: nextHeight },
                  data: { ...node.data, label },
                }
              })
              return changed ? { ...document, nodes } : document
            })
          },
          updateDropTarget: (ids) => {
            const { document } = get()
            const index = indexNodes(document.nodes)
            const tops = topLevelIds(document.nodes, ids)
            const primary = tops.length === 1 ? index.get(tops[0] as string) : undefined
            if (!primary) {
              get().setDropTarget(null)
              return
            }
            const exclude = collectSubtree(document.nodes, tops)
            const target = findContainerAt(
              document.nodes,
              index,
              rectCenter(absoluteRect(primary, index)),
              exclude,
            )
            get().setDropTarget(target ? target.id : null)
          },
          finishDrag: (ids) => {
            get().setDropTarget(null)
            apply((document) => {
              let nodes = document.nodes
              const tops = topLevelIds(nodes, ids)
              const exclude = collectSubtree(nodes, tops)
              for (const id of tops) {
                const index = indexNodes(nodes)
                const node = index.get(id)
                if (!node || node.locked) {
                  continue
                }
                const target = findContainerAt(
                  nodes,
                  index,
                  rectCenter(absoluteRect(node, index)),
                  exclude,
                )
                const parentId = target ? target.id : undefined
                if (parentId !== node.parentId) {
                  nodes = reparentNode(nodes, id, parentId)
                }
              }
              return nodes === document.nodes ? document : { ...document, nodes }
            })
          },

          addEdge: (input) => {
            if (get().readOnly) {
              return null
            }
            const edge = materializeEdge(input)
            const applied = apply(
              (document) => ({ ...document, edges: [...document.edges, edge] }),
              () => ({ selection: { nodes: [], edges: [edge.id] } }),
            )
            return applied ? edge.id : null
          },
          updateEdge: (id, patch) => {
            get().updateEdges([id], patch)
          },
          updateEdges: (ids, patch) => {
            const idSet = new Set(ids)
            apply((document) => {
              let changed = false
              const edges = document.edges.map((edge) => {
                if (!idSet.has(edge.id)) {
                  return edge
                }
                const next = patchEdge(edge, patch)
                if (JSON.stringify(next) === JSON.stringify(edge)) {
                  return edge
                }
                changed = true
                return next
              })
              return changed ? { ...document, edges } : document
            })
          },
          setEdgeWaypoints: (updates) => {
            const byId = new Map(updates.map((update) => [update.id, update.waypoints]))
            apply((document) => {
              let changed = false
              const edges = document.edges.map((edge) => {
                if (!byId.has(edge.id)) {
                  return edge
                }
                const waypoints = byId.get(edge.id)
                const next = patchEdge(edge, {
                  data: {
                    waypoints:
                      waypoints && waypoints.length > 0
                        ? waypoints.map((point) => ({ x: point.x, y: point.y }))
                        : undefined,
                  },
                })
                if (JSON.stringify(next) === JSON.stringify(edge)) {
                  return edge
                }
                changed = true
                return next
              })
              return changed ? { ...document, edges } : document
            })
          },
          removeEdges: (ids) => {
            const idSet = new Set(ids)
            apply(
              (document) => {
                const edges = document.edges.filter((edge) => !idSet.has(edge.id))
                return edges.length === document.edges.length ? document : { ...document, edges }
              },
              (next) => ({ selection: pruneSelection(next, get().selection) }),
            )
          },

          copy: () => {
            const { document, selection } = get()
            const payload = buildClipboard(document, selection.nodes)
            if (!payload) {
              return null
            }
            set({ clipboard: payload, pasteCount: 0 })
            return payload
          },
          cut: () => {
            const payload = get().copy()
            if (payload) {
              get().removeSelection()
            }
            return payload
          },
          paste: (offset, payloadArg) => {
            if (get().readOnly) {
              return []
            }
            const payload = payloadArg ?? get().clipboard
            if (!payload) {
              return []
            }
            const step = (get().pasteCount + 1) * DEFAULT_PASTE_OFFSET
            const delta = offset ?? { x: step, y: step }
            let rootIds: string[] = []
            apply(
              (document) => {
                const created = instantiateClipboard(document, payload, delta)
                rootIds = created.rootIds
                return {
                  ...document,
                  nodes: [...document.nodes, ...created.nodes],
                  edges: [...document.edges, ...created.edges],
                }
              },
              () => ({
                selection: { nodes: rootIds, edges: [] },
                pasteCount: get().pasteCount + 1,
              }),
            )
            return rootIds
          },
          duplicateSelection: (offset) => {
            const { document, selection } = get()
            const payload = buildClipboard(document, selection.nodes)
            if (!payload) {
              return []
            }
            const delta = offset ?? { x: DEFAULT_PASTE_OFFSET, y: DEFAULT_PASTE_OFFSET }
            let rootIds: string[] = []
            apply(
              (doc) => {
                const created = instantiateClipboard(doc, payload, delta)
                rootIds = created.rootIds
                return {
                  ...doc,
                  nodes: [...doc.nodes, ...created.nodes],
                  edges: [...doc.edges, ...created.edges],
                }
              },
              () => ({ selection: { nodes: rootIds, edges: [] } }),
            )
            return rootIds
          },
          group: () => {
            const holder: { id: string | null } = { id: null }
            apply(
              (document) => {
                const result = groupNodes(document, selectedNodeIds())
                if (!result) {
                  return document
                }
                holder.id = result.groupId
                return result.document
              },
              () => ({ selection: { nodes: holder.id ? [holder.id] : [], edges: [] } }),
            )
            return holder.id
          },
          ungroup: () => {
            let released: string[] = []
            apply(
              (document) => {
                const result = ungroupNodes(document, selectedNodeIds())
                if (!result) {
                  return document
                }
                released = result.released
                return result.document
              },
              () => ({ selection: { nodes: released, edges: [] }, editingNodeId: null }),
            )
            return released
          },
          align: (kind) => {
            apply((document) => {
              const nodes = alignNodes(document.nodes, selectedNodeIds(), kind)
              return nodes === document.nodes ? document : { ...document, nodes }
            })
          },
          distribute: (axis) => {
            apply((document) => {
              const nodes = distributeNodes(document.nodes, selectedNodeIds(), axis)
              return nodes === document.nodes ? document : { ...document, nodes }
            })
          },
          bringForward: () => {
            apply((document) => {
              const nodes = reorderNodes(document.nodes, selectedNodeIds(), 'forward')
              return nodes === document.nodes ? document : { ...document, nodes }
            })
          },
          sendBackward: () => {
            apply((document) => {
              const nodes = reorderNodes(document.nodes, selectedNodeIds(), 'backward')
              return nodes === document.nodes ? document : { ...document, nodes }
            })
          },
          toFront: () => {
            apply((document) => {
              const nodes = reorderNodes(document.nodes, selectedNodeIds(), 'front')
              return nodes === document.nodes ? document : { ...document, nodes }
            })
          },
          toBack: () => {
            apply((document) => {
              const nodes = reorderNodes(document.nodes, selectedNodeIds(), 'back')
              return nodes === document.nodes ? document : { ...document, nodes }
            })
          },
          toggleLock: (ids) => {
            const targets = new Set(ids ?? selectedNodeIds())
            apply((document) => {
              const affected = document.nodes.filter((node) => targets.has(node.id))
              if (affected.length === 0) {
                return document
              }
              const lock = !affected.every((node) => node.locked)
              const nodes = document.nodes.map((node) => {
                if (!targets.has(node.id)) {
                  return node
                }
                return patchNode(node, { locked: lock })
              })
              return { ...document, nodes }
            })
          },

          setViewport: (viewport) => {
            const current = get().document.viewport
            if (
              get().readOnly ||
              (Math.abs(current.x - viewport.x) < 0.01 &&
                Math.abs(current.y - viewport.y) < 0.01 &&
                Math.abs(current.zoom - viewport.zoom) < 0.0001)
            ) {
              return
            }
            silently(() => {
              apply((document) => ({ ...document, viewport: { ...viewport } }))
            })
          },
          updateSettings: (patch) => {
            apply((document) => {
              const settings = { ...document.settings, ...patch }
              const same = (Object.keys(settings) as (keyof Settings)[]).every(
                (key) => settings[key] === document.settings[key],
              )
              return same ? document : { ...document, settings }
            })
          },
          setTitle: (title) => {
            apply((document) => (document.title === title ? document : { ...document, title }))
          },
          applyLayout: (layout) => {
            apply(
              (document) =>
                layout === document ? document : { ...layout, viewport: document.viewport },
              (next) => ({
                selection: pruneSelection(next, get().selection),
                editingNodeId: null,
                dropTargetId: null,
              }),
            )
          },
          replaceDocument: (document, options = {}) => {
            const { silent = false, keepHistory = false } = options
            silently(() => {
              set({
                document,
                selection: pruneSelection(document, get().selection),
                editingNodeId: null,
                dropTargetId: null,
              })
            })
            if (!keepHistory) {
              store.temporal.getState().clear()
            }
            if (!silent) {
              emit(document)
            }
          },

          undo: () => {
            travel('undo')
          },
          redo: () => {
            travel('redo')
          },
          pauseHistory: () => {
            batchDepth += 1
            if (batchDepth === 1) {
              batchBase = get().document
              batchDirty = false
              store.temporal.getState().pause()
            }
          },
          resumeHistory: () => {
            if (batchDepth === 0) {
              return
            }
            batchDepth -= 1
            if (batchDepth > 0) {
              return
            }
            const history = store.temporal.getState()
            history.resume()
            const base = batchBase
            batchBase = null
            const current = get().document
            if (base && base !== current && !get().readOnly) {
              store.temporal.setState({
                pastStates: [...history.pastStates, { document: base }].slice(-HISTORY_LIMIT),
                futureStates: [],
              })
            }
            if (batchDirty) {
              batchDirty = false
              onChange?.(current)
            }
          },
        }
      },
      {
        limit: HISTORY_LIMIT,
        partialize: (state): HistorySlice => ({ document: state.document }),
        equality: (past, current) => past.document === current.document,
      },
    ),
  )

  return store as EditorStore
}

export function selectedNodes(state: EditorState): Node[] {
  const ids = new Set(state.selection.nodes)
  return state.document.nodes.filter((node) => ids.has(node.id))
}

export function selectedEdges(state: EditorState): Edge[] {
  const ids = new Set(state.selection.edges)
  return state.document.edges.filter((edge) => ids.has(edge.id))
}
