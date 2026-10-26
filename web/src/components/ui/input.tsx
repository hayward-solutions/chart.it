import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'h-9 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground shadow-xs outline-none transition-shadow placeholder:text-muted-foreground hover:border-muted-foreground/50 focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
