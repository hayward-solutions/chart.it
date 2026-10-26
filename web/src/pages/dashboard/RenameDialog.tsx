import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { useUpdateDocumentMeta, type DocumentSummary } from '@/api'
import { Button, Dialog, DialogClose, DialogContent, DialogFooter, Input } from '@/components/ui'

type RenameDialogProps = {
  doc: DocumentSummary | null
  onClose: () => void
}

function RenameForm({ doc, onClose }: { doc: DocumentSummary; onClose: () => void }) {
  const [title, setTitle] = useState(doc.title)
  const update = useUpdateDocumentMeta()
  const trimmed = title.trim()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!trimmed) {
      return
    }
    if (trimmed === doc.title) {
      onClose()
      return
    }
    update.mutate(
      { id: doc.id, title: trimmed },
      {
        onSuccess: onClose,
        onError: (error) => toast.error(`Could not rename: ${error.message}`),
      },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Input
        aria-label="Diagram name"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        maxLength={200}
      />
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="secondary">Cancel</Button>
        </DialogClose>
        <Button type="submit" variant="primary" disabled={!trimmed || update.isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}

export function RenameDialog({ doc, onClose }: RenameDialogProps) {
  return (
    <Dialog open={doc !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Rename diagram" className="max-w-md">
        {doc ? <RenameForm key={doc.id} doc={doc} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}
