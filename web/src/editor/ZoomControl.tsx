import { useStore as useFlowStore } from '@xyflow/react'
import { Maximize, Minus, Plus } from 'lucide-react'
import { IconButton } from '@/components/ui'
import { useEditorActions } from './api'

export function ZoomControl() {
  const actions = useEditorActions()
  const percent = useFlowStore((state) => Math.round((state.transform[2] ?? 1) * 100))
  return (
    <div
      role="group"
      aria-label="Zoom"
      className="flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5 shadow-raised"
    >
      <IconButton size="iconSm" label="Zoom out" className="rounded-full" onClick={actions.zoomOut}>
        <Minus />
      </IconButton>
      <button
        type="button"
        aria-label="Zoom to 100%"
        title="Zoom to 100%"
        onClick={() => {
          actions.zoomTo(1)
        }}
        className="h-8 min-w-12 rounded-full px-2 text-xs font-medium tabular-nums text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        {percent}%
      </button>
      <IconButton size="iconSm" label="Zoom in" className="rounded-full" onClick={actions.zoomIn}>
        <Plus />
      </IconButton>
      <IconButton
        size="iconSm"
        label="Fit to screen"
        className="rounded-full"
        onClick={actions.fitView}
      >
        <Maximize />
      </IconButton>
    </div>
  )
}
