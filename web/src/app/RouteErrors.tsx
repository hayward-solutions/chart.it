import { TriangleAlert } from 'lucide-react'
import { Link, useRouteError } from 'react-router'
import { EmptyState, buttonVariants } from '@/components/ui'

function ErrorPage({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        icon={TriangleAlert}
        title={title}
        description={message}
        action={
          <Link to="/" className={buttonVariants({ variant: 'primary' })}>
            Back to diagrams
          </Link>
        }
      />
    </div>
  )
}

export function RouteError() {
  const error = useRouteError()
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  return <ErrorPage title="Something went wrong" message={message} />
}

export function NotFound() {
  return <ErrorPage title="Page not found" message="That page does not exist." />
}
