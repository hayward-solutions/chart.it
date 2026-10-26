import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '@/api/mocks/server'
import { ApiError, request, setUnauthorizedHandler } from './client'
import { createDocument, getMe, listDocuments } from './endpoints'

function captureHeaders(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) {
  const seen: Headers[] = []
  server.use(
    http[method](path, ({ request: req }) => {
      seen.push(req.headers)
      return HttpResponse.json({ ok: true })
    }),
  )
  return seen
}

describe('api client', () => {
  it('sets X-Requested-With on mutating calls', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const seen = captureHeaders(method.toLowerCase() as 'post', '/probe')
      await request('/probe', { method, json: {} })
      expect(seen[0]?.get('X-Requested-With')).toBe('chartit')
    }
  })

  it('does not set X-Requested-With on GET', async () => {
    const seen = captureHeaders('get', '/probe')
    await request('/probe')
    expect(seen[0]?.get('X-Requested-With')).toBeNull()
  })

  it('creates documents through the mock API with the CSRF header', async () => {
    const doc = await createDocument({ title: 'From test' })
    expect(doc.title).toBe('From test')
    expect(doc.content.schemaVersion).toBe(1)
    const list = await listDocuments()
    expect(list.map((d) => d.id)).toContain(doc.id)
  })

  it('parses problem+json into ApiError', async () => {
    server.use(
      http.get('/probe', () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Conflict', status: 409, detail: 'stale', version: 7 },
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    const error = await request('/probe').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    const apiError = error as ApiError
    expect(apiError.status).toBe(409)
    expect(apiError.title).toBe('Conflict')
    expect(apiError.detail).toBe('stale')
    expect(apiError.body.version).toBe(7)
  })

  it('falls back to status text for non-json error bodies', async () => {
    server.use(http.get('/probe', () => new HttpResponse('boom', { status: 500 })))
    const error = (await request('/probe').catch((e: unknown) => e)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(500)
  })

  it('redirects on 401 for non-public calls only', async () => {
    const handler = vi.fn()
    const restore = setUnauthorizedHandler(handler)
    server.use(http.get('/probe', () => new HttpResponse(null, { status: 401 })))
    await expect(request('/probe')).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledTimes(1)
    await expect(request('/probe', { public: true })).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledTimes(1)
    restore()
  })

  it('treats /me as a public call so the guard can handle 401', async () => {
    const handler = vi.fn()
    const restore = setUnauthorizedHandler(handler)
    const { mockDb } = await import('./mocks/db')
    mockDb.authenticated = false
    await expect(getMe()).rejects.toMatchObject({ status: 401 })
    expect(handler).not.toHaveBeenCalled()
    restore()
  })
})
