import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { loadManifest, type Manifest } from './manifest'
import { createIconIndex, type IconIndex } from './search'

export const manifestQueryKey = ['icons', 'manifest'] as const

export function useManifest() {
  return useQuery<Manifest>({
    queryKey: manifestQueryKey,
    queryFn: loadManifest,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  })
}

export function useIconIndex(manifest: Manifest | undefined): IconIndex | undefined {
  return useMemo(() => (manifest ? createIconIndex(manifest) : undefined), [manifest])
}
