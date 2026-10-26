import { useEffect, useLayoutEffect, useRef } from 'react'
import { claimEditorIfFree, isActiveEditor, releaseEditor } from './activeEditor'
import { parseClipboard, serializeClipboard } from './clipboard'
import type { EditorCommand } from './commands'
import { useEditorStoreApi } from './context'

export type ParsedShortcut = { key: string; mod: boolean; shift: boolean; alt: boolean }

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
}

export function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.toLowerCase().split('+')
  const key = parts.length > 1 && parts[parts.length - 1] === '' ? '+' : (parts.pop() as string)
  return {
    key,
    mod: parts.includes('mod'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
  }
}

const KEY_LABELS: Record<string, string> = {
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  escape: 'Esc',
  delete: 'Del',
  backspace: 'Backspace',
  enter: 'Enter',
  f2: 'F2',
}

export function formatShortcut(shortcut: string, mac = isMacPlatform()): string {
  const parsed = parseShortcut(shortcut)
  const key = KEY_LABELS[parsed.key] ?? parsed.key.toUpperCase()
  const parts: string[] = []
  if (parsed.mod) {
    parts.push(mac ? '⌘' : 'Ctrl')
  }
  if (parsed.alt) {
    parts.push(mac ? '⌥' : 'Alt')
  }
  if (parsed.shift) {
    parts.push(mac ? '⇧' : 'Shift')
  }
  parts.push(key)
  return mac ? parts.join('') : parts.join('+')
}

export function eventKeyToken(event: KeyboardEvent): string {
  const code = event.code
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3).toLowerCase()
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5)
  }
  switch (code) {
    case 'BracketLeft':
      return '['
    case 'BracketRight':
      return ']'
    case 'Equal':
    case 'NumpadAdd':
      return '='
    case 'Minus':
    case 'NumpadSubtract':
      return '-'
    default:
      break
  }
  const key = event.key.toLowerCase()
  if (key === '+') {
    return '='
  }
  return key
}

export function matchesShortcut(
  event: KeyboardEvent,
  parsed: ParsedShortcut,
  mac = isMacPlatform(),
): boolean {
  const mod = mac ? event.metaKey : event.ctrlKey
  const stray = mac ? event.ctrlKey : event.metaKey
  if (stray) {
    return false
  }
  return (
    eventKeyToken(event) === parsed.key &&
    mod === parsed.mod &&
    event.shiftKey === parsed.shift &&
    event.altKey === parsed.alt
  )
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') {
    return true
  }
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset'].includes(type)
  }
  return target.getAttribute('role') === 'textbox'
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest(
      'button, a[href], summary, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"]',
    ) !== null
  )
}

function insideOverlay(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]') !==
      null
  )
}

export function useEditorShortcuts(commands: EditorCommand[], token: object) {
  const store = useEditorStoreApi()
  const commandsRef = useRef(commands)

  useLayoutEffect(() => {
    commandsRef.current = commands
  })

  useEffect(() => {
    claimEditorIfFree(token)
    const parsedCache = new WeakMap<EditorCommand, ParsedShortcut[]>()
    const parsedFor = (command: EditorCommand) => {
      let parsed = parsedCache.get(command)
      if (!parsed) {
        parsed = [command.shortcut, ...(command.aliases ?? [])]
          .filter((value): value is string => Boolean(value))
          .map(parseShortcut)
        parsedCache.set(command, parsed)
      }
      return parsed
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isActiveEditor(token)) {
        return
      }
      const typing = isTypingTarget(event.target)
      const state = store.getState()
      if (
        event.code === 'Space' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !typing &&
        !isInteractiveTarget(event.target) &&
        !insideOverlay(event.target)
      ) {
        event.preventDefault()
        state.setSpaceHeld(true)
        return
      }
      const overlay = insideOverlay(event.target)
      const interactive = isInteractiveTarget(event.target)
      for (const command of commandsRef.current) {
        if (!parsedFor(command).some((parsed) => matchesShortcut(event, parsed))) {
          continue
        }
        if (!command.global && (typing || overlay)) {
          continue
        }
        if (command.global && overlay && !state.paletteOpen) {
          continue
        }
        if (interactive && (event.key === 'Enter' || event.key === ' ')) {
          continue
        }
        if (command.native) {
          return
        }
        if (state.readOnly && command.mutates) {
          continue
        }
        if (command.enabled && !command.enabled(state)) {
          continue
        }
        event.preventDefault()
        command.run()
        return
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        store.getState().setSpaceHeld(false)
      }
    }

    const onBlur = () => {
      store.getState().setSpaceHeld(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      releaseEditor(token)
    }
  }, [store, token])
}

export function useEditorClipboardEvents(token: object) {
  const store = useEditorStoreApi()

  useEffect(() => {
    const eligible = (event: ClipboardEvent) =>
      isActiveEditor(token) && !isTypingTarget(event.target) && !insideOverlay(event.target)

    const onCopy = (event: ClipboardEvent) => {
      if (!eligible(event)) {
        return
      }
      const payload = store.getState().copy()
      if (payload && event.clipboardData) {
        event.clipboardData.setData('text/plain', serializeClipboard(payload))
        event.preventDefault()
      }
    }

    const onCut = (event: ClipboardEvent) => {
      if (!eligible(event) || store.getState().readOnly) {
        return
      }
      const payload = store.getState().cut()
      if (payload && event.clipboardData) {
        event.clipboardData.setData('text/plain', serializeClipboard(payload))
        event.preventDefault()
      }
    }

    const onPaste = (event: ClipboardEvent) => {
      if (!eligible(event) || store.getState().readOnly) {
        return
      }
      const payload =
        parseClipboard(event.clipboardData?.getData('text/plain')) ?? store.getState().clipboard
      if (payload) {
        event.preventDefault()
        store.getState().paste(undefined, payload)
      }
    }

    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCut)
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCut)
      document.removeEventListener('paste', onPaste)
    }
  }, [store, token])
}
