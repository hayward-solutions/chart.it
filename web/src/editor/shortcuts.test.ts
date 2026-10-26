import {
  eventKeyToken,
  formatShortcut,
  isTypingTarget,
  matchesShortcut,
  parseShortcut,
} from './shortcuts'

function key(init: KeyboardEventInit) {
  return new KeyboardEvent('keydown', init)
}

describe('shortcut matching', () => {
  it('parses modifiers and keys', () => {
    expect(parseShortcut('mod+shift+g')).toEqual({ key: 'g', mod: true, shift: true, alt: false })
    expect(parseShortcut('escape')).toEqual({ key: 'escape', mod: false, shift: false, alt: false })
    expect(parseShortcut('mod+]')).toEqual({ key: ']', mod: true, shift: false, alt: false })
  })

  it('uses ctrl on non-mac and cmd on mac', () => {
    const undo = parseShortcut('mod+z')
    expect(matchesShortcut(key({ key: 'z', ctrlKey: true }), undo, false)).toBe(true)
    expect(matchesShortcut(key({ key: 'z', metaKey: true }), undo, false)).toBe(false)
    expect(matchesShortcut(key({ key: 'z', metaKey: true }), undo, true)).toBe(true)
    expect(matchesShortcut(key({ key: 'z', ctrlKey: true }), undo, true)).toBe(false)
  })

  it('distinguishes shift variants', () => {
    const redo = parseShortcut('mod+shift+z')
    const undo = parseShortcut('mod+z')
    const event = key({ key: 'Z', ctrlKey: true, shiftKey: true })
    expect(matchesShortcut(event, redo, false)).toBe(true)
    expect(matchesShortcut(event, undo, false)).toBe(false)
  })

  it('prefers physical codes for brackets, digits and equals', () => {
    expect(eventKeyToken(key({ key: '}', code: 'BracketRight', shiftKey: true }))).toBe(']')
    expect(eventKeyToken(key({ key: '+', code: 'Equal' }))).toBe('=')
    expect(eventKeyToken(key({ key: '1', code: 'Digit1' }))).toBe('1')
    expect(eventKeyToken(key({ key: 'ArrowUp' }))).toBe('arrowup')
  })

  it('formats shortcuts per platform', () => {
    expect(formatShortcut('mod+shift+g', false)).toBe('Ctrl+Shift+G')
    expect(formatShortcut('mod+k', true)).toBe('⌘K')
    expect(formatShortcut('delete', false)).toBe('Del')
  })

  it('detects typing targets', () => {
    const input = document.createElement('input')
    const area = document.createElement('textarea')
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    const div = document.createElement('div')
    expect(isTypingTarget(input)).toBe(true)
    expect(isTypingTarget(area)).toBe(true)
    expect(isTypingTarget(checkbox)).toBe(false)
    expect(isTypingTarget(div)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
