import { createEmptyDocument, type Document, type Edge, type Node, type NodeStyle } from '@/model'
import type { IconAsset, IconLoader } from './icons'

type NodeInit = {
  id: string
  type?: Node['type']
  x?: number
  y?: number
  width?: number
  height?: number
  parentId?: string
  zIndex?: number
  locked?: boolean
  label?: string
  icon?: { pack: string; id: string }
  shape?: Node['data']['shape']
  containerKind?: string
  style?: NodeStyle
}

export function makeNode(init: NodeInit): Node {
  const type = init.type ?? 'icon'
  const node: Node = {
    id: init.id,
    type,
    position: { x: init.x ?? 0, y: init.y ?? 0 },
    size: {
      width: init.width ?? (type === 'container' ? 240 : 64),
      height: init.height ?? (type === 'container' ? 160 : 64),
    },
    zIndex: init.zIndex ?? 0,
    data: { label: init.label ?? '', style: init.style ?? {} },
  }
  if (init.parentId) {
    node.parentId = init.parentId
  }
  if (init.locked) {
    node.locked = true
  }
  if (init.icon) {
    node.data.icon = init.icon
  }
  if (init.shape) {
    node.data.shape = init.shape
  }
  if (init.containerKind) {
    node.data.containerKind = init.containerKind
  }
  return node
}

type EdgeInit = {
  id: string
  source: string
  target: string
  sourceHandle?: Edge['sourceHandle']
  targetHandle?: Edge['targetHandle']
  type?: Edge['type']
  zIndex?: number
  label?: string
  labelPosition?: number
  markerStart?: Edge['data']['markerStart']
  markerEnd?: Edge['data']['markerEnd']
  waypoints?: { x: number; y: number }[]
  style?: Edge['data']['style']
}

export function makeEdge(init: EdgeInit): Edge {
  const data: Edge['data'] = {
    markerStart: init.markerStart ?? 'none',
    markerEnd: init.markerEnd ?? 'arrow',
    style: init.style ?? {},
  }
  if (init.label !== undefined) {
    data.label = init.label
  }
  if (init.labelPosition !== undefined) {
    data.labelPosition = init.labelPosition
  }
  if (init.waypoints) {
    data.waypoints = init.waypoints
  }
  return {
    id: init.id,
    source: init.source,
    target: init.target,
    sourceHandle: init.sourceHandle ?? 'right',
    targetHandle: init.targetHandle ?? 'left',
    type: init.type ?? 'orthogonal',
    zIndex: init.zIndex ?? 0,
    data,
  }
}

export function makeDocument(nodes: Node[], edges: Edge[] = [], title = 'Test diagram'): Document {
  return { ...createEmptyDocument(title), nodes, edges }
}

const STUB_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>'

export const stubIconLoader: IconLoader = (icon) => {
  if (icon.id === 'missing') {
    return Promise.resolve(null)
  }
  const asset: IconAsset = {
    file: `${icon.pack}/${icon.id}.svg`,
    url: `/icons/${icon.pack}/${icon.id}.svg`,
    format: 'svg',
    svg: STUB_SVG,
  }
  return Promise.resolve(asset)
}

const manifestFiles = import.meta.glob('/public/icons/manifest.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const iconFiles = import.meta.glob('/public/icons/**/*.svg', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

export function createRepoIconLoader(): IconLoader {
  const manifest = JSON.parse(Object.values(manifestFiles)[0] ?? '{"icons":[]}') as {
    icons: { pack: string; id: string; file: string }[]
  }
  const files = new Map(manifest.icons.map((entry) => [`${entry.pack}/${entry.id}`, entry.file]))
  return async (icon) => {
    const file = files.get(`${icon.pack}/${icon.id}`) ?? files.get(`${icon.pack}/group-${icon.id}`)
    const load = file ? iconFiles[`/public/icons/${file}`] : undefined
    if (!file || !load) {
      return null
    }
    return { file, url: `/icons/${file}`, format: 'svg', svg: await load() }
  }
}

export function listRepoIconKeys(): Set<string> {
  const manifest = JSON.parse(Object.values(manifestFiles)[0] ?? '{"icons":[]}') as {
    icons: { pack: string; id: string }[]
  }
  return new Set(manifest.icons.map((entry) => `${entry.pack}/${entry.id}`))
}
