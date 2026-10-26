import { Eye, LinkIcon } from 'lucide-react'
import { useEffect } from 'react'
import { useParams } from 'react-router'
import { isApiError, useSharedDocument } from '@/api'
import { ThemeToggle } from '@/app/ThemeToggle'
import { Brand } from '@/components/brand'
import { Button, EmptyState, Skeleton } from '@/components/ui'
import { EditorCanvas } from '@/editor'

export default function Share() {
  const { token } = useParams()
  const shared = useSharedDocument(token)
  const title = shared.data?.title

  useEffect(() => {
    if (title) {
      document.title = `${title} - Chart.it`
    }
    return () => {
      document.title = 'Chart.it'
    }
  }, [title])

  let body
  if (shared.isPending) {
    body = (
      <div className="h-full p-4" role="status" aria-label="Loading diagram">
        <Skeleton className="h-full w-full" />
      </div>
    )
  } else if (shared.isError) {
    const gone = isApiError(shared.error) && shared.error.status === 404
    body = (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={LinkIcon}
          title={gone ? 'This link is no longer valid' : 'Could not load diagram'}
          description={gone ? 'The share link was revoked or never existed.' : shared.error.message}
          action={
            gone ? undefined : <Button onClick={() => void shared.refetch()}>Try again</Button>
          }
        />
      </div>
    )
  } else {
    body = <EditorCanvas document={shared.data.content} readOnly />
  }

  return (
    <div className="flex h-full flex-col">
      <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border bg-surface px-4">
        <Brand className="justify-self-start text-[15px]" />
        {title ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <h1 className="truncate text-sm font-semibold tracking-tight">{title}</h1>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              <Eye className="size-3" /> View only
            </span>
          </div>
        ) : (
          <span />
        )}
        <div className="justify-self-end">
          <ThemeToggle />
        </div>
      </header>
      <main className="min-h-0 flex-1">{body}</main>
    </div>
  )
}
