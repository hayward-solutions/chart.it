import { Command } from 'cmdk'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useMemo } from 'react'
import type { EditorCommand } from './commands'
import { useEditorStore, useEditorStoreApi } from './context'
import { formatShortcut } from './shortcuts'

type Props = { commands: EditorCommand[] }

export function CommandPalette({ commands }: Props) {
  const store = useEditorStoreApi()
  const open = useEditorStore((state) => state.paletteOpen)
  const readOnly = useEditorStore((state) => state.readOnly)

  const groups = useMemo(() => {
    if (!open) {
      return []
    }
    const state = store.getState()
    const grouped = new Map<string, EditorCommand[]>()
    for (const command of commands) {
      if (command.hidden || (readOnly && command.mutates)) {
        continue
      }
      if (command.enabled && !command.enabled(state)) {
        continue
      }
      const list = grouped.get(command.group)
      if (list) {
        list.push(command)
      } else {
        grouped.set(command.group, [command])
      }
    }
    return [...grouped.entries()]
  }, [commands, open, readOnly, store])

  const close = () => {
    store.getState().setPaletteOpen(false)
  }

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        store.getState().setPaletteOpen(next)
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/35 animate-[overlay-in_120ms_ease-out]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
          }}
          className="fixed left-1/2 top-[16%] z-50 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface text-foreground shadow-popover outline-none animate-[pop-in_140ms_ease-out]"
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <Command label="Command palette" loop>
            <Command.Input
              autoFocus
              placeholder="Type a command"
              className="h-12 w-full border-b border-border bg-transparent px-4 text-[15px] outline-none placeholder:text-muted-foreground"
            />
            <Command.List className="max-h-80 overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
                No matching commands
              </Command.Empty>
              {groups.map(([group, items]) => (
                <Command.Group
                  key={group}
                  heading={group}
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase"
                >
                  {items.map((command) => (
                    <Command.Item
                      key={command.id}
                      value={command.title}
                      keywords={command.keywords}
                      onSelect={() => {
                        close()
                        setTimeout(() => {
                          command.run()
                        }, 0)
                      }}
                      className="flex cursor-default items-center justify-between gap-4 rounded-md px-2.5 py-2 text-[13px] outline-none data-[selected=true]:bg-accent-soft data-[selected=true]:text-foreground"
                    >
                      <span className="truncate">{command.title}</span>
                      {command.shortcut ? (
                        <kbd className="shrink-0 rounded border border-border bg-surface-muted px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted-foreground shadow-xs">
                          {formatShortcut(command.shortcut)}
                        </kbd>
                      ) : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
