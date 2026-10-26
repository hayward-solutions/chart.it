import { Handle, Position } from '@xyflow/react'
import { memo } from 'react'

const SIDES = [
  ['top', Position.Top],
  ['right', Position.Right],
  ['bottom', Position.Bottom],
  ['left', Position.Left],
] as const

export const NodeHandles = memo(function NodeHandles() {
  return (
    <>
      {SIDES.map(([id, position]) => (
        <Handle key={id} id={id} type="source" position={position} className="chartit-handle" />
      ))}
    </>
  )
})
