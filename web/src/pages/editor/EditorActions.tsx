import {
  ChevronDown,
  ClipboardCopy,
  Download,
  History,
  Keyboard,
  RefreshCw,
  Save,
  Share2,
  Upload,
} from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from '@/components/ui'
import type { SaveStatus } from '@/panels'
import { LayoutMenu, type LayoutAlgorithm, type LayoutDirection } from './LayoutMenu'

type EditorActionsProps = {
  status: SaveStatus
  layoutBusy: boolean
  onLayout: (algorithm: LayoutAlgorithm, direction: LayoutDirection) => void
  onTidyEdges: () => void
  onResetRoutes: () => void
  onCopyPng: () => void
  onRetry: () => void
  onExport: () => void
  onImport: () => void
  onSaveVersion: () => void
  onHistory: () => void
  onShare: () => void
  onShortcuts: () => void
}

const menuTriggerClass =
  'inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm font-medium text-foreground outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-surface-muted'

export function EditorActions({
  status,
  layoutBusy,
  onLayout,
  onTidyEdges,
  onResetRoutes,
  onCopyPng,
  onRetry,
  onExport,
  onImport,
  onSaveVersion,
  onHistory,
  onShare,
  onShortcuts,
}: EditorActionsProps) {
  return (
    <>
      {status === 'error' ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          <RefreshCw /> Retry
        </Button>
      ) : null}
      <LayoutMenu
        busy={layoutBusy}
        onLayout={onLayout}
        onTidyEdges={onTidyEdges}
        onResetRoutes={onResetRoutes}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={menuTriggerClass}>
            File
            <ChevronDown className="size-3 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-52">
          <DropdownMenuItem onSelect={onExport}>
            <Download /> Export...
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onCopyPng}>
            <ClipboardCopy /> Copy as PNG
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onImport}>
            <Upload /> Import JSON...
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onSaveVersion}>
            <Save /> Save named version...
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onHistory}>
            <History /> Version history
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={menuTriggerClass}>
            Help
            <ChevronDown className="size-3 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-52">
          <DropdownMenuItem onSelect={onShortcuts}>
            <Keyboard /> Keyboard shortcuts
            <span className="flex-1" />
            <kbd className="font-sans text-[10px] text-muted-foreground">?</kbd>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <IconButton label="Version history" size="iconSm" onClick={onHistory}>
        <History />
      </IconButton>
      <Button size="sm" variant="primary" onClick={onShare}>
        <Share2 /> Share
      </Button>
    </>
  )
}
