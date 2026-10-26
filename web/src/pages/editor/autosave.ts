import { isApiError, isConflict, type SaveContentResult } from '@/api'
import type { Document } from '@/model'

export type AutosaveStatus = 'saved' | 'saving' | 'unsaved' | 'error' | 'conflict'

export type SaveRequest = {
  version: number
  content: Document
  label?: string
  keepalive: boolean
}

export type AutosaveOptions = {
  initialVersion: number
  save: (request: SaveRequest) => Promise<SaveContentResult>
  onStatus: (status: AutosaveStatus) => void
  onSaved?: (result: SaveContentResult, content: Document, label?: string) => void
  debounceMs?: number
  maxWaitMs?: number
  retryMs?: number
}

export type FlushOptions = {
  keepalive?: boolean
  label?: string
  document?: Document
}

export type Autosave = {
  change: (document: Document) => void
  flush: (options?: FlushOptions) => Promise<boolean>
  reset: (version: number) => void
  overwrite: (version: number) => Promise<boolean>
  status: () => AutosaveStatus
  version: () => number
  conflictVersion: () => number | null
  isPending: () => boolean
  dispose: () => void
}

const MAX_RETRY_MS = 30_000

function versionFromConflict(error: unknown): number | null {
  if (isApiError(error) && typeof error.body.version === 'number') {
    return error.body.version
  }
  return null
}

export function createAutosave(options: AutosaveOptions): Autosave {
  const { debounceMs = 1000, maxWaitMs = 5000, retryMs = 4000 } = options
  let version = options.initialVersion
  let latest: Document | null = null
  let dirty = false
  let status: AutosaveStatus = 'saved'
  let inflight: Promise<void> | null = null
  let conflict: { version: number | null } | null = null
  let failures = 0
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let maxTimer: ReturnType<typeof setTimeout> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined

  const setStatus = (next: AutosaveStatus) => {
    if (status !== next) {
      status = next
      options.onStatus(next)
    }
  }

  const clearTimers = () => {
    clearTimeout(debounceTimer)
    clearTimeout(maxTimer)
    clearTimeout(retryTimer)
    debounceTimer = undefined
    maxTimer = undefined
    retryTimer = undefined
  }

  const clean = () => !dirty && inflight === null && status === 'saved'

  const run = async (flushOptions: FlushOptions, follow: boolean): Promise<boolean> => {
    clearTimers()
    if (inflight) {
      await inflight
    }
    if (conflict) {
      return false
    }
    if (flushOptions.label !== undefined) {
      latest = flushOptions.document ?? latest
      dirty = latest !== null
    }
    if (!dirty || latest === null) {
      return clean()
    }
    const content = latest
    const label = flushOptions.label
    dirty = false
    setStatus('saving')
    const attempt = options
      .save({
        version,
        content,
        keepalive: flushOptions.keepalive ?? false,
        ...(label !== undefined ? { label } : {}),
      })
      .then(
        (result) => {
          version = result.version
          failures = 0
          if (dirty) {
            setStatus('unsaved')
          } else {
            setStatus('saved')
          }
          options.onSaved?.(result, content, label)
        },
        (error: unknown) => {
          dirty = true
          if (isConflict(error)) {
            conflict = { version: versionFromConflict(error) }
            setStatus('conflict')
          } else {
            failures += 1
            setStatus('error')
            clearTimeout(retryTimer)
            retryTimer = setTimeout(
              () => {
                void run({}, false)
              },
              Math.min(retryMs * 2 ** (failures - 1), MAX_RETRY_MS),
            )
          }
        },
      )
      .finally(() => {
        inflight = null
      })
    inflight = attempt
    await attempt
    if (follow && dirty && status === 'unsaved') {
      return run(flushOptions.keepalive ? { keepalive: true } : {}, true)
    }
    return clean()
  }

  const flush = (flushOptions: FlushOptions = {}) => run(flushOptions, true)

  const schedule = () => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      void run({}, false)
    }, debounceMs)
    if (maxTimer === undefined) {
      maxTimer = setTimeout(() => {
        void run({}, false)
      }, maxWaitMs)
    }
  }

  return {
    change: (document) => {
      latest = document
      dirty = true
      if (conflict) {
        return
      }
      if (status !== 'saving') {
        setStatus('unsaved')
      }
      clearTimeout(retryTimer)
      retryTimer = undefined
      schedule()
    },
    flush,
    reset: (next) => {
      clearTimers()
      version = next
      latest = null
      dirty = false
      conflict = null
      failures = 0
      setStatus('saved')
    },
    overwrite: (next) => {
      version = next
      conflict = null
      failures = 0
      if (latest === null) {
        dirty = false
        setStatus('saved')
        return Promise.resolve(true)
      }
      dirty = true
      setStatus('unsaved')
      return flush()
    },
    status: () => status,
    version: () => version,
    conflictVersion: () => conflict?.version ?? null,
    isPending: () => dirty || inflight !== null || status === 'error' || status === 'conflict',
    dispose: clearTimers,
  }
}
