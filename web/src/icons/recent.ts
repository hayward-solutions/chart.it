import { useCallback, useSyncExternalStore } from 'react'

export type RecentIcon = { pack: string; id: string; title: string; kind: string }

export const RECENT_ICONS_KEY = 'chartit.recentIcons'
export const MAX_RECENT_ICONS = 24

const listeners = new Set<() => void>()
const EMPTY: readonly RecentIcon[] = []

let cachedRaw: string | null = null
let cachedValue: readonly RecentIcon[] = EMPTY

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(RECENT_ICONS_KEY)
  } catch {
    return null
  }
}

function isRecentIcon(value: unknown): value is RecentIcon {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.pack === 'string' &&
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.kind === 'string'
  )
}

function getSnapshot(): readonly RecentIcon[] {
  const raw = readRaw()
  if (raw === cachedRaw) {
    return cachedValue
  }
  cachedRaw = raw
  if (!raw) {
    cachedValue = EMPTY
    return cachedValue
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    cachedValue = Array.isArray(parsed)
      ? parsed.filter(isRecentIcon).slice(0, MAX_RECENT_ICONS)
      : EMPTY
  } catch {
    cachedValue = EMPTY
  }
  return cachedValue
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

export function pushRecentIcon(icon: RecentIcon): void {
  const entry: RecentIcon = {
    pack: icon.pack,
    id: icon.id,
    title: icon.title,
    kind: icon.kind,
  }
  const next = [
    entry,
    ...getSnapshot().filter((item) => item.pack !== entry.pack || item.id !== entry.id),
  ].slice(0, MAX_RECENT_ICONS)
  try {
    window.localStorage.setItem(RECENT_ICONS_KEY, JSON.stringify(next))
  } catch {
    return
  }
  listeners.forEach((listener) => listener())
}

export function clearRecentIcons(): void {
  try {
    window.localStorage.removeItem(RECENT_ICONS_KEY)
  } catch {
    return
  }
  listeners.forEach((listener) => listener())
}

export function useRecentIcons(): {
  recent: readonly RecentIcon[]
  push: (icon: RecentIcon) => void
  clear: () => void
} {
  const recent = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY)
  const push = useCallback((icon: RecentIcon) => pushRecentIcon(icon), [])
  const clear = useCallback(() => clearRecentIcons(), [])
  return { recent, push, clear }
}
