import type { Edge, Node, StrokeStyle } from '@/model'
import type { EditorApi } from './api'
import { ArrangeSection } from './ArrangeSection'
import { resolveNodeStyle } from './defaults'
import { ColorPicker } from './ui/ColorPicker'
import { CompactSelect } from './ui/CompactSelect'
import { DraftInput } from './ui/DraftInput'
import { NumberField } from './ui/NumberField'
import { Field, Section } from './ui/Section'
import { SliderField } from './ui/SliderField'

const DASH_OPTIONS: readonly { value: StrokeStyle; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
]

type MixedPropertiesProps = { api: EditorApi; nodes: Node[]; edges: Edge[] }

export function MixedProperties({ api, nodes, edges }: MixedPropertiesProps) {
  const firstNode = nodes[0]
  if (!firstNode || edges.length === 0) {
    return null
  }
  const nodeStyle = resolveNodeStyle(firstNode)
  const { stroke, strokeWidth, strokeStyle, opacity } = nodeStyle

  const patch = (style: {
    stroke?: string
    strokeWidth?: number
    strokeStyle?: StrokeStyle
    opacity?: number
  }) => {
    api.updateSelectedNodes({ style })
    api.updateSelectedEdges({ style })
  }

  return (
    <>
      <Section title="Label">
        <Field label="Text">
          <DraftInput
            aria-label="Label"
            live
            value={firstNode.data.label}
            onCommit={(label) => {
              api.updateSelectedNodes({ label })
              api.updateSelectedEdges({ label })
            }}
          />
        </Field>
      </Section>
      <Section title="Style">
        <Field label="Stroke">
          <ColorPicker
            ariaLabel="Stroke"
            value={stroke}
            onChange={(value) => patch({ stroke: value })}
          />
        </Field>
        <Field label="Stroke width">
          <NumberField
            ariaLabel="Stroke width"
            value={strokeWidth}
            min={0}
            max={24}
            step={0.5}
            onChange={(value) => patch({ strokeWidth: value })}
          />
        </Field>
        <Field label="Dash">
          <CompactSelect
            ariaLabel="Stroke dash"
            value={strokeStyle}
            options={DASH_OPTIONS}
            onChange={(value) => patch({ strokeStyle: value })}
          />
        </Field>
        <Field label="Opacity">
          <SliderField
            ariaLabel="Opacity"
            value={Math.round(opacity * 100)}
            onChange={(value) => patch({ opacity: value / 100 })}
          />
        </Field>
      </Section>
      <ArrangeSection api={api} />
    </>
  )
}
