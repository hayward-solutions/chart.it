import type { DragEvent, KeyboardEvent, ReactNode } from 'react'
import { Tooltip } from '@/components/ui'
import { cn } from '@/lib/cn'

type LibraryTileProps = {
  label: string
  title?: string
  onActivate: () => void
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void
  children: ReactNode
  className?: string
}

export function LibraryTile({
  label,
  title,
  onActivate,
  onDragStart,
  children,
  className,
}: LibraryTileProps) {
  const name = title ?? label
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onActivate()
    }
  }
  return (
    <Tooltip content={name} side="right">
      <div
        role="button"
        tabIndex={0}
        aria-label={name}
        draggable={onDragStart !== undefined}
        onDragStart={onDragStart}
        onClick={onActivate}
        onKeyDown={onKeyDown}
        className={cn(
          'flex w-14 cursor-pointer flex-col items-center gap-0.5 rounded-lg px-0 py-1 outline-none select-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring active:bg-accent-soft',
          onDragStart && 'active:cursor-grabbing',
          className,
        )}
      >
        <div data-drag-preview className="flex size-10 items-center justify-center text-foreground">
          {children}
        </div>
        <span className="line-clamp-2 min-h-[2lh] w-full text-center text-[10.5px] leading-[1.15] break-words text-muted-foreground">
          {label}
        </span>
      </div>
    </Tooltip>
  )
}

export function TileGrid({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid grid-cols-[repeat(auto-fill,56px)] justify-center gap-x-1 gap-y-1"
    >
      {children}
    </div>
  )
}
