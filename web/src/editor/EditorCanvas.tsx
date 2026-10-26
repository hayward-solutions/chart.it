import '@xyflow/react/dist/style.css'
import './editor.css'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  Panel,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type OnConnectStartParams,
  type Node as RFNode,
} from '@xyflow/react'
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createEmptyDocument, getContainerKind, type Document, type HandleSide } from '@/model'
import { activateEditor } from './activeEditor'
import { useEditorActions } from './api'
import {
  createFlowEdgeAdapter,
  createFlowNodeAdapter,
  type EditorFlowEdge,
  type EditorFlowNode,
} from './adapters'
import { CommandPalette } from './CommandPalette'
import { createCommands } from './commands'
import { canvasInk, isDarkColor } from './color'
import { useEditorStore, useEditorStoreApi, useOptionalEditorStoreApi } from './context'
import { isShapeKind } from './defaults'
import { EditorProvider } from './EditorProvider'
import { ConnectionLine, edgeTypes, EdgeMarkerDefs } from './edges'
import { nodeTypes } from './nodes'
import { useEditorClipboardEvents, useEditorShortcuts } from './shortcuts'
import type { GeometryUpdate } from './types'
import { ZoomControl } from './ZoomControl'

export type EditorCanvasProps = {
  document?: Document
  onChange?: (document: Document) => void
  readOnly?: boolean
}

const SIDES: readonly HandleSide[] = ['top', 'right', 'bottom', 'left']

function asSide(value: string | null | undefined, fallback: HandleSide): HandleSide {
  return SIDES.find((side) => side === value) ?? fallback
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function parseDrop(event: DragEvent): { type: string; payload: unknown } | null {
  for (const type of [
    'application/x-chartit-icon',
    'application/x-chartit-shape',
    'application/x-chartit-container',
  ]) {
    if (event.dataTransfer.types.includes(type)) {
      try {
        return { type, payload: JSON.parse(event.dataTransfer.getData(type)) as unknown }
      } catch {
        return null
      }
    }
  }
  return null
}

function minimapColor(node: RFNode): string {
  const data = node.data as EditorFlowNode['data']
  switch (node.type) {
    case 'container':
      return data.style.stroke ?? getContainerKind(data.containerKind).colour
    case 'shape':
      return data.style.fill ?? '#c4c8d0'
    case 'text':
      return 'transparent'
    default:
      return '#8b8b96'
  }
}

const EditorSurface = memo(function EditorSurface() {
  const store = useEditorStoreApi()
  const actions = useEditorActions()
  const instance = useReactFlow<EditorFlowNode, EditorFlowEdge>()
  const [token] = useState(() => ({}))
  const [connecting, setConnecting] = useState(false)

  const nodesSource = useEditorStore((state) => state.document.nodes)
  const edgesSource = useEditorStore((state) => state.document.edges)
  const settings = useEditorStore((state) => state.document.settings)
  const selection = useEditorStore((state) => state.selection)
  const readOnly = useEditorStore((state) => state.readOnly)
  const tool = useEditorStore((state) => state.tool)
  const spaceHeld = useEditorStore((state) => state.spaceHeld)
  const [initialViewport] = useState(() => store.getState().document.viewport)
  const [shouldFit] = useState(() => {
    const { nodes, viewport } = store.getState().document
    return nodes.length > 0 && viewport.x === 0 && viewport.y === 0 && viewport.zoom === 1
  })

  const adaptNodes = useMemo(() => createFlowNodeAdapter(), [])
  const adaptEdges = useMemo(() => createFlowEdgeAdapter(), [])
  const selectedNodes = useMemo(() => new Set(selection.nodes), [selection.nodes])
  const selectedEdges = useMemo(() => new Set(selection.edges), [selection.edges])
  const flowNodes = useMemo(
    () => adaptNodes(nodesSource, selectedNodes, readOnly),
    [adaptNodes, nodesSource, selectedNodes, readOnly],
  )
  const flowEdges = useMemo(
    () => adaptEdges(edgesSource, selectedEdges, readOnly),
    [adaptEdges, edgesSource, selectedEdges, readOnly],
  )

  const commands = useMemo(() => createCommands(store, actions), [store, actions])
  useEditorShortcuts(commands, token)
  useEditorClipboardEvents(token)

  useEffect(() => {
    return () => {
      store.getState().setSpaceHeld(false)
    }
  }, [store])

  const onNodesChange = useCallback(
    (changes: NodeChange<EditorFlowNode>[]) => {
      const state = store.getState()
      const geometry = new Map<string, GeometryUpdate>()
      let nodeSelection: Set<string> | null = null
      const removed: string[] = []
      for (const change of changes) {
        switch (change.type) {
          case 'position': {
            if (change.position) {
              const entry = geometry.get(change.id) ?? { id: change.id }
              entry.position = { x: round(change.position.x), y: round(change.position.y) }
              geometry.set(change.id, entry)
            }
            break
          }
          case 'dimensions': {
            if (change.dimensions && change.resizing !== undefined) {
              const entry = geometry.get(change.id) ?? { id: change.id }
              entry.size = {
                width: round(change.dimensions.width),
                height: round(change.dimensions.height),
              }
              geometry.set(change.id, entry)
            }
            break
          }
          case 'select': {
            nodeSelection ??= new Set(state.selection.nodes)
            if (change.selected) {
              nodeSelection.add(change.id)
            } else {
              nodeSelection.delete(change.id)
            }
            break
          }
          case 'remove':
            removed.push(change.id)
            break
          default:
            break
        }
      }
      if (nodeSelection) {
        state.setSelection({ nodes: [...nodeSelection] })
      }
      if (geometry.size > 0) {
        state.setNodeGeometry([...geometry.values()])
      }
      if (removed.length > 0) {
        state.removeNodes(removed)
      }
    },
    [store],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<EditorFlowEdge>[]) => {
      const state = store.getState()
      let edgeSelection: Set<string> | null = null
      const removed: string[] = []
      for (const change of changes) {
        if (change.type === 'select') {
          edgeSelection ??= new Set(state.selection.edges)
          if (change.selected) {
            edgeSelection.add(change.id)
          } else {
            edgeSelection.delete(change.id)
          }
        } else if (change.type === 'remove') {
          removed.push(change.id)
        }
      }
      if (edgeSelection) {
        state.setSelection({ edges: [...edgeSelection] })
      }
      if (removed.length > 0) {
        state.removeEdges(removed)
      }
    },
    [store],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) {
        return
      }
      store.getState().addEdge({
        source: connection.source,
        target: connection.target,
        sourceHandle: asSide(connection.sourceHandle, 'right'),
        targetHandle: asSide(connection.targetHandle, 'left'),
        type: 'orthogonal',
        data: { markerStart: 'none', markerEnd: 'arrow', style: {} },
      })
    },
    [store],
  )

  const isValidConnection = useCallback(
    (connection: Connection | EditorFlowEdge) => {
      if (!connection.source || !connection.target || connection.source === connection.target) {
        return false
      }
      const sourceHandle = asSide(connection.sourceHandle, 'right')
      const targetHandle = asSide(connection.targetHandle, 'left')
      return !store
        .getState()
        .document.edges.some(
          (edge) =>
            edge.source === connection.source &&
            edge.target === connection.target &&
            edge.sourceHandle === sourceHandle &&
            edge.targetHandle === targetHandle,
        )
    },
    [store],
  )

  const onReconnect = useCallback(
    (oldEdge: EditorFlowEdge, connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) {
        return
      }
      store.getState().updateEdge(oldEdge.id, {
        source: connection.source,
        target: connection.target,
        sourceHandle: asSide(connection.sourceHandle, 'right'),
        targetHandle: asSide(connection.targetHandle, 'left'),
        data: { waypoints: undefined },
      })
    },
    [store],
  )

  const onConnectStart = useCallback((_event: unknown, _params: OnConnectStartParams) => {
    setConnecting(true)
  }, [])

  const onConnectEnd = useCallback(() => {
    setConnecting(false)
  }, [])

  const dragIds = (nodes: RFNode[]) => nodes.map((node) => node.id)

  const onDragStart = useCallback(() => {
    store.getState().pauseHistory()
  }, [store])

  const onDrag = useCallback(
    (_event: unknown, _node: RFNode, nodes: RFNode[]) => {
      store.getState().updateDropTarget(dragIds(nodes))
    },
    [store],
  )

  const onDragStop = useCallback(
    (_event: unknown, _node: RFNode, nodes: RFNode[]) => {
      const state = store.getState()
      state.finishDrag(dragIds(nodes))
      state.resumeHistory()
    },
    [store],
  )

  const onSelectionDrag = useCallback(
    (_event: ReactMouseEvent, nodes: RFNode[]) => {
      store.getState().updateDropTarget(dragIds(nodes))
    },
    [store],
  )

  const onSelectionDragStop = useCallback(
    (_event: ReactMouseEvent, nodes: RFNode[]) => {
      const state = store.getState()
      state.finishDrag(dragIds(nodes))
      state.resumeHistory()
    },
    [store],
  )

  const onNodeDoubleClick = useCallback(
    (_event: ReactMouseEvent, node: RFNode) => {
      store.getState().setEditingNode(node.id)
    },
    [store],
  )

  const onPaneClick = useCallback(
    (event: ReactMouseEvent) => {
      const state = store.getState()
      const current = state.tool
      const position = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      if (current === 'text') {
        actions.addText(position)
      } else if (current.startsWith('shape:')) {
        actions.addShape(current.slice(6), position)
      } else if (current.startsWith('container:')) {
        actions.addContainer(current.slice(10), position)
      }
    },
    [actions, instance, store],
  )

  const onMoveEnd = useCallback(
    (event: MouseEvent | TouchEvent | null, viewport: { x: number; y: number; zoom: number }) => {
      const state = store.getState()
      if (event || state.persistNextMove) {
        if (state.persistNextMove) {
          store.setState({ persistNextMove: false })
        }
        state.setViewport(viewport)
      }
    },
    [store],
  )

  const onDragOver = useCallback(
    (event: DragEvent) => {
      if (store.getState().readOnly) {
        return
      }
      const types = event.dataTransfer.types
      if (
        types.includes('application/x-chartit-icon') ||
        types.includes('application/x-chartit-shape') ||
        types.includes('application/x-chartit-container')
      ) {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }
    },
    [store],
  )

  const onDrop = useCallback(
    (event: DragEvent) => {
      if (store.getState().readOnly) {
        return
      }
      const dropped = parseDrop(event)
      if (!dropped) {
        return
      }
      event.preventDefault()
      const position = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const payload = dropped.payload as Record<string, unknown>
      if (dropped.type === 'application/x-chartit-icon') {
        if (typeof payload.pack === 'string' && typeof payload.id === 'string') {
          actions.addIcon(
            {
              pack: payload.pack,
              id: payload.id,
              title: typeof payload.title === 'string' ? payload.title : payload.id,
              kind: typeof payload.kind === 'string' ? payload.kind : 'service',
            },
            position,
          )
        }
      } else if (dropped.type === 'application/x-chartit-shape') {
        if (typeof payload.shape === 'string' && isShapeKind(payload.shape)) {
          actions.addShape(payload.shape, position)
        }
      } else if (typeof payload.containerKind === 'string') {
        actions.addContainer(payload.containerKind, position)
      }
    },
    [actions, instance, store],
  )

  const effectiveTool = spaceHeld ? 'pan' : tool
  const panning = effectiveTool === 'pan'
  const selecting = effectiveTool === 'select'
  const interactive = !readOnly
  const gridSize = Math.max(2, settings.gridSize)
  const dark = isDarkColor(settings.background)
  const ink = canvasInk(settings.background)

  const rootStyle = {
    '--chartit-ink': ink,
    '--chartit-bg': settings.background,
    '--chartit-edge': dark ? '#9ca3af' : '#4b5563',
  } as CSSProperties

  return (
    <div
      className="chartit-editor group/canvas"
      data-testid="editor-canvas"
      data-tool={effectiveTool}
      data-connecting={connecting}
      data-readonly={readOnly}
      style={rootStyle}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onPointerDownCapture={() => {
        activateEditor(token)
      }}
    >
      <EdgeMarkerDefs />
      <ReactFlow<EditorFlowNode, EditorFlowEdge>
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        isValidConnection={isValidConnection}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeDragStart={onDragStart}
        onNodeDrag={onDrag}
        onNodeDragStop={onDragStop}
        onSelectionDragStart={onDragStart}
        onSelectionDrag={onSelectionDrag}
        onSelectionDragStop={onSelectionDragStop}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeMouseEnter={(_event, node) => {
          store.getState().setHover(node.id)
        }}
        onNodeMouseLeave={() => {
          store.getState().setHover(null)
        }}
        onPaneClick={onPaneClick}
        onMoveEnd={onMoveEnd}
        defaultViewport={initialViewport}
        fitView={shouldFit}
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.1}
        maxZoom={4}
        snapToGrid={settings.snap}
        snapGrid={[gridSize, gridSize]}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={24}
        reconnectRadius={14}
        connectionLineComponent={ConnectionLine}
        connectionLineStyle={{ stroke: 'var(--accent)', strokeWidth: 2 }}
        nodesDraggable={interactive && selecting}
        nodesConnectable={interactive}
        elementsSelectable={interactive && !panning}
        panOnDrag={panning ? true : [1, 2]}
        selectionOnDrag={interactive && selecting}
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        disableKeyboardA11y
        elevateNodesOnSelect={false}
        elevateEdgesOnSelect
        nodeDragThreshold={2}
        style={{ background: settings.background }}
      >
        {settings.grid !== 'none' ? (
          <Background
            variant={settings.grid === 'dots' ? BackgroundVariant.Dots : BackgroundVariant.Lines}
            gap={gridSize}
            size={settings.grid === 'dots' ? 1.5 : 1}
            color={dark ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.16)'}
          />
        ) : null}
        <MiniMap
          pannable
          zoomable
          nodeColor={minimapColor}
          nodeStrokeWidth={0}
          maskColor="color-mix(in srgb, var(--background) 70%, transparent)"
          style={{ marginBottom: 28 }}
        />
        <Panel position="bottom-left">
          <ZoomControl />
        </Panel>
      </ReactFlow>
      <CommandPalette commands={commands} />
    </div>
  )
})

export function EditorCanvas({ document, onChange, readOnly }: EditorCanvasProps) {
  const existing = useOptionalEditorStoreApi()
  const [fallback] = useState(() => createEmptyDocument('Untitled'))
  if (existing) {
    return <EditorSurface />
  }
  return (
    <EditorProvider document={document ?? fallback} onChange={onChange} readOnly={readOnly}>
      <EditorSurface />
    </EditorProvider>
  )
}
