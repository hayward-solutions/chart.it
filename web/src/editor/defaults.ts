import {
  CONTAINER_KINDS,
  type Edge,
  type IconRef,
  type Node,
  type NodeStyle,
  type NodeType,
  type Point,
  type ShapeKind,
  type Size,
} from '@/model'
import { newId } from './ids'
import type { NewEdge, NewNode } from './types'

export const DEFAULT_ICON_SIZE: Size = { width: 64, height: 64 }
export const DEFAULT_CONTAINER_SIZE: Size = { width: 320, height: 240 }
export const DEFAULT_TEXT_SIZE: Size = { width: 160, height: 28 }

export const DEFAULT_SHAPE_SIZES: Record<ShapeKind, Size> = {
  rect: { width: 140, height: 80 },
  roundedRect: { width: 140, height: 80 },
  ellipse: { width: 140, height: 90 },
  diamond: { width: 120, height: 100 },
  cylinder: { width: 90, height: 110 },
  hexagon: { width: 130, height: 90 },
  parallelogram: { width: 140, height: 80 },
  cloud: { width: 150, height: 100 },
  note: { width: 120, height: 120 },
}

export const DEFAULT_SHAPE_STYLE: NodeStyle = {
  fill: '#ffffff',
  stroke: '#374151',
  strokeWidth: 2,
  fontSize: 14,
}

export const GROUP_PADDING = 24
export const MIN_NODE_SIZE = 16

export function defaultSize(type: NodeType, shape?: ShapeKind): Size {
  switch (type) {
    case 'icon':
      return DEFAULT_ICON_SIZE
    case 'container':
      return DEFAULT_CONTAINER_SIZE
    case 'text':
      return DEFAULT_TEXT_SIZE
    case 'shape':
      return DEFAULT_SHAPE_SIZES[shape ?? 'rect']
  }
}

export function isShapeKind(value: string): value is ShapeKind {
  return value in DEFAULT_SHAPE_SIZES
}

const ICON_CONTAINER_KINDS: Record<string, string> = {
  'aws/group-public-subnet': 'aws.subnet.public',
  'aws/group-private-subnet': 'aws.subnet.private',
}

export function containerKindForIcon(icon: IconRef): string | null {
  const direct = ICON_CONTAINER_KINDS[`${icon.pack}/${icon.id}`]
  if (direct) {
    return direct
  }
  for (const spec of Object.values(CONTAINER_KINDS)) {
    if (spec.badge && spec.badge.pack === icon.pack && spec.badge.id === icon.id) {
      return spec.kind
    }
  }
  return null
}

export function topLeftFromCenter(center: Point, size: Size): Point {
  return { x: Math.round(center.x - size.width / 2), y: Math.round(center.y - size.height / 2) }
}

export function buildIconNode(
  icon: { pack: string; id: string; title: string },
  center: Point,
): NewNode {
  const size = DEFAULT_ICON_SIZE
  return {
    type: 'icon',
    position: topLeftFromCenter(center, size),
    size,
    data: {
      label: icon.title,
      icon: { pack: icon.pack, id: icon.id },
      style: { labelPosition: 'bottom' },
    },
  }
}

export function buildShapeNode(shape: ShapeKind, center: Point): NewNode {
  const size = DEFAULT_SHAPE_SIZES[shape]
  return {
    type: 'shape',
    position: topLeftFromCenter(center, size),
    size,
    data: { label: '', shape, style: { ...DEFAULT_SHAPE_STYLE } },
  }
}

export function buildContainerNode(kind: string, center: Point): NewNode {
  const size = DEFAULT_CONTAINER_SIZE
  const spec = CONTAINER_KINDS[kind]
  return {
    type: 'container',
    position: topLeftFromCenter(center, size),
    size,
    data: { label: spec?.label ?? 'Group', containerKind: spec ? spec.kind : 'generic', style: {} },
  }
}

export function buildTextNode(center: Point): NewNode {
  const size = DEFAULT_TEXT_SIZE
  return {
    type: 'text',
    position: topLeftFromCenter(center, size),
    size,
    data: { label: 'Text', style: { fontSize: 16, textAlign: 'left' } },
  }
}

export function materializeNode(input: NewNode, zIndex: number): Node {
  const type = input.type
  const size = input.size ?? defaultSize(type, input.data?.shape)
  const data = input.data ?? {}
  const node: Node = {
    id: input.id ?? newId('n'),
    type,
    position: input.position ?? { x: 0, y: 0 },
    size,
    zIndex: input.zIndex ?? zIndex,
    data: { ...data, label: data.label ?? '', style: data.style ?? {} },
  }
  if (input.parentId) {
    node.parentId = input.parentId
  }
  if (input.locked) {
    node.locked = true
  }
  return node
}

export function materializeEdge(input: NewEdge): Edge {
  const data = input.data ?? {}
  return {
    id: input.id ?? newId('e'),
    source: input.source,
    target: input.target,
    sourceHandle: input.sourceHandle ?? 'right',
    targetHandle: input.targetHandle ?? 'left',
    type: input.type ?? 'orthogonal',
    zIndex: input.zIndex ?? 0,
    data: {
      ...data,
      markerStart: data.markerStart ?? 'none',
      markerEnd: data.markerEnd ?? 'arrow',
      style: data.style ?? {},
    },
  }
}
