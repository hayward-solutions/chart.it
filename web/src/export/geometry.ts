import type { Edge, HandleSide, Node, Point } from '@/model'

export type Rect = { x: number; y: number; width: number; height: number }

export const LINE_HEIGHT = 1.3
export const STUB = 24
export const ICON_LABEL_MAX_WIDTH = 200
export const ICON_LABEL_GAP = 6
export const ICON_LABEL_SIDE_GAP = 8

const SIDE_VECTORS: Record<HandleSide, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}

export function indexNodes(nodes: readonly Node[]): Map<string, Node> {
  return new Map(nodes.map((node) => [node.id, node]))
}

export function absolutePosition(node: Node, index: ReadonlyMap<string, Node>): Point {
  let x = node.position.x
  let y = node.position.y
  let current = node.parentId ? index.get(node.parentId) : undefined
  let guard = 0
  while (current && guard < 64) {
    x += current.position.x
    y += current.position.y
    current = current.parentId ? index.get(current.parentId) : undefined
    guard += 1
  }
  return { x, y }
}

export function absoluteRect(node: Node, index: ReadonlyMap<string, Node>): Rect {
  const position = absolutePosition(node, index)
  return { x: position.x, y: position.y, width: node.size.width, height: node.size.height }
}

export function nodeDepth(node: Node, index: ReadonlyMap<string, Node>): number {
  let depth = 0
  let current = node.parentId ? index.get(node.parentId) : undefined
  while (current && depth < 64) {
    depth += 1
    current = current.parentId ? index.get(current.parentId) : undefined
  }
  return depth
}

export function collectSubtree(nodes: readonly Node[], ids: Iterable<string>): Set<string> {
  const children = new Map<string, string[]>()
  for (const node of nodes) {
    if (node.parentId) {
      const list = children.get(node.parentId)
      if (list) {
        list.push(node.id)
      } else {
        children.set(node.parentId, [node.id])
      }
    }
  }
  const result = new Set<string>()
  const stack = [...ids]
  while (stack.length > 0) {
    const id = stack.pop() as string
    if (result.has(id)) {
      continue
    }
    result.add(id)
    for (const child of children.get(id) ?? []) {
      stack.push(child)
    }
  }
  return result
}

export function unionRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) {
    return null
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const rect of rects) {
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.width)
    maxY = Math.max(maxY, rect.y + rect.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function padRect(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  }
}

export function pointsRect(points: readonly Point[]): Rect | null {
  return unionRects(points.map((point) => ({ x: point.x, y: point.y, width: 0, height: 0 })))
}

const NARROW = new Set("iljtfI.,;:'|!()[]/\\- ")
const WIDE = new Set('mwMW@%')

export function estimateTextWidth(text: string, fontSize: number, bold = false): number {
  let total = 0
  for (const char of text) {
    if (char === ' ') {
      total += 0.28
    } else if (NARROW.has(char)) {
      total += 0.3
    } else if (WIDE.has(char)) {
      total += 0.88
    } else if (char >= 'A' && char <= 'Z') {
      total += 0.68
    } else if (char >= '0' && char <= '9') {
      total += 0.56
    } else if ((char.codePointAt(0) ?? 0) > 0x2e80) {
      total += 1
    } else {
      total += 0.54
    }
  }
  return total * fontSize * (bold ? 1.06 : 1)
}

export function wrapText(text: string, maxWidth: number, fontSize: number, bold = false): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(' ')
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (current && estimateTextWidth(candidate, fontSize, bold) > maxWidth) {
        lines.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    lines.push(current)
  }
  return lines
}

export function truncateText(text: string, maxWidth: number, fontSize: number, bold = false) {
  if (estimateTextWidth(text, fontSize, bold) <= maxWidth) {
    return text
  }
  let result = text
  while (result.length > 1 && estimateTextWidth(`${result}...`, fontSize, bold) > maxWidth) {
    result = result.slice(0, -1)
  }
  return `${result.trimEnd()}...`
}

export type TextLine = { text: string; x: number; y: number }

export type IconLabelLayout = {
  lines: TextLine[]
  anchor: 'start' | 'middle' | 'end'
  fontSize: number
  box: Rect
}

export function iconLabelLayout(node: Node, origin: Point): IconLabelLayout | null {
  const label = node.data.label
  if (!label) {
    return null
  }
  const style = node.data.style
  const fontSize = style.fontSize ?? 12
  const bold = style.fontWeight === 'bold' || Number(style.fontWeight) >= 600
  const placement = style.labelPosition ?? 'bottom'
  const lines = wrapText(label, ICON_LABEL_MAX_WIDTH - 8, fontSize, bold)
  const lineHeight = fontSize * LINE_HEIGHT
  const textWidth = Math.max(...lines.map((line) => estimateTextWidth(line, fontSize, bold)))
  const boxWidth = Math.min(ICON_LABEL_MAX_WIDTH, textWidth + 8)
  const boxHeight = lines.length * lineHeight
  const { width: w, height: h } = node.size
  let boxX = origin.x + w / 2 - boxWidth / 2
  let boxY = origin.y + h + ICON_LABEL_GAP
  let defaultAlign: 'start' | 'middle' | 'end' = 'middle'
  if (placement === 'top') {
    boxY = origin.y - ICON_LABEL_GAP - boxHeight
  } else if (placement === 'left') {
    boxX = origin.x - ICON_LABEL_SIDE_GAP - boxWidth
    boxY = origin.y + h / 2 - boxHeight / 2
    defaultAlign = 'end'
  } else if (placement === 'right') {
    boxX = origin.x + w + ICON_LABEL_SIDE_GAP
    boxY = origin.y + h / 2 - boxHeight / 2
    defaultAlign = 'start'
  } else if (placement === 'inside') {
    boxY = origin.y + h / 2 - boxHeight / 2
  }
  const align =
    style.textAlign === 'left' ? 'start' : style.textAlign === 'right' ? 'end' : defaultAlign
  const x =
    align === 'start' ? boxX + 4 : align === 'end' ? boxX + boxWidth - 4 : boxX + boxWidth / 2
  return {
    lines: lines.map((text, i) => ({
      text,
      x,
      y: boxY + i * lineHeight + lineHeight / 2 + fontSize * 0.35,
    })),
    anchor: align,
    fontSize,
    box: { x: boxX, y: boxY, width: boxWidth, height: boxHeight },
  }
}

export function nodeVisualBounds(node: Node, index: ReadonlyMap<string, Node>): Rect {
  const origin = absolutePosition(node, index)
  const rect = { x: origin.x, y: origin.y, width: node.size.width, height: node.size.height }
  if (node.type !== 'icon') {
    return rect
  }
  const label = iconLabelLayout(node, origin)
  return label ? (unionRects([rect, label.box]) as Rect) : rect
}

export function sideVector(side: HandleSide): Point {
  return SIDE_VECTORS[side]
}

export function isHorizontalSide(side: HandleSide): boolean {
  return side === 'left' || side === 'right'
}

export function handlePoint(rect: Rect, side: HandleSide): Point {
  switch (side) {
    case 'top':
      return { x: rect.x + rect.width / 2, y: rect.y }
    case 'bottom':
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height }
    case 'left':
      return { x: rect.x, y: rect.y + rect.height / 2 }
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
  }
}

export function simplifyPoints(points: readonly Point[]): Point[] {
  const result: Point[] = []
  for (const point of points) {
    const last = result[result.length - 1]
    if (last && Math.abs(last.x - point.x) < 0.01 && Math.abs(last.y - point.y) < 0.01) {
      continue
    }
    result.push(point)
    while (result.length >= 3) {
      const a = result[result.length - 3] as Point
      const b = result[result.length - 2] as Point
      const c = result[result.length - 1] as Point
      const sameX = Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01
      const sameY = Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01
      if (!sameX && !sameY) {
        break
      }
      result.splice(result.length - 2, 1)
    }
  }
  return result
}

export function orthogonalRoute(
  source: Point,
  sourceSide: HandleSide,
  target: Point,
  targetSide: HandleSide,
  stub = STUB,
): Point[] {
  const sv = SIDE_VECTORS[sourceSide]
  const tv = SIDE_VECTORS[targetSide]
  const s1 = { x: source.x + sv.x * stub, y: source.y + sv.y * stub }
  const t1 = { x: target.x + tv.x * stub, y: target.y + tv.y * stub }
  const sourceH = isHorizontalSide(sourceSide)
  const targetH = isHorizontalSide(targetSide)
  const middle: Point[] = []
  if (sourceH && targetH) {
    const x =
      sourceSide === targetSide
        ? sourceSide === 'right'
          ? Math.max(s1.x, t1.x)
          : Math.min(s1.x, t1.x)
        : (s1.x + t1.x) / 2
    middle.push({ x, y: s1.y }, { x, y: t1.y })
  } else if (!sourceH && !targetH) {
    const y =
      sourceSide === targetSide
        ? sourceSide === 'bottom'
          ? Math.max(s1.y, t1.y)
          : Math.min(s1.y, t1.y)
        : (s1.y + t1.y) / 2
    middle.push({ x: s1.x, y }, { x: t1.x, y })
  } else if (sourceH) {
    middle.push({ x: t1.x, y: s1.y })
  } else {
    middle.push({ x: s1.x, y: t1.y })
  }
  return simplifyPoints([source, s1, ...middle, t1, target])
}

export function routeThroughWaypoints(
  source: Point,
  sourceSide: HandleSide,
  target: Point,
  targetSide: HandleSide,
  waypoints: readonly Point[],
): Point[] {
  const chain = [source, ...waypoints, target]
  const result: Point[] = [source]
  let horizontal = isHorizontalSide(sourceSide)
  for (let i = 1; i < chain.length; i += 1) {
    const a = chain[i - 1] as Point
    const b = chain[i] as Point
    const aligned = Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01
    if (!aligned) {
      const last = i === chain.length - 1
      const continueHorizontal = last ? !isHorizontalSide(targetSide) : horizontal
      result.push(continueHorizontal ? { x: b.x, y: a.y } : { x: a.x, y: b.y })
    }
    const previous = result[result.length - 1] as Point
    horizontal = Math.abs(previous.y - b.y) < 0.01 && Math.abs(previous.x - b.x) >= 0.01
    result.push(b)
  }
  return simplifyPoints(result)
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function toward(from: Point, to: Point, amount: number): Point {
  const length = distance(from, to)
  if (length === 0) {
    return from
  }
  return {
    x: from.x + ((to.x - from.x) * amount) / length,
    y: from.y + ((to.y - from.y) * amount) / length,
  }
}

function fmt(value: number): string {
  return String(Math.round(value * 100) / 100)
}

export function roundedPath(points: readonly Point[], radius: number): string {
  const first = points[0]
  if (!first) {
    return ''
  }
  let d = `M${fmt(first.x)} ${fmt(first.y)}`
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1] as Point
    const cur = points[i] as Point
    const next = points[i + 1] as Point
    const r = Math.min(radius, distance(prev, cur) / 2, distance(cur, next) / 2)
    const a = toward(cur, prev, r)
    const b = toward(cur, next, r)
    d += `L${fmt(a.x)} ${fmt(a.y)}Q${fmt(cur.x)} ${fmt(cur.y)} ${fmt(b.x)} ${fmt(b.y)}`
  }
  const last = points[points.length - 1] as Point
  if (points.length > 1) {
    d += `L${fmt(last.x)} ${fmt(last.y)}`
  }
  return d
}

export function pointAlong(points: readonly Point[], fraction: number): Point {
  const first = points[0] ?? { x: 0, y: 0 }
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    total += distance(points[i - 1] as Point, points[i] as Point)
  }
  if (total === 0) {
    return first
  }
  let remaining = Math.min(1, Math.max(0, fraction)) * total
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Point
    const b = points[i] as Point
    const length = distance(a, b)
    if (remaining <= length && length > 0) {
      return toward(a, b, remaining)
    }
    remaining -= length
  }
  return points[points.length - 1] as Point
}

function bezierControl(from: Point, side: HandleSide, to: Point): Point {
  const offset = (distanceValue: number) =>
    distanceValue >= 0 ? 0.5 * distanceValue : 0.25 * 25 * Math.sqrt(-distanceValue)
  switch (side) {
    case 'left':
      return { x: from.x - offset(from.x - to.x), y: from.y }
    case 'right':
      return { x: from.x + offset(to.x - from.x), y: from.y }
    case 'top':
      return { x: from.x, y: from.y - offset(from.y - to.y) }
    case 'bottom':
      return { x: from.x, y: from.y + offset(to.y - from.y) }
  }
}

function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  }
}

export type EdgeGeometry = { d: string; samples: Point[]; label: Point }

export function edgeGeometry(edge: Edge, sourceRect: Rect, targetRect: Rect): EdgeGeometry {
  const source = handlePoint(sourceRect, edge.sourceHandle)
  const target = handlePoint(targetRect, edge.targetHandle)
  const fraction = edge.data.labelPosition ?? 0.5
  if (edge.type === 'straight') {
    const samples = [source, target]
    return { d: roundedPath(samples, 0), samples, label: pointAlong(samples, fraction) }
  }
  if (edge.type === 'bezier') {
    const c1 = bezierControl(source, edge.sourceHandle, target)
    const c2 = bezierControl(target, edge.targetHandle, source)
    const samples = Array.from({ length: 33 }, (_, i) => cubicAt(source, c1, c2, target, i / 32))
    return {
      d: `M${fmt(source.x)} ${fmt(source.y)}C${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(target.x)} ${fmt(target.y)}`,
      samples,
      label: pointAlong(samples, fraction),
    }
  }
  const waypoints = edge.data.waypoints ?? []
  const samples =
    waypoints.length > 0
      ? routeThroughWaypoints(source, edge.sourceHandle, target, edge.targetHandle, waypoints)
      : orthogonalRoute(source, edge.sourceHandle, target, edge.targetHandle)
  return { d: roundedPath(samples, 6), samples, label: pointAlong(samples, fraction) }
}
