import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type SectionProps = {
  title: string
  children: ReactNode
  action?: ReactNode
  className?: string
}

export function Section({ title, children, action, className }: SectionProps) {
  return (
    <section aria-label={title} className={cn('border-b border-border px-3.5 py-3.5', className)}>
      <div className="mb-2.5 flex min-h-5 items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {title}
        </h3>
        {action}
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

type FieldProps = {
  label: string
  children: ReactNode
  className?: string
}

export function Field({ label, children, className }: FieldProps) {
  return (
    <div className={cn('grid grid-cols-[72px_minmax(0,1fr)] items-center gap-x-2', className)}>
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">{children}</div>
    </div>
  )
}
