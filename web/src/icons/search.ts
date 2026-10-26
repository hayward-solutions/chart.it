import Fuse from 'fuse.js'
import type { IconKind, Manifest, ManifestIcon } from './manifest'

export type IconIndex = {
  fuse: Fuse<ManifestIcon>
  icons: readonly ManifestIcon[]
}

export type IconSearchOptions = {
  pack?: string
  kind?: IconKind
  limit?: number
}

export const DEFAULT_SEARCH_LIMIT = 200

export function createIconIndex(manifest: Manifest): IconIndex {
  const fuse = new Fuse(manifest.icons, {
    keys: [
      { name: 'title', weight: 0.5 },
      { name: 'terms', weight: 0.25 },
      { name: 'id', weight: 0.1 },
      { name: 'category', weight: 0.1 },
      { name: 'pack', weight: 0.05 },
    ],
    threshold: 0.32,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeScore: true,
  })
  return { fuse, icons: manifest.icons }
}

export function searchIcons(
  index: IconIndex,
  query: string,
  options: IconSearchOptions = {},
): ManifestIcon[] {
  const { pack, kind, limit = DEFAULT_SEARCH_LIMIT } = options
  const accepts = (icon: ManifestIcon) =>
    (!pack || icon.pack === pack) && (!kind || icon.kind === kind)
  const trimmed = query.trim()
  if (!trimmed) {
    return index.icons.filter(accepts).slice(0, limit)
  }
  const results: ManifestIcon[] = []
  for (const { item } of index.fuse.search(trimmed)) {
    if (accepts(item)) {
      results.push(item)
      if (results.length >= limit) {
        break
      }
    }
  }
  return results
}
