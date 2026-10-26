import { Check, Copy, Link2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useCreateShare, useRevokeShare, useShares } from '@/api'
import { Button, Dialog, DialogContent, IconButton, Input, Skeleton } from '@/components/ui'
import { formatRelative } from '@/lib/time'

type ShareDialogProps = {
  documentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function ShareDialog({ documentId, open, onOpenChange }: ShareDialogProps) {
  const shares = useShares(open ? documentId : undefined)
  const create = useCreateShare()
  const revoke = useRevokeShare()
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (url: string, token: string) => {
    if (await copyText(url)) {
      setCopied(token)
      toast.success('Link copied')
      window.setTimeout(() => setCopied((current) => (current === token ? null : current)), 2000)
    } else {
      toast.error('Could not copy the link. Select it and copy manually.')
    }
  }

  const createLink = () =>
    create.mutate(documentId, {
      onSuccess: (share) => {
        void copy(share.url, share.token)
      },
      onError: (error) => toast.error(`Could not create a link: ${error.message}`),
    })

  const revokeLink = (token: string) =>
    revoke.mutate(
      { id: documentId, token },
      {
        onSuccess: () => toast.success('Link revoked'),
        onError: (error) => toast.error(`Could not revoke the link: ${error.message}`),
      },
    )

  let list
  if (shares.isPending) {
    list = (
      <div role="status" aria-label="Loading links" className="space-y-2">
        <Skeleton className="h-12 w-full" />
      </div>
    )
  } else if (shares.isError) {
    list = (
      <p className="text-sm text-danger">
        Could not load links.{' '}
        <button type="button" className="underline" onClick={() => void shares.refetch()}>
          Try again
        </button>
      </p>
    )
  } else if (shares.data.length === 0) {
    list = (
      <p className="rounded-lg border border-dashed border-border-strong px-3 py-4 text-center text-sm text-muted-foreground">
        No links yet. Anyone with a link can view this diagram without signing in.
      </p>
    )
  } else {
    list = (
      <ul className="space-y-2" aria-label="Share links">
        {shares.data.map((share) => (
          <li
            key={share.token}
            className="flex items-center gap-2 rounded-lg border border-border p-2"
          >
            <div className="min-w-0 flex-1">
              <Input
                readOnly
                aria-label="Share link"
                value={share.url}
                className="h-8 text-xs"
                onFocus={(event) => event.currentTarget.select()}
              />
              <p className="mt-1 px-0.5 text-[11px] text-muted-foreground">
                View only, created {formatRelative(share.createdAt)}
              </p>
            </div>
            <IconButton
              label="Copy link"
              size="iconSm"
              onClick={() => void copy(share.url, share.token)}
            >
              {copied === share.token ? <Check /> : <Copy />}
            </IconButton>
            <IconButton
              label="Revoke link"
              size="iconSm"
              disabled={revoke.isPending}
              className="hover:text-danger"
              onClick={() => revokeLink(share.token)}
            >
              <Trash2 />
            </IconButton>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Share diagram"
        description="Create a link that lets anyone view this diagram. They cannot edit it."
        className="max-w-xl"
      >
        <div className="min-h-0 space-y-4 overflow-y-auto">
          <Button variant="primary" disabled={create.isPending} onClick={createLink}>
            <Link2 /> Create view-only link
          </Button>
          {list}
        </div>
      </DialogContent>
    </Dialog>
  )
}
