function parseHex(value: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (!match) {
    return null
  }
  let hex = match[1] as string
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('')
  }
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ]
}

export function luminance(value: string): number | null {
  const rgb = parseHex(value)
  if (!rgb) {
    return null
  }
  const [r, g, b] = rgb
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

export const INK_DARK = '#1f2937'
export const INK_LIGHT = '#f3f4f6'

export function isDarkColor(value: string): boolean {
  const l = luminance(value)
  return l !== null && l < 0.5
}

export function readableOn(fill: string | undefined, fallback: string): string {
  if (!fill || fill === 'none' || fill === 'transparent') {
    return fallback
  }
  const l = luminance(fill)
  if (l === null) {
    return fallback
  }
  return l < 0.5 ? INK_LIGHT : INK_DARK
}

export function canvasInk(background: string): string {
  return isDarkColor(background) ? INK_LIGHT : INK_DARK
}
