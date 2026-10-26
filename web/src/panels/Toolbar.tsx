import {
  AlignStartVertical,
  BringToFront,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Group,
  Hand,
  LoaderCircle,
  Lock,
  LockOpen,
  MousePointer2,
  Redo2,
  Shapes,
  Trash2,
  Type,
  Undo2,
  Ungroup,
  Waypoints,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { SHAPES } from '@/model'
import type { EditorApi } from './api'
import {
  ALIGN_ACTIONS,
  DISTRIBUTE_ACTIONS,
  MIN_ALIGN,
  MIN_DISTRIBUTE,
  ORDER_ACTIONS,
} from './arrange'
import { TOOL_IDS, TOOL_SHORTCUTS } from './tools'
import { BACKSPACE, MOD, SHIFT } from './ui/platform'
import { ShapePreview } from './ui/ShapePreview'
import { ShortcutHint, ToolbarButton, ToolbarDivider } from './ui/ToolbarButton'

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error' | 'conflict'

const SHAPE_SHORTCUTS: Record<string, string> = {
  rect: TOOL_SHORTCUTS.rect,
  ellipse: TOOL_SHORTCUTS.ellipse,
  diamond: TOOL_SHORTCUTS.diamond,
}

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2] as const

type ToolbarProps = {
  api: EditorApi
  backSlot?: ReactNode
  saveStatus?: SaveStatus
  actions?: ReactNode
  className?: string
}

export function Toolbar({ api, backSlot, saveStatus, actions, className }: ToolbarProps) {
  const { nodes, edges } = api.selection
  const nodeCount = nodes.length
  const total = nodeCount + edges.length
  const selectedIds = new Set(nodes.map((node) => node.id))
  const hasChildren = api.document.nodes.some(
    (node) => node.parentId !== undefined && selectedIds.has(node.parentId),
  )
  const locked = nodes.length > 0 && nodes.every((node) => node.locked === true)

  const tools: { id: string; label: string; shortcut: string; icon: LucideIcon }[] = [
    { id: TOOL_IDS.select, label: 'Select', shortcut: TOOL_SHORTCUTS.select, icon: MousePointer2 },
    { id: TOOL_IDS.pan, label: 'Pan', shortcut: TOOL_SHORTCUTS.pan, icon: Hand },
    { id: TOOL_IDS.text, label: 'Text', shortcut: TOOL_SHORTCUTS.text, icon: Type },
    {
      id: TOOL_IDS.connector,
      label: 'Connector',
      shortcut: TOOL_SHORTCUTS.connector,
      icon: Waypoints,
    },
  ]

  return (
    <header
      role="toolbar"
      aria-label="Editor toolbar"
      className={cn(
        'flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-surface px-2 text-foreground shadow-xs',
        className,
      )}
    >
      {backSlot ? <div className="mr-1 flex shrink-0 items-center">{backSlot}</div> : null}
      <TitleEditor title={api.document.title} onCommit={api.setTitle} />
      {saveStatus ? <SaveIndicator status={saveStatus} /> : null}
      <ToolbarDivider />

      <div role="group" aria-label="Tools" className="flex items-center gap-0.5">
        {tools.slice(0, 3).map(({ id, label, shortcut, icon: Icon }) => (
          <ToolbarButton
            key={id}
            label={label}
            shortcut={shortcut}
            pressed={api.tool === id}
            onClick={() => api.setTool(id)}
          >
            <Icon />
          </ToolbarButton>
        ))}
        <ShapesMenu api={api} />
        {tools.slice(3).map(({ id, label, shortcut, icon: Icon }) => (
          <ToolbarButton
            key={id}
            label={label}
            shortcut={shortcut}
            pressed={api.tool === id}
            onClick={() => api.setTool(id)}
          >
            <Icon />
          </ToolbarButton>
        ))}
      </div>
      <ToolbarDivider />

      <div role="group" aria-label="History" className="flex items-center gap-0.5">
        <ToolbarButton label="Undo" shortcut={`${MOD}Z`} disabled={!api.canUndo} onClick={api.undo}>
          <Undo2 />
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          shortcut={`${SHIFT}${MOD}Z`}
          disabled={!api.canRedo}
          onClick={api.redo}
        >
          <Redo2 />
        </ToolbarButton>
      </div>
      <ToolbarDivider />

      <ZoomControl api={api} />
      <ToolbarDivider />

      <div role="group" aria-label="Arrange" className="flex items-center gap-0.5">
        <ArrangeMenu
          label="Align and distribute"
          icon={AlignStartVertical}
          disabled={nodeCount < MIN_ALIGN}
        >
          <DropdownMenuLabel>Align</DropdownMenuLabel>
          {ALIGN_ACTIONS.map(({ kind, label, icon: Icon }) => (
            <DropdownMenuItem key={kind} onSelect={() => api.align(kind)}>
              <Icon />
              {label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Distribute</DropdownMenuLabel>
          {DISTRIBUTE_ACTIONS.map(({ axis, label, icon: Icon }) => (
            <DropdownMenuItem
              key={axis}
              disabled={nodeCount < MIN_DISTRIBUTE}
              onSelect={() => api.distribute(axis)}
            >
              <Icon />
              {label}
            </DropdownMenuItem>
          ))}
        </ArrangeMenu>
        <ArrangeMenu label="Order" icon={BringToFront} disabled={total < 1}>
          {ORDER_ACTIONS.map(({ op, label, icon: Icon }) => (
            <DropdownMenuItem key={op} onSelect={() => api.order(op)}>
              <Icon />
              {label}
            </DropdownMenuItem>
          ))}
        </ArrangeMenu>
        <ToolbarButton
          label="Group"
          shortcut={`${MOD}G`}
          disabled={nodeCount < 2}
          onClick={api.group}
        >
          <Group />
        </ToolbarButton>
        <ToolbarButton
          label="Ungroup"
          shortcut={`${SHIFT}${MOD}G`}
          disabled={!hasChildren}
          onClick={api.ungroup}
        >
          <Ungroup />
        </ToolbarButton>
      </div>
      <ToolbarDivider />

      <div role="group" aria-label="Object" className="flex items-center gap-0.5">
        <ToolbarButton
          label={locked ? 'Unlock' : 'Lock'}
          shortcut={`${MOD}L`}
          pressed={locked}
          disabled={nodeCount < 1}
          onClick={api.toggleLock}
        >
          {locked ? <Lock /> : <LockOpen />}
        </ToolbarButton>
        <ToolbarButton
          label="Duplicate"
          shortcut={`${MOD}D`}
          disabled={total < 1}
          onClick={api.duplicate}
        >
          <Copy />
        </ToolbarButton>
        <ToolbarButton
          label="Delete"
          shortcut={BACKSPACE}
          disabled={total < 1}
          onClick={api.remove}
          className="hover:text-danger"
        >
          <Trash2 />
        </ToolbarButton>
      </div>

      <div className="min-w-4 flex-1" />
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </header>
  )
}

function ShapesMenu({ api }: { api: EditorApi }) {
  return (
    <DropdownMenu>
      <Tooltip
        content={
          <>
            Shapes
            <ShortcutHint keys={TOOL_SHORTCUTS.rect} />
          </>
        }
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Shapes"
            className="flex h-8 items-center gap-0.5 rounded-md px-1.5 text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-surface-muted [&_svg]:size-4"
          >
            <Shapes />
            <ChevronDown className="size-3! text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="start" className="min-w-52">
        {SHAPES.map((shape) => (
          <DropdownMenuItem key={shape.kind} onSelect={() => api.addShape(shape.kind)}>
            <ShapePreview kind={shape.kind} className="h-5 w-7 text-foreground" />
            <span className="flex-1">{shape.label}</span>
            {SHAPE_SHORTCUTS[shape.kind] ? (
              <kbd className="font-sans text-[10px] text-muted-foreground">
                {SHAPE_SHORTCUTS[shape.kind]}
              </kbd>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type ArrangeMenuProps = { label: string; icon: LucideIcon; disabled: boolean; children: ReactNode }

function ArrangeMenu({ label, icon: Icon, disabled, children }: ArrangeMenuProps) {
  return (
    <DropdownMenu>
      <Tooltip content={label}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={label}
            disabled={disabled}
            className="flex h-8 items-center gap-0.5 rounded-md px-1.5 text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 data-[state=open]:bg-surface-muted [&_svg]:size-4"
          >
            <Icon />
            <ChevronDown className="size-3! text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="start">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}

function ZoomControl({ api }: { api: EditorApi }) {
  const percent = Math.round(api.zoom * 100)
  return (
    <div role="group" aria-label="Zoom" className="flex items-center gap-0.5">
      <ToolbarButton label="Zoom out" shortcut={`${MOD}-`} onClick={api.zoomOut}>
        <ZoomOut />
      </ToolbarButton>
      <DropdownMenu>
        <Tooltip content="Zoom level">
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Zoom level"
              className="flex h-7 min-w-[3.75rem] items-center justify-center gap-0.5 rounded-md bg-surface-muted px-2 text-xs font-medium text-foreground tabular-nums outline-none transition-colors hover:bg-border focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-border"
            >
              {percent}%
              <ChevronDown className="size-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent align="center" className="min-w-36">
          {ZOOM_LEVELS.map((level) => (
            <DropdownMenuItem key={level} onSelect={() => api.zoomTo(level)}>
              {Math.round(level * 100)}%
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={api.fitView}>
            Fit to screen
            <span className="flex-1" />
            <kbd className="font-sans text-[10px] text-muted-foreground">{`${SHIFT}1`}</kbd>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ToolbarButton label="Zoom in" shortcut={`${MOD}+`} onClick={api.zoomIn}>
        <ZoomIn />
      </ToolbarButton>
    </div>
  )
}

type TitleEditorProps = { title: string; onCommit: (title: string) => void }

function TitleEditor({ title, onCommit }: TitleEditorProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const start = () => {
    setDraft(title)
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== title) {
      onCommit(next)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        aria-label="Diagram title"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          } else if (event.key === 'Escape') {
            setDraft(title)
            setEditing(false)
          }
        }}
        className="h-8 w-56 shrink-0 rounded-md border border-accent bg-background px-2 text-[13px] font-semibold text-foreground ring-[3px] ring-ring/25 outline-none"
      />
    )
  }

  return (
    <Tooltip content="Rename diagram">
      <button
        type="button"
        aria-label={`Diagram title: ${title}. Click to rename`}
        onClick={start}
        className="h-8 max-w-64 shrink truncate rounded-md px-2 text-[13px] font-semibold tracking-tight text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        {title}
      </button>
    </Tooltip>
  )
}

const STATUS_COPY: Record<SaveStatus, { text: string; icon: LucideIcon; tone: string }> = {
  saved: { text: 'Saved', icon: Check, tone: 'bg-success-soft text-success' },
  saving: { text: 'Saving', icon: LoaderCircle, tone: 'bg-surface-muted text-muted-foreground' },
  unsaved: {
    text: 'Unsaved changes',
    icon: CircleAlert,
    tone: 'bg-warning-soft text-warning',
  },
  error: { text: 'Save failed', icon: CircleAlert, tone: 'bg-danger-soft text-danger' },
  conflict: { text: 'Conflict', icon: CircleAlert, tone: 'bg-warning-soft text-warning' },
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const { text, icon: Icon, tone } = STATUS_COPY[status]
  return (
    <span
      role="status"
      aria-live="polite"
      data-status={status}
      className={cn(
        'ml-1 flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] leading-none font-medium',
        tone,
      )}
    >
      <Icon className={cn('size-3.5', status === 'saving' && 'animate-spin')} aria-hidden="true" />
      {text}
    </span>
  )
}
