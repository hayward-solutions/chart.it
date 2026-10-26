import { dataUrlToBlob } from './capture'

export type ThumbnailerOptions = {
  getElement: () => HTMLElement | null
  capture: (element: HTMLElement) => Promise<string>
  upload: (png: Blob) => Promise<void>
  intervalMs?: number
  timeoutMs?: number
}

export type Thumbnailer = {
  markSaved: () => void
  captureNow: () => Promise<void>
  isStale: () => boolean
  dispose: () => void
}

export function createThumbnailer(options: ThumbnailerOptions): Thumbnailer {
  const { intervalMs = 30_000, timeoutMs = 2000 } = options
  let stale = false
  let lastAt = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> | null = null

  const run = (): Promise<void> => {
    if (running) {
      return running
    }
    clearTimeout(timer)
    timer = undefined
    stale = false
    lastAt = Date.now()
    running = (async () => {
      try {
        const element = options.getElement()
        if (!element) {
          return
        }
        const png = dataUrlToBlob(await options.capture(element))
        await options.upload(png)
      } catch {
        return
      }
    })().finally(() => {
      running = null
    })
    return running
  }

  return {
    markSaved: () => {
      stale = true
      const elapsed = Date.now() - lastAt
      if (elapsed >= intervalMs) {
        void run()
      } else if (timer === undefined) {
        timer = setTimeout(() => {
          timer = undefined
          void run()
        }, intervalMs - elapsed)
      }
    },
    captureNow: async () => {
      if (!stale) {
        return running ?? undefined
      }
      let timeout: ReturnType<typeof setTimeout> | undefined
      const limit = new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs)
      })
      await Promise.race([run(), limit])
      clearTimeout(timeout)
    },
    isStale: () => stale,
    dispose: () => {
      clearTimeout(timer)
      timer = undefined
    },
  }
}
