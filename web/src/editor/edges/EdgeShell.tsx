import { BaseEdge } from '@xyflow/react'
import { useState, type ReactNode } from 'react'
import type { EdgeData, Point } from '@/model'
import type { EdgeVisuals } from './edgeVisuals'
import { EdgeLabel } from './EdgeLabel'
import { markerUrl } from './markerIds'
import { EdgeMarkers } from './markers'
import { useEdgeEditing } from './useEdgeEditing'

export const HIT_WIDTH = 12

export type EdgeShellProps = {
  id: string
  data: EdgeData | undefined
  selected: boolean
  visuals: EdgeVisuals
  path: string
  points: readonly Point[]
  overlay?: ReactNode
}

export function EdgeShell({ id, data, selected, visuals, path, points, overlay }: EdgeShellProps) {
  const { readOnly } = useEdgeEditing()
  const [editing, setEditing] = useState(false)
  const style = data?.style ?? {}
  const { width, color } = visuals

  return (
    <g
      className="chartit-edge"
      data-selected={selected}
      onDoubleClick={() => {
        if (!readOnly) {
          setEditing(true)
        }
      }}
    >
      <EdgeMarkers
        scope={id}
        markerStart={visuals.markerStart}
        markerEnd={visuals.markerEnd}
        color={color}
        strokeWidth={width}
      />
      <path
        className="chartit-edge-halo"
        d={path}
        fill="none"
        strokeWidth={width + 6}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      />
      <BaseEdge
        id={id}
        path={path}
        markerStart={markerUrl(visuals.markerStart, 'start', id)}
        markerEnd={markerUrl(visuals.markerEnd, 'end', id)}
        interactionWidth={HIT_WIDTH}
        style={{
          stroke: color,
          strokeWidth: width,
          strokeDasharray: visuals.dash,
          strokeLinecap: visuals.cap,
          strokeLinejoin: 'round',
          opacity: visuals.opacity,
        }}
      />
      <EdgeLabel
        id={id}
        text={data?.label}
        style={style}
        position={data?.labelPosition ?? 0.5}
        points={points}
        selected={selected}
        editing={editing}
        onEditingChange={setEditing}
      />
      {overlay}
    </g>
  )
}
