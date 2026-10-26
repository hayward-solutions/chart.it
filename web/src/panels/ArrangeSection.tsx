import { IconButton } from '@/components/ui'
import type { EditorApi } from './api'
import {
  ALIGN_ACTIONS,
  DISTRIBUTE_ACTIONS,
  MIN_ALIGN,
  MIN_DISTRIBUTE,
  ORDER_ACTIONS,
} from './arrange'
import { Section } from './ui/Section'

type ArrangeSectionProps = { api: EditorApi; showAlign?: boolean }

export function ArrangeSection({ api, showAlign = true }: ArrangeSectionProps) {
  const nodeCount = api.selection.nodes.length
  const total = nodeCount + api.selection.edges.length
  return (
    <Section title="Arrange">
      {showAlign ? (
        <div className="flex flex-wrap items-center gap-0.5">
          <div role="group" aria-label="Align" className="flex gap-0.5">
            {ALIGN_ACTIONS.map(({ kind, label, icon: Icon }) => (
              <IconButton
                key={kind}
                label={label}
                size="iconSm"
                className="size-7"
                disabled={nodeCount < MIN_ALIGN}
                onClick={() => api.align(kind)}
              >
                <Icon />
              </IconButton>
            ))}
          </div>
          <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
          <div role="group" aria-label="Distribute" className="flex gap-0.5">
            {DISTRIBUTE_ACTIONS.map(({ axis, label, icon: Icon }) => (
              <IconButton
                key={axis}
                label={label}
                size="iconSm"
                className="size-7"
                disabled={nodeCount < MIN_DISTRIBUTE}
                onClick={() => api.distribute(axis)}
              >
                <Icon />
              </IconButton>
            ))}
          </div>
        </div>
      ) : null}
      <div role="group" aria-label="Order" className="flex gap-0.5">
        {ORDER_ACTIONS.map(({ op, label, icon: Icon }) => (
          <IconButton
            key={op}
            label={label}
            size="iconSm"
            className="size-7"
            disabled={total < 1}
            onClick={() => api.order(op)}
          >
            <Icon />
          </IconButton>
        ))}
      </div>
    </Section>
  )
}
