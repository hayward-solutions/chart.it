import './zodConfig'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { AppProviders } from '@/app/providers'
import { createAppRouter } from '@/app/router'
import './index.css'

async function enableMocking() {
  if (import.meta.env.VITE_MOCK_API === '1') {
    const { startMockApi } = await import('@/api/mocks/browser')
    try {
      await startMockApi()
    } catch (error) {
      console.error('mock API failed to start', error)
    }
  }
}

void enableMocking().then(() => {
  const root = document.getElementById('root')
  if (!root) {
    throw new Error('root element missing')
  }
  createRoot(root).render(
    <StrictMode>
      <AppProviders>
        <RouterProvider router={createAppRouter()} />
      </AppProviders>
    </StrictMode>,
  )
})
