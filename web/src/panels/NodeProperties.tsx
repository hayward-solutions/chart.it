import { AlignCenter, AlignLeft, AlignRight, Lock, LockOpen } from 'lucide-react'
import { useState } from 'react'
import { Button, Popover, PopoverContent, PopoverTrigger } from '@/components/ui'
import { findIcon, iconKey, useManifest } from '@/icons'
import {
  CONTAINER_KINDS,
  getContainerKind,
  type LabelPosition,
  type Node,
  type StrokeStyle,
  type TextAlign,
} from '@/model'
import type { EditorApi } from './api'
import { ArrangeSection } from './ArrangeSection'
import { FONT_FAMILIES, resolveNodeStyle, weightValue } from './defaults'
import { IconImage } from './IconGrid'
import { IconPicker } from './IconPicker'
import { packLongName } from './packs'
import { ColorPicker } from './ui/ColorPicker'
import { CompactSelect } from './ui/CompactSelect'
import { DraftInput } from './ui/DraftInput'
import { NumberField } from './ui/NumberField'
import { Field, Section } from './ui/Section'
import { SegmentedControl } from './ui/SegmentedControl'
import { SliderField } from './ui/SliderField'
import { Switch } from './ui/Switch'

const LABEL_POSITIONS: readonly { value: LabelPosition; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'inside', label: 'Inside' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
]

const DASH_OPTIONS: readonly { value: StrokeStyle; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
]

const WEIGHT_OPTIONS = [
  { value: '400', label: 'Regular' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semibold' },
  { value: '700', label: 'Bold' },
] as const

const ALIGN_OPTIONS = [
  { value: 'left', label: 'Align text left', content: <AlignLeft /> },
  { value: 'center', label: 'Align text centre', content: <AlignCenter /> },
  { value: 'right', label: 'Align text right', content: <AlignRight /> },
] as const satisfies readonly { value: TextAlign; label: string; content: React.ReactNode }[]

const FONT_OPTIONS = FONT_FAMILIES.map((family) => ({
  value: family,
  label: <span style={{ fontFamily: family }}>{family}</span>,
}))

const CONTAINER_OPTIONS = Object.values(CONTAINER_KINDS).map((spec) => ({
  value: spec.kind,
  label: `${packLongName(spec.kind.split('.')[0] ?? 'generic')}: ${spec.label}`,
}))

type NodePropertiesProps = { api: EditorApi; nodes: Node[] }

export function NodeProperties({ api, nodes }: NodePropertiesProps) {
  const first = nodes[0]
  if (!first) {
    return null
  }
  const style = resolveNodeStyle(first)
  const allIcons = nodes.every((node) => node.type === 'icon')
  const allText = nodes.every((node) => node.type === 'text')
  const hasContainer = nodes.some((node) => node.type === 'container')
  const hasIconish = nodes.some((node) => node.type === 'icon' || node.type === 'container')
  const hasRounded = nodes.some((node) => node.type === 'shape' || node.type === 'container')
  const iconNode = nodes.find((node) => node.data.icon)
  const containerNode = nodes.find((node) => node.type === 'container')
  const locked = first.locked === true
  const patchStyle = (patch: Parameters<EditorApi['updateSelectedNodes']>[0]['style']) =>
    api.updateSelectedNodes({ style: patch })

  return (
    <>
      <Section title="Label">
        <Field label="Text">
          <DraftInput
            aria-label="Label"
            live
            value={first.data.label}
            onCommit={(label) => api.updateSelectedNodes({ label })}
          />
        </Field>
        {allText ? null : (
          <Field label="Position">
            <CompactSelect
              ariaLabel="Label position"
              value={style.labelPosition}
              options={LABEL_POSITIONS}
              onChange={(labelPosition) => patchStyle({ labelPosition })}
            />
          </Field>
        )}
      </Section>

      <Section title="Style">
        {allIcons ? null : (
          <>
            <Field label="Fill">
              <ColorPicker
                ariaLabel="Fill"
                value={style.fill}
                onChange={(fill) => patchStyle({ fill })}
              />
            </Field>
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
                min={0}
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
          </>
        )}
        <Field label="Opacity">
          <SliderField
            ariaLabel="Opacity"
            value={Math.round(style.opacity * 100)}
            onChange={(value) => patchStyle({ opacity: value / 100 })}
          />
        </Field>
        {hasRounded ? (
          <Field label="Radius">
            <NumberField
              ariaLabel="Corner radius"
              value={style.radius}
              min={0}
              max={96}
              onChange={(radius) => patchStyle({ radius })}
            />
          </Field>
        ) : null}
      </Section>

      <Section title="Text">
        <Field label="Font">
          <CompactSelect
            ariaLabel="Font family"
            value={style.fontFamily}
            options={
              FONT_OPTIONS.some((option) => option.value === style.fontFamily)
                ? FONT_OPTIONS
                : [...FONT_OPTIONS, { value: style.fontFamily, label: style.fontFamily }]
            }
            onChange={(fontFamily) => patchStyle({ fontFamily })}
          />
        </Field>
        <Field label="Size">
          <NumberField
            ariaLabel="Font size"
            value={style.fontSize}
            min={6}
            max={96}
            onChange={(fontSize) => patchStyle({ fontSize })}
          />
          <CompactSelect
            ariaLabel="Font weight"
            value={weightValue(style.fontWeight)}
            options={WEIGHT_OPTIONS}
            onChange={(weight) => patchStyle({ fontWeight: Number(weight) })}
          />
        </Field>
        <Field label="Colour">
          <ColorPicker
            ariaLabel="Text colour"
            value={style.fontColor}
            allowTransparent={false}
            onChange={(fontColor) => patchStyle({ fontColor })}
          />
        </Field>
        <Field label="Align">
          <SegmentedControl
            ariaLabel="Text alignment"
            value={style.textAlign}
            options={ALIGN_OPTIONS}
            onChange={(textAlign) => patchStyle({ textAlign })}
          />
        </Field>
      </Section>

      {hasIconish ? <IconSection api={api} node={iconNode} container={hasContainer} /> : null}

      {hasContainer ? (
        <Section title="Container">
          <Field label="Kind">
            <CompactSelect
              ariaLabel="Container kind"
              value={getContainerKind(containerNode?.data.containerKind).kind}
              options={CONTAINER_OPTIONS}
              onChange={(containerKind) => api.updateSelectedNodes({ containerKind })}
            />
          </Field>
        </Section>
      ) : null}

      <Section title="Object">
        <Field label="Locked">
          <Switch aria-label="Locked" checked={locked} onCheckedChange={() => api.toggleLock()} />
          {locked ? (
            <Lock className="size-3.5 text-muted-foreground" />
          ) : (
            <LockOpen className="size-3.5 text-muted-foreground" />
          )}
        </Field>
      </Section>

      <ArrangeSection api={api} />
    </>
  )
}

type IconSectionProps = { api: EditorApi; node: Node | undefined; container: boolean }

function IconSection({ api, node, container }: IconSectionProps) {
  const [open, setOpen] = useState(false)
  const manifest = useManifest().data
  const ref = node?.data.icon
  const icon = ref ? findIcon(manifest, ref) : undefined
  return (
    <Section title={container ? 'Badge' : 'Icon'}>
      <div className="flex items-center gap-2">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-background">
          {icon ? <IconImage icon={icon} className="size-7 object-contain" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-foreground">
            {icon ? icon.title : ref ? ref.id : 'No icon'}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {ref
              ? `${packLongName(ref.pack)}${icon ? ` / ${iconKey(icon)}` : ''}`
              : 'Pick one to set it'}
          </p>
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" className="h-7 px-2 text-xs">
              Change…
            </Button>
          </PopoverTrigger>
          <PopoverContent side="left" align="start" className="w-80 p-2.5">
            <IconPicker
              onPick={(picked) => {
                api.updateSelectedNodes({ icon: { pack: picked.pack, id: picked.id } })
                setOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </Section>
  )
}
