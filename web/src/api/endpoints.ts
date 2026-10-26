import { migrateDocument } from '@/model'
import { request } from './client'
import type {
  CreateDocumentInput,
  CreatedShare,
  DocumentMeta,
  DocumentRecord,
  DocumentSummary,
  ListDocumentsParams,
  SaveContentInput,
  SaveContentResult,
  Share,
  SharedDocument,
  Template,
  UpdateDocumentMetaInput,
  User,
  VersionDetail,
  VersionSummary,
} from './types'

const API = '/api/v1'

function parseContent(raw: unknown) {
  return migrateDocument(typeof raw === 'string' ? JSON.parse(raw) : raw)
}

type RawRecord = Omit<DocumentRecord, 'content'> & { content: unknown }

function toRecord(raw: RawRecord): DocumentRecord {
  return { ...raw, content: parseContent(raw.content) }
}

export function getMe(signal?: AbortSignal): Promise<User> {
  return request<User>(`${API}/me`, { public: true, signal })
}

export function listDocuments(
  params: ListDocumentsParams = {},
  signal?: AbortSignal,
): Promise<DocumentSummary[]> {
  return request<DocumentSummary[]>(`${API}/documents`, {
    query: { q: params.q, tag: params.tag, trashed: params.trashed ? true : undefined },
    signal,
  })
}

export async function createDocument(input: CreateDocumentInput): Promise<DocumentRecord> {
  return toRecord(await request<RawRecord>(`${API}/documents`, { method: 'POST', json: input }))
}

export async function getDocument(id: string, signal?: AbortSignal): Promise<DocumentRecord> {
  return toRecord(await request<RawRecord>(`${API}/documents/${id}`, { signal }))
}

export function updateDocumentMeta(
  id: string,
  input: UpdateDocumentMetaInput,
): Promise<DocumentMeta> {
  return request<DocumentMeta>(`${API}/documents/${id}`, { method: 'PATCH', json: input })
}

export function deleteDocument(id: string): Promise<void> {
  return request<void>(`${API}/documents/${id}`, { method: 'DELETE' })
}

export function restoreDocument(id: string): Promise<DocumentMeta> {
  return request<DocumentMeta>(`${API}/documents/${id}/restore`, { method: 'POST' })
}

export function duplicateDocument(id: string): Promise<DocumentMeta> {
  return request<DocumentMeta>(`${API}/documents/${id}/duplicate`, { method: 'POST' })
}

export function saveContent(
  id: string,
  input: SaveContentInput,
  options: { keepalive?: boolean } = {},
): Promise<SaveContentResult> {
  return request<SaveContentResult>(`${API}/documents/${id}/content`, {
    method: 'PUT',
    json: input,
    keepalive: options.keepalive,
  })
}

export function putThumbnail(id: string, png: Blob): Promise<void> {
  return request<void>(`${API}/documents/${id}/thumbnail`, {
    method: 'PUT',
    body: png,
    contentType: 'image/png',
  })
}

export function thumbnailUrl(id: string, cacheKey?: string | number): string {
  const suffix = cacheKey === undefined ? '' : `?v=${encodeURIComponent(String(cacheKey))}`
  return `${API}/documents/${id}/thumbnail${suffix}`
}

export function listVersions(id: string, signal?: AbortSignal): Promise<VersionSummary[]> {
  return request<VersionSummary[]>(`${API}/documents/${id}/versions`, { signal })
}

export async function getVersion(
  id: string,
  version: number,
  signal?: AbortSignal,
): Promise<VersionDetail> {
  const raw = await request<Omit<VersionDetail, 'content'> & { content: unknown }>(
    `${API}/documents/${id}/versions/${version}`,
    { signal },
  )
  return { ...raw, content: parseContent(raw.content) }
}

export function restoreVersion(id: string, version: number): Promise<{ version: number }> {
  return request<{ version: number }>(`${API}/documents/${id}/versions/${version}/restore`, {
    method: 'POST',
  })
}

export function createShare(id: string): Promise<CreatedShare> {
  return request<CreatedShare>(`${API}/documents/${id}/shares`, { method: 'POST' })
}

export function listShares(id: string, signal?: AbortSignal): Promise<Share[]> {
  return request<Share[]>(`${API}/documents/${id}/shares`, { signal })
}

export function revokeShare(id: string, token: string): Promise<void> {
  return request<void>(`${API}/documents/${id}/shares/${token}`, { method: 'DELETE' })
}

export async function getSharedDocument(
  token: string,
  signal?: AbortSignal,
): Promise<SharedDocument> {
  const raw = await request<Omit<SharedDocument, 'content'> & { content: unknown }>(
    `${API}/shared/${token}`,
    { public: true, signal },
  )
  return { ...raw, content: parseContent(raw.content) }
}

export function listTemplates(signal?: AbortSignal): Promise<Template[]> {
  return request<Template[]>(`${API}/templates`, { signal })
}
