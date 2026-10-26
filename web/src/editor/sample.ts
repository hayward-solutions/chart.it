import { createEmptyDocument, type Document, type Edge, type Node } from '@/model'

function node(partial: Omit<Node, 'zIndex'> & { zIndex?: number }, zIndex: number): Node {
  return { zIndex, ...partial }
}

function edge(
  id: string,
  source: string,
  target: string,
  sourceHandle: Edge['sourceHandle'],
  targetHandle: Edge['targetHandle'],
  label?: string,
): Edge {
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    type: 'orthogonal',
    zIndex: 0,
    data: { markerStart: 'none', markerEnd: 'arrow', ...(label ? { label } : {}), style: {} },
  }
}

export function buildSampleDocument(): Document {
  const doc = createEmptyDocument('AWS VPC sample')
  doc.nodes = [
    node(
      {
        id: 'vpc',
        type: 'container',
        position: { x: 80, y: 60 },
        size: { width: 760, height: 420 },
        data: { label: 'Production VPC', containerKind: 'aws.vpc', style: {} },
      },
      1,
    ),
    node(
      {
        id: 'subnet-public',
        type: 'container',
        parentId: 'vpc',
        position: { x: 24, y: 56 },
        size: { width: 260, height: 330 },
        data: { label: 'Public subnet', containerKind: 'aws.subnet.public', style: {} },
      },
      2,
    ),
    node(
      {
        id: 'subnet-private',
        type: 'container',
        parentId: 'vpc',
        position: { x: 316, y: 56 },
        size: { width: 420, height: 330 },
        data: { label: 'Private subnet', containerKind: 'aws.subnet.private', style: {} },
      },
      3,
    ),
    node(
      {
        id: 'alb',
        type: 'icon',
        parentId: 'subnet-public',
        position: { x: 98, y: 130 },
        size: { width: 64, height: 64 },
        data: {
          label: 'Load balancer',
          icon: { pack: 'aws', id: 'elb-application-load-balancer' },
          style: { labelPosition: 'bottom' },
        },
      },
      4,
    ),
    node(
      {
        id: 'ec2-a',
        type: 'icon',
        parentId: 'subnet-private',
        position: { x: 70, y: 70 },
        size: { width: 64, height: 64 },
        data: {
          label: 'Web 1',
          icon: { pack: 'aws', id: 'ec2' },
          style: { labelPosition: 'bottom' },
        },
      },
      5,
    ),
    node(
      {
        id: 'ec2-b',
        type: 'icon',
        parentId: 'subnet-private',
        position: { x: 70, y: 200 },
        size: { width: 64, height: 64 },
        data: {
          label: 'Web 2',
          icon: { pack: 'aws', id: 'ec2' },
          style: { labelPosition: 'bottom' },
        },
      },
      6,
    ),
    node(
      {
        id: 'rds',
        type: 'icon',
        parentId: 'subnet-private',
        position: { x: 290, y: 135 },
        size: { width: 64, height: 64 },
        data: {
          label: 'Orders DB',
          icon: { pack: 'aws', id: 'rds' },
          style: { labelPosition: 'bottom' },
        },
      },
      7,
    ),
    node(
      {
        id: 'note',
        type: 'text',
        position: { x: 80, y: 20 },
        size: { width: 240, height: 28 },
        data: { label: 'Three-tier web application', style: { fontSize: 16, fontWeight: 600 } },
      },
      8,
    ),
  ]
  doc.edges = [
    edge('e-alb-a', 'alb', 'ec2-a', 'right', 'left', 'HTTP'),
    edge('e-alb-b', 'alb', 'ec2-b', 'right', 'left'),
    edge('e-a-rds', 'ec2-a', 'rds', 'right', 'top'),
    edge('e-b-rds', 'ec2-b', 'rds', 'right', 'left'),
  ]
  return doc
}

export const sampleDocument: Document = buildSampleDocument()
