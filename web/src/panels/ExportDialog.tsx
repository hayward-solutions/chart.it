import { Download } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { Switch } from './ui/Switch'

export type ExportFormat = 'png' | 'svg' | 'pdf' | 'json'
export type ExportScale = 1 | 2 | 4

export type ExportOptions = {
  format: ExportFormat
  scale: ExportScale
  transparent: boolean
  selectionOnly: boolean
  filename: string
}

type ExportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultFilename: string
  hasSelection?: boolean
  onExport: (options: ExportOptions) => void | Promise<void>
}

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'svg', label: 'SVG' },
  { value: 'pdf', label: 'PDF' },
  { value: 'json', label: 'JSON' },
]

const SCALES: ExportScale[] = [1, 2, 4]

const EXTENSIONS: Record<ExportFormat, string> = {
  png: '.png',
  svg: '.svg',
  pdf: '.pdf',
  json: '.json',
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className={cn('flex items-center justify-between gap-4', disabled && 'opacity-50')}>
      <label htmlFor={id} className="min-w-0 text-sm">
        <span className="block font-medium">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}

export function ExportDialog({
  open,
  onOpenChange,
  defaultFilename,
  hasSelection = false,
  onExport,
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('png')
  const [scale, setScale] = useState<ExportScale>(2)
  const [transparent, setTransparent] = useState(false)
  const [selectionOnly, setSelectionOnly] = useState(false)
  const [filename, setFilename] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const filenameId = useId()

  const raster = format === 'png'
  const visual = format !== 'json'
  const name = filename ?? defaultFilename

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim() || defaultFilename
    setBusy(true)
    try {
      await onExport({
        format,
        scale,
        transparent: visual && transparent,
        selectionOnly: visual && hasSelection && selectionOnly,
        filename: trimmed,
      })
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Export diagram"
        description="Download this diagram as an image, document or file."
        hideDescription
        className="max-w-md"
      >
        <form onSubmit={(event) => void submit(event)} className="space-y-5">
          <Tabs value={format} onValueChange={(value) => setFormat(value as ExportFormat)}>
            <TabsList aria-label="Format" className="w-full">
              {FORMATS.map((entry) => (
                <TabsTrigger key={entry.value} value={entry.value} className="flex-1">
                  {entry.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="space-y-1.5">
            <span id={`${filenameId}-scale`} className="text-sm font-medium">
              Scale
            </span>
            <div
              role="group"
              aria-labelledby={`${filenameId}-scale`}
              className={cn(
                'inline-flex h-9 w-full rounded-lg bg-surface-muted p-1',
                !raster && 'opacity-50',
              )}
            >
              {SCALES.map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={!raster}
                  aria-pressed={scale === value}
                  onClick={() => setScale(value)}
                  className={cn(
                    'flex-1 rounded-md text-sm font-medium text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                    scale === value && 'bg-surface text-foreground shadow-card',
                  )}
                >
                  {value}x
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <ToggleRow
              label="Transparent background"
              checked={transparent}
              disabled={!visual}
              onChange={setTransparent}
            />
            <ToggleRow
              label="Selection only"
              hint={hasSelection ? undefined : 'Select something on the canvas first'}
              checked={hasSelection && selectionOnly}
              disabled={!visual || !hasSelection}
              onChange={setSelectionOnly}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={filenameId} className="text-sm font-medium">
              File name
            </label>
            <div className="flex items-center gap-2">
              <Input
                id={filenameId}
                value={name}
                onChange={(event) => setFilename(event.target.value)}
              />
              <span className="shrink-0 text-sm text-muted-foreground">{EXTENSIONS[format]}</span>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="primary" disabled={busy}>
              <Download /> Export
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
