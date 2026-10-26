import { cn } from '@/lib/cn'
import type { EditorApi } from './api'
import { DocumentProperties } from './DocumentProperties'
import { EdgeProperties } from './EdgeProperties'
import { MixedProperties } from './MixedProperties'
import { NodeProperties } from './NodeProperties'

type PropertiesProps = { api: EditorApi; className?: string }

export function Properties({ api, className }: PropertiesProps) {
  const { nodes, edges } = api.selection
  const count = nodes.length + edges.length
  const mode =
    count === 0 ? 'document' : edges.length === 0 ? 'nodes' : nodes.length === 0 ? 'edges' : 'mixed'

  return (
    <aside
      aria-label="Properties"
      className={cn(
        'flex h-full min-h-0 w-full flex-col overflow-y-auto bg-surface text-xs text-foreground',
        className,
      )}
    >
      {count > 1 ? (
        <p className="border-b border-border bg-surface-muted px-3 py-1.5 text-[11px] text-muted-foreground">
          {count} objects selected
        </p>
      ) : null}
      {mode === 'document' ? <DocumentProperties api={api} /> : null}
      {mode === 'nodes' ? <NodeProperties api={api} nodes={nodes} /> : null}
      {mode === 'edges' ? <EdgeProperties api={api} edges={edges} /> : null}
      {mode === 'mixed' ? <MixedProperties api={api} nodes={nodes} edges={edges} /> : null}
    </aside>
  )
}
