import type { CSSProperties } from 'react'
import type { EdgeStyle, NodeStyle, StrokeStyle } from '@/model'

export function dashArray(style: StrokeStyle | undefined, width: number): string | undefined {
  if (style === 'dashed') {
    return `${Math.max(6, width * 4)} ${Math.max(4, width * 3)}`
  }
  if (style === 'dotted') {
    return `0.1 ${Math.max(4, width * 2.5)}`
  }
  return undefined
}

export function dashCap(style: StrokeStyle | undefined): 'round' | 'butt' {
  return style === 'dotted' ? 'round' : 'butt'
}

export function textStyle(
  style: NodeStyle,
  defaults: { fontSize: number; color: string },
): CSSProperties {
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize ?? defaults.fontSize,
    fontWeight: style.fontWeight,
    color: style.fontColor ?? defaults.color,
    textAlign: style.textAlign,
  }
}

export function edgeStrokeWidth(style: EdgeStyle): number {
  return style.strokeWidth ?? 2
}
