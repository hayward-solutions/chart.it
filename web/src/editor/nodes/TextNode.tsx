import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { cn } from '@/lib/cn'
import type { EditorFlowNode } from '../adapters'
import { readableOn } from '../color'
import { textStyle } from '../style'
import { LockBadge, SelectionRing } from './Chrome'
import { NodeHandles } from './Handles'
import { InlineLabel } from './InlineLabel'
import { NodeResizeFrame } from './Resizer'

function TextNodeImpl({ id, data, selected, draggable }: NodeProps<EditorFlowNode>) {
  const style = data.style
  const editable = selected && draggable && !data.locked
  return (
    <div
      className="chartit-node group/node relative w-full"
      data-selected={selected}
      style={{
        opacity: style.opacity,
        background: style.fill,
        borderRadius: style.radius ?? 2,
        border: style.stroke
          ? `${style.strokeWidth ?? 1}px ${style.strokeStyle ?? 'solid'} ${style.stroke}`
          : undefined,
      }}
    >
      <NodeResizeFrame visible={editable} minWidth={40} minHeight={16} />
      <SelectionRing selected={selected} radius={2} />
      <InlineLabel
        id={id}
        label={data.label}
        autoHeight
        placeholder="Text"
        className={cn('px-1.5 py-1')}
        style={textStyle(style, {
          fontSize: 16,
          color: readableOn(style.fill, 'var(--chartit-ink)'),
        })}
      />
      <LockBadge locked={data.locked} selected={selected} />
      <NodeHandles />
    </div>
  )
}

export const TextNode = memo(TextNodeImpl)
