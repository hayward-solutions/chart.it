import { FilePlus2, LayoutTemplate, TriangleAlert } from 'lucide-react'
import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useCreateDocument, useTemplates, type Template } from '@/api'
import { Button, Dialog, DialogContent, EmptyState, Input, Skeleton } from '@/components/ui'
import { cn } from '@/lib/cn'

const PACK_LABELS: Record<string, string> = {
  aws: 'AWS',
  azure: 'Azure',
  gcp: 'GCP',
  k8s: 'Kubernetes',
  generic: 'Generic',
}

const BLANK: Template = {
  key: '',
  title: 'Blank',
  description: 'Start from an empty canvas.',
  pack: 'generic',
}

const PACK_TONES: Record<string, { badge: string; dot: string; tile: string }> = {
  aws: {
    badge: 'bg-[#ff9900]/15 text-[#8a4b00] dark:bg-[#ff9900]/20 dark:text-[#ffb84d]',
    dot: 'bg-[#ff9900]',
    tile: 'bg-[#ff9900]/15 text-[#a35a00] dark:text-[#ffb84d]',
  },
  azure: {
    badge: 'bg-[#0078d4]/12 text-[#00569c] dark:bg-[#0078d4]/25 dark:text-[#6cb8f5]',
    dot: 'bg-[#0078d4]',
    tile: 'bg-[#0078d4]/12 text-[#0067b8] dark:text-[#6cb8f5]',
  },
  gcp: {
    badge:
      'bg-linear-to-r from-[#4285f4]/15 via-[#34a853]/12 to-[#fbbc04]/18 text-[#1a56c4] dark:from-[#4285f4]/25 dark:via-[#34a853]/18 dark:to-[#fbbc04]/22 dark:text-[#9bbcf9]',
    dot: 'bg-linear-to-br from-[#4285f4] via-[#34a853] to-[#fbbc04]',
    tile: 'bg-linear-to-br from-[#4285f4]/15 via-[#34a853]/12 to-[#fbbc04]/18 text-[#1a56c4] dark:text-[#9bbcf9]',
  },
  k8s: {
    badge: 'bg-[#326ce5]/12 text-[#2250b8] dark:bg-[#326ce5]/25 dark:text-[#8fb0f5]',
    dot: 'bg-[#326ce5]',
    tile: 'bg-[#326ce5]/12 text-[#2a5bcc] dark:text-[#8fb0f5]',
  },
}

const NEUTRAL_TONE = {
  badge: 'bg-surface-muted text-muted-foreground',
  dot: 'bg-muted-foreground/60',
  tile: 'bg-accent-soft text-accent',
}

function packTone(pack: string) {
  return PACK_TONES[pack] ?? NEUTRAL_TONE
}

function packLabel(pack: string): string {
  return PACK_LABELS[pack] ?? pack
}

type TemplatePickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function PackBadge({ pack }: { pack: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        packTone(pack).badge,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', packTone(pack).dot)} />
      {packLabel(pack)}
    </span>
  )
}

export function TemplatePickerDialog({ open, onOpenChange }: TemplatePickerDialogProps) {
  const navigate = useNavigate()
  const templates = useTemplates()
  const create = useCreateDocument()
  const nameId = useId()
  const [title, setTitle] = useState('Untitled diagram')
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  const choose = (template: Template) => {
    const name = title.trim() || (template.key ? template.title : 'Untitled diagram')
    setPendingKey(template.key)
    create.mutate(
      { title: name, ...(template.key ? { templateKey: template.key } : {}) },
      {
        onSuccess: (doc) => {
          onOpenChange(false)
          void navigate(`/d/${doc.id}`)
        },
        onError: (error) => toast.error(`Could not create diagram: ${error.message}`),
        onSettled: () => setPendingKey(null),
      },
    )
  }

  const cards: Template[] = [BLANK, ...(templates.data ?? [])]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New diagram"
        description="Name your diagram, then pick a starting point."
        className="max-w-2xl"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className="text-sm font-medium">
            Name
          </label>
          <Input
            id={nameId}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 py-1">
          {templates.isError ? (
            <EmptyState
              icon={TriangleAlert}
              title="Could not load templates"
              description="You can still start with a blank diagram."
              action={
                <Button onClick={() => void templates.refetch()} size="sm">
                  Retry
                </Button>
              }
              className="mb-4 py-8"
            />
          ) : null}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {templates.isPending
              ? Array.from({ length: 3 }, (_, index) => (
                  <li key={`skeleton-${index}`} className="order-last">
                    <Skeleton className="h-32 w-full rounded-xl" />
                  </li>
                ))
              : null}
            {cards.map((template) => {
              const isBlank = template.key === ''
              const busy = pendingKey === template.key
              return (
                <li key={template.key || 'blank'}>
                  <button
                    type="button"
                    disabled={create.isPending}
                    onClick={() => choose(template)}
                    className={cn(
                      'group flex h-full w-full flex-col items-start gap-1.5 rounded-xl border border-border bg-surface p-4 text-left shadow-xs outline-none transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-px hover:border-border-strong hover:shadow-raised focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                      busy && 'border-accent',
                    )}
                  >
                    <span className="mb-1 flex w-full items-center justify-between gap-2">
                      <span
                        className={cn(
                          'flex size-9 items-center justify-center rounded-lg',
                          packTone(template.pack).tile,
                        )}
                      >
                        {isBlank ? (
                          <FilePlus2 className="size-4" />
                        ) : (
                          <LayoutTemplate className="size-4" />
                        )}
                      </span>
                      <PackBadge pack={template.pack} />
                    </span>
                    <span className="text-sm font-semibold tracking-tight">{template.title}</span>
                    <span className="text-xs leading-relaxed text-muted-foreground">
                      {template.description}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  )
}
