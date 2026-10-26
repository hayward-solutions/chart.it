export const TOOL_IDS = {
  select: 'select',
  pan: 'pan',
  text: 'text',
  connector: 'connector',
} as const

export type ToolId = (typeof TOOL_IDS)[keyof typeof TOOL_IDS]

export const TOOL_SHORTCUTS = {
  select: 'V',
  pan: 'H',
  text: 'T',
  connector: 'L',
  rect: 'R',
  ellipse: 'O',
  diamond: 'D',
} as const
