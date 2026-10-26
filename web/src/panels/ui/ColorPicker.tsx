import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui'
import { cn } from '@/lib/cn'
import { THEME_COLOURS, isColour, sameColour, toPickerHex } from './colors'
import { DraftInput } from './DraftInput'

const CHECKER =
  'bg-[conic-gradient(#d4d4d8_25%,#fff_0_50%,#d4d4d8_0_75%,#fff_0)] bg-[length:8px_8px]'

type SwatchProps = { value: string | undefined; className?: string }

export function Swatch({ value, className }: SwatchProps) {
  const transparent = !value || value === 'transparent'
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block size-4 shrink-0 rounded-[4px] border border-black/15 dark:border-white/25',
        transparent && CHECKER,
        className,
      )}
      style={transparent ? undefined : { backgroundColor: value }}
    />
  )
}

type ColorPickerProps = {
  value: string | undefined
  onChange: (value: string) => void
  ariaLabel: string
  fallback?: string
  allowTransparent?: boolean
  disabled?: boolean
}

export function ColorPicker({
  value,
  onChange,
  ariaLabel,
  fallback,
  allowTransparent = true,
  disabled,
}: ColorPickerProps) {
  const shown = value ?? fallback
  const swatches = allowTransparent
    ? THEME_COLOURS
    : THEME_COLOURS.filter((colour) => colour.value !== 'transparent')

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel}
            disabled={disabled}
            className="flex h-7 w-8 shrink-0 items-center justify-center rounded-md border border-border-strong bg-surface outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <Swatch value={shown} className="size-[18px]" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 p-3">
          <div role="group" aria-label={`${ariaLabel} swatches`} className="grid grid-cols-8 gap-1">
            {swatches.map((colour) => (
              <button
                key={colour.value}
                type="button"
                title={colour.name}
                aria-label={colour.name}
                aria-pressed={sameColour(shown, colour.value)}
                onClick={() => onChange(colour.value)}
                className={cn(
                  'rounded-md p-0.5 outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring',
                  sameColour(shown, colour.value) && 'ring-2 ring-accent',
                )}
              >
                <Swatch value={colour.value} className="size-5" />
              </button>
            ))}
          </div>
          <label className="mt-2.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            Custom
            <input
              type="color"
              aria-label={`${ariaLabel} custom colour`}
              value={toPickerHex(shown)}
              onChange={(event) => onChange(event.target.value)}
              className="h-7 w-24 cursor-pointer rounded-md border border-border-strong bg-surface p-0.5"
            />
          </label>
        </PopoverContent>
      </Popover>
      <DraftInput
        aria-label={`${ariaLabel} hex`}
        value={shown ?? ''}
        disabled={disabled}
        validate={(next) => isColour(next.trim())}
        onCommit={(next) => onChange(next.trim())}
        className="font-mono uppercase"
        spellCheck={false}
      />
    </div>
  )
}
