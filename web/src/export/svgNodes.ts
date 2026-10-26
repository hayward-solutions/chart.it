import { dashArray, dashCap } from '@/editor/style'
import { readableOn } from '@/editor/color'
import { shapeGeometry } from '@/editor/nodes/shapeGeometry'
import { getContainerKind, type IconRef, type Node, type Point } from '@/model'
import { LINE_HEIGHT, iconLabelLayout, truncateText, wrapText, type Rect } from './geometry'
import { inlineIconSvg, type IconAsset } from './icons'
import { esc, num, tag } from './xml'

export const FONT_STACK = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'

export type NodeRenderContext = {
  ink: string
  inlineIcons: boolean
  icons: ReadonlyMap<string, IconAsset | null>
  nextPrefix: () => string
}

export function iconKey(icon: IconRef): string {
  return `${icon.pack}/${icon.id}`
}

export function containerBadge(node: Node): IconRef | undefined {
  return node.data.icon ?? getContainerKind(node.data.containerKind).badge ?? undefined
}

function isBold(weight: string | number | undefined, fallback = false): boolean {
  if (weight === undefined) {
    return fallback
  }
  return weight === 'bold' || Number(weight) >= 600
}

function textElement(
  lines: readonly { text: string; x: number; y: number }[],
  fontSize: number,
  anchor: 'start' | 'middle' | 'end',
  fill: string,
  extra: { fontFamily?: string; fontWeight?: string | number } = {},
): string {
  const body = lines.map((line) => tag('text', { x: line.x, y: line.y }, esc(line.text))).join('')
  return tag(
    'g',
    {
      'font-size': fontSize,
      'font-family': extra.fontFamily,
      'font-weight': extra.fontWeight,
      'text-anchor': anchor === 'start' ? undefined : anchor,
      fill,
    },
    body,
  )
}

function iconMarkup(
  icon: IconRef | undefined,
  box: Rect,
  context: NodeRenderContext,
  placeholder: boolean,
): string {
  const asset = icon ? context.icons.get(iconKey(icon)) : null
  if (!asset) {
    return placeholder
      ? tag('rect', {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          rx: 6,
          fill: '#e5e7eb',
          stroke: '#9ca3af',
        })
      : ''
  }
  if (!context.inlineIcons) {
    return tag('image', {
      href: asset.url,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      preserveAspectRatio: 'xMidYMid meet',
    })
  }
  if (asset.format === 'png' && asset.dataUri) {
    return tag('image', {
      href: asset.dataUri,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      preserveAspectRatio: 'xMidYMid meet',
    })
  }
  return (asset.svg && inlineIconSvg(asset.svg, context.nextPrefix(), box)) || ''
}

function renderContainer(node: Node, context: NodeRenderContext): string {
  const style = node.data.style
  const spec = getContainerKind(node.data.containerKind)
  const { width: w, height: h } = node.size
  const strokeWidth = style.strokeWidth ?? 2
  const half = strokeWidth / 2
  const fill = style.fill ?? spec.fill
  const hasFill = fill !== undefined && fill !== 'none' && fill !== 'transparent'
  const strokeStyle = style.strokeStyle ?? spec.border
  const centred = spec.title === 'top-centre'
  const badge = containerBadge(node)
  const badgeAsset = badge ? context.icons.get(iconKey(badge)) : null
  const parts = [
    tag('rect', {
      x: half,
      y: half,
      width: Math.max(0, w - strokeWidth),
      height: Math.max(0, h - strokeWidth),
      rx: style.radius ?? 4,
      fill: hasFill ? fill : 'none',
      stroke: style.stroke ?? spec.colour,
      'stroke-width': strokeWidth,
      'stroke-dasharray': dashArray(strokeStyle, strokeWidth),
      'stroke-linecap': dashCap(strokeStyle) === 'round' ? 'round' : undefined,
      opacity: style.opacity,
    }),
  ]
  if (badgeAsset) {
    parts.push(
      iconMarkup(badge, { x: strokeWidth, y: strokeWidth, width: 32, height: 32 }, context, false),
    )
  }
  const label = node.data.label.replace(/\s*\n\s*/g, ' ')
  if (label) {
    const fontSize = style.fontSize ?? 13
    const bold = isBold(style.fontWeight, true)
    const left = strokeWidth + (badgeAsset ? 32 + 8 : 8)
    const available = centred ? w - 2 * (strokeWidth + 32 + 8) : w - left - 8
    const text = truncateText(label, Math.max(40, available), fontSize, bold)
    const y = strokeWidth + 16 + fontSize * 0.35
    parts.push(
      textElement(
        [{ text, x: centred ? w / 2 : left, y }],
        fontSize,
        centred ? 'middle' : 'start',
        style.fontColor ?? readableOn(fill, context.ink),
        { fontFamily: style.fontFamily, fontWeight: style.fontWeight ?? 500 },
      ),
    )
  }
  return parts.join('')
}

function renderShape(node: Node, context: NodeRenderContext): string {
  const style = node.data.style
  const { width: w, height: h } = node.size
  const strokeWidth = style.strokeWidth ?? 2
  const fill = style.fill ?? '#ffffff'
  const stroke = style.stroke ?? '#374151'
  const dash = dashArray(style.strokeStyle, strokeWidth)
  const cap = dashCap(style.strokeStyle) === 'round' ? 'round' : undefined
  const geometry = shapeGeometry(node.data.shape ?? 'rect', w, h, strokeWidth / 2, style.radius)
  const common = {
    stroke,
    'stroke-width': strokeWidth,
    'stroke-dasharray': dash,
    'stroke-linecap': cap,
    'stroke-linejoin': 'round',
  }
  const parts = [tag('path', { d: geometry.d, fill, ...common })]
  if (geometry.detail) {
    parts.push(tag('path', { d: geometry.detail, fill: 'none', ...common }))
  }
  if (node.data.label) {
    const fontSize = style.fontSize ?? 14
    const bold = isBold(style.fontWeight)
    const lines = wrapText(node.data.label, Math.max(20, w - 16), fontSize, bold)
    const lineHeight = fontSize * LINE_HEIGHT
    const top = (h - lines.length * lineHeight) / 2
    const anchor =
      style.textAlign === 'left' ? 'start' : style.textAlign === 'right' ? 'end' : 'middle'
    const x = anchor === 'start' ? 8 : anchor === 'end' ? w - 8 : w / 2
    parts.push(
      textElement(
        lines.map((text, i) => ({
          text,
          x,
          y: top + i * lineHeight + lineHeight / 2 + fontSize * 0.35,
        })),
        fontSize,
        anchor,
        style.fontColor ?? readableOn(fill, context.ink),
        { fontFamily: style.fontFamily, fontWeight: style.fontWeight },
      ),
    )
  }
  return parts.join('')
}

function renderText(node: Node, context: NodeRenderContext): string {
  const style = node.data.style
  const { width: w, height: h } = node.size
  const parts: string[] = []
  const borderWidth = style.stroke ? (style.strokeWidth ?? 1) : 0
  if (style.fill || style.stroke) {
    parts.push(
      tag('rect', {
        x: borderWidth / 2,
        y: borderWidth / 2,
        width: Math.max(0, w - borderWidth),
        height: Math.max(0, h - borderWidth),
        rx: style.radius ?? 2,
        fill: style.fill ?? 'none',
        stroke: style.stroke,
        'stroke-width': style.stroke ? borderWidth : undefined,
        'stroke-dasharray': style.stroke ? dashArray(style.strokeStyle, borderWidth) : undefined,
      }),
    )
  }
  if (node.data.label) {
    const fontSize = style.fontSize ?? 16
    const bold = isBold(style.fontWeight)
    const padX = 4 + borderWidth
    const lines = wrapText(node.data.label, Math.max(20, w - padX * 2), fontSize, bold)
    const lineHeight = fontSize * LINE_HEIGHT
    const anchor =
      style.textAlign === 'right' ? 'end' : style.textAlign === 'center' ? 'middle' : 'start'
    const x = anchor === 'start' ? padX : anchor === 'end' ? w - padX : w / 2
    const top = 2 + borderWidth
    parts.push(
      textElement(
        lines.map((text, i) => ({
          text,
          x,
          y: top + i * lineHeight + lineHeight / 2 + fontSize * 0.35,
        })),
        fontSize,
        anchor,
        style.fontColor ?? readableOn(style.fill, context.ink),
        { fontFamily: style.fontFamily, fontWeight: style.fontWeight },
      ),
    )
  }
  return parts.join('')
}

function renderIconNode(node: Node, context: NodeRenderContext): string {
  const style = node.data.style
  const { width: w, height: h } = node.size
  const parts: string[] = []
  const borderWidth = style.stroke ? (style.strokeWidth ?? 1) : 0
  if (style.fill || style.stroke) {
    parts.push(
      tag('rect', {
        x: borderWidth / 2,
        y: borderWidth / 2,
        width: Math.max(0, w - borderWidth),
        height: Math.max(0, h - borderWidth),
        rx: style.radius,
        fill: style.fill ?? 'none',
        stroke: style.stroke,
        'stroke-width': style.stroke ? borderWidth : undefined,
        'stroke-dasharray': style.stroke ? dashArray(style.strokeStyle, borderWidth) : undefined,
      }),
    )
  }
  parts.push(iconMarkup(node.data.icon, { x: 0, y: 0, width: w, height: h }, context, true))
  const label = iconLabelLayout(node, { x: 0, y: 0 })
  if (label) {
    parts.push(
      textElement(label.lines, label.fontSize, label.anchor, style.fontColor ?? context.ink, {
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
      }),
    )
  }
  return parts.join('')
}

export function renderNode(node: Node, origin: Point, context: NodeRenderContext): string {
  let body: string
  switch (node.type) {
    case 'container':
      body = renderContainer(node, context)
      break
    case 'shape':
      body = renderShape(node, context)
      break
    case 'text':
      body = renderText(node, context)
      break
    case 'icon':
      body = renderIconNode(node, context)
      break
  }
  const opacity = node.type === 'container' ? undefined : node.data.style.opacity
  return tag(
    'g',
    {
      'data-node-id': node.id,
      transform: `translate(${num(origin.x)} ${num(origin.y)})`,
      opacity,
    },
    body,
  )
}
