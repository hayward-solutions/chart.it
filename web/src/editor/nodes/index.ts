import type { NodeTypes } from '@xyflow/react'
import { ContainerNode } from './ContainerNode'
import { IconNode } from './IconNode'
import { ShapeNode } from './ShapeNode'
import { TextNode } from './TextNode'

export const nodeTypes: NodeTypes = {
  icon: IconNode,
  container: ContainerNode,
  shape: ShapeNode,
  text: TextNode,
}

export { ContainerNode, IconNode, ShapeNode, TextNode }
