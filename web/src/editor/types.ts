import type {
  Document,
  Edge,
  EdgeData,
  EdgeStyle,
  EdgeType,
  HandleSide,
  Node,
  NodeData,
  NodeStyle,
  NodeType,
  Point,
  Size,
} from '@/model'

export type Rect = { x: number; y: number; width: number; height: number }

export type SelectionState = { nodes: string[]; edges: string[] }

export type ClipboardPayload = {
  nodes: Node[]
  edges: Edge[]
  rootParents: Record<string, string>
}

export type NodeDataPatch = Partial<Omit<NodeData, 'style'>> & { style?: Partial<NodeStyle> }
export type NodePatch = Partial<Omit<Node, 'id' | 'data'>> & { data?: NodeDataPatch }
export type EdgeDataPatch = Partial<Omit<EdgeData, 'style'>> & { style?: Partial<EdgeStyle> }
export type EdgePatch = Partial<Omit<Edge, 'id' | 'data'>> & { data?: EdgeDataPatch }

export type AlignKind = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom'
export type DistributeAxis = 'x' | 'y'
export type OrderOp = 'forward' | 'backward' | 'front' | 'back'

export type NewNode = {
  id?: string
  type: NodeType
  position?: Point
  size?: Size
  parentId?: string
  zIndex?: number
  locked?: boolean
  data?: Partial<NodeData>
}

export type NewEdge = {
  id?: string
  source: string
  target: string
  sourceHandle?: HandleSide
  targetHandle?: HandleSide
  type?: EdgeType
  zIndex?: number
  data?: Partial<EdgeData>
}

export type AddNodeOptions = { absolute?: boolean; select?: boolean }

export type GeometryUpdate = { id: string; position?: Point; size?: Size }

export type DocumentChangeHandler = (document: Document) => void
