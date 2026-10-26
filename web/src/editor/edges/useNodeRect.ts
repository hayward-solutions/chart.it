import { useInternalNode } from '@xyflow/react'
import { useMemo } from 'react'
import type { Rect } from '../types'

export function useNodeRect(id: string): Rect | undefined {
  const node = useInternalNode(id)
  const x = node?.internals.positionAbsolute.x
  const y = node?.internals.positionAbsolute.y
  const width = node?.measured.width ?? node?.width
  const height = node?.measured.height ?? node?.height
  return useMemo(() => {
    if (x === undefined || y === undefined || width === undefined || height === undefined) {
      return undefined
    }
    return { x, y, width, height }
  }, [x, y, width, height])
}
