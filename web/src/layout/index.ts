import type { Document } from '@/model'
import type { LayoutOptions } from './elk'
import { routeEdges } from './router'

export type { LayoutOptions } from './elk'

export async function layoutDocument(doc: Document, options: LayoutOptions): Promise<Document> {
  const { layoutDocument: run } = await import('./elk')
  return run(doc, options)
}

export function tidyEdges(doc: Document): Promise<Document> {
  const edges = routeEdges(doc.nodes, doc.edges)
  return Promise.resolve({ ...doc, edges })
}
