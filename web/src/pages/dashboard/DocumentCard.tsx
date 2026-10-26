import { Copy, ExternalLink, MoreHorizontal, Pencil, RotateCcw, Tags, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { thumbnailUrl, type DocumentSummary } from '@/api'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from '@/components/ui'
import { DiagramIllustration } from '@/components/illustrations'
import { formatRelative } from '@/lib/time'

export type CardActions = {
  onRename: (doc: DocumentSummary) => void
  onEditTags: (doc: DocumentSummary) => void
  onDuplicate: (doc: DocumentSummary) => void
  onTrash: (doc: DocumentSummary) => void
  onRestore: (doc: DocumentSummary) => void
}

type DocumentCardProps = {
  doc: DocumentSummary
  trashed: boolean
  actions: CardActions
}

export function DocumentCard({ doc, trashed, actions }: DocumentCardProps) {
  const navigate = useNavigate()
  const thumbnail = doc.hasThumbnail ? (
    <img
      src={thumbnailUrl(doc.id, doc.updatedAt)}
      alt=""
      loading="lazy"
      className="size-full object-cover object-top"
    />
  ) : (
    <div
      data-testid="thumbnail-placeholder"
      className="flex size-full items-center justify-center bg-[radial-gradient(circle,var(--border-strong)_1px,transparent_1.2px)] bg-[length:14px_14px]"
    >
      <DiagramIllustration className="w-[46%] min-w-24 max-w-44 opacity-90 transition-transform duration-200 group-hover:scale-[1.03]" />
    </div>
  )

  return (
    <article
      aria-label={doc.title}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-raised focus-within:border-accent focus-within:ring-2 focus-within:ring-ring/60"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-border bg-surface-muted">
        {thumbnail}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-foreground/5"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2 px-3.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {trashed ? (
              <h3 className="truncate text-sm font-semibold tracking-tight">{doc.title}</h3>
            ) : (
              <h3 className="truncate text-sm font-semibold tracking-tight">
                <Link
                  to={`/d/${doc.id}`}
                  className="outline-none after:absolute after:inset-0 after:content-['']"
                >
                  {doc.title}
                </Link>
              </h3>
            )}
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {trashed ? 'Trashed' : 'Updated'} {formatRelative(doc.updatedAt)}
            </p>
          </div>
          {trashed ? (
            <Button
              size="sm"
              variant="secondary"
              className="relative z-10"
              onClick={() => actions.onRestore(doc)}
            >
              <RotateCcw /> Restore
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  label={`Actions for ${doc.title}`}
                  tooltip={false}
                  size="iconSm"
                  className="relative z-10 -mr-1 -mt-1"
                >
                  <MoreHorizontal />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => void navigate(`/d/${doc.id}`)}>
                  <ExternalLink /> Open
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.onRename(doc)}>
                  <Pencil /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.onEditTags(doc)}>
                  <Tags /> Edit tags
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.onDuplicate(doc)}>
                  <Copy /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => actions.onTrash(doc)}>
                  <Trash2 /> Move to trash
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {doc.tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1" aria-label="Tags">
            {doc.tags.map((tag) => (
              <li
                key={tag}
                className="rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-[11px] leading-4 font-medium text-foreground/80"
              >
                {tag}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  )
}
