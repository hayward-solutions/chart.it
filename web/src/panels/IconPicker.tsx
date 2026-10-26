import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  findIcon,
  searchIcons,
  useIconIndex,
  useManifest,
  useRecentIcons,
  type ManifestIcon,
} from '@/icons'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { cn } from '@/lib/cn'
import { IconGrid } from './IconGrid'
import { toIconPayload } from './drag'
import { packShortName } from './packs'

type IconPickerProps = {
  onPick: (icon: ManifestIcon) => void
  className?: string
}

export function IconPicker({ onPick, className }: IconPickerProps) {
  const manifestQuery = useManifest()
  const manifest = manifestQuery.data
  const index = useIconIndex(manifest)
  const { recent, push } = useRecentIcons()
  const [query, setQuery] = useState('')
  const [pack, setPack] = useState<string | undefined>(undefined)
  const debounced = useDebouncedValue(query, 150)

  const results = useMemo(
    () => (index ? searchIcons(index, debounced, { pack, limit: 120 }) : []),
    [index, debounced, pack],
  )
  const recentIcons = useMemo(
    () =>
      recent.flatMap((item) => {
        const icon = findIcon(manifest, item)
        return icon ? [icon] : []
      }),
    [recent, manifest],
  )

  const searching = debounced.trim() !== '' || pack !== undefined
  const shown = searching ? results : recentIcons

  const pick = (icon: ManifestIcon) => {
    push(toIconPayload(icon))
    onPick(icon)
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          aria-label="Search icons"
          placeholder="Search icons"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-7 w-full rounded-md border border-border-strong bg-surface pr-2 pl-7 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </div>
      <div role="group" aria-label="Icon pack" className="flex flex-wrap gap-1">
        {[{ id: undefined, title: 'All' }, ...(manifest?.packs ?? [])].map((item) => (
          <button
            key={item.id ?? 'all'}
            type="button"
            aria-pressed={pack === item.id}
            onClick={() => setPack(item.id)}
            className={cn(
              'h-6 rounded-full border border-border px-2 text-[11px] text-muted-foreground outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring',
              pack === item.id && 'border-accent bg-accent-soft text-accent',
            )}
          >
            {item.id === undefined ? 'All' : packShortName(item.id)}
          </button>
        ))}
      </div>
      <div className="max-h-72 min-h-24 overflow-y-auto">
        {manifestQuery.isPending ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Loading icons</p>
        ) : manifestQuery.isError ? (
          <p className="py-6 text-center text-xs text-danger">Could not load the icon library</p>
        ) : shown.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {searching ? 'No icons match' : 'Type to search the icon library'}
          </p>
        ) : (
          <>
            {!searching ? (
              <p className="px-1 pb-1 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Recent
              </p>
            ) : null}
            <IconGrid icons={shown} onPick={pick} draggable={false} label="Icon results" showPack />
          </>
        )}
      </div>
    </div>
  )
}
