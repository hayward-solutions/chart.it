import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type EmptyStateProps = {
  icon?: ComponentType<{ className?: string }>
  illustration?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon: Icon,
  illustration,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface/50 px-6 py-16 text-center',
        className,
      )}
    >
      {illustration ? <div aria-hidden="true">{illustration}</div> : null}
      {Icon && !illustration ? (
        <div className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent ring-1 ring-inset ring-accent/15">
          <Icon className="size-6" />
        </div>
      ) : null}
      <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      {description ? (
        <p className="max-w-sm text-sm text-pretty text-muted-foreground">{description}</p>
      ) : null}
      {action}
    </div>
  )
}
