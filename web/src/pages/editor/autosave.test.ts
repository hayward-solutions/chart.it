import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api'
import { createEmptyDocument } from '@/model'
import { createAutosave, type AutosaveStatus, type SaveRequest } from './autosave'

function setup(save?: (request: SaveRequest) => Promise<{ version: number; updatedAt: string }>) {
  const statuses: AutosaveStatus[] = []
  const calls: SaveRequest[] = []
  const autosave = createAutosave({
    initialVersion: 1,
    save: async (request) => {
      calls.push(request)
      return save ? save(request) : { version: request.version + 1, updatedAt: 'now' }
    },
    onStatus: (status) => statuses.push(status),
  })
  return { autosave, statuses, calls }
}

describe('createAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces edits into a single save with the current version', async () => {
    const { autosave, statuses, calls } = setup()
    autosave.change(createEmptyDocument('a'))
    autosave.change(createEmptyDocument('b'))
    expect(statuses).toEqual(['unsaved'])
    await vi.advanceTimersByTimeAsync(999)
    expect(calls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(2)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.version).toBe(1)
    expect(calls[0]?.content.title).toBe('b')
    expect(autosave.status()).toBe('saved')
    expect(autosave.version()).toBe(2)
  })

  it('flushes at most every five seconds during continuous edits', async () => {
    const { autosave, calls } = setup()
    for (let i = 0; i < 9; i += 1) {
      autosave.change(createEmptyDocument(`t${i}`))
      await vi.advanceTimersByTimeAsync(700)
    }
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls[0]?.content.title).toBe('t7')
  })

  it('moves to conflict on 409 and keeps the pending edit for overwrite', async () => {
    let attempt = 0
    const { autosave, calls, statuses } = setup(async (request) => {
      attempt += 1
      if (attempt === 1) {
        throw new ApiError(409, 'Conflict', '', undefined, { version: 7 })
      }
      return { version: request.version + 1, updatedAt: 'now' }
    })
    autosave.change(createEmptyDocument('mine'))
    await vi.advanceTimersByTimeAsync(1100)
    expect(autosave.status()).toBe('conflict')
    expect(autosave.conflictVersion()).toBe(7)
    expect(statuses).toEqual(['unsaved', 'saving', 'conflict'])

    autosave.change(createEmptyDocument('mine again'))
    await vi.advanceTimersByTimeAsync(5000)
    expect(calls).toHaveLength(1)

    await autosave.overwrite(7)
    expect(calls).toHaveLength(2)
    expect(calls[1]?.version).toBe(7)
    expect(calls[1]?.content.title).toBe('mine again')
    expect(autosave.status()).toBe('saved')
    expect(autosave.version()).toBe(8)
  })

  it('reports an error and retries with backoff', async () => {
    let attempt = 0
    const { autosave, calls } = setup(async (request) => {
      attempt += 1
      if (attempt === 1) {
        throw new ApiError(500, 'Internal Server Error')
      }
      return { version: request.version + 1, updatedAt: 'now' }
    })
    autosave.change(createEmptyDocument('x'))
    await vi.advanceTimersByTimeAsync(1100)
    expect(autosave.status()).toBe('error')
    expect(autosave.isPending()).toBe(true)
    await vi.advanceTimersByTimeAsync(4100)
    expect(calls).toHaveLength(2)
    expect(autosave.status()).toBe('saved')
  })

  it('saves a labelled version even when nothing changed', async () => {
    const { autosave, calls } = setup()
    const ok = await autosave.flush({ label: 'Milestone', document: createEmptyDocument('m') })
    expect(ok).toBe(true)
    expect(calls[0]?.label).toBe('Milestone')
  })
})
