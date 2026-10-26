import type { Document } from '@/model'

export type User = {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}

export type DocumentSummary = {
  id: string
  title: string
  tags: string[]
  version: number
  updatedAt: string
  createdAt: string
  hasThumbnail: boolean
}

export type DocumentMeta = {
  id: string
  title: string
  tags: string[]
  version: number
  templateKey: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type DocumentRecord = DocumentMeta & {
  content: Document
}

export type ListDocumentsParams = {
  q?: string
  tag?: string
  trashed?: boolean
}

export type CreateDocumentInput = {
  title: string
  templateKey?: string
}

export type UpdateDocumentMetaInput = {
  title?: string
  tags?: string[]
}

export type SaveContentInput = {
  version: number
  content: Document
  label?: string
}

export type SaveContentResult = {
  version: number
  updatedAt: string
}

export type VersionSummary = {
  version: number
  label: string | null
  createdAt: string
  createdBy: string | null
}

export type VersionDetail = {
  version: number
  label: string | null
  createdAt: string
  content: Document
}

export type Share = {
  token: string
  url: string
  createdAt: string
}

export type CreatedShare = {
  token: string
  url: string
}

export type SharedDocument = {
  title: string
  content: Document
  updatedAt: string
}

export type Template = {
  key: string
  title: string
  description: string
  pack: string
}

export type ConflictBody = {
  version: number
  updatedAt: string
}
