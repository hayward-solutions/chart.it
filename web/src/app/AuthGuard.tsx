import { Navigate, Outlet } from 'react-router'
import { isUnauthorized, useMe } from '@/api'
import { Button, EmptyState, Skeleton } from '@/components/ui'
import { TriangleAlert } from 'lucide-react'

export function AuthGuard() {
  const me = useMe()

  if (me.isPending) {
    return (
      <div className="flex h-full flex-col" role="status" aria-label="Loading">
        <div className="h-12 border-b border-border bg-surface" />
        <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  if (me.isError) {
    if (isUnauthorized(me.error)) {
      return <Navigate to="/login" replace />
    }
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={TriangleAlert}
          title="Can't reach the server"
          description="Something went wrong while checking your session."
          action={<Button onClick={() => void me.refetch()}>Try again</Button>}
        />
      </div>
    )
  }

  return <Outlet context={me.data} />
}
