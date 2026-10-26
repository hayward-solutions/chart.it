import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { cn } from '@/lib/cn'
import { getContainerKind } from '@/model'
import type { EditorFlowNode } from '../adapters'
import { readableOn } from '../color'
import { useEditorStore } from '../context'
import { useIconUrl } from '../iconFiles'
import { dashArray, dashCap, textStyle } from '../style'
import { LockBadge, SelectionRing } from './Chrome'
import { NodeHandles } from './Handles'
import { InlineLabel } from './InlineLabel'
import { NodeResizeFrame } from './Resizer'

const BADGE_SIZE = 32

function ContainerNodeImpl({
  id,
  data,
  selected,
  width,
  height,
  draggable,
}: NodeProps<EditorFlowNode>) {
  const style = data.style
  const spec = getContainerKind(data.containerKind)
  const w = width ?? 0
  const h = height ?? 0
  const strokeWidth = style.strokeWidth ?? 2
  const half = strokeWidth / 2
  const colour = style.stroke ?? spec.colour
  const fillValue = style.fill ?? spec.fill
  const hasFill = fillValue !== undefined && fillValue !== 'none' && fillValue !== 'transparent'
  const strokeStyle = style.strokeStyle ?? spec.border
  const dash = dashArray(strokeStyle, strokeWidth)
  const radius = style.radius ?? 4
  const badgeUrl = useIconUrl(data.icon ?? spec.badge ?? undefined)
  const isDropTarget = useEditorStore((state) => state.dropTargetId === id)
  const centred = spec.title === 'top-centre'
  const editable = selected && draggable && !data.locked
  const ink = readableOn(fillValue, 'var(--chartit-ink)')

  return (
    <div className="chartit-node group/node relative size-full" data-selected={selected}>
      <NodeResizeFrame visible={editable} minWidth={80} minHeight={56} />
      <svg
        className="absolute inset-0 overflow-visible"
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        aria-hidden="true"
        style={{ opacity: style.opacity }}
      >
        <rect
          x={half}
          y={half}
          width={Math.max(0, w - strokeWidth)}
          height={Math.max(0, h - strokeWidth)}
          rx={radius}
          fill={hasFill ? fillValue : 'none'}
          stroke={colour}
          strokeWidth={strokeWidth}
          strokeDasharray={dash}
          strokeLinecap={dashCap(strokeStyle)}
          pointerEvents={hasFill ? 'all' : 'none'}
        />
        <rect
          x={half}
          y={half}
          width={Math.max(0, w - strokeWidth)}
          height={Math.max(0, h - strokeWidth)}
          rx={radius}
          fill="none"
          stroke="transparent"
          strokeWidth={14}
          pointerEvents="stroke"
        />
      </svg>
      <SelectionRing selected={selected} radius={radius + 1} />
      {isDropTarget ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-accent/10 shadow-[0_0_0_3px_var(--accent)]"
          style={{ borderRadius: radius }}
        />
      ) : null}
      <div
        className={cn(
          'pointer-events-auto absolute top-0 flex items-center gap-2.5',
          centred ? 'inset-x-0 justify-center' : 'left-0 max-w-full pr-3',
        )}
        style={{
          height: BADGE_SIZE + strokeWidth,
          paddingLeft: strokeWidth,
          paddingTop: strokeWidth,
        }}
      >
        {badgeUrl ? (
          <img
            src={badgeUrl}
            alt=""
            draggable={false}
            className={cn('select-none', centred && 'absolute left-0 top-0')}
            style={{
              width: BADGE_SIZE,
              height: BADGE_SIZE,
              marginLeft: centred ? strokeWidth : 0,
              marginTop: centred ? strokeWidth : 0,
            }}
          />
        ) : null}
        <div className={cn('min-w-0', !badgeUrl && !centred && 'pl-2.5')}>
          <InlineLabel
            id={id}
            label={data.label}
            style={textStyle(style, { fontSize: 13, color: ink })}
            className="font-semibold"
          />
        </div>
      </div>
      <LockBadge locked={data.locked} selected={selected} />
      <NodeHandles />
    </div>
  )
}

export const ContainerNode = memo(ContainerNodeImpl)
