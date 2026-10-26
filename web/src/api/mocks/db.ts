import { createEmptyDocument, type Document } from '@/model'
import type { DocumentMeta, Share, Template, User } from '../types'

export type StoredDocument = DocumentMeta & {
  content: Document
  hasThumbnail: boolean
}

export type StoredVersion = {
  version: number
  label: string | null
  createdAt: string
  createdBy: string | null
  content: Document
}

export type StoredShare = Share & { documentId: string; revokedAt: string | null }

export type MockDb = {
  authenticated: boolean
  user: User
  documents: Map<string, StoredDocument>
  versions: Map<string, StoredVersion[]>
  shares: StoredShare[]
  templates: Template[]
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

export function randomId(length = 32): string {
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return out
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function templateContent(key: string | undefined, title: string): Document {
  const doc = createEmptyDocument(title)
  if (!key || key === 'blank') {
    return doc
  }
  doc.nodes = [
    {
      id: `${key}-a`,
      type: 'shape',
      position: { x: 80, y: 80 },
      size: { width: 140, height: 60 },
      zIndex: 1,
      data: { label: 'Service A', shape: 'roundedRect', style: {} },
    },
    {
      id: `${key}-b`,
      type: 'shape',
      position: { x: 360, y: 80 },
      size: { width: 140, height: 60 },
      zIndex: 2,
      data: { label: 'Service B', shape: 'roundedRect', style: {} },
    },
  ]
  doc.edges = [
    {
      id: `${key}-e`,
      source: `${key}-a`,
      target: `${key}-b`,
      sourceHandle: 'right',
      targetHandle: 'left',
      type: 'orthogonal',
      zIndex: 0,
      data: { markerStart: 'none', markerEnd: 'arrow', style: {} },
    },
  ]
  return doc
}

export function seedDocument(
  db: MockDb,
  input: { title: string; tags?: string[]; templateKey?: string | null; updatedAt?: string },
): StoredDocument {
  const stamp = input.updatedAt ?? nowIso()
  const doc: StoredDocument = {
    id: randomId(32),
    title: input.title,
    tags: input.tags ?? [],
    version: 1,
    templateKey: input.templateKey ?? null,
    createdAt: stamp,
    updatedAt: stamp,
    deletedAt: null,
    content: templateContent(input.templateKey ?? undefined, input.title),
    hasThumbnail: false,
  }
  db.documents.set(doc.id, doc)
  db.versions.set(doc.id, [])
  return doc
}

export function createMockDb(): MockDb {
  const db: MockDb = {
    authenticated: true,
    user: {
      id: 'user-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      avatarUrl: null,
    },
    documents: new Map(),
    versions: new Map(),
    shares: [],
    templates: [
      {
        key: 'aws-three-tier',
        title: 'AWS three-tier web app',
        description: 'Load balancer, app tier and database across two availability zones.',
        pack: 'aws',
      },
      {
        key: 'azure-hub-spoke',
        title: 'Azure hub and spoke',
        description: 'Hub virtual network peered with workload spokes.',
        pack: 'azure',
      },
      {
        key: 'gcp-gke-cluster',
        title: 'GKE regional cluster',
        description: 'Regional GKE cluster behind a global load balancer.',
        pack: 'gcp',
      },
      {
        key: 'k8s-app',
        title: 'Kubernetes application',
        description: 'Ingress, deployment, service and persistent volume in a namespace.',
        pack: 'k8s',
      },
    ],
  }
  return db
}

export const mockDb: MockDb = createMockDb()

export function resetMockDb(options: { seed?: boolean } = {}): MockDb {
  const fresh = createMockDb()
  mockDb.authenticated = fresh.authenticated
  mockDb.user = fresh.user
  mockDb.documents = fresh.documents
  mockDb.versions = fresh.versions
  mockDb.shares = fresh.shares
  mockDb.templates = fresh.templates
  if (options.seed) {
    const day = 86_400_000
    seedDocument(mockDb, {
      title: 'Production network',
      tags: ['aws', 'network'],
      updatedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    })
    seedDocument(mockDb, {
      title: 'Payments platform',
      tags: ['kubernetes'],
      templateKey: 'k8s-app',
      updatedAt: new Date(Date.now() - 3 * day).toISOString(),
    })
    seedDocument(mockDb, {
      title: 'Data lake',
      tags: ['gcp', 'data'],
      updatedAt: new Date(Date.now() - 14 * day).toISOString(),
    })
  }
  return mockDb
}
