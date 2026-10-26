import { useSyncExternalStore } from 'react'
import type { IconRef } from '@/model'

type ManifestEntry = { pack: string; id: string; file: string }

let files: ReadonlyMap<string, string> | null = null
let pending: Promise<void> | null = null
const listeners = new Set<() => void>()

function publish(next: ReadonlyMap<string, string>) {
  files = next
  for (const listener of listeners) {
    listener()
  }
}

export function setIconFiles(entries: readonly ManifestEntry[]) {
  publish(new Map(entries.map((entry) => [`${entry.pack}/${entry.id}`, entry.file])))
}

export function resetIconFiles() {
  files = null
  pending = null
}

export function loadIconFiles(): Promise<void> {
  if (files) {
    return Promise.resolve()
  }
  if (!pending) {
    pending = fetch('/icons/manifest.json')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('manifest'))))
      .then((manifest: { icons?: ManifestEntry[] }) => {
        setIconFiles(manifest.icons ?? [])
      })
      .catch(() => {
        pending = null
      })
  }
  return pending
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!files) {
    void loadIconFiles()
  }
  return () => {
    listeners.delete(listener)
  }
}

function snapshot() {
  return files
}

export function useIconUrl(icon: IconRef | undefined): string | undefined {
  const map = useSyncExternalStore(subscribe, snapshot, snapshot)
  if (!icon || !map) {
    return undefined
  }
  const file = map.get(`${icon.pack}/${icon.id}`)
  return file ? `/icons/${file}` : undefined
}
