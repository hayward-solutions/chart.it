export type ThemeColour = { name: string; value: string }

export const THEME_COLOURS: readonly ThemeColour[] = [
  { name: 'AWS orange', value: '#ED7100' },
  { name: 'AWS purple', value: '#8C4FFF' },
  { name: 'AWS green', value: '#7AA116' },
  { name: 'AWS teal', value: '#00A4A6' },
  { name: 'AWS pink', value: '#E7157B' },
  { name: 'AWS red', value: '#DD344C' },
  { name: 'Azure blue', value: '#0078D4' },
  { name: 'GCP blue', value: '#4285F4' },
  { name: 'Kubernetes blue', value: '#326CE5' },
  { name: 'Slate', value: '#374151' },
  { name: 'Grey', value: '#6B7280' },
  { name: 'Light grey', value: '#9CA3AF' },
  { name: 'Pale grey', value: '#E5E7EB' },
  { name: 'Black', value: '#000000' },
  { name: 'White', value: '#FFFFFF' },
  { name: 'Transparent', value: 'transparent' },
]

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

export function isColour(value: string): boolean {
  return value === 'transparent' || HEX.test(value)
}

export function toPickerHex(value: string | undefined): string {
  if (!value || !HEX.test(value)) {
    return value === 'transparent' || !value ? '#ffffff' : '#000000'
  }
  if (value.length === 4 || value.length === 5) {
    const [r, g, b] = [value[1], value[2], value[3]]
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return value.slice(0, 7).toLowerCase()
}

export function sameColour(a: string | undefined, b: string): boolean {
  return a !== undefined && a.toLowerCase() === b.toLowerCase()
}
