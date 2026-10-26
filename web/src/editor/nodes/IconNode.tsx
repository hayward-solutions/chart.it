import type { NodeProps } from '@xyflow/react'
import { memo, type CSSProperties } from 'react'
import { ImageOff } from 'lucide-react'
import type { LabelPosition } from '@/model'
import { cn } from '@/lib/cn'
import type { EditorFlowNode } from '../adapters'
import { useIconUrl } from '../iconFiles'
import { textStyle } from '../style'
import { LockBadge, SelectionRing } from './Chrome'
import { NodeHandles } from './Handles'
import { InlineLabel } from './InlineLabel'
import { NodeResizeFrame } from './Resizer'

const LABEL_PLACEMENT: Record<LabelPosition, string> = {
  bottom: 'left-1/2 top-full mt-1.5 -translate-x-1/2 text-center',
  top: 'bottom-full left-1/2 mb-1.5 -translate-x-1/2 text-center',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2 text-right',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2 text-left',
  inside: 'inset-0 flex items-center justify-center text-center',
}

function IconNodeImpl({ id, data, selected, draggable }: NodeProps<EditorFlowNode>) {
  const style = data.style
  const url = useIconUrl(data.icon)
  const placement = style.labelPosition ?? 'bottom'
  const box: CSSProperties = {
    background: style.fill,
    borderRadius: style.radius,
    border: style.stroke
      ? `${style.strokeWidth ?? 1}px ${style.strokeStyle ?? 'solid'} ${style.stroke}`
      : undefined,
  }
  const editable = selected && draggable && !data.locked
  return (
    <div
      className="chartit-node group/node relative size-full"
      data-selected={selected}
      style={{ opacity: style.opacity }}
    >
      <NodeResizeFrame visible={editable} minWidth={24} minHeight={24} />
      <div className="absolute inset-0 overflow-hidden" style={box}>
        {url ? (
          <img
            src={url}
            alt=""
            draggable={false}
            className="pointer-events-none size-full select-none object-contain"
          />
        ) : (
          <div className="flex size-full items-center justify-center rounded-md bg-surface-muted text-muted-foreground">
            <ImageOff className="size-1/2" />
          </div>
        )}
      </div>
      <SelectionRing selected={selected} radius={style.radius ?? 3} />
      <div
        className={cn(
          'chartit-icon-label absolute w-max max-w-[200px] px-1',
          LABEL_PLACEMENT[placement],
        )}
      >
        <InlineLabel
          id={id}
          label={data.label}
          style={textStyle(style, { fontSize: 12, color: 'var(--chartit-ink)' })}
        />
      </div>
      <LockBadge locked={data.locked} selected={selected} />
      <NodeHandles />
    </div>
  )
}

export const IconNode = memo(IconNodeImpl)
