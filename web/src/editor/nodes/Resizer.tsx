import { NodeResizer } from '@xyflow/react'
import { useEffect, useState } from 'react'
import { useEditorStoreApi } from '../context'

type ResizerProps = {
  visible: boolean
  minWidth: number
  minHeight: number
}

function ActiveResizer({ minWidth, minHeight }: Omit<ResizerProps, 'visible'>) {
  const store = useEditorStoreApi()
  const [shift, setShift] = useState(false)

  useEffect(() => {
    const sync = (event: KeyboardEvent) => {
      setShift(event.shiftKey)
    }
    const reset = () => {
      setShift(false)
    }
    window.addEventListener('keydown', sync)
    window.addEventListener('keyup', sync)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', sync)
      window.removeEventListener('keyup', sync)
      window.removeEventListener('blur', reset)
    }
  }, [])

  return (
    <NodeResizer
      minWidth={minWidth}
      minHeight={minHeight}
      keepAspectRatio={shift}
      handleClassName="chartit-resize-handle"
      lineClassName="chartit-resize-line"
      onResizeStart={() => {
        store.getState().pauseHistory()
      }}
      onResizeEnd={() => {
        store.getState().resumeHistory()
      }}
    />
  )
}

export function NodeResizeFrame({ visible, minWidth, minHeight }: ResizerProps) {
  if (!visible) {
    return null
  }
  return <ActiveResizer minWidth={minWidth} minHeight={minHeight} />
}
