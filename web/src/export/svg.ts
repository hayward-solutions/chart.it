import { canvasInk, isDarkColor } from '@/editor/color'
import type { Document, Edge, Node } from '@/model'
import {
  absolutePosition,
  absoluteRect,
  collectSubtree,
  indexNodes,
  nodeDepth,
  nodeVisualBounds,
  unionRects,
  type Rect,
} from './geometry'
import { defaultIconLoader, type IconAsset, type IconLoader } from './icons'
import { renderEdge } from './svgEdges'
import { FONT_STACK, containerBadge, iconKey, renderNode, type NodeRenderContext } from './svgNodes'
import { esc, tag } from './xml'

export type SvgOptions = {
  selectionIds?: string[]
  padding?: number
  background?: string | 'transparent'
  inlineIcons?: boolean
  loadIcon?: IconLoader
}

export type SvgResult = { svg: string; width: number; height: number }

type Item = { z: number; tie: number; depth: number; order: number; markup: () => string }

function effectiveZ(node: Node, index: ReadonlyMap<string, Node>): number {
  let z = node.zIndex
  let current = node.parentId ? index.get(node.parentId) : undefined
  let guard = 0
  while (current && guard < 64) {
    z = Math.max(z, current.zIndex)
    current = current.parentId ? index.get(current.parentId) : undefined
    guard += 1
  }
  return z
}

async function loadIcons(
  nodes: readonly Node[],
  loader: IconLoader,
): Promise<Map<string, IconAsset | null>> {
  const refs = new Map<string, NonNullable<Node['data']['icon']>>()
  for (const node of nodes) {
    const icon = node.type === 'container' ? containerBadge(node) : node.data.icon
    if (icon && (node.type === 'icon' || node.type === 'container')) {
      refs.set(iconKey(icon), icon)
    }
  }
  const entries = await Promise.all(
    [...refs].map(async ([key, icon]) => [key, await loader(icon).catch(() => null)] as const),
  )
  return new Map(entries)
}

export async function renderDocumentSvgDetailed(
  doc: Document,
  options: SvgOptions = {},
): Promise<SvgResult> {
  const padding = options.padding ?? 32
  const index = indexNodes(doc.nodes)
  const selection =
    options.selectionIds && options.selectionIds.length > 0
      ? collectSubtree(
          doc.nodes,
          options.selectionIds.filter((id) => index.has(id)),
        )
      : null
  const nodes = selection ? doc.nodes.filter((node) => selection.has(node.id)) : doc.nodes
  const edges: Edge[] = doc.edges.filter(
    (edge) =>
      index.has(edge.source) &&
      index.has(edge.target) &&
      (!selection || (selection.has(edge.source) && selection.has(edge.target))),
  )

  const requested = options.background ?? doc.settings.background
  const transparent = requested === 'transparent'
  const canvas = transparent ? doc.settings.background : requested
  const ink = canvasInk(canvas)
  const icons = await loadIcons(nodes, options.loadIcon ?? defaultIconLoader)
  let counter = 0
  const nodeContext: NodeRenderContext = {
    ink,
    inlineIcons: options.inlineIcons !== false,
    icons,
    nextPrefix: () => `ic${counter++}-`,
  }
  const markers = new Map<string, string>()
  const edgeContext = {
    ink,
    edgeColour: isDarkColor(canvas) ? '#9ca3af' : '#4b5563',
    labelBackground: canvas,
    markers,
  }

  const items: Item[] = []
  const bounds: Rect[] = []
  let order = 0
  for (const node of nodes) {
    bounds.push(nodeVisualBounds(node, index))
    items.push({
      z: effectiveZ(node, index),
      tie: node.type === 'container' ? 0 : 2,
      depth: node.type === 'container' ? nodeDepth(node, index) : 0,
      order: order++,
      markup: () => renderNode(node, absolutePosition(node, index), nodeContext),
    })
  }
  for (const edge of edges) {
    const source = index.get(edge.source) as Node
    const target = index.get(edge.target) as Node
    const rendered = renderEdge(
      edge,
      absoluteRect(source, index),
      absoluteRect(target, index),
      edgeContext,
    )
    bounds.push(rendered.bounds)
    items.push({ z: edge.zIndex, tie: 1, depth: 0, order: order++, markup: () => rendered.markup })
  }
  items.sort((a, b) => a.z - b.z || a.tie - b.tie || a.depth - b.depth || a.order - b.order)

  const content = unionRects(bounds) ?? { x: 0, y: 0, width: 0, height: 0 }
  const x = Math.floor(content.x - padding)
  const y = Math.floor(content.y - padding)
  const width = Math.max(1, Math.ceil(content.x + content.width + padding) - x)
  const height = Math.max(1, Math.ceil(content.y + content.height + padding) - y)

  const body = items.map((item) => item.markup()).join('')
  const defs = markers.size > 0 ? tag('defs', {}, [...markers.values()].join('')) : ''
  const background = transparent
    ? ''
    : tag('rect', { x, y, width, height, fill: canvas, 'data-role': 'background' })
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}" font-family="${FONT_STACK}">` +
    `<title>${esc(doc.title)}</title>${defs}${background}${body}</svg>`
  return { svg, width, height }
}

export async function renderDocumentSvg(doc: Document, options: SvgOptions = {}): Promise<string> {
  return (await renderDocumentSvgDetailed(doc, options)).svg
}
