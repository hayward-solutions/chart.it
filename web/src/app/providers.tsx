import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui'
import { ThemeProvider, useTheme } from './theme'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, refetchOnWindowFocus: false },
    },
  })
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme()
  return <Toaster theme={resolvedTheme} position="bottom-right" closeButton />
}

export function AppProviders({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [defaultClient] = useState(createQueryClient)
  return (
    <QueryClientProvider client={client ?? defaultClient}>
      <ThemeProvider>
        <TooltipProvider>
          {children}
          <ThemedToaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
