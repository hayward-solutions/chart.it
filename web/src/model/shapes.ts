import type { ShapeKind } from './schema'

export const SHAPES: readonly { kind: ShapeKind; label: string }[] = [
  { kind: 'rect', label: 'Rectangle' },
  { kind: 'roundedRect', label: 'Rounded rectangle' },
  { kind: 'ellipse', label: 'Ellipse' },
  { kind: 'diamond', label: 'Diamond' },
  { kind: 'cylinder', label: 'Cylinder' },
  { kind: 'hexagon', label: 'Hexagon' },
  { kind: 'parallelogram', label: 'Parallelogram' },
  { kind: 'cloud', label: 'Cloud' },
  { kind: 'note', label: 'Note' },
]
