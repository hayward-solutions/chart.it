import { History, RotateCcw, Save } from 'lucide-react'
import { useId, useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { useMe, useVersion, useVersions, type VersionSummary } from '@/api'
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  EmptyState,
  Input,
  Sheet,
  SheetContent,
  Skeleton,
} from '@/components/ui'
import { EditorCanvas, EditorStoreContext } from '@/editor'
import { cn } from '@/lib/cn'
import { formatRelative } from '@/lib/time'

type VersionHistoryProps = {
  documentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onRestore: (version: number) => Promise<void>
  onRequestSave: () => void
}

function authorName(summary: VersionSummary, me: { id: string; name: string } | undefined) {
  if (!summary.createdBy) {
    return 'Unknown'
  }
  return me && summary.createdBy === me.id ? 'You' : 'Another user'
}

function VersionPreview({
  documentId,
  version,
  onClose,
  onRestore,
}: {
  documentId: string
  version: number | null
  onClose: () => void
  onRestore: (version: number) => Promise<void>
}) {
  const detail = useVersion(documentId, version ?? undefined)
  const [restoring, setRestoring] = useState(false)
  const fitted = useMemo(
    () => (detail.data ? { ...detail.data.content, viewport: { x: 0, y: 0, zoom: 1 } } : undefined),
    [detail.data],
  )

  const restore = async () => {
    if (version === null) {
      return
    }
    setRestoring(true)
    try {
      await onRestore(version)
      onClose()
    } catch (error) {
      toast.error(`Could not restore: ${error instanceof Error ? error.message : 'unknown error'}`)
    } finally {
      setRestoring(false)
    }
  }

  let body
  if (detail.isPending) {
    body = <Skeleton className="h-full w-full" />
  } else if (detail.isError) {
    body = (
      <EmptyState
        icon={History}
        title="Could not load this version"
        description={detail.error.message}
      />
    )
  } else {
    body = (
      <EditorStoreContext value={null}>
        <EditorCanvas key={detail.data.version} document={fitted} readOnly />
      </EditorStoreContext>
    )
  }

  return (
    <Dialog open={version !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        title={version === null ? 'Version preview' : `Version ${version}`}
        description="Read-only preview of this saved version."
        hideDescription
        className="h-[80vh] max-w-5xl"
      >
        <div
          data-testid="version-preview"
          className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border [&_.react-flow\_\_minimap]:hidden [&_.react-flow\_\_panel]:hidden"
        >
          {body}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Close</Button>
          </DialogClose>
          <Button
            variant="primary"
            disabled={restoring || !detail.isSuccess}
            onClick={() => void restore()}
          >
            <RotateCcw /> Restore this version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function VersionHistory({
  documentId,
  open,
  onOpenChange,
  onRestore,
  onRequestSave,
}: VersionHistoryProps) {
  const versions = useVersions(open ? documentId : undefined)
  const me = useMe()
  const [selected, setSelected] = useState<number | null>(null)

  let list
  if (versions.isPending) {
    list = (
      <div role="status" aria-label="Loading versions" className="space-y-2 p-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    )
  } else if (versions.isError) {
    list = (
      <div className="p-4">
        <EmptyState
          icon={History}
          title="Could not load versions"
          description={versions.error.message}
          action={<Button onClick={() => void versions.refetch()}>Try again</Button>}
        />
      </div>
    )
  } else if (versions.data.length === 0) {
    list = (
      <div className="p-4">
        <EmptyState
          icon={History}
          title="No saved versions yet"
          description="Snapshots are taken automatically while you work. Save a named version to mark an important moment."
        />
      </div>
    )
  } else {
    list = (
      <ul aria-label="Versions" className="divide-y divide-border">
        {versions.data.map((entry) => (
          <li key={entry.version}>
            <button
              type="button"
              onClick={() => setSelected(entry.version)}
              className={cn(
                'flex w-full flex-col gap-0.5 px-4 py-3 text-left outline-none hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {entry.label ?? `Version ${entry.version}`}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">v{entry.version}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {formatRelative(entry.createdAt)} by {authorName(entry, me.data)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          title="Version history"
          description="Browse earlier snapshots of this diagram."
          headerActions={
            <Button size="sm" variant="secondary" onClick={onRequestSave}>
              <Save /> Save named version
            </Button>
          }
        >
          <div className="min-h-0 flex-1 overflow-y-auto">{list}</div>
        </SheetContent>
      </Sheet>
      <VersionPreview
        documentId={documentId}
        version={selected}
        onClose={() => setSelected(null)}
        onRestore={async (version) => {
          await onRestore(version)
          onOpenChange(false)
        }}
      />
    </>
  )
}

type SaveVersionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (label: string) => Promise<boolean>
}

export function SaveVersionDialog({ open, onOpenChange, onSave }: SaveVersionDialogProps) {
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const inputId = useId()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = label.trim()
    if (!trimmed) {
      return
    }
    setSaving(true)
    const ok = await onSave(trimmed)
    setSaving(false)
    if (ok) {
      setLabel('')
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Save named version"
        description="Name this moment so you can find and restore it later."
        className="max-w-md"
      >
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor={inputId} className="block text-sm font-medium">
              Version name
            </label>
            <Input
              id={inputId}
              value={label}
              maxLength={100}
              placeholder="Before the migration"
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="primary" disabled={saving || !label.trim()}>
              Save version
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
