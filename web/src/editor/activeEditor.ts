let active: object | null = null

export function activateEditor(token: object) {
  active = token
}

export function claimEditorIfFree(token: object) {
  if (active === null) {
    active = token
  }
}

export function releaseEditor(token: object) {
  if (active === token) {
    active = null
  }
}

export function isActiveEditor(token: object): boolean {
  return active === token
}
