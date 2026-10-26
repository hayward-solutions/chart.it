import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { RouterProvider } from 'react-router'
import { AppProviders } from '@/app/providers'
import { createTestRouter } from '@/app/router'

export function renderApp(path = '/') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  })
  const router = createTestRouter([path])
  const result = render(
    <AppProviders client={client}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { ...result, router, client }
}
