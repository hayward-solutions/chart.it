import { LogOut } from 'lucide-react'
import { Avatar } from 'radix-ui'
import { useState } from 'react'
import { postLogout, useMe } from '@/api'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui'

function initials(name: string, email: string): string {
  const source = name.trim() || email.trim()
  const parts = source.split(/\s+/).filter(Boolean)
  const letters =
    parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : source.slice(0, 2)
  return letters.toUpperCase() || '?'
}

export function UserMenu() {
  const me = useMe()
  const [busy, setBusy] = useState(false)
  const user = me.data

  const logout = async () => {
    setBusy(true)
    try {
      await postLogout()
    } finally {
      window.location.reload()
    }
  }

  if (!user) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Avatar.Root className="inline-flex size-8 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-xs font-semibold text-accent">
          {user.avatarUrl ? (
            <Avatar.Image src={user.avatarUrl} alt="" className="size-full object-cover" />
          ) : null}
          <Avatar.Fallback>{initials(user.name, user.email)}</Avatar.Fallback>
        </Avatar.Root>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">{user.name || user.email}</span>
          {user.name ? <span className="font-normal">{user.email}</span> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={busy} onSelect={() => void logout()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
