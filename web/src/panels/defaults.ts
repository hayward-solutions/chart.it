import { getContainerKind, type EdgeStyle, type Node, type NodeStyle } from '@/model'

export type ResolvedNodeStyle = Required<
  Pick<
    NodeStyle,
    | 'fill'
    | 'stroke'
    | 'strokeWidth'
    | 'strokeStyle'
    | 'opacity'
    | 'radius'
    | 'fontFamily'
    | 'fontSize'
    | 'fontColor'
    | 'textAlign'
    | 'labelPosition'
  >
> & { fontWeight: number | string }

export type ResolvedEdgeStyle = Required<EdgeStyle>

export const FONT_FAMILIES = [
  'Inter',
  'Arial',
  'Verdana',
  'Georgia',
  'Times New Roman',
  'Courier New',
] as const

export const EDGE_DEFAULTS: ResolvedEdgeStyle = {
  stroke: '#4B5563',
  strokeWidth: 2,
  strokeStyle: 'solid',
  opacity: 1,
  fontSize: 12,
  fontColor: '#18181b',
  labelBackground: '#ffffff',
}

export function resolveNodeStyle(node: Node): ResolvedNodeStyle {
  const style = node.data.style
  const container =
    node.type === 'container' ? getContainerKind(node.data.containerKind) : undefined
  const base: ResolvedNodeStyle = {
    fill: '#ffffff',
    stroke: '#374151',
    strokeWidth: 1.5,
    strokeStyle: 'solid',
    opacity: 1,
    radius: 0,
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: 400,
    fontColor: '#18181b',
    textAlign: 'center',
    labelPosition: 'inside',
  }
  if (node.type === 'icon') {
    base.fill = 'transparent'
    base.stroke = 'transparent'
    base.strokeWidth = 0
    base.labelPosition = 'bottom'
  } else if (node.type === 'text') {
    base.fill = 'transparent'
    base.stroke = 'transparent'
    base.strokeWidth = 0
  } else if (node.type === 'container' && container) {
    base.fill = container.fill ?? 'transparent'
    base.stroke = container.colour
    base.strokeStyle = container.border
    base.radius = 8
    base.labelPosition = 'top'
    base.textAlign = container.title === 'top-centre' ? 'center' : 'left'
  } else if (node.data.shape === 'roundedRect') {
    base.radius = 8
  }
  return {
    fill: style.fill ?? base.fill,
    stroke: style.stroke ?? base.stroke,
    strokeWidth: style.strokeWidth ?? base.strokeWidth,
    strokeStyle: style.strokeStyle ?? base.strokeStyle,
    opacity: style.opacity ?? base.opacity,
    radius: style.radius ?? base.radius,
    fontFamily: style.fontFamily ?? base.fontFamily,
    fontSize: style.fontSize ?? base.fontSize,
    fontWeight: style.fontWeight ?? base.fontWeight,
    fontColor: style.fontColor ?? base.fontColor,
    textAlign: style.textAlign ?? base.textAlign,
    labelPosition: style.labelPosition ?? base.labelPosition,
  }
}

export function weightValue(weight: number | string): string {
  if (weight === 'bold') {
    return '700'
  }
  if (weight === 'normal') {
    return '400'
  }
  return String(weight)
}
