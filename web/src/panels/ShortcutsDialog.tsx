import { Dialog, DialogContent } from '@/components/ui'
import { MOD, SHIFT } from './ui/platform'

type ShortcutsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Row = { label: string; keys: string }
type Group = { title: string; rows: Row[] }

const GROUPS: Group[] = [
  {
    title: 'Tools',
    rows: [
      { label: 'Select', keys: 'V' },
      { label: 'Pan', keys: 'H' },
      { label: 'Text', keys: 'T' },
      { label: 'Rectangle', keys: 'R' },
      { label: 'Ellipse', keys: 'O' },
      { label: 'Diamond', keys: 'D' },
      { label: 'Connector', keys: 'L' },
      { label: 'Cancel or deselect', keys: 'Esc' },
    ],
  },
  {
    title: 'Edit',
    rows: [
      { label: 'Undo', keys: `${MOD}Z` },
      { label: 'Redo', keys: `${SHIFT}${MOD}Z` },
      { label: 'Cut', keys: `${MOD}X` },
      { label: 'Copy', keys: `${MOD}C` },
      { label: 'Paste', keys: `${MOD}V` },
      { label: 'Duplicate', keys: `${MOD}D` },
      { label: 'Delete', keys: 'Del' },
      { label: 'Select all', keys: `${MOD}A` },
      { label: 'Edit label', keys: 'Enter' },
    ],
  },
  {
    title: 'Arrange',
    rows: [
      { label: 'Group', keys: `${MOD}G` },
      { label: 'Ungroup', keys: `${SHIFT}${MOD}G` },
      { label: 'Bring forward', keys: `${MOD}]` },
      { label: 'Send backward', keys: `${MOD}[` },
      { label: 'Bring to front', keys: `${SHIFT}${MOD}]` },
      { label: 'Send to back', keys: `${SHIFT}${MOD}[` },
      { label: 'Lock or unlock', keys: `${MOD}L` },
      { label: 'Nudge', keys: 'Arrow keys' },
      { label: 'Nudge by 10', keys: `${SHIFT}Arrow keys` },
    ],
  },
  {
    title: 'View',
    rows: [
      { label: 'Zoom in', keys: `${MOD}=` },
      { label: 'Zoom out', keys: `${MOD}-` },
      { label: 'Fit to screen', keys: `${MOD}0` },
      { label: 'Zoom to 100%', keys: `${MOD}1` },
      { label: 'Command palette', keys: `${MOD}K` },
      { label: 'Keyboard shortcuts', keys: '?' },
    ],
  },
]

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Keyboard shortcuts"
        description="Shortcuts work while the canvas has focus."
        hideDescription
        className="max-w-3xl"
      >
        <div className="grid min-h-0 gap-x-8 gap-y-5 overflow-y-auto sm:grid-cols-2">
          {GROUPS.map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </h3>
              <dl className="divide-y divide-border">
                {group.rows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3 py-1.5">
                    <dt className="text-sm">{row.label}</dt>
                    <dd>
                      <kbd className="rounded-md border border-border-strong bg-surface-muted px-1.5 py-0.5 font-sans text-xs text-foreground">
                        {row.keys}
                      </kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
