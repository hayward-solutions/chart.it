import { lazy, Suspense } from 'react'
import { Skeleton } from '@/components/ui'

const Editor = lazy(() => import('@/pages/Editor'))
const Share = lazy(() => import('@/pages/Share'))

function PageFallback() {
  return (
    <div className="h-full p-4" role="status" aria-label="Loading">
      <Skeleton className="h-full w-full" />
    </div>
  )
}

export function LazyEditor() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Editor />
    </Suspense>
  )
}

export function LazyShare() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Share />
    </Suspense>
  )
}
