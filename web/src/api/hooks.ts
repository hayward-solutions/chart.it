import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import * as endpoints from './endpoints'
import { isApiError } from './client'
import type {
  CreateDocumentInput,
  DocumentMeta,
  DocumentRecord,
  ListDocumentsParams,
  SaveContentInput,
  UpdateDocumentMetaInput,
} from './types'

export const queryKeys = {
  me: ['me'] as const,
  documents: ['documents'] as const,
  documentList: (params: ListDocumentsParams) => ['documents', 'list', params] as const,
  document: (id: string) => ['documents', 'detail', id] as const,
  versions: (id: string) => ['documents', id, 'versions'] as const,
  version: (id: string, version: number) => ['documents', id, 'versions', version] as const,
  shares: (id: string) => ['documents', id, 'shares'] as const,
  shared: (token: string) => ['shared', token] as const,
  templates: ['templates'] as const,
}

function retryUnlessClientError(failureCount: number, error: Error): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) {
    return false
  }
  return failureCount < 2
}

function invalidateLists(client: QueryClient) {
  return client.invalidateQueries({ queryKey: [...queryKeys.documents, 'list'] })
}

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => endpoints.getMe(signal),
    retry: false,
    staleTime: 5 * 60_000,
  })
}

export function useDocuments(
  params: ListDocumentsParams = {},
  options: { refetchOnMount?: boolean | 'always' } = {},
) {
  return useQuery({
    queryKey: queryKeys.documentList(params),
    queryFn: ({ signal }) => endpoints.listDocuments(params, signal),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
    refetchOnMount: options.refetchOnMount,
  })
}

export function useDocument(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.document(id ?? ''),
    queryFn: ({ signal }) => endpoints.getDocument(id as string, signal),
    enabled: Boolean(id),
    retry: retryUnlessClientError,
  })
}

export function useLoadedDocument(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.document(id ?? ''),
    queryFn: ({ signal }) => endpoints.getDocument(id as string, signal),
    enabled: Boolean(id),
    retry: retryUnlessClientError,
    refetchOnMount: 'always',
  })
}

export function useCreateDocument() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateDocumentInput) => endpoints.createDocument(input),
    onSuccess: (doc) => {
      client.setQueryData(queryKeys.document(doc.id), doc)
      return invalidateLists(client)
    },
  })
}

export function useUpdateDocumentMeta() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateDocumentMetaInput & { id: string }) =>
      endpoints.updateDocumentMeta(id, patch),
    onSuccess: (meta: DocumentMeta) => {
      client.setQueryData<DocumentRecord>(queryKeys.document(meta.id), (current) =>
        current ? { ...current, ...meta } : current,
      )
      return invalidateLists(client)
    },
  })
}

export function useDeleteDocument() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => endpoints.deleteDocument(id),
    onSuccess: (_data, id) => {
      client.removeQueries({ queryKey: queryKeys.document(id) })
      return invalidateLists(client)
    },
  })
}

export function useRestoreDocument() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => endpoints.restoreDocument(id),
    onSuccess: () => invalidateLists(client),
  })
}

export function useDuplicateDocument() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => endpoints.duplicateDocument(id),
    onSuccess: () => invalidateLists(client),
  })
}

export function useSaveContent() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: SaveContentInput & { id: string }) =>
      endpoints.saveContent(id, input),
    onSuccess: (result, variables) => {
      client.setQueryData<DocumentRecord>(queryKeys.document(variables.id), (current) =>
        current
          ? {
              ...current,
              content: variables.content,
              title: variables.content.title,
              version: result.version,
              updatedAt: result.updatedAt,
            }
          : current,
      )
      void client.invalidateQueries({ queryKey: queryKeys.versions(variables.id) })
      return invalidateLists(client)
    },
  })
}

export function useVersions(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.versions(id ?? ''),
    queryFn: ({ signal }) => endpoints.listVersions(id as string, signal),
    enabled: Boolean(id),
  })
}

export function useVersion(id: string | undefined, version: number | undefined) {
  return useQuery({
    queryKey: queryKeys.version(id ?? '', version ?? 0),
    queryFn: ({ signal }) => endpoints.getVersion(id as string, version as number, signal),
    enabled: Boolean(id) && version !== undefined,
    staleTime: Infinity,
  })
}

export function useRestoreVersion() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      endpoints.restoreVersion(id, version),
    onSuccess: (_result, { id }) => {
      void client.invalidateQueries({ queryKey: queryKeys.versions(id) })
      void client.invalidateQueries({ queryKey: queryKeys.document(id) })
      return invalidateLists(client)
    },
  })
}

export function useShares(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.shares(id ?? ''),
    queryFn: ({ signal }) => endpoints.listShares(id as string, signal),
    enabled: Boolean(id),
  })
}

export function useCreateShare() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => endpoints.createShare(id),
    onSuccess: (_share, id) => client.invalidateQueries({ queryKey: queryKeys.shares(id) }),
  })
}

export function useRevokeShare() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, token }: { id: string; token: string }) => endpoints.revokeShare(id, token),
    onSuccess: (_data, { id }) => client.invalidateQueries({ queryKey: queryKeys.shares(id) }),
  })
}

export function useTemplates() {
  return useQuery({
    queryKey: queryKeys.templates,
    queryFn: ({ signal }) => endpoints.listTemplates(signal),
    staleTime: 10 * 60_000,
  })
}

export function useSharedDocument(token: string | undefined) {
  return useQuery({
    queryKey: queryKeys.shared(token ?? ''),
    queryFn: ({ signal }) => endpoints.getSharedDocument(token as string, signal),
    enabled: Boolean(token),
    retry: retryUnlessClientError,
  })
}
