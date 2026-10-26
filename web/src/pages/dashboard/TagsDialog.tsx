import { X } from 'lucide-react'
import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { useUpdateDocumentMeta, type DocumentSummary } from '@/api'
import { Button, Dialog, DialogClose, DialogContent, DialogFooter, Input } from '@/components/ui'

type TagsDialogProps = {
  doc: DocumentSummary | null
  onClose: () => void
}

function normalise(raw: string): string {
  return raw.trim().toLowerCase()
}

function TagsForm({ doc, onClose }: { doc: DocumentSummary; onClose: () => void }) {
  const [tags, setTags] = useState<string[]>(doc.tags)
  const [draft, setDraft] = useState('')
  const update = useUpdateDocumentMeta()

  const commit = (): string[] => {
    const next = normalise(draft)
    setDraft('')
    if (!next || tags.includes(next)) {
      return tags
    }
    const merged = [...tags, next]
    setTags(merged)
    return merged
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
      setTags(tags.slice(0, -1))
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const final = commit()
    update.mutate(
      { id: doc.id, tags: final },
      {
        onSuccess: onClose,
        onError: (error) => toast.error(`Could not save tags: ${error.message}`),
      },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Input
          aria-label="Add tag"
          placeholder="Type a tag and press Enter"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
          maxLength={40}
        />
        {tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Current tags">
            {tags.map((tag) => (
              <li
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pl-2.5 pr-1 text-xs font-medium text-accent"
              >
                {tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  className="inline-flex size-4 items-center justify-center rounded-full outline-none hover:bg-accent/15 focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setTags(tags.filter((t) => t !== tag))}
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No tags yet.</p>
        )}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="secondary">Cancel</Button>
        </DialogClose>
        <Button type="submit" variant="primary" disabled={update.isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}

export function TagsDialog({ doc, onClose }: TagsDialogProps) {
  return (
    <Dialog open={doc !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Edit tags" className="max-w-md">
        {doc ? <TagsForm key={doc.id} doc={doc} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}
