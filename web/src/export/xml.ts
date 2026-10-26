const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function isXmlSafe(code: number): boolean {
  return code === 9 || code === 10 || code === 13 || code >= 32
}

export function esc(value: string): string {
  let clean = ''
  for (const char of value) {
    if (isXmlSafe(char.codePointAt(0) ?? 0)) {
      clean += char
    }
  }
  return clean.replace(/[&<>"']/g, (char) => ESCAPES[char] as string)
}

export function num(value: number): string {
  return String(Math.round(value * 100) / 100)
}

export type AttrValue = string | number | undefined | null | false

export function attrs(values: Record<string, AttrValue>): string {
  let out = ''
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === false || value === '') {
      continue
    }
    out += ` ${key}="${typeof value === 'number' ? num(value) : esc(value)}"`
  }
  return out
}

export function tag(name: string, values: Record<string, AttrValue>, children?: string): string {
  const open = `<${name}${attrs(values)}`
  return children === undefined ? `${open}/>` : `${open}>${children}</${name}>`
}
