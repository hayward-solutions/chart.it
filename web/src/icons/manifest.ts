export type PackId = 'aws' | 'azure' | 'gcp' | 'k8s' | 'generic'
export type IconKind = 'service' | 'resource' | 'group' | 'shape'

export type ManifestPack = {
  id: PackId
  title: string
  licence: string
  version?: string
}

export type ManifestIcon = {
  pack: string
  id: string
  category: string
  title: string
  terms: string[]
  file: string
  format: 'svg' | 'png'
  kind: IconKind
  colour?: string
}

export type Manifest = {
  generatedAt: string
  packs: ManifestPack[]
  icons: ManifestIcon[]
}

export type IconRefLike = { pack: string; id: string }

export const MANIFEST_URL = '/icons/manifest.json'

let manifestPromise: Promise<Manifest> | null = null

export function loadManifest(): Promise<Manifest> {
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`icon manifest request failed with status ${response.status}`)
        }
        return response.json() as Promise<Manifest>
      })
      .catch((error: unknown) => {
        manifestPromise = null
        throw error
      })
  }
  return manifestPromise
}

export function resetManifestCache(): void {
  manifestPromise = null
}

export function iconUrl(icon: Pick<ManifestIcon, 'file'>): string {
  return `/icons/${icon.file}`
}

export function iconKey(icon: IconRefLike): string {
  return `${icon.pack}/${icon.id}`
}

export type IconLookup = ReadonlyMap<string, ManifestIcon>

const lookups = new WeakMap<Manifest, IconLookup>()

export function createIconLookup(manifest: Manifest): IconLookup {
  const cached = lookups.get(manifest)
  if (cached) {
    return cached
  }
  const lookup = new Map(manifest.icons.map((icon) => [iconKey(icon), icon]))
  lookups.set(manifest, lookup)
  return lookup
}

export function findIcon(
  manifest: Manifest | undefined,
  ref: IconRefLike,
): ManifestIcon | undefined {
  if (!manifest) {
    return undefined
  }
  const lookup = createIconLookup(manifest)
  return lookup.get(iconKey(ref)) ?? lookup.get(`${ref.pack}/group-${ref.id}`)
}

export function humanizeCategory(category: string): string {
  return category
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function groupByCategory(
  icons: readonly ManifestIcon[],
): { category: string; icons: ManifestIcon[] }[] {
  const groups = new Map<string, ManifestIcon[]>()
  for (const icon of icons) {
    const list = groups.get(icon.category)
    if (list) {
      list.push(icon)
    } else {
      groups.set(icon.category, [icon])
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, list]) => ({
      category,
      icons: [...list].sort((a, b) => a.title.localeCompare(b.title)),
    }))
}

const VENDOR_PREFIX = /^(?:Amazon|AWS|Azure|Microsoft|Google Cloud|Google|Cloud)\s+(?=\S)/i

export function shortTitle(title: string): string {
  return title.replace(VENDOR_PREFIX, '')
}
