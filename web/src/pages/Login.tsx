import { TriangleAlert } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { Brand } from '@/components/brand'
import { buttonVariants } from '@/components/ui'
import { cn } from '@/lib/cn'

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Sign-in was cancelled or your account is not allowed to use Chart.it.',
  session_expired: 'Your session expired. Please sign in again.',
  state_mismatch: 'The sign-in attempt could not be verified. Please try again.',
  unavailable: 'The sign-in service is unavailable right now. Please try again shortly.',
}

const FALLBACK_MESSAGE = 'Something went wrong while signing you in. Please try again.'

export default function Login() {
  const [params] = useSearchParams()
  const errorCode = params.get('error')
  const message = errorCode ? (ERROR_MESSAGES[errorCode] ?? FALLBACK_MESSAGE) : null

  return (
    <div className="flex min-h-full items-center justify-center bg-[radial-gradient(circle,var(--border-strong)_1px,transparent_1.2px)] bg-[length:20px_20px] p-6">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface px-8 py-10 text-center shadow-raised">
        <Brand className="flex-col gap-4 text-2xl [&_svg]:size-14" />
        <p className="mx-auto mt-3 text-sm text-pretty text-muted-foreground">
          Architecture diagrams for AWS, Azure, GCP and Kubernetes.
        </p>
        {message ? (
          <div
            role="alert"
            className="mt-6 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-left text-sm text-danger"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{message}</span>
          </div>
        ) : null}
        <a
          href="/auth/login"
          className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'mt-8 w-full')}
        >
          Sign in
        </a>
      </div>
    </div>
  )
}
