import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useDraft } from './useDraft'

type NumberFieldProps = {
  value: number
  onChange: (value: number) => void
  ariaLabel: string
  min?: number
  max?: number
  step?: number
  suffix?: string
  className?: string
  disabled?: boolean
}

function clamp(value: number, min?: number, max?: number): number {
  let result = value
  if (min !== undefined) {
    result = Math.max(min, result)
  }
  if (max !== undefined) {
    result = Math.min(max, result)
  }
  return Math.round(result * 1000) / 1000
}

export function NumberField({
  value,
  onChange,
  ariaLabel,
  min,
  max,
  step = 1,
  suffix,
  className,
  disabled,
}: NumberFieldProps) {
  const [draft, setDraft] = useDraft(String(value))

  const apply = (next: number) => {
    const clamped = clamp(next, min, max)
    setDraft(String(clamped))
    if (clamped !== value) {
      onChange(clamped)
    }
  }

  const commitDraft = () => {
    const parsed = Number(draft)
    if (draft.trim() === '' || Number.isNaN(parsed)) {
      setDraft(String(value))
      return
    }
    apply(parsed)
  }

  const buttonClass =
    'flex h-full w-6 shrink-0 items-center justify-center bg-surface-muted/60 text-muted-foreground outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:bg-surface-muted disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3'

  return (
    <div
      className={cn(
        'flex h-7 min-w-0 items-stretch overflow-hidden rounded-md border border-border-strong bg-surface transition-shadow focus-within:border-accent focus-within:ring-[3px] focus-within:ring-ring/25',
        className,
      )}
    >
      <button
        type="button"
        aria-label={`Decrease ${ariaLabel}`}
        tabIndex={-1}
        disabled={disabled || (min !== undefined && value <= min)}
        className={buttonClass}
        onClick={() => apply(value - step)}
      >
        <Minus />
      </button>
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={draft}
        disabled={disabled}
        className="min-w-0 flex-1 bg-transparent text-center text-xs text-foreground tabular-nums outline-none"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commitDraft()
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            apply(value + step)
          } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            apply(value - step)
          } else if (event.key === 'Escape') {
            setDraft(String(value))
          }
        }}
      />
      {suffix ? (
        <span className="flex items-center pr-1 text-[11px] text-muted-foreground">{suffix}</span>
      ) : null}
      <button
        type="button"
        aria-label={`Increase ${ariaLabel}`}
        tabIndex={-1}
        disabled={disabled || (max !== undefined && value >= max)}
        className={buttonClass}
        onClick={() => apply(value + step)}
      >
        <Plus />
      </button>
    </div>
  )
}
