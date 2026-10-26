import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router'
import Dashboard from '@/pages/Dashboard'
import Login from '@/pages/Login'
import { AppShell } from './AppShell'
import { AuthGuard } from './AuthGuard'
import { LazyEditor, LazyShare } from './lazyPages'
import { NotFound, RouteError } from './RouteErrors'

export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      { path: '/login', element: <Login /> },
      {
        path: '/s/:token',
        element: <LazyShare />,
      },
      {
        element: <AuthGuard />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: '/', element: <Dashboard /> },
              {
                path: '/d/:id',
                element: <LazyEditor />,
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]

export function createAppRouter() {
  return createBrowserRouter(routes)
}

export function createTestRouter(initialEntries: string[] = ['/']) {
  return createMemoryRouter(routes, { initialEntries })
}
