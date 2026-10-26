import type { EdgeProps } from '@xyflow/react'
import { memo, useMemo } from 'react'
import type { HandleSide } from '@/model'
import type { EditorFlowEdge } from '../adapters'
import { resolveVisuals } from './edgeVisuals'
import { EdgeShell } from './EdgeShell'
import { bezierCurve, bezierPath, sampleBezier, sideVector } from './geometry'

function BezierEdgeImpl({
  id,
  data,
  selected = false,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<EditorFlowEdge>) {
  const visuals = resolveVisuals(data, selected)
  const { startTrim, endTrim } = visuals
  const sourceSide = sourcePosition as HandleSide
  const targetSide = targetPosition as HandleSide
  const { points, path } = useMemo(() => {
    const source = { x: sourceX, y: sourceY }
    const target = { x: targetX, y: targetY }
    const full = sampleBezier(bezierCurve(source, sourceSide, target, targetSide))
    const ns = sideVector(sourceSide)
    const nt = sideVector(targetSide)
    const trimmed = bezierCurve(
      { x: source.x + ns.x * startTrim, y: source.y + ns.y * startTrim },
      sourceSide,
      { x: target.x + nt.x * endTrim, y: target.y + nt.y * endTrim },
      targetSide,
    )
    return { points: full, path: bezierPath(trimmed) }
  }, [sourceX, sourceY, targetX, targetY, sourceSide, targetSide, startTrim, endTrim])
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

export const BezierEdge = memo(BezierEdgeImpl)
