import { Link, Outlet, useMatch } from 'react-router'
import { Brand } from '@/components/brand'
import { cn } from '@/lib/cn'
import { ThemeToggle } from './ThemeToggle'
import { UserMenu } from './UserMenu'

export function AppShell() {
  const inEditor = useMatch('/d/:id') !== null
  return (
    <div className="flex h-full flex-col">
      {inEditor ? null : (
        <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4">
          <Link
            to="/"
            aria-label="Chart.it home"
            className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Brand />
          </Link>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
      )}
      <main className={cn('min-h-0 flex-1', inEditor ? 'overflow-hidden' : 'overflow-auto')}>
        <Outlet />
      </main>
    </div>
  )
}
