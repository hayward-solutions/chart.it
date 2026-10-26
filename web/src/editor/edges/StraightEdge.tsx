import type { EdgeProps } from '@xyflow/react'
import { memo, useMemo } from 'react'
import type { EditorFlowEdge } from '../adapters'
import { resolveVisuals } from './edgeVisuals'
import { EdgeShell } from './EdgeShell'
import { trimPolyline } from './geometry'

function StraightEdgeImpl({
  id,
  data,
  selected = false,
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps<EditorFlowEdge>) {
  const visuals = resolveVisuals(data, selected)
  const { startTrim, endTrim } = visuals
  const { points, path } = useMemo(() => {
    const full = [
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
    ]
    const [from, to] = trimPolyline(full, startTrim, endTrim)
    return {
      points: full,
      path: from && to ? `M ${from.x} ${from.y} L ${to.x} ${to.y}` : '',
    }
  }, [sourceX, sourceY, targetX, targetY, startTrim, endTrim])
  return (
    <EdgeShell
      id={id}
      data={data}
      selected={selected}
      visuals={visuals}
      path={path}
      points={points}
    />
  )
}

export const StraightEdge = memo(StraightEdgeImpl)
