import type { MarkerKind } from '@/model'
import { MARKER_KINDS, markerId, type MarkerEnd } from './markerIds'
import { markerMetrics } from './markerMetrics'

type Kind = Exclude<MarkerKind, 'none'>

function Shape({ kind, strokeWidth }: { kind: Kind; strokeWidth: number }) {
  const { length, height } = markerMetrics(kind, strokeWidth)
  switch (kind) {
    case 'arrow':
      return <path d={`M 0 ${-height / 2} L ${length} 0 L 0 ${height / 2} Z`} stroke="none" />
    case 'diamond':
      return (
        <path
          d={`M 0 0 L ${length / 2} ${-height / 2} L ${length} 0 L ${length / 2} ${height / 2} Z`}
          stroke="none"
        />
      )
    case 'circle':
      return <circle cx={length / 2} cy={0} r={length / 2} stroke="none" />
    case 'openArrow':
      return (
        <path
          d={`M ${-length} ${-height / 2} L 0 0 L ${-length} ${height / 2}`}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
  }
}

type MarkerProps = {
  id: string
  kind: Kind
  end: MarkerEnd
  color: string
  strokeWidth: number
}

function Marker({ id, kind, end, color, strokeWidth }: MarkerProps) {
  const { box } = markerMetrics(kind, strokeWidth)
  const paint =
    kind === 'openArrow' ? { fill: 'none', stroke: color } : { fill: color, stroke: 'none' }
  return (
    <marker
      id={id}
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      refX={0}
      refY={0}
      markerWidth={box.width}
      markerHeight={box.height}
      markerUnits="userSpaceOnUse"
      orient={end === 'end' ? 'auto' : 'auto-start-reverse'}
      overflow="visible"
      style={paint}
    >
      <Shape kind={kind} strokeWidth={strokeWidth} />
    </marker>
  )
}

export type EdgeMarkersProps = {
  scope: string
  markerStart: MarkerKind
  markerEnd: MarkerKind
  color: string
  strokeWidth: number
}

export function EdgeMarkers({
  scope,
  markerStart,
  markerEnd,
  color,
  strokeWidth,
}: EdgeMarkersProps) {
  if (markerStart === 'none' && markerEnd === 'none') {
    return null
  }
  return (
    <defs>
      {markerStart !== 'none' ? (
        <Marker
          id={markerId(markerStart, 'start', scope)}
          kind={markerStart}
          end="start"
          color={color}
          strokeWidth={strokeWidth}
        />
      ) : null}
      {markerEnd !== 'none' ? (
        <Marker
          id={markerId(markerEnd, 'end', scope)}
          kind={markerEnd}
          end="end"
          color={color}
          strokeWidth={strokeWidth}
        />
      ) : null}
    </defs>
  )
}

export function EdgeMarkerDefs() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
    >
      <defs>
        {MARKER_KINDS.flatMap((kind) =>
          (['start', 'end'] as const).map((end) => (
            <Marker
              key={`${kind}-${end}`}
              id={markerId(kind, end)}
              kind={kind}
              end={end}
              color="var(--chartit-edge)"
              strokeWidth={2}
            />
          )),
        )}
      </defs>
    </svg>
  )
}
