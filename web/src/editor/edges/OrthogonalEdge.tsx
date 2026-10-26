import { EdgeLabelRenderer, useReactFlow, type EdgeProps } from '@xyflow/react'
import { memo, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { HandleSide, Point } from '@/model'
import type { EditorFlowEdge } from '../adapters'
import { resolveVisuals } from './edgeVisuals'
import { EdgeShell } from './EdgeShell'
import {
  clampSegmentValue,
  moveSegment,
  orthogonalRoute,
  pointAtT,
  removeSegmentWaypoints,
  roundedPath,
  segmentHandles,
  simplifyOrthogonal,
  trimPolyline,
  waypointsOf,
  type Axis,
  type SegmentHandle,
} from './geometry'
import { OVERLAY_LAYER, SELECTED_LIFT } from './layers'
import { useEdgeEditing } from './useEdgeEditing'
import { useEdgeZIndex } from './useEdgeZIndex'
import { useNodeRect } from './useNodeRect'

type SegmentDrag = {
  index: number
  axis: Axis
  start: Point
  base: Point[]
  baseValue: number
  latest: Point[] | null
}

function OrthogonalEdgeImpl({
  id,
  data,
  selected = false,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<EditorFlowEdge>) {
  const sourceRect = useNodeRect(source)
  const targetRect = useNodeRect(target)
  const { update, readOnly, snapSize } = useEdgeEditing()
  const { screenToFlowPosition } = useReactFlow()
  const zIndex = useEdgeZIndex(id)
  const [draft, setDraft] = useState<Point[] | null>(null)
  const dragRef = useRef<SegmentDrag | null>(null)

  const visuals = resolveVisuals(data, selected)
  const { startTrim, endTrim } = visuals
  const sourceSide = sourcePosition as HandleSide
  const targetSide = targetPosition as HandleSide
  const stored = data?.waypoints
  const waypoints = draft ?? stored

  const route = useMemo(
    () =>
      orthogonalRoute({
        source: { x: sourceX, y: sourceY },
        sourceSide,
        target: { x: targetX, y: targetY },
        targetSide,
        waypoints,
        sourceRect,
        targetRect,
      }),
    [sourceX, sourceY, targetX, targetY, sourceSide, targetSide, waypoints, sourceRect, targetRect],
  )
  const path = useMemo(
    () => roundedPath(trimPolyline(route, startTrim, endTrim)),
    [route, startTrim, endTrim],
  )

  const editable = selected && !readOnly
  const handles = editable ? segmentHandles(route) : []
  const hasWaypoints = stored !== undefined && stored.length > 0

  const onHandleDown = (event: ReactPointerEvent<HTMLDivElement>, handle: SegmentHandle) => {
    if (event.button !== 0) {
      return
    }
    event.stopPropagation()
    const anchor = route[handle.index]
    if (!anchor) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      index: handle.index,
      axis: handle.axis,
      start: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      base: route,
      baseValue: handle.axis === 'x' ? anchor.y : anchor.x,
      latest: null,
    }
  }

  const onHandleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) {
      return
    }
    const flow = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    let value = drag.baseValue + (drag.axis === 'x' ? flow.y - drag.start.y : flow.x - drag.start.x)
    if (snapSize > 0) {
      value = Math.round(value / snapSize) * snapSize
    }
    value = clampSegmentValue(drag.base, drag.index, value, sourceSide, targetSide)
    if (Math.abs(value - drag.baseValue) < 0.5) {
      drag.latest = null
      setDraft(null)
      return
    }
    const next = waypointsOf(simplifyOrthogonal(moveSegment(drag.base, drag.index, value)))
    drag.latest = next
    setDraft(next)
  }

  const onHandleEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) {
      return
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (drag.latest && event.type === 'pointerup') {
      update(id, { data: { waypoints: drag.latest.length > 0 ? drag.latest : undefined } })
    }
    setDraft(null)
  }

  const anchor = handles[Math.floor(handles.length / 2)]
  const resetOffset = anchor
    ? anchor.axis === 'y'
      ? { x: anchor.point.x + 60, y: anchor.point.y }
      : { x: anchor.point.x, y: anchor.point.y - 28 }
    : (() => {
        const middle = pointAtT(route, 0.5)
        return { x: middle.x, y: middle.y - 28 }
      })()

  const overlay = editable ? (
    <EdgeLabelRenderer>
      {handles.map((handle) => (
        <div
          key={handle.index}
          className="chartit-segment-handle nodrag nopan"
          data-testid="segment-handle"
          role="presentation"
          data-axis={handle.axis}
          style={{
            transform: `translate(-50%, -50%) translate(${handle.point.x}px, ${handle.point.y}px)`,
            zIndex: OVERLAY_LAYER + zIndex + SELECTED_LIFT + 1,
          }}
          onPointerDown={(event) => {
            onHandleDown(event, handle)
          }}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleEnd}
          onPointerCancel={onHandleEnd}
          onDoubleClick={(event) => {
            event.stopPropagation()
            const next = removeSegmentWaypoints(route, handle.index)
            update(id, { data: { waypoints: next.length > 0 ? next : undefined } })
          }}
        />
      ))}
      {hasWaypoints ? (
        <button
          type="button"
          className="chartit-edge-action nodrag nopan"
          style={{
            transform: `translate(-50%, -50%) translate(${resetOffset.x}px, ${resetOffset.y}px)`,
            zIndex: OVERLAY_LAYER + zIndex + SELECTED_LIFT + 1,
          }}
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.stopPropagation()
            update(id, { data: { waypoints: undefined } })
          }}
        >
          Reset route
        </button>
      ) : null}
    </EdgeLabelRenderer>
  ) : null

  return (
    <EdgeShell
      id={id}
      data={data}
      selected={selected}
      visuals={visuals}
      path={path}
      points={route}
      overlay={overlay}
    />
  )
}

export const OrthogonalEdge = memo(OrthogonalEdgeImpl)
