import type { EdgeData, MarkerKind } from '@/model'
import { dashArray, dashCap, edgeStrokeWidth } from '../style'
import { markerTrim } from './markerMetrics'

export const DEFAULT_EDGE_COLOR = 'var(--chartit-edge)'
export const SELECTED_EDGE_COLOR = 'var(--accent)'

export type EdgeVisuals = {
  width: number
  color: string
  markerStart: MarkerKind
  markerEnd: MarkerKind
  startTrim: number
  endTrim: number
  dash: string | undefined
  cap: 'round' | 'butt'
  opacity: number | undefined
}

export function resolveVisuals(data: EdgeData | undefined, selected: boolean): EdgeVisuals {
  const style = data?.style ?? {}
  const width = edgeStrokeWidth(style)
  const markerStart = data?.markerStart ?? 'none'
  const markerEnd = data?.markerEnd ?? 'none'
  return {
    width,
    color: selected ? SELECTED_EDGE_COLOR : (style.stroke ?? DEFAULT_EDGE_COLOR),
    markerStart,
    markerEnd,
    startTrim: markerTrim(markerStart, width),
    endTrim: markerTrim(markerEnd, width),
    dash: dashArray(style.strokeStyle, width),
    cap: dashCap(style.strokeStyle),
    opacity: style.opacity,
  }
}
