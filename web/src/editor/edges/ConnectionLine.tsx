import type { ConnectionLineComponentProps } from '@xyflow/react'
import type { HandleSide } from '@/model'
import { orthogonalRoute, roundedPath } from './geometry'

export function ConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
}: ConnectionLineComponentProps) {
  const route = orthogonalRoute({
    source: { x: fromX, y: fromY },
    sourceSide: fromPosition as HandleSide,
    target: { x: toX, y: toY },
    targetSide: toPosition as HandleSide,
  })
  return (
    <g className="chartit-connection-line">
      <path
        d={roundedPath(route)}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={toX} cy={toY} r={3.5} fill="var(--accent)" />
    </g>
  )
}
