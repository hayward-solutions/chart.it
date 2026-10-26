import { cn } from '@/lib/cn'

type IllustrationProps = { className?: string }

export function DiagramIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 160 100"
      fill="none"
      aria-hidden="true"
      className={cn('h-auto w-40', className)}
    >
      <path
        d="M52 30h20q6 0 6 6v8q0 6 6 6h18"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="stroke-border-strong"
      />
      <path
        d="M52 74h20q6 0 6-6v-6q0-6 6-6"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="stroke-border-strong"
      />
      <rect
        x="12"
        y="20"
        width="40"
        height="20"
        rx="5"
        strokeWidth="1.5"
        className="fill-surface stroke-border-strong"
      />
      <rect
        x="12"
        y="64"
        width="40"
        height="20"
        rx="5"
        strokeWidth="1.5"
        className="fill-surface stroke-border-strong"
      />
      <rect
        x="96"
        y="38"
        width="52"
        height="24"
        rx="6"
        strokeWidth="1.5"
        className="fill-accent-soft stroke-accent"
      />
      <rect x="20" y="28" width="16" height="4" rx="2" className="fill-border-strong" />
      <rect x="20" y="72" width="22" height="4" rx="2" className="fill-border-strong" />
      <rect x="106" y="47" width="30" height="5" rx="2.5" className="fill-accent/60" />
      <circle cx="96" cy="50" r="3" className="fill-accent" />
    </svg>
  )
}
