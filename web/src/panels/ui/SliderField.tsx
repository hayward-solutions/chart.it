import { Slider } from '@/components/ui'

type SliderFieldProps = {
  value: number
  onChange: (value: number) => void
  ariaLabel: string
  min?: number
  max?: number
  step?: number
  format?: (value: number) => string
}

export function SliderField({
  value,
  onChange,
  ariaLabel,
  min = 0,
  max = 100,
  step = 1,
  format = (current) => `${current}%`,
}: SliderFieldProps) {
  return (
    <>
      <Slider
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => {
          if (next !== undefined) {
            onChange(next)
          }
        }}
      />
      <span className="w-9 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
        {format(value)}
      </span>
    </>
  )
}
