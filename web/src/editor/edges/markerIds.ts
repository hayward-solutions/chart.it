import type { MarkerKind } from '@/model'

export type MarkerEnd = 'start' | 'end'

export const MARKER_KINDS: readonly Exclude<MarkerKind, 'none'>[] = [
  'arrow',
  'openArrow',
  'diamond',
  'circle',
]

function sanitize(scope: string): string {
  return scope.replace(/[^A-Za-z0-9_-]/g, '_')
}

export function markerId(
  kind: Exclude<MarkerKind, 'none'>,
  end: MarkerEnd,
  scope?: string,
): string {
  const base = `chartit-marker-${kind}-${end}`
  return scope === undefined ? base : `${base}-${sanitize(scope)}`
}

export function markerUrl(kind: MarkerKind, end: MarkerEnd, scope?: string): string | undefined {
  return kind === 'none' ? undefined : `url(#${markerId(kind, end, scope)})`
}
