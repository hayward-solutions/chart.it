import { FolderOpen, Plus, Search, SearchX, TriangleAlert, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  useDeleteDocument,
  useDocuments,
  useDuplicateDocument,
  useRestoreDocument,
  type DocumentSummary,
} from '@/api'
import {
  Button,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui'
import { DiagramIllustration } from '@/components/illustrations'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { DocumentCard, type CardActions } from './dashboard/DocumentCard'
import { RenameDialog } from './dashboard/RenameDialog'
import { TagsDialog } from './dashboard/TagsDialog'
import { TemplatePickerDialog } from './dashboard/TemplatePickerDialog'

type SortKey = 'updated' | 'created' | 'title'
type View = 'active' | 'trash'

const ALL_TAGS = '__all__'

function sortDocuments(docs: DocumentSummary[], sort: SortKey): DocumentSummary[] {
  const copy = [...docs]
  if (sort === 'title') {
    return copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
  }
  const key = sort === 'created' ? 'createdAt' : 'updatedAt'
  return copy.sort((a, b) => b[key].localeCompare(a[key]))
}

function CardGridSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading diagrams"
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-xl border border-border bg-surface shadow-card"
        >
          <Skeleton className="aspect-[16/10] w-full rounded-none" />
          <div className="space-y-2 px-3.5 py-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
            <div className="flex gap-1 pt-1">
              <Skeleton className="h-4 w-10 rounded-md" />
              <Skeleton className="h-4 w-12 rounded-md" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const [view, setView] = useState<View>('active')
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState(ALL_TAGS)
  const [sort, setSort] = useState<SortKey>('updated')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [renaming, setRenaming] = useState<DocumentSummary | null>(null)
  const [tagging, setTagging] = useState<DocumentSummary | null>(null)

  const trashed = view === 'trash'
  const q = useDebouncedValue(search.trim(), 250)
  const tagFilter = tag === ALL_TAGS ? undefined : tag

  const docs = useDocuments(
    { q: q || undefined, tag: tagFilter, trashed },
    { refetchOnMount: 'always' },
  )
  const everything = useDocuments({ trashed }, { refetchOnMount: 'always' })

  const trash = useDeleteDocument()
  const restore = useRestoreDocument()
  const duplicate = useDuplicateDocument()

  const availableTags = useMemo(() => {
    const set = new Set<string>()
    for (const doc of everything.data ?? []) {
      for (const t of doc.tags) set.add(t)
    }
    if (tagFilter) set.add(tagFilter)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [everything.data, tagFilter])

  const sorted = useMemo(() => sortDocuments(docs.data ?? [], sort), [docs.data, sort])
  const filtering = Boolean(q) || Boolean(tagFilter)

  const restoreDoc = (doc: DocumentSummary) =>
    restore.mutate(doc.id, {
      onSuccess: () => toast.success(`Restored "${doc.title}"`),
      onError: (error) => toast.error(`Could not restore: ${error.message}`),
    })

  const actions: CardActions = {
    onRename: setRenaming,
    onEditTags: setTagging,
    onDuplicate: (doc) =>
      duplicate.mutate(doc.id, {
        onSuccess: (copy) => toast.success(`Created "${copy.title}"`),
        onError: (error) => toast.error(`Could not duplicate: ${error.message}`),
      }),
    onTrash: (doc) =>
      trash.mutate(doc.id, {
        onSuccess: () =>
          toast(`Moved "${doc.title}" to trash`, {
            action: { label: 'Undo', onClick: () => restoreDoc(doc) },
          }),
        onError: (error) => toast.error(`Could not delete: ${error.message}`),
      }),
    onRestore: restoreDoc,
  }

  let content
  if (docs.isPending) {
    content = <CardGridSkeleton />
  } else if (docs.isError) {
    content = (
      <EmptyState
        icon={TriangleAlert}
        title="Could not load diagrams"
        description={docs.error.message}
        action={<Button onClick={() => void docs.refetch()}>Try again</Button>}
      />
    )
  } else if (sorted.length === 0) {
    if (filtering) {
      content = (
        <EmptyState
          icon={SearchX}
          title="No matching diagrams"
          description="Try a different search or clear the tag filter."
          action={
            <Button
              onClick={() => {
                setSearch('')
                setTag(ALL_TAGS)
              }}
            >
              Clear filters
            </Button>
          }
        />
      )
    } else if (trashed) {
      content = (
        <EmptyState
          icon={Trash2}
          title="Trash is empty"
          description="Diagrams you move to the trash show up here so you can restore them."
        />
      )
    } else {
      content = (
        <EmptyState
          icon={FolderOpen}
          illustration={<DiagramIllustration className="w-52" />}
          title="No diagrams yet"
          description="Create your first diagram from a blank canvas or a starter template."
          action={
            <Button variant="primary" onClick={() => setPickerOpen(true)}>
              <Plus /> New diagram
            </Button>
          }
        />
      )
    }
  } else {
    content = (
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.map((doc) => (
          <li key={doc.id} className="min-w-0">
            <DocumentCard doc={doc} trashed={trashed} actions={actions} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-7 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Diagrams</h1>
        <Button variant="primary" onClick={() => setPickerOpen(true)}>
          <Plus /> New diagram
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search diagrams"
            placeholder="Search diagrams"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={tag} onValueChange={setTag}>
          <SelectTrigger aria-label="Filter by tag" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TAGS}>All tags</SelectItem>
            {availableTags.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
          <SelectTrigger aria-label="Sort diagrams" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated">Last updated</SelectItem>
            <SelectItem value="created">Date created</SelectItem>
            <SelectItem value="title">Title</SelectItem>
          </SelectContent>
        </Select>
        <Tabs
          value={view}
          onValueChange={(value) => {
            setView(value as View)
            setTag(ALL_TAGS)
          }}
          className="ml-auto"
        >
          <TabsList aria-label="View">
            <TabsTrigger value="active">Diagrams</TabsTrigger>
            <TabsTrigger value="trash">
              <Trash2 className="size-3.5" /> Trash
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {content}

      <TemplatePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />
      <RenameDialog doc={renaming} onClose={() => setRenaming(null)} />
      <TagsDialog doc={tagging} onClose={() => setTagging(null)} />
    </div>
  )
}
