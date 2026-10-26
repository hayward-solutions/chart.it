import { EdgeLabelRenderer, useReactFlow } from '@xyflow/react'
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { EdgeStyle, Point } from '@/model'
import { OVERLAY_LAYER, SELECTED_LIFT } from './layers'
import { pointAtT, projectOnPolyline } from './geometry'
import { useEdgeEditing } from './useEdgeEditing'
import { useEdgeZIndex } from './useEdgeZIndex'

const DRAG_THRESHOLD = 3
const CENTER_SNAP = 0.02

type LabelInputProps = {
  initial: string
  onCommit: (value: string) => void
  onCancel: () => void
}

function LabelInput({ initial, onCommit, onCancel }: LabelInputProps) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  const finished = useRef(false)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const finish = (commit: boolean) => {
    if (finished.current) {
      return
    }
    finished.current = true
    if (commit) {
      onCommit(value)
    } else {
      onCancel()
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.key === 'Enter') {
      event.preventDefault()
      finish(true)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      finish(false)
    }
  }

  return (
    <input
      ref={ref}
      className="chartit-edge-label-input"
      aria-label="Edge label"
      value={value}
      size={Math.max(4, value.length + 1)}
      onChange={(event) => {
        setValue(event.target.value)
      }}
      onBlur={() => {
        finish(true)
      }}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        event.stopPropagation()
      }}
      onDoubleClick={(event) => {
        event.stopPropagation()
      }}
    />
  )
}

export type EdgeLabelProps = {
  id: string
  text: string | undefined
  style: EdgeStyle
  position: number
  points: readonly Point[]
  selected: boolean
  editing: boolean
  onEditingChange: (editing: boolean) => void
}

export function EdgeLabel({
  id,
  text,
  style,
  position,
  points,
  selected,
  editing,
  onEditingChange,
}: EdgeLabelProps) {
  const { update, select, readOnly } = useEdgeEditing()
  const { screenToFlowPosition } = useReactFlow()
  const zIndex = useEdgeZIndex(id)
  const [draft, setDraft] = useState<number | null>(null)
  const dragRef = useRef<{
    moved: boolean
    originX: number
    originY: number
    latest: number | null
  } | null>(null)

  const hasText = text !== undefined && text !== ''
  if (!hasText && !editing) {
    return null
  }

  const point = pointAtT(points, draft ?? position)

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || editing) {
      return
    }
    event.stopPropagation()
    if (readOnly) {
      return
    }
    select(id, event.shiftKey || event.metaKey || event.ctrlKey)
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      moved: false,
      originX: event.clientX,
      originY: event.clientY,
      latest: null,
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) {
      return
    }
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY) < DRAG_THRESHOLD
    ) {
      return
    }
    drag.moved = true
    const flow = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const projected = projectOnPolyline(points, flow)
    const snapped = Math.abs(projected.t - 0.5) < CENTER_SNAP ? 0.5 : projected.t
    const next = Math.round(snapped * 10000) / 10000
    drag.latest = next
    setDraft(next)
  }

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) {
      return
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (drag.moved && drag.latest !== null && event.type === 'pointerup') {
      update(id, { data: { labelPosition: drag.latest } })
    }
    setDraft(null)
  }

  const commit = (value: string) => {
    onEditingChange(false)
    const next = value.trim() === '' ? undefined : value
    if (next !== text) {
      update(id, { data: { label: next } })
    }
  }

  return (
    <EdgeLabelRenderer>
      <div
        className="chartit-edge-label nodrag nopan"
        data-testid="edge-label"
        role="presentation"
        data-selected={selected}
        data-dragging={draft !== null}
        style={{
          transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)`,
          color: style.fontColor ?? 'var(--chartit-ink)',
          fontSize: style.fontSize ?? 12,
          background: style.labelBackground ?? 'var(--chartit-bg)',
          zIndex: OVERLAY_LAYER + zIndex + (selected ? SELECTED_LIFT : 0),
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDoubleClick={(event) => {
          event.stopPropagation()
          if (!readOnly) {
            onEditingChange(true)
          }
        }}
      >
        {editing ? (
          <LabelInput
            initial={text ?? ''}
            onCommit={commit}
            onCancel={() => {
              onEditingChange(false)
            }}
          />
        ) : (
          text
        )}
      </div>
    </EdgeLabelRenderer>
  )
}
