import type { ReactNode } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui'
import { cn } from '@/lib/cn'

export type CompactOption<T extends string> = { value: T; label: ReactNode }

type CompactSelectProps<T extends string> = {
  value: T | undefined
  onChange: (value: T) => void
  options: readonly CompactOption<T>[]
  ariaLabel: string
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function CompactSelect<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder,
  className,
  disabled,
}: CompactSelectProps<T>) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)} disabled={disabled}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn('h-7 min-w-0 rounded-md px-2 text-xs', className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="py-1 text-xs">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
