import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'
import { useDraft } from './useDraft'

export const compactInputClass =
  'h-7 w-full min-w-0 rounded-md border border-border-strong bg-surface px-2 text-xs text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:opacity-50'

type DraftInputProps = Omit<ComponentProps<'input'>, 'value' | 'onChange'> & {
  value: string
  onCommit: (value: string) => void
  live?: boolean
  validate?: (value: string) => boolean
}

export function DraftInput({
  value,
  onCommit,
  live = false,
  validate,
  className,
  onBlur,
  onKeyDown,
  ...props
}: DraftInputProps) {
  const [draft, setDraft] = useDraft(value)
  const valid = !validate || validate(draft)

  const commit = () => {
    if (draft === value) {
      return
    }
    if (valid) {
      onCommit(draft)
    } else {
      setDraft(value)
    }
  }

  return (
    <input
      type="text"
      value={draft}
      aria-invalid={valid ? undefined : true}
      className={cn(compactInputClass, !valid && 'border-danger', className)}
      onChange={(event) => {
        setDraft(event.target.value)
        if (live) {
          onCommit(event.target.value)
        }
      }}
      onBlur={(event) => {
        if (!live) {
          commit()
        }
        onBlur?.(event)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !live) {
          commit()
        }
        if (event.key === 'Escape') {
          setDraft(value)
        }
        onKeyDown?.(event)
      }}
      {...props}
    />
  )
}
