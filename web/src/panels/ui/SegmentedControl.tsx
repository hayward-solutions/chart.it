import type { ReactNode } from 'react'
import { Tooltip } from '@/components/ui'
import { cn } from '@/lib/cn'

export type SegmentOption<T extends string> = { value: T; label: string; content: ReactNode }

type SegmentedControlProps<T extends string> = {
  value: T | undefined
  onChange: (value: T) => void
  options: readonly SegmentOption<T>[]
  ariaLabel: string
  className?: string
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex h-7 rounded-md bg-surface-muted p-0.5 ring-1 ring-inset ring-border',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <Tooltip key={option.value} content={option.label}>
            <button
              type="button"
              aria-label={option.label}
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex min-w-7 flex-1 items-center justify-center rounded-[5px] px-1.5 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5',
                active && 'bg-surface-raised text-foreground shadow-card ring-1 ring-border',
              )}
            >
              {option.content}
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
