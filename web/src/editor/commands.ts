import { routeEdges } from '@/layout/router'
import { CONTAINER_KINDS, SHAPES } from '@/model'
import type { EditorActions } from './actions'
import { parseClipboard, serializeClipboard } from './clipboard'
import type { EditorState, EditorStore } from './store'

export type EditorCommand = {
  id: string
  title: string
  group: string
  shortcut?: string
  aliases?: string[]
  keywords?: string[]
  native?: boolean
  global?: boolean
  hidden?: boolean
  mutates: boolean
  enabled?: (state: EditorState) => boolean
  run: () => void
}

type Spec = Omit<EditorCommand, 'mutates'> & { mutates?: boolean }

const hasNodes = (state: EditorState) => state.selection.nodes.length > 0
const hasSelection = (state: EditorState) =>
  state.selection.nodes.length > 0 || state.selection.edges.length > 0
const atLeast = (count: number) => (state: EditorState) => state.selection.nodes.length >= count
const hasContainer = (state: EditorState) => {
  const ids = new Set(state.selection.nodes)
  return state.document.nodes.some((node) => ids.has(node.id) && node.type === 'container')
}

const hasRoutableEdges = (state: EditorState) =>
  state.document.edges.some((edge) => edge.type === 'orthogonal')

const hasRoutedEdges = (state: EditorState) =>
  state.document.edges.some((edge) => (edge.data.waypoints?.length ?? 0) > 0)

export function createCommands(store: EditorStore, actions: EditorActions): EditorCommand[] {
  const state = () => store.getState()
  const history = () => store.temporal.getState()

  const writeSystemClipboard = (text: string) => {
    try {
      void navigator.clipboard?.writeText(text).catch(() => {})
    } catch {
      return
    }
  }

  const specs: Spec[] = [
    {
      id: 'tool.select',
      title: 'Select tool',
      group: 'Tools',
      shortcut: 'v',
      mutates: false,
      run: () => actions.setTool('select'),
    },
    {
      id: 'tool.pan',
      title: 'Pan tool',
      group: 'Tools',
      shortcut: 'h',
      keywords: ['hand', 'move canvas'],
      mutates: false,
      run: () => actions.setTool('pan'),
    },
    {
      id: 'tool.text',
      title: 'Text tool',
      group: 'Tools',
      shortcut: 't',
      run: () => actions.setTool('text'),
    },
    {
      id: 'tool.rect',
      title: 'Rectangle tool',
      group: 'Tools',
      shortcut: 'r',
      run: () => actions.setTool('shape:rect'),
    },
    {
      id: 'tool.ellipse',
      title: 'Ellipse tool',
      group: 'Tools',
      shortcut: 'o',
      keywords: ['circle'],
      run: () => actions.setTool('shape:ellipse'),
    },
    {
      id: 'tool.diamond',
      title: 'Diamond tool',
      group: 'Tools',
      shortcut: 'd',
      keywords: ['decision'],
      run: () => actions.setTool('shape:diamond'),
    },
    {
      id: 'tool.connector',
      title: 'Connector tool',
      group: 'Tools',
      shortcut: 'l',
      keywords: ['line', 'arrow', 'edge'],
      run: () => actions.setTool('connector'),
    },
    {
      id: 'edit.cancel',
      title: 'Cancel or deselect',
      group: 'Edit',
      shortcut: 'escape',
      hidden: true,
      mutates: false,
      run: () => {
        const current = state()
        if (current.paletteOpen) {
          current.setPaletteOpen(false)
        } else if (current.tool !== 'select') {
          current.setTool('select')
        } else {
          current.clearSelection()
        }
      },
    },
    {
      id: 'edit.undo',
      title: 'Undo',
      group: 'Edit',
      shortcut: 'mod+z',
      enabled: () => history().pastStates.length > 0,
      run: () => actions.undo(),
    },
    {
      id: 'edit.redo',
      title: 'Redo',
      group: 'Edit',
      shortcut: 'mod+shift+z',
      aliases: ['mod+y'],
      enabled: () => history().futureStates.length > 0,
      run: () => actions.redo(),
    },
    {
      id: 'edit.cut',
      title: 'Cut',
      group: 'Edit',
      shortcut: 'mod+x',
      native: true,
      enabled: hasNodes,
      run: () => {
        const payload = state().cut()
        if (payload) {
          writeSystemClipboard(serializeClipboard(payload))
        }
      },
    },
    {
      id: 'edit.copy',
      title: 'Copy',
      group: 'Edit',
      shortcut: 'mod+c',
      native: true,
      mutates: false,
      enabled: hasNodes,
      run: () => {
        const payload = state().copy()
        if (payload) {
          writeSystemClipboard(serializeClipboard(payload))
        }
      },
    },
    {
      id: 'edit.paste',
      title: 'Paste',
      group: 'Edit',
      shortcut: 'mod+v',
      native: true,
      run: () => {
        const fallback = () => {
          state().paste()
        }
        try {
          const read = navigator.clipboard?.readText()
          if (!read) {
            fallback()
            return
          }
          read
            .then((text) => {
              const payload = parseClipboard(text)
              if (payload) {
                state().paste(undefined, payload)
              } else {
                fallback()
              }
            })
            .catch(fallback)
        } catch {
          fallback()
        }
      },
    },
    {
      id: 'edit.duplicate',
      title: 'Duplicate',
      group: 'Edit',
      shortcut: 'mod+d',
      enabled: hasNodes,
      run: () => actions.duplicate(),
    },
    {
      id: 'edit.delete',
      title: 'Delete',
      group: 'Edit',
      shortcut: 'delete',
      aliases: ['backspace'],
      enabled: hasSelection,
      run: () => actions.remove(),
    },
    {
      id: 'edit.selectAll',
      title: 'Select all',
      group: 'Edit',
      shortcut: 'mod+a',
      mutates: false,
      run: () => actions.selectAll(),
    },
    {
      id: 'edit.deselect',
      title: 'Deselect all',
      group: 'Edit',
      mutates: false,
      enabled: hasSelection,
      run: () => actions.clearSelection(),
    },
    {
      id: 'edit.label',
      title: 'Edit label',
      group: 'Edit',
      shortcut: 'enter',
      aliases: ['f2'],
      keywords: ['rename', 'text'],
      enabled: (s) => s.selection.nodes.length === 1,
      run: () => {
        const only = state().selection.nodes
        if (only.length === 1) {
          state().setEditingNode(only[0] as string)
        }
      },
    },
    {
      id: 'edges.reroute',
      title: 'Reroute edges',
      group: 'Edges',
      keywords: ['route', 'connector', 'avoid', 'orthogonal', 'auto'],
      enabled: hasRoutableEdges,
      run: () => {
        const { document, selection } = state()
        const chosen = new Set(selection.edges)
        const targets = document.edges.filter(
          (edge) => edge.type === 'orthogonal' && (chosen.size === 0 || chosen.has(edge.id)),
        )
        const routed = routeEdges(document.nodes, targets)
        state().setEdgeWaypoints(
          routed.map((edge) => ({ id: edge.id, waypoints: edge.data.waypoints })),
        )
      },
    },
    {
      id: 'edges.resetRoute',
      title: 'Reset edge route',
      group: 'Edges',
      keywords: ['route', 'connector', 'waypoints', 'clear'],
      enabled: hasRoutedEdges,
      run: () => {
        const { document, selection } = state()
        const chosen = new Set(selection.edges)
        state().setEdgeWaypoints(
          document.edges
            .filter((edge) => chosen.size === 0 || chosen.has(edge.id))
            .map((edge) => ({ id: edge.id, waypoints: undefined })),
        )
      },
    },
    {
      id: 'arrange.group',
      title: 'Group',
      group: 'Arrange',
      shortcut: 'mod+g',
      enabled: hasNodes,
      run: () => actions.group(),
    },
    {
      id: 'arrange.ungroup',
      title: 'Ungroup',
      group: 'Arrange',
      shortcut: 'mod+shift+g',
      enabled: hasContainer,
      run: () => actions.ungroup(),
    },
    {
      id: 'arrange.forward',
      title: 'Bring forward',
      group: 'Arrange',
      shortcut: 'mod+]',
      enabled: hasNodes,
      run: () => actions.order('forward'),
    },
    {
      id: 'arrange.backward',
      title: 'Send backward',
      group: 'Arrange',
      shortcut: 'mod+[',
      enabled: hasNodes,
      run: () => actions.order('backward'),
    },
    {
      id: 'arrange.front',
      title: 'Bring to front',
      group: 'Arrange',
      shortcut: 'mod+shift+]',
      enabled: hasNodes,
      run: () => actions.order('front'),
    },
    {
      id: 'arrange.back',
      title: 'Send to back',
      group: 'Arrange',
      shortcut: 'mod+shift+[',
      enabled: hasNodes,
      run: () => actions.order('back'),
    },
    {
      id: 'arrange.lock',
      title: 'Lock or unlock',
      group: 'Arrange',
      shortcut: 'mod+l',
      keywords: ['freeze'],
      enabled: hasNodes,
      run: () => actions.toggleLock(),
    },
    ...(
      [
        ['left', 'Align left'],
        ['centerX', 'Align horizontal centres'],
        ['right', 'Align right'],
        ['top', 'Align top'],
        ['centerY', 'Align vertical centres'],
        ['bottom', 'Align bottom'],
      ] as const
    ).map(([kind, title]): Spec => ({
      id: `arrange.align.${kind}`,
      title,
      group: 'Arrange',
      enabled: atLeast(2),
      run: () => actions.align(kind),
    })),
    {
      id: 'arrange.distribute.x',
      title: 'Distribute horizontally',
      group: 'Arrange',
      enabled: atLeast(3),
      run: () => actions.distribute('x'),
    },
    {
      id: 'arrange.distribute.y',
      title: 'Distribute vertically',
      group: 'Arrange',
      enabled: atLeast(3),
      run: () => actions.distribute('y'),
    },
    ...(
      [
        ['up', 'arrowup', 0, -1],
        ['down', 'arrowdown', 0, 1],
        ['left', 'arrowleft', -1, 0],
        ['right', 'arrowright', 1, 0],
      ] as const
    ).flatMap(([name, key, dx, dy]): Spec[] => [
      {
        id: `nudge.${name}`,
        title: `Nudge ${name}`,
        group: 'Arrange',
        shortcut: key,
        hidden: true,
        enabled: hasNodes,
        run: () => state().moveNodes(state().selection.nodes, { x: dx, y: dy }),
      },
      {
        id: `nudge.${name}.big`,
        title: `Nudge ${name} by 10`,
        group: 'Arrange',
        shortcut: `shift+${key}`,
        hidden: true,
        enabled: hasNodes,
        run: () => state().moveNodes(state().selection.nodes, { x: dx * 10, y: dy * 10 }),
      },
    ]),
    {
      id: 'view.zoomIn',
      title: 'Zoom in',
      group: 'View',
      shortcut: 'mod+=',
      aliases: ['mod+shift+='],
      mutates: false,
      run: () => actions.zoomIn(),
    },
    {
      id: 'view.zoomOut',
      title: 'Zoom out',
      group: 'View',
      shortcut: 'mod+-',
      mutates: false,
      run: () => actions.zoomOut(),
    },
    {
      id: 'view.fit',
      title: 'Fit to screen',
      group: 'View',
      shortcut: 'mod+0',
      mutates: false,
      run: () => actions.fitView(),
    },
    {
      id: 'view.actual',
      title: 'Zoom to 100%',
      group: 'View',
      shortcut: 'mod+1',
      mutates: false,
      run: () => actions.zoomTo(1),
    },
    {
      id: 'view.grid.dots',
      title: 'Grid: dots',
      group: 'View',
      run: () => actions.updateSettings({ grid: 'dots' }),
    },
    {
      id: 'view.grid.lines',
      title: 'Grid: lines',
      group: 'View',
      run: () => actions.updateSettings({ grid: 'lines' }),
    },
    {
      id: 'view.grid.none',
      title: 'Grid: hidden',
      group: 'View',
      run: () => actions.updateSettings({ grid: 'none' }),
    },
    {
      id: 'view.snap',
      title: 'Toggle snap to grid',
      group: 'View',
      run: () => actions.updateSettings({ snap: !state().document.settings.snap }),
    },
    {
      id: 'view.palette',
      title: 'Command palette',
      group: 'View',
      shortcut: 'mod+k',
      global: true,
      hidden: true,
      mutates: false,
      run: () => state().setPaletteOpen(!state().paletteOpen),
    },
    ...SHAPES.map((shape): Spec => ({
      id: `insert.shape.${shape.kind}`,
      title: `Insert ${shape.label.toLowerCase()}`,
      group: 'Insert',
      keywords: ['shape'],
      run: () => actions.addShape(shape.kind),
    })),
    {
      id: 'insert.text',
      title: 'Insert text',
      group: 'Insert',
      run: () => actions.addText(),
    },
    ...Object.values(CONTAINER_KINDS).map((spec): Spec => ({
      id: `insert.container.${spec.kind}`,
      title:
        `Insert container: ${spec.kind.split('.')[0]?.toUpperCase() ?? ''} ${spec.label}`.replace(
          'GENERIC ',
          '',
        ),
      group: 'Insert',
      keywords: ['container', 'group', spec.kind],
      run: () => actions.addContainer(spec.kind),
    })),
  ]

  return specs.map((spec) => ({ ...spec, mutates: spec.mutates ?? true }))
}
