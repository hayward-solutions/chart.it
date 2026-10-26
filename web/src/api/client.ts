export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Record<string, string | number | boolean | undefined>
  json?: unknown
  body?: BodyInit
  contentType?: string
  public?: boolean
  keepalive?: boolean
  signal?: AbortSignal
}

export class ApiError extends Error {
  readonly status: number
  readonly title: string
  readonly detail: string
  readonly type: string | undefined
  readonly body: Record<string, unknown>

  constructor(status: number, title: string, detail = '', type?: string, body = {}) {
    super(detail ? `${title}: ${detail}` : title)
    this.name = 'ApiError'
    this.status = status
    this.title = title
    this.detail = detail
    this.type = type
    this.body = body
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function isUnauthorized(error: unknown): boolean {
  return isApiError(error) && error.status === 401
}

export function isConflict(error: unknown): boolean {
  return isApiError(error) && error.status === 409
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

let unauthorizedHandler: () => void = () => {
  if (window.location.pathname !== '/login') {
    window.location.assign('/login')
  }
}

export function setUnauthorizedHandler(handler: () => void): () => void {
  const previous = unauthorizedHandler
  unauthorizedHandler = handler
  return () => {
    unauthorizedHandler = previous
  }
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const base = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  const url = new URL(path, base)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }
  }
  return url.toString()
}

async function toApiError(response: Response): Promise<ApiError> {
  let parsed: Record<string, unknown> = {}
  try {
    const text = await response.text()
    if (text) {
      const value: unknown = JSON.parse(text)
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        parsed = value as Record<string, unknown>
      }
    }
  } catch {
    parsed = {}
  }
  const title = typeof parsed.title === 'string' ? parsed.title : response.statusText || 'Error'
  const detail = typeof parsed.detail === 'string' ? parsed.detail : ''
  const type = typeof parsed.type === 'string' ? parsed.type : undefined
  const status = typeof parsed.status === 'number' ? parsed.status : response.status
  return new ApiError(status, title, detail, type, parsed)
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (!SAFE_METHODS.has(method)) {
    headers['X-Requested-With'] = 'chartit'
  }
  let body: BodyInit | undefined = options.body
  if (options.json !== undefined) {
    body = JSON.stringify(options.json)
    headers['Content-Type'] = 'application/json'
  } else if (options.contentType) {
    headers['Content-Type'] = options.contentType
  }
  const response = await fetch(buildUrl(path, options.query), {
    method,
    headers,
    body,
    credentials: 'same-origin',
    keepalive: options.keepalive,
    signal: options.signal,
  })
  if (!response.ok) {
    if (response.status === 401 && !options.public) {
      unauthorizedHandler()
    }
    throw await toApiError(response)
  }
  if (response.status === 204) {
    return undefined as T
  }
  const contentType = response.headers.get('Content-Type') ?? ''
  if (contentType.includes('json')) {
    return (await response.json()) as T
  }
  return undefined as T
}

export async function postLogout(): Promise<void> {
  await request<void>('/auth/logout', { method: 'POST', public: true })
}
