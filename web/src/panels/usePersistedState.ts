import { useCallback, useState } from 'react'

function read<T>(key: string, fallback: T, validate?: (value: unknown) => value is T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) {
      return fallback
    }
    const parsed: unknown = JSON.parse(raw)
    if (validate && !validate(parsed)) {
      return fallback
    }
    return parsed as T
  } catch {
    return fallback
  }
}

export function usePersistedState<T>(
  key: string,
  fallback: T,
  validate?: (value: unknown) => value is T,
): [T, (next: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback, validate))
  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      setValue((previous) => {
        const resolved = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved))
        } catch {
          return resolved
        }
        return resolved
      })
    },
    [key],
  )
  return [value, update]
}
