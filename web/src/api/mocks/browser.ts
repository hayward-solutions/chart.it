import { setupWorker } from 'msw/browser'
import { resetMockDb } from './db'
import { handlers } from './handlers'

export async function startMockApi(): Promise<void> {
  resetMockDb({ seed: true })
  const worker = setupWorker(...handlers)
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true })
}
