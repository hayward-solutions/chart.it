import { useStore } from '@xyflow/react'

export function useEdgeZIndex(id: string): number {
  return useStore((state) => state.edgeLookup.get(id)?.zIndex ?? 0)
}
