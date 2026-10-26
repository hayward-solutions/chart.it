import { useEffect, useRef, useState } from 'react'
import { useBlocker, type Blocker } from 'react-router'
import { ConfirmDialog } from '@/components/ui'
import type { Autosave } from './autosave'
import type { Thumbnailer } from './thumbnail'

type LeaveGuardProps = { autosave: Autosave; thumbnailer: Thumbnailer }

export function LeaveGuard({ autosave, thumbnailer }: LeaveGuardProps) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname &&
      (autosave.isPending() || thumbnailer.isStale()),
  )
  const blockerRef = useRef<Blocker>(blocker)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    blockerRef.current = blocker
  }, [blocker])

  const blocked = blocker.state === 'blocked'

  useEffect(() => {
    if (!blocked) {
      return
    }
    let active = true
    void (async () => {
      const clean = await autosave.flush()
      if (!active) {
        return
      }
      if (clean) {
        await thumbnailer.captureNow()
        if (active && blockerRef.current.state === 'blocked') {
          blockerRef.current.proceed()
        }
      } else {
        setConfirming(true)
      }
    })()
    return () => {
      active = false
    }
  }, [blocked, autosave, thumbnailer])

  const stay = () => {
    setConfirming(false)
    if (blockerRef.current.state === 'blocked') {
      blockerRef.current.reset()
    }
  }

  const leave = () => {
    setConfirming(false)
    if (blockerRef.current.state === 'blocked') {
      blockerRef.current.proceed()
    }
  }

  return (
    <ConfirmDialog
      open={confirming && blocked}
      onOpenChange={(open) => {
        if (!open) {
          stay()
        }
      }}
      title="Unsaved changes"
      description="Your latest changes could not be saved. If you leave now they will be lost."
      confirmLabel="Leave without saving"
      cancelLabel="Stay"
      destructive
      onConfirm={leave}
    />
  )
}
