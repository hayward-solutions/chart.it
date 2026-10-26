import type { EdgeTypes } from '@xyflow/react'
import { BezierEdge } from './BezierEdge'
import { OrthogonalEdge } from './OrthogonalEdge'
import { StraightEdge } from './StraightEdge'

export const edgeTypes: EdgeTypes = {
  orthogonal: OrthogonalEdge,
  straight: StraightEdge,
  bezier: BezierEdge,
}

export { ConnectionLine } from './ConnectionLine'
export { EdgeMarkerDefs } from './markers'
export { MARKER_KINDS, markerId, markerUrl, type MarkerEnd } from './markerIds'
