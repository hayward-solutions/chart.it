import { cva, type VariantProps } from 'class-variance-authority'
import { Toggle as TogglePrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

const toggleVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent-soft data-[state=on]:text-accent [&_svg]:size-4',
  {
    variants: {
      size: { sm: 'h-8 min-w-8 px-2', md: 'h-9 min-w-9 px-2.5' },
    },
    defaultVariants: { size: 'md' },
  },
)

export function Toggle({
  className,
  size,
  ...props
}: ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return <TogglePrimitive.Root className={cn(toggleVariants({ size }), className)} {...props} />
}
