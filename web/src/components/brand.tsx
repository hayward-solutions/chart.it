import { cn } from '@/lib/cn'

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-7 shrink-0', className)}>
      <rect width="32" height="32" rx="8" className="fill-accent" />
      <rect x="6" y="7" width="8" height="6" rx="1.5" className="fill-accent-foreground" />
      <rect x="18" y="19" width="8" height="6" rx="1.5" className="fill-accent-foreground" />
      <path
        d="M14 10h4v12"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-accent-foreground"
      />
    </svg>
  )
}

export function Brand({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-base font-semibold tracking-tight',
        className,
      )}
    >
      <BrandMark />
      Chart.it
    </span>
  )
}
