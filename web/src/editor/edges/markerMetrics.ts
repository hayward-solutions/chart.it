import type { MarkerKind } from '@/model'

export type MarkerBox = { x: number; y: number; width: number; height: number }

export type MarkerMetrics = {
  trim: number
  box: MarkerBox
  length: number
  height: number
}

const MIN_UNIT = 1.5

export function markerUnit(strokeWidth: number): number {
  return Math.max(strokeWidth, MIN_UNIT)
}

export function markerMetrics(kind: MarkerKind, strokeWidth: number): MarkerMetrics {
  const unit = markerUnit(strokeWidth)
  switch (kind) {
    case 'arrow': {
      const length = unit * 4.5
      const height = unit * 3.6
      return { trim: length, length, height, box: { x: 0, y: -height / 2, width: length, height } }
    }
    case 'diamond': {
      const length = unit * 5
      const height = unit * 3.6
      return { trim: length, length, height, box: { x: 0, y: -height / 2, width: length, height } }
    }
    case 'circle': {
      const length = unit * 3.4
      return {
        trim: length,
        length,
        height: length,
        box: { x: 0, y: -length / 2, width: length, height: length },
      }
    }
    case 'openArrow': {
      const arm = unit * 3.2
      const height = unit * 4
      const cap = strokeWidth / 2
      return {
        trim: cap,
        length: arm,
        height,
        box: { x: -arm, y: -height / 2 - cap, width: arm + cap, height: height + strokeWidth },
      }
    }
    case 'none':
      return { trim: 0, length: 0, height: 0, box: { x: 0, y: 0, width: 0, height: 0 } }
  }
}

export function markerTrim(kind: MarkerKind, strokeWidth: number): number {
  return markerMetrics(kind, strokeWidth).trim
}
