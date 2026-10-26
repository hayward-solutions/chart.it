import { Lock } from 'lucide-react'
import { cn } from '@/lib/cn'

type RingProps = { selected: boolean; radius?: number; inset?: string }

export function SelectionRing({ selected, radius = 3, inset = '-inset-0.5' }: RingProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute transition-shadow duration-100',
        inset,
        selected
          ? 'shadow-[0_0_0_1.5px_var(--accent)]'
          : 'shadow-[0_0_0_0_transparent] group-hover/node:group-data-[readonly=false]/canvas:shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_50%,transparent)]',
      )}
      style={{ borderRadius: radius }}
    />
  )
}

export function LockBadge({
  locked,
  selected,
}: {
  locked: boolean | undefined
  selected: boolean
}) {
  if (!locked || !selected) {
    return null
  }
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -right-2 -top-2 flex size-4 items-center justify-center rounded-full border border-border-strong bg-surface text-muted-foreground shadow-card"
    >
      <Lock className="size-2.5" />
    </div>
  )
}
