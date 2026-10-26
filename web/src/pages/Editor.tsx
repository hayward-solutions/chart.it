import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { isApiError, useLoadedDocument, type DocumentRecord } from '@/api'
import { Button, EmptyState, Skeleton, buttonVariants } from '@/components/ui'
import { EditorSession } from './editor/EditorSession'

function EditorLoader({ id }: { id: string }) {
  const doc = useLoadedDocument(id)
  const [record, setRecord] = useState<DocumentRecord | null>(null)

  if (record === null && doc.data && doc.isFetchedAfterMount && !doc.isError) {
    setRecord(doc.data)
  }

  if (record) {
    return <EditorSession record={record} />
  }

  if (doc.isError) {
    const notFound = isApiError(doc.error) && doc.error.status === 404
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={TriangleAlert}
          title={notFound ? 'Diagram not found' : 'Could not load diagram'}
          description={
            notFound ? 'It may have been deleted or you may not have access.' : doc.error.message
          }
          action={
            notFound ? (
              <Link to="/" className={buttonVariants({ variant: 'primary' })}>
                Back to diagrams
              </Link>
            ) : (
              <Button onClick={() => void doc.refetch()}>Try again</Button>
            )
          }
        />
      </div>
    )
  }

  return (
    <div className="h-full p-4" role="status" aria-label="Loading diagram">
      <Skeleton className="h-full w-full" />
    </div>
  )
}

export default function Editor() {
  const { id } = useParams()
  if (!id) {
    return null
  }
  return <EditorLoader key={id} id={id} />
}
