import { CornerDownRight, Slash, Spline } from 'lucide-react'
import type { Edge, EdgeType, MarkerKind, StrokeStyle } from '@/model'
import type { EditorApi } from './api'
import { ArrangeSection } from './ArrangeSection'
import { EDGE_DEFAULTS } from './defaults'
import { ColorPicker } from './ui/ColorPicker'
import { CompactSelect } from './ui/CompactSelect'
import { DraftInput } from './ui/DraftInput'
import { MarkerPreview } from './ui/MarkerPreview'
import { NumberField } from './ui/NumberField'
import { Field, Section } from './ui/Section'
import { SegmentedControl } from './ui/SegmentedControl'
import { SliderField } from './ui/SliderField'

const TYPE_OPTIONS = [
  { value: 'orthogonal', label: 'Orthogonal', content: <CornerDownRight /> },
  { value: 'straight', label: 'Straight', content: <Slash /> },
  { value: 'bezier', label: 'Curved', content: <Spline /> },
] as const satisfies readonly { value: EdgeType; label: string; content: React.ReactNode }[]

const MARKER_LABELS: Record<MarkerKind, string> = {
  none: 'No marker',
  arrow: 'Arrow',
  openArrow: 'Open arrow',
  diamond: 'Diamond',
  circle: 'Circle',
}

const MARKER_KINDS: readonly MarkerKind[] = ['none', 'arrow', 'openArrow', 'diamond', 'circle']

const DASH_OPTIONS: readonly { value: StrokeStyle; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
]

function markerOptions(flip: boolean) {
  return MARKER_KINDS.map((kind) => ({
    value: kind,
    label: MARKER_LABELS[kind],
    content: <MarkerPreview kind={kind} flip={flip} className="h-3 w-7" />,
  }))
}

const START_OPTIONS = markerOptions(true)
const END_OPTIONS = markerOptions(false)

type EdgePropertiesProps = { api: EditorApi; edges: Edge[] }

export function EdgeProperties({ api, edges }: EdgePropertiesProps) {
  const first = edges[0]
  if (!first) {
    return null
  }
  const style = { ...EDGE_DEFAULTS, ...first.data.style }
  const patchStyle = (patch: Parameters<EditorApi['updateSelectedEdges']>[0]['style']) =>
    api.updateSelectedEdges({ style: patch })

  return (
    <>
      <Section title="Label">
        <Field label="Text">
          <DraftInput
            aria-label="Label"
            live
            value={first.data.label ?? ''}
            onCommit={(label) => api.updateSelectedEdges({ label })}
          />
        </Field>
        <Field label="Position">
          <SliderField
            ariaLabel="Label position"
            value={Math.round((first.data.labelPosition ?? 0.5) * 100)}
            onChange={(value) => api.updateSelectedEdges({ labelPosition: value / 100 })}
          />
        </Field>
      </Section>

      <Section title="Type">
        <SegmentedControl
          ariaLabel="Connector type"
          value={first.type}
          options={TYPE_OPTIONS}
          onChange={(type) => api.updateSelectedEdges({ type })}
          className="w-full"
        />
      </Section>

      <Section title="Markers">
        <Field label="Start">
          <SegmentedControl
            ariaLabel="Start marker"
            value={first.data.markerStart}
            options={START_OPTIONS}
            onChange={(markerStart) => api.updateSelectedEdges({ markerStart })}
            className="w-full"
          />
        </Field>
        <Field label="End">
          <SegmentedControl
            ariaLabel="End marker"
            value={first.data.markerEnd}
            options={END_OPTIONS}
            onChange={(markerEnd) => api.updateSelectedEdges({ markerEnd })}
            className="w-full"
          />
        </Field>
      </Section>

      <Section title="Style">
        <Field label="Stroke">
          <ColorPicker
            ariaLabel="Stroke"
            value={style.stroke}
            onChange={(stroke) => patchStyle({ stroke })}
          />
        </Field>
        <Field label="Stroke width">
          <NumberField
            ariaLabel="Stroke width"
            value={style.strokeWidth}
            min={0.5}
            max={24}
            step={0.5}
            onChange={(strokeWidth) => patchStyle({ strokeWidth })}
          />
        </Field>
        <Field label="Dash">
          <CompactSelect
            ariaLabel="Stroke dash"
            value={style.strokeStyle}
            options={DASH_OPTIONS}
            onChange={(strokeStyle) => patchStyle({ strokeStyle })}
          />
        </Field>
        <Field label="Opacity">
          <SliderField
            ariaLabel="Opacity"
            value={Math.round(style.opacity * 100)}
            onChange={(value) => patchStyle({ opacity: value / 100 })}
          />
        </Field>
        <Field label="Label size">
          <NumberField
            ariaLabel="Label font size"
            value={style.fontSize}
            min={6}
            max={48}
            onChange={(fontSize) => patchStyle({ fontSize })}
          />
        </Field>
        <Field label="Label colour">
          <ColorPicker
            ariaLabel="Label colour"
            value={style.fontColor}
            allowTransparent={false}
            onChange={(fontColor) => patchStyle({ fontColor })}
          />
        </Field>
        <Field label="Label fill">
          <ColorPicker
            ariaLabel="Label background"
            value={style.labelBackground}
            onChange={(labelBackground) => patchStyle({ labelBackground })}
          />
        </Field>
      </Section>

      <ArrangeSection api={api} showAlign={false} />
    </>
  )
}
