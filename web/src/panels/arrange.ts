import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowUp,
  BringToFront,
  SendToBack,
  type LucideIcon,
} from 'lucide-react'
import type { EditorApi } from './api'

type AlignKind = Parameters<EditorApi['align']>[0]
type DistributeAxis = Parameters<EditorApi['distribute']>[0]
type OrderOp = Parameters<EditorApi['order']>[0]

export const ALIGN_ACTIONS: readonly { kind: AlignKind; label: string; icon: LucideIcon }[] = [
  { kind: 'left', label: 'Align left', icon: AlignStartVertical },
  { kind: 'centerX', label: 'Align centre', icon: AlignCenterVertical },
  { kind: 'right', label: 'Align right', icon: AlignEndVertical },
  { kind: 'top', label: 'Align top', icon: AlignStartHorizontal },
  { kind: 'centerY', label: 'Align middle', icon: AlignCenterHorizontal },
  { kind: 'bottom', label: 'Align bottom', icon: AlignEndHorizontal },
]

export const DISTRIBUTE_ACTIONS: readonly {
  axis: DistributeAxis
  label: string
  icon: LucideIcon
}[] = [
  { axis: 'x', label: 'Distribute horizontally', icon: AlignHorizontalDistributeCenter },
  { axis: 'y', label: 'Distribute vertically', icon: AlignVerticalDistributeCenter },
]

export const ORDER_ACTIONS: readonly { op: OrderOp; label: string; icon: LucideIcon }[] = [
  { op: 'front', label: 'Bring to front', icon: BringToFront },
  { op: 'forward', label: 'Bring forward', icon: ArrowUp },
  { op: 'backward', label: 'Send backward', icon: ArrowDown },
  { op: 'back', label: 'Send to back', icon: SendToBack },
]

export const MIN_ALIGN = 2
export const MIN_DISTRIBUTE = 3
