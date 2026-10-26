import type { IconRef } from './schema'

export type ContainerBorder = 'solid' | 'dashed'
export type ContainerTitlePosition = 'top-left' | 'top-centre'

export type ContainerKindSpec = {
  kind: string
  label: string
  border: ContainerBorder
  colour: string
  fill?: string
  badge: IconRef | null
  title: ContainerTitlePosition
}

function spec(
  kind: string,
  label: string,
  border: ContainerBorder,
  colour: string,
  badge: IconRef | null,
  title: ContainerTitlePosition = 'top-left',
  fill?: string,
): ContainerKindSpec {
  return { kind, label, border, colour, badge, title, ...(fill ? { fill } : {}) }
}

export const CONTAINER_KINDS: Readonly<Record<string, ContainerKindSpec>> = Object.fromEntries(
  [
    spec('aws.cloud', 'AWS Cloud', 'solid', '#232F3E', { pack: 'aws', id: 'group-cloud' }),
    spec('aws.region', 'Region', 'dashed', '#00A4A6', { pack: 'aws', id: 'group-region' }),
    spec('aws.account', 'AWS Account', 'solid', '#E7157B', { pack: 'aws', id: 'group-account' }),
    spec('aws.vpc', 'VPC', 'solid', '#8C4FFF', { pack: 'aws', id: 'group-vpc' }),
    spec('aws.availabilityZone', 'Availability Zone', 'dashed', '#00A4A6', null),
    spec('aws.subnet.public', 'Public subnet', 'solid', '#7AA116', null, 'top-left', '#E9F3E6'),
    spec('aws.subnet.private', 'Private subnet', 'solid', '#00A4A6', null, 'top-left', '#E6F2F8'),
    spec('aws.securityGroup', 'Security group', 'dashed', '#DD344C', null),
    spec(
      'aws.autoScaling',
      'Auto Scaling group',
      'dashed',
      '#ED7100',
      {
        pack: 'aws',
        id: 'group-auto-scaling',
      },
      'top-centre',
    ),
    spec('azure.subscription', 'Subscription', 'solid', '#0078D4', {
      pack: 'azure',
      id: 'subscription',
    }),
    spec('azure.resourceGroup', 'Resource group', 'dashed', '#7A7A7A', {
      pack: 'azure',
      id: 'resource-group',
    }),
    spec('azure.vnet', 'Virtual network', 'solid', '#0078D4', { pack: 'azure', id: 'vnet' }),
    spec('azure.subnet', 'Subnet', 'solid', '#0078D4', null, 'top-left', '#EAF3FB'),
    spec('gcp.project', 'Project', 'solid', '#4285F4', { pack: 'gcp', id: 'project' }),
    spec('gcp.vpc', 'VPC network', 'solid', '#4285F4', { pack: 'gcp', id: 'vpc' }),
    spec('gcp.region', 'Region', 'dashed', '#4285F4', null),
    spec('gcp.zone', 'Zone', 'dashed', '#9AA0A6', null),
    spec('k8s.cluster', 'Cluster', 'solid', '#326CE5', { pack: 'k8s', id: 'cluster' }),
    spec('k8s.namespace', 'Namespace', 'dashed', '#326CE5', { pack: 'k8s', id: 'namespace' }),
    spec('k8s.node', 'Node', 'solid', '#326CE5', { pack: 'k8s', id: 'node' }),
    spec('k8s.pod', 'Pod', 'solid', '#326CE5', { pack: 'k8s', id: 'pod' }),
    spec('generic', 'Group', 'solid', '#6B7280', null),
  ].map((entry) => [entry.kind, entry]),
)

export function getContainerKind(kind: string | undefined): ContainerKindSpec {
  const found = kind ? CONTAINER_KINDS[kind] : undefined
  return found ?? (CONTAINER_KINDS.generic as ContainerKindSpec)
}
