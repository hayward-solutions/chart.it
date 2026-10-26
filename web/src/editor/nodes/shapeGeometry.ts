import type { ShapeKind } from '@/model'

export type ShapeGeometry = { d: string; detail?: string }

function n(value: number): string {
  return String(Math.round(value * 100) / 100)
}

const CLOUD: readonly (readonly number[])[] = [
  [18.67, 6.59, 15.64, 4, 12, 4],
  [9.11, 4, 6.6, 5.64, 5.35, 8.04],
  [2.34, 8.36, 0, 10.91, 0, 14],
  [0, 17.31, 2.69, 20, 6, 20],
]

const CLOUD_TAIL: readonly (readonly number[])[] = [
  [21.76, 20, 24, 17.76, 24, 15],
  [24, 12.36, 21.95, 10.22, 19.35, 10.04],
]

export function shapeGeometry(
  kind: ShapeKind,
  width: number,
  height: number,
  inset: number,
  radius?: number,
): ShapeGeometry {
  const x0 = inset
  const y0 = inset
  const x1 = Math.max(x0 + 1, width - inset)
  const y1 = Math.max(y0 + 1, height - inset)
  const w = x1 - x0
  const h = y1 - y0
  const cx = x0 + w / 2
  const cy = y0 + h / 2
  switch (kind) {
    case 'rect':
      return { d: `M${n(x0)} ${n(y0)}H${n(x1)}V${n(y1)}H${n(x0)}Z` }
    case 'roundedRect': {
      const r = Math.min(radius ?? 12, w / 2, h / 2)
      return {
        d: `M${n(x0 + r)} ${n(y0)}H${n(x1 - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x1)} ${n(y0 + r)}V${n(y1 - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x1 - r)} ${n(y1)}H${n(x0 + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x0)} ${n(y1 - r)}V${n(y0 + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x0 + r)} ${n(y0)}Z`,
      }
    }
    case 'ellipse':
      return {
        d: `M${n(x0)} ${n(cy)}A${n(w / 2)} ${n(h / 2)} 0 1 0 ${n(x1)} ${n(cy)}A${n(w / 2)} ${n(h / 2)} 0 1 0 ${n(x0)} ${n(cy)}Z`,
      }
    case 'diamond':
      return { d: `M${n(cx)} ${n(y0)}L${n(x1)} ${n(cy)}L${n(cx)} ${n(y1)}L${n(x0)} ${n(cy)}Z` }
    case 'cylinder': {
      const ry = Math.min(h * 0.14, 22)
      const rx = w / 2
      return {
        d: `M${n(x0)} ${n(y0 + ry)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x1)} ${n(y0 + ry)}V${n(y1 - ry)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x0)} ${n(y1 - ry)}Z`,
        detail: `M${n(x0)} ${n(y0 + ry)}A${n(rx)} ${n(ry)} 0 0 0 ${n(x1)} ${n(y0 + ry)}`,
      }
    }
    case 'hexagon': {
      const s = w * 0.25
      return {
        d: `M${n(x0 + s)} ${n(y0)}H${n(x1 - s)}L${n(x1)} ${n(cy)}L${n(x1 - s)} ${n(y1)}H${n(x0 + s)}L${n(x0)} ${n(cy)}Z`,
      }
    }
    case 'parallelogram': {
      const s = w * 0.2
      return { d: `M${n(x0 + s)} ${n(y0)}H${n(x1)}L${n(x1 - s)} ${n(y1)}H${n(x0)}Z` }
    }
    case 'cloud': {
      const px = (x: number) => n(x0 + (x / 24) * w)
      const py = (y: number) => n(y0 + ((y - 4) / 16) * h)
      const curve = (c: readonly number[]) =>
        `C${px(c[0] as number)} ${py(c[1] as number)} ${px(c[2] as number)} ${py(c[3] as number)} ${px(c[4] as number)} ${py(c[5] as number)}`
      const parts = [`M${px(19.35)} ${py(10.04)}`]
      for (const c of CLOUD) {
        parts.push(curve(c))
      }
      parts.push(`L${px(19)} ${py(20)}`)
      for (const c of CLOUD_TAIL) {
        parts.push(curve(c))
      }
      parts.push('Z')
      return { d: parts.join('') }
    }
    case 'note': {
      const f = Math.min(w, h) * 0.22
      return {
        d: `M${n(x0)} ${n(y0)}H${n(x1 - f)}L${n(x1)} ${n(y0 + f)}V${n(y1)}H${n(x0)}Z`,
        detail: `M${n(x1 - f)} ${n(y0)}V${n(y0 + f)}H${n(x1)}`,
      }
    }
  }
}
