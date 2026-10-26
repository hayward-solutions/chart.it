import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { EditorApi } from './api'
import { LEFT_PANEL, RIGHT_PANEL } from './layout'
import { PanelShell } from './PanelShell'
import { Properties } from './Properties'
import { ShapeLibrary } from './ShapeLibrary'
import { Toolbar, type SaveStatus } from './Toolbar'
import { usePersistedState } from './usePersistedState'

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

type EditorLayoutProps = {
  api: EditorApi
  children: ReactNode
  backSlot?: ReactNode
  saveStatus?: SaveStatus
  actions?: ReactNode
  className?: string
}

export function EditorLayout({
  api,
  children,
  backSlot,
  saveStatus,
  actions,
  className,
}: EditorLayoutProps) {
  const [leftCollapsed, setLeftCollapsed] = usePersistedState(
    'chartit.layout.leftCollapsed',
    false,
    isBoolean,
  )
  const [rightCollapsed, setRightCollapsed] = usePersistedState(
    'chartit.layout.rightCollapsed',
    false,
    isBoolean,
  )
  const [leftWidth, setLeftWidth] = usePersistedState(
    'chartit.layout.leftWidth',
    LEFT_PANEL.default,
    isNumber,
  )
  const [rightWidth, setRightWidth] = usePersistedState(
    'chartit.layout.rightWidth',
    RIGHT_PANEL.default,
    isNumber,
  )

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-background text-foreground', className)}>
      <Toolbar api={api} backSlot={backSlot} saveStatus={saveStatus} actions={actions} />
      <div className="flex min-h-0 flex-1">
        <PanelShell
          side="left"
          title="Shapes"
          collapsed={leftCollapsed}
          onCollapsedChange={setLeftCollapsed}
          width={leftWidth}
          minWidth={LEFT_PANEL.min}
          maxWidth={LEFT_PANEL.max}
          onWidthChange={setLeftWidth}
        >
          <ShapeLibrary api={api} />
        </PanelShell>
        <main className="relative min-w-0 flex-1 overflow-hidden">{children}</main>
        <PanelShell
          side="right"
          title="Properties"
          collapsed={rightCollapsed}
          onCollapsedChange={setRightCollapsed}
          width={rightWidth}
          minWidth={RIGHT_PANEL.min}
          maxWidth={RIGHT_PANEL.max}
          onWidthChange={setRightWidth}
        >
          <Properties api={api} />
        </PanelShell>
      </div>
    </div>
  )
}
