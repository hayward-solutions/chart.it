export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const MOD = IS_MAC ? '\u2318' : 'Ctrl+'
export const SHIFT = IS_MAC ? '\u21E7' : 'Shift+'
export const BACKSPACE = IS_MAC ? '\u232B' : 'Del'
