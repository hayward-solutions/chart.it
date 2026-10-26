import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'

type ConflictBannerProps = {
  onReload: () => void
  onOverwrite: () => void
  busy?: boolean
  className?: string
}

export function ConflictBanner({ onReload, onOverwrite, busy, className }: ConflictBannerProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex max-w-2xl flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-sm shadow-raised',
        className,
      )}
    >
      <TriangleAlert className="size-5 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-56">
        <p className="font-semibold text-foreground">This diagram was changed elsewhere</p>
        <p className="mt-0.5 text-xs text-foreground/75">
          Reload to load the latest version and drop your unsaved edits, or overwrite it with what
          you have here.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={onReload}>
          Reload
        </Button>
        <Button size="sm" variant="danger" disabled={busy} onClick={onOverwrite}>
          Overwrite
        </Button>
      </div>
    </div>
  )
}
