import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/cn'
import { useEditorStore, useEditorStoreApi } from '../context'

type LabelEditorProps = {
  id: string
  initial: string
  style: CSSProperties
  className?: string
  autoHeight?: boolean
}

function LabelEditor({ id, initial, style, className, autoHeight }: LabelEditorProps) {
  const store = useEditorStoreApi()
  const ref = useRef<HTMLTextAreaElement>(null)
  const done = useRef(false)
  const [value, setValue] = useState(initial)

  useEffect(() => {
    const el = ref.current
    if (el) {
      el.focus()
      el.select()
    }
  }, [])

  useLayoutEffect(() => {
    const el = ref.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [value])

  const commit = () => {
    if (done.current) {
      return
    }
    done.current = true
    const el = ref.current
    const state = store.getState()
    state.setNodeLabel(id, el ? el.value : value, autoHeight && el ? el.scrollHeight : undefined)
    state.setEditingNode(null)
  }

  return (
    <textarea
      ref={ref}
      aria-label="Edit label"
      value={value}
      rows={1}
      spellCheck={false}
      onChange={(event) => {
        setValue(event.target.value)
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
          event.preventDefault()
          commit()
        }
      }}
      onPointerDown={(event) => {
        event.stopPropagation()
      }}
      onDoubleClick={(event) => {
        event.stopPropagation()
      }}
      className={cn(
        'nodrag nopan nowheel pointer-events-auto block w-full min-w-24 resize-none overflow-hidden rounded-sm border-0 bg-surface/80 p-0 outline-2 outline-accent',
        className,
      )}
      style={{ ...style, background: 'transparent', lineHeight: 1.3 }}
    />
  )
}

type InlineLabelProps = {
  id: string
  label: string
  style: CSSProperties
  className?: string
  placeholder?: string
  autoHeight?: boolean
}

export const InlineLabel = memo(function InlineLabel({
  id,
  label,
  style,
  className,
  placeholder,
  autoHeight,
}: InlineLabelProps) {
  const editing = useEditorStore((state) => state.editingNodeId === id)
  if (editing) {
    return (
      <LabelEditor
        id={id}
        initial={label}
        style={style}
        className={className}
        autoHeight={autoHeight}
      />
    )
  }
  if (!label) {
    return placeholder ? (
      <div
        className={cn('whitespace-pre-wrap break-words opacity-40', className)}
        style={{ ...style, lineHeight: 1.3 }}
      >
        {placeholder}
      </div>
    ) : null
  }
  return (
    <div
      className={cn('whitespace-pre-wrap break-words', className)}
      style={{ ...style, lineHeight: 1.3 }}
    >
      {label}
    </div>
  )
})
