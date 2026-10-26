import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { IconButton } from '@/components/ui'
import { cn } from '@/lib/cn'

type PanelShellProps = {
  side: 'left' | 'right'
  title: string
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  width: number
  minWidth: number
  maxWidth: number
  onWidthChange: (width: number) => void
  children: ReactNode
}

const KEY_STEP = 16

export function PanelShell({
  side,
  title,
  collapsed,
  onCollapsedChange,
  width,
  minWidth,
  maxWidth,
  onWidthChange,
  children,
}: PanelShellProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)
  const left = side === 'left'
  const clamp = (value: number) => Math.min(maxWidth, Math.max(minWidth, Math.round(value)))
  const CollapseIcon = left ? PanelLeftClose : PanelRightClose
  const ExpandIcon = left ? PanelLeftOpen : PanelRightOpen

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { startX: event.clientX, startWidth: width }
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) {
      return
    }
    const delta = event.clientX - drag.current.startX
    onWidthChange(clamp(drag.current.startWidth + (left ? delta : -delta)))
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const grow = left ? 'ArrowRight' : 'ArrowLeft'
    const shrink = left ? 'ArrowLeft' : 'ArrowRight'
    if (event.key === grow) {
      event.preventDefault()
      onWidthChange(clamp(width + KEY_STEP))
    } else if (event.key === shrink) {
      event.preventDefault()
      onWidthChange(clamp(width - KEY_STEP))
    }
  }

  if (collapsed) {
    return (
      <div
        className={cn(
          'flex w-9 shrink-0 flex-col items-center gap-2 bg-surface py-1.5',
          left ? 'border-r border-border' : 'border-l border-border',
        )}
      >
        <IconButton
          label={`Show ${title.toLowerCase()}`}
          size="iconSm"
          className="size-7"
          onClick={() => onCollapsedChange(false)}
        >
          <ExpandIcon />
        </IconButton>
        <span className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase [writing-mode:vertical-rl]">
          {title}
        </span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative flex min-h-0 shrink-0 flex-col bg-surface',
        left ? 'border-r border-border' : 'border-l border-border',
      )}
      style={{ width }}
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border pr-1.5 pl-3">
        <h2 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {title}
        </h2>
        <IconButton
          label={`Hide ${title.toLowerCase()}`}
          size="iconSm"
          className="size-7"
          onClick={() => onCollapsedChange(true)}
        >
          <CollapseIcon className="size-4" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
      <div
        role="slider"
        aria-orientation="vertical"
        aria-label={`Resize ${title.toLowerCase()}`}
        aria-valuenow={width}
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        className={cn(
          'group/resize absolute inset-y-0 z-10 w-2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:bg-accent after:opacity-0 after:transition-opacity before:absolute before:top-1/2 before:left-1/2 before:z-10 before:h-9 before:w-1 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:bg-border-strong before:opacity-0 before:transition-opacity hover:after:opacity-70 hover:before:opacity-100 focus-visible:after:opacity-100 focus-visible:before:opacity-100',
          left ? '-right-1' : '-left-1',
        )}
      />
    </div>
  )
}
