import { http, HttpResponse, type HttpHandler } from 'msw'
import { migrateDocument } from '@/model'
import type { ConflictBody } from '../types'
import { mockDb, nowIso, randomId, seedDocument, type StoredDocument } from './db'

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

function problem(status: number, title: string, detail = '', extra: Record<string, unknown> = {}) {
  return HttpResponse.json(
    { type: 'about:blank', title, status, detail, ...extra },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

type Guard = { error: Response } | { error: null }

function guard(request: Request): Guard {
  if (!mockDb.authenticated) {
    return { error: problem(401, 'Unauthorized', 'sign in required') }
  }
  if (!SAFE.has(request.method) && request.headers.get('X-Requested-With') !== 'chartit') {
    return { error: problem(403, 'Forbidden', 'missing X-Requested-With header') }
  }
  return { error: null }
}

function meta(doc: StoredDocument) {
  return {
    id: doc.id,
    title: doc.title,
    tags: doc.tags,
    version: doc.version,
    templateKey: doc.templateKey,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt,
  }
}

function full(doc: StoredDocument) {
  return { ...meta(doc), content: doc.content }
}

function summary(doc: StoredDocument) {
  return {
    id: doc.id,
    title: doc.title,
    tags: doc.tags,
    version: doc.version,
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
    hasThumbnail: doc.hasThumbnail,
  }
}

function snapshot(doc: StoredDocument, label: string | null) {
  const list = mockDb.versions.get(doc.id) ?? []
  list.push({
    version: doc.version,
    label,
    createdAt: nowIso(),
    createdBy: mockDb.user.id,
    content: doc.content,
  })
  mockDb.versions.set(doc.id, list)
}

function find(id: string | readonly string[] | undefined): StoredDocument | undefined {
  return typeof id === 'string' ? mockDb.documents.get(id) : undefined
}

export const handlers: HttpHandler[] = [
  http.get('/api/v1/me', () => {
    if (!mockDb.authenticated) {
      return problem(401, 'Unauthorized', 'sign in required')
    }
    return HttpResponse.json(mockDb.user)
  }),

  http.get('/api/v1/documents', ({ request }) => {
    const g = guard(request)
    if (g.error) return g.error
    const url = new URL(request.url)
    const q = (url.searchParams.get('q') ?? '').toLowerCase()
    const tag = url.searchParams.get('tag') ?? ''
    const trashed = url.searchParams.get('trashed') === 'true'
    const list = [...mockDb.documents.values()]
      .filter((d) => (trashed ? d.deletedAt !== null : d.deletedAt === null))
      .filter((d) => !q || d.title.toLowerCase().includes(q))
      .filter((d) => !tag || d.tags.includes(tag))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(summary)
    return HttpResponse.json(list)
  }),

  http.post('/api/v1/documents', async ({ request }) => {
    const g = guard(request)
    if (g.error) return g.error
    const body = (await request.json()) as { title?: string; templateKey?: string }
    if (!body.title?.trim()) {
      return problem(400, 'Bad Request', 'title is required')
    }
    if (body.templateKey && body.templateKey !== 'blank') {
      if (!mockDb.templates.some((t) => t.key === body.templateKey)) {
        return problem(400, 'Bad Request', 'unknown template')
      }
    }
    const doc = seedDocument(mockDb, {
      title: body.title.trim(),
      templateKey: body.templateKey && body.templateKey !== 'blank' ? body.templateKey : null,
    })
    return HttpResponse.json(full(doc), { status: 201 })
  }),

  http.get('/api/v1/documents/:id', ({ request, params }) => {
    const g = guard(request)
    if (g.error) return g.error
    const doc = find(params.id)
    if (!doc) return problem(404, 'Not Found')
    return HttpResponse.json(full(doc))
  }),

  http.patch('/api/v1/documents/:id', async ({ request, params }) => {
    const g = guard(request)
    if (g.error) return g.error
    const doc = find(params.id)
    if (!doc) return problem(404, 'Not Found')
    const body = (await request.json()) as { title?: string; tags?: string[] }
    if (body.title !== undefined) {
      if (!body.title.trim()) return problem(400, 'Bad Request', 'title must not be empty')
      doc.title = body.title.trim()
      doc.content = { ...doc.content, title: doc.title }
    }
    if (body.tags !== undefined) doc.tags = body.tags
    doc.updatedAt = nowIso()
    return HttpResponse.json(meta(doc))
  }),

  http.delete('/api/v1/documents/:id', ({ request, params }) => {
    const g = guard(request)
    if (g.error) return g.error
    const doc = find(params.id)
    if (!doc) return problem(404, 'Not Found')
    doc.deletedAt = nowIso()
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('/api/v1/documents/:id/restore', ({ request, params }) => {
    const g = guard(request)
    if (g.error) return g.error
    const doc = find(params.id)
    if (!doc) return problem(404, 'Not Found')
    doc.deletedAt = null
    return HttpResponse.json(meta(doc))
  }),

  http.post('/api/v1/documents/:id/duplicate', ({ request, params }) => {
    const g = guard(request)
    if (g.error) return g.error
    const doc = find(params.id)
    if (!doc) return problem(404, 'Not Found')
    const copy = seedDocument(mockDb, {
      title: `${doc.title} (copy)`,
      tags: [...doc.tags],
      templateKey: doc.templateKey,
    })
    copy.content = { ...doc.content, title: copy.title }
    return HttpResponse.json(meta(copy), { status: 201 })
  }),

  http.put('/api/v1/documents/:id/content', async ({ request, params }) => {
    const g = guard(request)
    if (g.error) return g.error
    const doc = find(params.id)
    if (!doc) return problem(404, 'Not Found')
    const body = (await request.json()) as { version?: number; content?: unknown; label?: string }
    if (body.version !== doc.version) {
      const conflict: ConflictBody = { version: doc.version, updatedAt: doc.updatedAt }
      return problem(409, 'Conflict', 'document was modified elsewhere', conflict)
    }
    try {
      doc.content = migrateDocument(body.content)
    } catch {
      return problem(400, 'Bad Request', 'invalid document content')
    }
    doc.version += 1
    doc.updatedAt = nowIso()
    doc.title = doc.content.title || doc.title
    const list = mockDb.versions.get(doc.id) ?? []
    const last = list[list.length - 1]
    const stale = !last || Date.now() - Date.parse(last.createdAt) > 5 * 60_000
    if (body.label || stale) snapshot(doc, body.label ?? null)
    return HttpResponse.json({ version: doc.version, updatedAt: doc.updatedAt })
  }),

  http.put('/api/v1/documents/:id/thumbnail', ({ request, params }) => {
    const g = guard(request)
    if (g.error) return g.error
    const doc = find(params.id)
    if (!doc) return problem(404, 'Not Found')
    doc.hasThumbnail = true
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('/api/v1/documents/:id/thumbnail', ({ request, params }) => {
    const g = guard(request)
    if (g.error) return g.error
    const doc = find(params.id)
    if (!doc?.hasThumbnail) return problem(404, 'Not Found')
    return new HttpResponse(null, { status: 404 })
  }),

  http.get('/api/v1/documents/:id/versions', ({ request, params }) => {
    const g = guard(request)
    if (g.error) return g.error
    const doc = find(params.id)
    if (!doc) return problem(404, 'Not Found')
    const list = (mockDb.versions.get(doc.id) ?? [])
      .map(({ version, label, createdAt, createdBy }) => ({ version, label, createdAt, createdBy }))
      .sort((a, b) => b.version - a.version)
    return HttpResponse.json(list)
  }),

  http.get('/api/v1/documents/:id/versions/:v', ({ request, params }) => {
    const g = guard(request)
    if (g.error) return g.error
    const doc = find(params.id)
    if (!doc) return problem(404, 'Not Found')
    const found = (mockDb.versions.get(doc.id) ?? []).find((v) => v.version === Number(params.v))
    if (!found) return problem(404, 'Not Found')
    return HttpResponse.json({
      version: found.version,
      label: found.label,
      createdAt: found.createdAt,
      content: found.content,
    })
  }),

  http.post('/api/v1/documents/:id/versions/:v/restore', ({ request, params }) => {
    const g = guard(request)
    if (g.error) return g.error
    const doc = find(params.id)
    if (!doc) return problem(404, 'Not Found')
    const found = (mockDb.versions.get(doc.id) ?? []).find((v) => v.version === Number(params.v))
    if (!found) return problem(404, 'Not Found')
    doc.content = found.content
    doc.version += 1
    doc.updatedAt = nowIso()
    snapshot(doc, `Restored version ${found.version}`)
    return HttpResponse.json({ version: doc.version })
  }),

  http.post('/api/v1/documents/:id/shares', ({ request, params }) => {
    const g = guard(request)
    if (g.error) return g.error
    const doc = find(params.id)
    if (!doc) return problem(404, 'Not Found')
    const token = randomId(32)
    const url = `${new URL(request.url).origin}/s/${token}`
    mockDb.shares.push({ token, url, createdAt: nowIso(), documentId: doc.id, revokedAt: null })
    return HttpResponse.json({ token, url }, { status: 201 })
  }),

  http.get('/api/v1/documents/:id/shares', ({ request, params }) => {
    const g = guard(request)
    if (g.error) return g.error
    const doc = find(params.id)
    if (!doc) return problem(404, 'Not Found')
    const list = mockDb.shares
      .filter((s) => s.documentId === doc.id && !s.revokedAt)
      .map(({ token, url, createdAt }) => ({ token, url, createdAt }))
    return HttpResponse.json(list)
  }),

  http.delete('/api/v1/documents/:id/shares/:token', ({ request, params }) => {
    const g = guard(request)
    if (g.error) return g.error
    const doc = find(params.id)
    if (!doc) return problem(404, 'Not Found')
    const share = mockDb.shares.find((s) => s.documentId === doc.id && s.token === params.token)
    if (!share) return problem(404, 'Not Found')
    share.revokedAt = nowIso()
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('/api/v1/shared/:token', ({ params }) => {
    const share = mockDb.shares.find((s) => s.token === params.token && !s.revokedAt)
    const doc = share ? mockDb.documents.get(share.documentId) : undefined
    if (!doc || doc.deletedAt) return problem(404, 'Not Found')
    return HttpResponse.json({ title: doc.title, content: doc.content, updatedAt: doc.updatedAt })
  }),

  http.get('/api/v1/templates', ({ request }) => {
    const g = guard(request)
    if (g.error) return g.error
    return HttpResponse.json(mockDb.templates)
  }),

  http.post('/auth/logout', ({ request }) => {
    if (request.headers.get('X-Requested-With') !== 'chartit') {
      return problem(403, 'Forbidden', 'missing X-Requested-With header')
    }
    mockDb.authenticated = false
    return new HttpResponse(null, { status: 204 })
  }),
]
