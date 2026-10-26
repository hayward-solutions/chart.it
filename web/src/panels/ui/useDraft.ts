import { useState } from 'react'

export function useDraft(value: string): [string, (next: string) => void] {
  const [draft, setDraft] = useState(value)
  const [previous, setPrevious] = useState(value)
  if (previous !== value) {
    setPrevious(value)
    setDraft(value)
  }
  return [draft, setDraft]
}
