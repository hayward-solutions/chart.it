import { dashArray, dashCap, edgeStrokeWidth } from '@/editor/style'
import type { Edge, MarkerKind } from '@/model'
import {
  LINE_HEIGHT,
  edgeGeometry,
  estimateTextWidth,
  pointsRect,
  unionRects,
  type EdgeGeometry,
  type Rect,
} from './geometry'
import { esc, tag } from './xml'

export type EdgeRenderContext = {
  ink: string
  edgeColour: string
  labelBackground: string
  markers: Map<string, string>
}

type VisibleMarker = Exclude<MarkerKind, 'none'>

const MARKER_REF: Record<VisibleMarker, { refX: number; size: number }> = {
  arrow: { refX: 10, size: 6 },
  openArrow: { refX: 9, size: 6 },
  diamond: { refX: 10, size: 7 },
  circle: { refX: 9, size: 6 },
}

function colourToken(colour: string): string {
  return colour.replace(/[^a-zA-Z0-9]/g, '') || 'x'
}

function markerShape(kind: VisibleMarker, colour: string): string {
  switch (kind) {
    case 'arrow':
      return tag('path', { d: 'M 0 1 L 10 5 L 0 9 z', fill: colour })
    case 'openArrow':
      return tag('path', {
        d: 'M 1 1 L 9 5 L 1 9',
        fill: 'none',
        stroke: colour,
        'stroke-width': 1.6,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      })
    case 'diamond':
      return tag('path', { d: 'M 0 5 L 5 1 L 10 5 L 5 9 z', fill: colour })
    case 'circle':
      return tag('circle', { cx: 5, cy: 5, r: 4, fill: colour })
  }
}

function markerRef(
  kind: MarkerKind,
  end: 'start' | 'end',
  colour: string,
  markers: Map<string, string>,
): string | undefined {
  if (kind === 'none') {
    return undefined
  }
  const id = `chartit-marker-${kind}-${end}-${colourToken(colour)}`
  if (!markers.has(id)) {
    const geometry = MARKER_REF[kind]
    markers.set(
      id,
      tag(
        'marker',
        {
          id,
          viewBox: '0 0 10 10',
          refX: geometry.refX,
          refY: 5,
          markerWidth: geometry.size,
          markerHeight: geometry.size,
          markerUnits: 'strokeWidth',
          orient: end === 'end' ? 'auto' : 'auto-start-reverse',
          overflow: 'visible',
        },
        markerShape(kind, colour),
      ),
    )
  }
  return `url(#${id})`
}

export type RenderedEdge = { markup: string; bounds: Rect }

export function renderEdge(
  edge: Edge,
  sourceRect: Rect,
  targetRect: Rect,
  context: EdgeRenderContext,
): RenderedEdge {
  const geometry: EdgeGeometry = edgeGeometry(edge, sourceRect, targetRect)
  const style = edge.data.style
  const width = edgeStrokeWidth(style)
  const stroke = style.stroke ?? context.edgeColour
  const parts = [
    tag('path', {
      d: geometry.d,
      fill: 'none',
      stroke,
      'stroke-width': width,
      'stroke-dasharray': dashArray(style.strokeStyle, width),
      'stroke-linecap': dashCap(style.strokeStyle) === 'round' ? 'round' : undefined,
      'stroke-linejoin': 'round',
      opacity: style.opacity,
      'marker-start': markerRef(edge.data.markerStart, 'start', stroke, context.markers),
      'marker-end': markerRef(edge.data.markerEnd, 'end', stroke, context.markers),
    }),
  ]
  const rects: Rect[] = []
  const line = pointsRect(geometry.samples)
  if (line) {
    rects.push(line)
  }
  const label = edge.data.label
  if (label) {
    const fontSize = style.fontSize ?? 12
    const lines = label.split('\n')
    const lineHeight = fontSize * LINE_HEIGHT
    const textWidth = Math.max(...lines.map((text) => estimateTextWidth(text, fontSize)))
    const box: Rect = {
      x: geometry.label.x - (textWidth + 12) / 2,
      y: geometry.label.y - (lines.length * lineHeight + 6) / 2,
      width: textWidth + 12,
      height: lines.length * lineHeight + 6,
    }
    rects.push(box)
    parts.push(
      tag('rect', {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        rx: 4,
        fill: style.labelBackground ?? context.labelBackground,
        'fill-opacity': 0.92,
      }),
      tag(
        'g',
        { 'font-size': fontSize, fill: style.fontColor ?? context.ink, 'text-anchor': 'middle' },
        lines
          .map((text, i) =>
            tag(
              'text',
              {
                x: geometry.label.x,
                y: box.y + 3 + i * lineHeight + lineHeight / 2 + fontSize * 0.35,
              },
              esc(text),
            ),
          )
          .join(''),
      ),
    )
  }
  return {
    markup: tag('g', { 'data-edge-id': edge.id }, parts.join('')),
    bounds: unionRects(rects) as Rect,
  }
}
