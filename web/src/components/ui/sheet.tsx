import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export const Sheet = DialogPrimitive.Root
export const SheetClose = DialogPrimitive.Close

type SheetContentProps = Omit<ComponentProps<typeof DialogPrimitive.Content>, 'title'> & {
  title: ReactNode
  description?: ReactNode
  headerActions?: ReactNode
}

export function SheetContent({
  className,
  title,
  description,
  headerActions,
  children,
  ...props
}: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/35 animate-[overlay-in_150ms_ease-out]" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-surface shadow-popover outline-none',
          className,
        )}
        {...(description ? {} : { 'aria-describedby': undefined })}
        {...props}
      >
        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3">
          <DialogPrimitive.Title className="truncate text-base font-semibold tracking-tight text-foreground">
            {title}
          </DialogPrimitive.Title>
          <div className="flex shrink-0 items-center gap-1">
            {headerActions}
            <DialogPrimitive.Close
              aria-label="Close"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          {description ? (
            <DialogPrimitive.Description className="col-span-2 text-xs text-muted-foreground">
              {description}
            </DialogPrimitive.Description>
          ) : null}
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
