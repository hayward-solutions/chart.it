import { ChevronDown, ChevronRight, Search, Type, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Button, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui'
import {
  findIcon,
  groupByCategory,
  humanizeCategory,
  searchIcons,
  useIconIndex,
  useManifest,
  useRecentIcons,
  type Manifest,
  type ManifestIcon,
} from '@/icons'
import { cn } from '@/lib/cn'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { CONTAINER_KINDS, SHAPES, type ContainerKindSpec } from '@/model'
import type { EditorApi } from './api'
import { ContainerPreview } from './ContainerPreview'
import { beginDrag, CONTAINER_MIME, SHAPE_MIME, TEXT_MIME, toIconPayload } from './drag'
import { IconGrid } from './IconGrid'
import { LibraryTile, TileGrid } from './LibraryTile'
import { packLongName, packShortName } from './packs'
import { usePersistedState } from './usePersistedState'
import { ShapePreview } from './ui/ShapePreview'

const PACK_TABS = ['aws', 'azure', 'gcp', 'k8s', 'generic'] as const
const SHAPES_TAB = 'shapes'
const SMALL_PACK = 60

const isStringRecord = (value: unknown): value is Record<string, boolean> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'

type ShapeLibraryProps = { api: EditorApi; className?: string }

export function ShapeLibrary({ api, className }: ShapeLibraryProps) {
  const manifestQuery = useManifest()
  const manifest = manifestQuery.data
  const index = useIconIndex(manifest)
  const { recent, push } = useRecentIcons()
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 150)
  const [tab, setTab] = usePersistedState<string>('chartit.library.tab', 'aws', isString)
  const [recentOpen, setRecentOpen] = usePersistedState<boolean>(
    'chartit.library.recentOpen',
    true,
    isBoolean,
  )

  const trimmed = debounced.trim()
  const results = useMemo(
    () => (index && trimmed ? searchIcons(index, trimmed, { limit: 200 }) : []),
    [index, trimmed],
  )
  const recentIcons = useMemo(
    () =>
      recent.flatMap((item) => {
        const icon = findIcon(manifest, item)
        return icon ? [icon] : []
      }),
    [recent, manifest],
  )

  const pickIcon = (icon: ManifestIcon) => {
    const payload = toIconPayload(icon)
    push(payload)
    api.addIcon(payload)
  }
  const dragIcon = (icon: ManifestIcon) => push(toIconPayload(icon))

  const packs = PACK_TABS.filter((id) => manifest?.packs.some((pack) => pack.id === id) ?? true)

  return (
    <aside
      aria-label="Shape library"
      className={cn('flex h-full min-h-0 w-full flex-col bg-surface text-foreground', className)}
    >
      <div className="border-b border-border p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            aria-label="Search shapes"
            placeholder="Search all icons"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setQuery('')
              }
            }}
            className="h-8 w-full rounded-md border border-border-strong bg-background pr-7 pl-7 text-[13px] text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/25"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {manifestQuery.isPending ? (
          <LibrarySkeleton />
        ) : manifestQuery.isError || !manifest ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center text-xs text-muted-foreground">
            <p>Could not load the icon library.</p>
            <Button size="sm" onClick={() => void manifestQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : trimmed ? (
          <SearchResults
            query={trimmed}
            results={results}
            onPick={pickIcon}
            onDragIcon={dragIcon}
          />
        ) : (
          <>
            {recentIcons.length > 0 ? (
              <CollapsibleHeading
                title="Recent"
                count={recentIcons.length}
                open={recentOpen}
                onToggle={() => setRecentOpen(!recentOpen)}
              >
                <div className="px-2 pb-2">
                  <IconGrid
                    icons={recentIcons.slice(0, 12)}
                    onPick={pickIcon}
                    onDragIcon={dragIcon}
                    label="Recent icons"
                    showPack
                  />
                </div>
              </CollapsibleHeading>
            ) : null}
            <Tabs value={tab} onValueChange={setTab}>
              <div className="sticky top-0 z-10 border-b border-border bg-surface px-2.5 py-2">
                <TabsList className="h-8 w-full gap-0.5">
                  {packs.map((id) => (
                    <TabsTrigger
                      key={id}
                      value={id}
                      title={packLongName(id)}
                      className="h-7 flex-1 px-1 text-[11px]"
                    >
                      {packShortName(id)}
                    </TabsTrigger>
                  ))}
                  <TabsTrigger value={SHAPES_TAB} className="h-7 flex-1 px-1 text-[11px]">
                    Shapes
                  </TabsTrigger>
                </TabsList>
              </div>
              {packs.map((id) => (
                <TabsContent key={id} value={id}>
                  <PackPanel
                    pack={id}
                    manifest={manifest}
                    onPick={pickIcon}
                    onDragIcon={dragIcon}
                  />
                </TabsContent>
              ))}
              <TabsContent value={SHAPES_TAB}>
                <ShapesPanel api={api} manifest={manifest} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </aside>
  )
}

function LibrarySkeleton() {
  return (
    <div role="status" aria-label="Loading icons" className="space-y-3 p-3">
      <Skeleton className="h-7 w-full" />
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}

type SearchResultsProps = {
  query: string
  results: ManifestIcon[]
  onPick: (icon: ManifestIcon) => void
  onDragIcon: (icon: ManifestIcon) => void
}

function SearchResults({ query, results, onPick, onDragIcon }: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <p className="p-6 text-center text-xs text-muted-foreground">
        No icons match &ldquo;{query}&rdquo;
      </p>
    )
  }
  return (
    <div className="p-2">
      <p className="px-1 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {results.length} {results.length === 1 ? 'result' : 'results'}
      </p>
      <IconGrid
        icons={results}
        onPick={onPick}
        onDragIcon={onDragIcon}
        label="Search results"
        showPack
      />
    </div>
  )
}

type CollapsibleHeadingProps = {
  title: string
  count?: number
  open: boolean
  onToggle: () => void
  children: ReactNode
  id?: string
}

function CollapsibleHeading({
  title,
  count,
  open,
  onToggle,
  children,
  id,
}: CollapsibleHeadingProps) {
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <div className="border-b border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="flex h-8 w-full items-center gap-1 px-2.5 text-left outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <Chevron className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {title}
        </span>
        {count !== undefined ? (
          <span className="rounded-full bg-surface-muted px-1.5 text-[10.5px] leading-4 font-medium text-muted-foreground tabular-nums">
            {count}
          </span>
        ) : null}
      </button>
      {open ? <div id={id}>{children}</div> : null}
    </div>
  )
}

type PackPanelProps = {
  pack: string
  manifest: Manifest
  onPick: (icon: ManifestIcon) => void
  onDragIcon: (icon: ManifestIcon) => void
}

function PackPanel({ pack, manifest, onPick, onDragIcon }: PackPanelProps) {
  const [openMap, setOpenMap] = usePersistedState<Record<string, boolean>>(
    'chartit.library.categories',
    {},
    isStringRecord,
  )
  const categories = useMemo(
    () => groupByCategory(manifest.icons.filter((icon) => icon.pack === pack)),
    [manifest, pack],
  )
  const total = categories.reduce((sum, group) => sum + group.icons.length, 0)

  if (categories.length === 0) {
    return <p className="p-6 text-center text-xs text-muted-foreground">No icons in this pack</p>
  }

  return (
    <div>
      {categories.map((group, position) => {
        const key = `${pack}/${group.category}`
        const open = openMap[key] ?? (total <= SMALL_PACK || position === 0)
        return (
          <CollapsibleHeading
            key={key}
            id={`library-${pack}-${group.category}`}
            title={humanizeCategory(group.category)}
            count={group.icons.length}
            open={open}
            onToggle={() => setOpenMap((previous) => ({ ...previous, [key]: !open }))}
          >
            <div className="px-2 pb-2">
              <IconGrid
                icons={group.icons}
                onPick={onPick}
                onDragIcon={onDragIcon}
                label={humanizeCategory(group.category)}
              />
            </div>
          </CollapsibleHeading>
        )
      })}
    </div>
  )
}

function groupContainers(): { prefix: string; specs: ContainerKindSpec[] }[] {
  const groups = new Map<string, ContainerKindSpec[]>()
  for (const spec of Object.values(CONTAINER_KINDS)) {
    const prefix = spec.kind.split('.')[0] ?? 'generic'
    const list = groups.get(prefix)
    if (list) {
      list.push(spec)
    } else {
      groups.set(prefix, [spec])
    }
  }
  return [...groups.entries()].map(([prefix, specs]) => ({ prefix, specs }))
}

const CONTAINER_GROUPS = groupContainers()

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="px-1 pt-2 pb-1 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
      {children}
    </h3>
  )
}

function ShapesPanel({ api, manifest }: { api: EditorApi; manifest: Manifest | undefined }) {
  return (
    <div className="space-y-1 p-2">
      <SubHeading>Basic shapes</SubHeading>
      <TileGrid label="Basic shapes">
        {SHAPES.map((shape) => (
          <LibraryTile
            key={shape.kind}
            label={shape.label}
            onActivate={() => api.addShape(shape.kind)}
            onDragStart={(event) => beginDrag(event, SHAPE_MIME, { shape: shape.kind })}
          >
            <ShapePreview kind={shape.kind} />
          </LibraryTile>
        ))}
      </TileGrid>
      <SubHeading>Text</SubHeading>
      <TileGrid label="Text">
        <LibraryTile
          label="Text"
          onActivate={() => api.addText()}
          onDragStart={(event) => beginDrag(event, TEXT_MIME, {})}
        >
          <Type className="size-6" />
        </LibraryTile>
      </TileGrid>
      {CONTAINER_GROUPS.map((group) => (
        <div key={group.prefix}>
          <SubHeading>{`${packLongName(group.prefix)} containers`}</SubHeading>
          <TileGrid label={`${packLongName(group.prefix)} containers`}>
            {group.specs.map((spec) => (
              <LibraryTile
                key={spec.kind}
                label={spec.label}
                title={`${spec.label} container`}
                onActivate={() => api.addContainer(spec.kind)}
                onDragStart={(event) =>
                  beginDrag(event, CONTAINER_MIME, { containerKind: spec.kind })
                }
              >
                <ContainerPreview spec={spec} manifest={manifest} />
              </LibraryTile>
            ))}
          </TileGrid>
        </div>
      ))}
    </div>
  )
}
