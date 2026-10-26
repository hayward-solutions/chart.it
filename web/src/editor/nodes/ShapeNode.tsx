import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { readableOn } from '../color'
import type { EditorFlowNode } from '../adapters'
import { dashArray, dashCap, textStyle } from '../style'
import { LockBadge, SelectionRing } from './Chrome'
import { NodeHandles } from './Handles'
import { InlineLabel } from './InlineLabel'
import { NodeResizeFrame } from './Resizer'
import { shapeGeometry } from './shapeGeometry'

function ShapeNodeImpl({
  id,
  data,
  selected,
  width,
  height,
  draggable,
}: NodeProps<EditorFlowNode>) {
  const style = data.style
  const w = width ?? 0
  const h = height ?? 0
  const strokeWidth = style.strokeWidth ?? 2
  const fill = style.fill ?? '#ffffff'
  const geometry = shapeGeometry(data.shape ?? 'rect', w, h, strokeWidth / 2, style.radius)
  const stroke = style.stroke ?? '#374151'
  const dash = dashArray(style.strokeStyle, strokeWidth)
  const editable = selected && draggable && !data.locked
  return (
    <div
      className="chartit-node group/node relative size-full"
      data-selected={selected}
      style={{ opacity: style.opacity }}
    >
      <NodeResizeFrame visible={editable} minWidth={24} minHeight={24} />
      <svg
        className="absolute inset-0 overflow-visible"
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        aria-hidden="true"
      >
        <path
          d={geometry.d}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dash}
          strokeLinecap={dashCap(style.strokeStyle)}
          strokeLinejoin="round"
        />
        {geometry.detail ? (
          <path
            d={geometry.detail}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={dash}
            strokeLinecap={dashCap(style.strokeStyle)}
            strokeLinejoin="round"
          />
        ) : null}
      </svg>
      <SelectionRing selected={selected} radius={2} />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden p-2">
        <div className="w-full">
          <InlineLabel
            id={id}
            label={data.label}
            className="text-center"
            style={textStyle(style, {
              fontSize: 14,
              color: readableOn(style.fill ?? '#ffffff', 'var(--chartit-ink)'),
            })}
          />
        </div>
      </div>
      <LockBadge locked={data.locked} selected={selected} />
      <NodeHandles />
    </div>
  )
}

export const ShapeNode = memo(ShapeNodeImpl)
