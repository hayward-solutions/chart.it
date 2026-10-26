import { z } from 'zod'

export const CURRENT_SCHEMA_VERSION = 1

export const StrokeStyleSchema = z.enum(['solid', 'dashed', 'dotted'])
export const TextAlignSchema = z.enum(['left', 'center', 'right'])
export const LabelPositionSchema = z.enum(['top', 'bottom', 'inside', 'left', 'right'])
export const HandleSideSchema = z.enum(['top', 'right', 'bottom', 'left'])
export const NodeTypeSchema = z.enum(['icon', 'container', 'shape', 'text'])
export const ShapeKindSchema = z.enum([
  'rect',
  'roundedRect',
  'ellipse',
  'diamond',
  'cylinder',
  'hexagon',
  'parallelogram',
  'cloud',
  'note',
])
export const EdgeTypeSchema = z.enum(['orthogonal', 'straight', 'bezier'])
export const MarkerKindSchema = z.enum(['none', 'arrow', 'openArrow', 'diamond', 'circle'])

export const PointSchema = z.object({ x: z.number(), y: z.number() })
export const SizeSchema = z.object({ width: z.number(), height: z.number() })
export const IconRefSchema = z.object({ pack: z.string(), id: z.string() })

export const NodeStyleSchema = z.object({
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  strokeStyle: StrokeStyleSchema.optional(),
  opacity: z.number().optional(),
  radius: z.number().optional(),
  fontFamily: z.string().optional(),
  fontSize: z.number().optional(),
  fontWeight: z.union([z.number(), z.string()]).optional(),
  fontColor: z.string().optional(),
  textAlign: TextAlignSchema.optional(),
  labelPosition: LabelPositionSchema.optional(),
})

export const EdgeStyleSchema = z.object({
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  strokeStyle: StrokeStyleSchema.optional(),
  opacity: z.number().optional(),
  fontSize: z.number().optional(),
  fontColor: z.string().optional(),
  labelBackground: z.string().optional(),
})

export const NodeDataSchema = z.object({
  label: z.string(),
  icon: IconRefSchema.optional(),
  shape: ShapeKindSchema.optional(),
  containerKind: z.string().optional(),
  style: NodeStyleSchema,
})

export const NodeSchema = z.object({
  id: z.string(),
  type: NodeTypeSchema,
  position: PointSchema,
  size: SizeSchema,
  parentId: z.string().optional(),
  zIndex: z.number(),
  locked: z.boolean().optional(),
  data: NodeDataSchema,
})

export const EdgeDataSchema = z.object({
  label: z.string().optional(),
  labelPosition: z.number().min(0).max(1).optional(),
  markerStart: MarkerKindSchema,
  markerEnd: MarkerKindSchema,
  waypoints: z.array(PointSchema).optional(),
  style: EdgeStyleSchema,
})

export const EdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: HandleSideSchema,
  targetHandle: HandleSideSchema,
  type: EdgeTypeSchema,
  zIndex: z.number(),
  data: EdgeDataSchema,
})

export const SettingsSchema = z.object({
  background: z.string(),
  grid: z.enum(['dots', 'lines', 'none']),
  snap: z.boolean(),
  gridSize: z.number().positive(),
  theme: z.enum(['light', 'dark', 'system']),
})

export const ViewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number().positive(),
})

export const DocumentSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  title: z.string(),
  settings: SettingsSchema,
  viewport: ViewportSchema,
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
})

export type StrokeStyle = z.infer<typeof StrokeStyleSchema>
export type TextAlign = z.infer<typeof TextAlignSchema>
export type LabelPosition = z.infer<typeof LabelPositionSchema>
export type HandleSide = z.infer<typeof HandleSideSchema>
export type NodeType = z.infer<typeof NodeTypeSchema>
export type ShapeKind = z.infer<typeof ShapeKindSchema>
export type EdgeType = z.infer<typeof EdgeTypeSchema>
export type MarkerKind = z.infer<typeof MarkerKindSchema>
export type Point = z.infer<typeof PointSchema>
export type Size = z.infer<typeof SizeSchema>
export type IconRef = z.infer<typeof IconRefSchema>
export type NodeStyle = z.infer<typeof NodeStyleSchema>
export type EdgeStyle = z.infer<typeof EdgeStyleSchema>
export type NodeData = z.infer<typeof NodeDataSchema>
export type Node = z.infer<typeof NodeSchema>
export type EdgeData = z.infer<typeof EdgeDataSchema>
export type Edge = z.infer<typeof EdgeSchema>
export type Settings = z.infer<typeof SettingsSchema>
export type Viewport = z.infer<typeof ViewportSchema>
export type Document = z.infer<typeof DocumentSchema>

export function createEmptyDocument(title: string): Document {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    title,
    settings: { background: '#ffffff', grid: 'dots', snap: true, gridSize: 16, theme: 'light' },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: [],
  }
}
