import { ChevronDown, LayoutDashboard, LoaderCircle } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui'

export type LayoutDirection = 'DOWN' | 'RIGHT'
export type LayoutAlgorithm = 'layered' | 'orthogonal'

type LayoutMenuProps = {
  busy: boolean
  disabled?: boolean
  onLayout: (algorithm: LayoutAlgorithm, direction: LayoutDirection) => void
  onTidyEdges: () => void
  onResetRoutes: () => void
}

const SECTIONS: { algorithm: LayoutAlgorithm; label: string }[] = [
  { algorithm: 'layered', label: 'Auto layout' },
  { algorithm: 'orthogonal', label: 'Orthogonal layout' },
]

const DIRECTIONS: { direction: LayoutDirection; label: string }[] = [
  { direction: 'DOWN', label: 'Top to bottom' },
  { direction: 'RIGHT', label: 'Left to right' },
]

export function LayoutMenu({
  busy,
  disabled,
  onLayout,
  onTidyEdges,
  onResetRoutes,
}: LayoutMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled || busy}
          aria-busy={busy}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm font-medium text-foreground outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-surface-muted"
        >
          {busy ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <LayoutDashboard className="size-4" aria-hidden="true" />
          )}
          Layout
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-52">
        {SECTIONS.map((section) => (
          <div key={section.algorithm} role="group" aria-label={section.label}>
            <DropdownMenuLabel>{section.label}</DropdownMenuLabel>
            {DIRECTIONS.map((entry) => (
              <DropdownMenuItem
                key={entry.direction}
                onSelect={() => onLayout(section.algorithm, entry.direction)}
              >
                {section.label}: {entry.label}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onTidyEdges}>Tidy edges</DropdownMenuItem>
        <DropdownMenuItem onSelect={onResetRoutes}>Reset edge routes</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
