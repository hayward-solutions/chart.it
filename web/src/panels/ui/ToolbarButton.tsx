import type { ComponentProps, ReactNode } from 'react'
import { Button, Tooltip } from '@/components/ui'
import { cn } from '@/lib/cn'

export function ShortcutHint({ keys }: { keys: string }) {
  return (
    <kbd className="ml-1.5 rounded bg-background/20 px-1 font-sans text-[10px] font-medium opacity-90">
      {keys}
    </kbd>
  )
}

type ToolbarButtonProps = Omit<ComponentProps<typeof Button>, 'aria-label' | 'size' | 'variant'> & {
  label: string
  shortcut?: string
  pressed?: boolean
  children: ReactNode
}

export function ToolbarButton({
  label,
  shortcut,
  pressed,
  className,
  children,
  ...props
}: ToolbarButtonProps) {
  return (
    <Tooltip
      content={
        <>
          {label}
          {shortcut ? <ShortcutHint keys={shortcut} /> : null}
        </>
      }
    >
      <Button
        variant="ghost"
        size="iconSm"
        aria-label={label}
        aria-pressed={pressed}
        className={cn(
          'size-8 rounded-md text-foreground [&_svg]:size-4',
          pressed &&
            'bg-accent-soft text-accent ring-1 ring-inset ring-accent/25 hover:bg-accent-soft',
          className,
        )}
        {...props}
      >
        {children}
      </Button>
    </Tooltip>
  )
}

export function ToolbarDivider() {
  return <span aria-hidden="true" className="mx-1.5 h-5 w-px shrink-0 bg-border-strong/70" />
}
