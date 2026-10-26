import { useReactFlow, useStoreApi } from '@xyflow/react'
import { useLayoutEffect, useMemo, useRef } from 'react'
import type { Point } from '@/model'

export type FlowController = {
  zoomIn: () => void
  zoomOut: () => void
  zoomTo: (level: number) => void
  fitView: () => void
  center: () => Point
  screenToFlow: (point: Point) => Point
}

const ZOOM_DURATION = 160

export function useFlowController(onProgrammaticMove: () => void): FlowController {
  const instance = useReactFlow()
  const flowStore = useStoreApi()
  const instanceRef = useRef(instance)
  const moveRef = useRef(onProgrammaticMove)

  useLayoutEffect(() => {
    instanceRef.current = instance
    moveRef.current = onProgrammaticMove
  })

  return useMemo(
    () => ({
      zoomIn: () => {
        moveRef.current()
        void instanceRef.current.zoomIn({ duration: ZOOM_DURATION })
      },
      zoomOut: () => {
        moveRef.current()
        void instanceRef.current.zoomOut({ duration: ZOOM_DURATION })
      },
      zoomTo: (level) => {
        moveRef.current()
        void instanceRef.current.zoomTo(level, { duration: ZOOM_DURATION })
      },
      fitView: () => {
        moveRef.current()
        void instanceRef.current.fitView({ padding: 0.2, maxZoom: 1.5, duration: ZOOM_DURATION })
      },
      center: () => {
        const { width, height, transform } = flowStore.getState()
        const zoom = transform[2] || 1
        return {
          x: (width / 2 - transform[0]) / zoom,
          y: (height / 2 - transform[1]) / zoom,
        }
      },
      screenToFlow: (point) => instanceRef.current.screenToFlowPosition(point),
    }),
    [flowStore],
  )
}
