import type { EditorApi } from './api'
import { ColorPicker } from './ui/ColorPicker'
import { CompactSelect } from './ui/CompactSelect'
import { DraftInput } from './ui/DraftInput'
import { NumberField } from './ui/NumberField'
import { Field, Section } from './ui/Section'
import { Switch } from './ui/Switch'

const GRID_OPTIONS = [
  { value: 'dots', label: 'Dots' },
  { value: 'lines', label: 'Lines' },
  { value: 'none', label: 'None' },
] as const

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const

export function DocumentProperties({ api }: { api: EditorApi }) {
  const { settings, title } = api.document
  return (
    <>
      <Section title="Diagram">
        <Field label="Title">
          <DraftInput
            aria-label="Diagram title"
            value={title}
            onCommit={(next) => api.setTitle(next.trim())}
            validate={(next) => next.trim().length > 0}
          />
        </Field>
      </Section>
      <Section title="Canvas">
        <Field label="Background">
          <ColorPicker
            ariaLabel="Background colour"
            value={settings.background}
            allowTransparent={false}
            onChange={(background) => api.updateSettings({ background })}
          />
        </Field>
        <Field label="Grid">
          <CompactSelect
            ariaLabel="Grid style"
            value={settings.grid}
            options={GRID_OPTIONS}
            onChange={(grid) => api.updateSettings({ grid })}
          />
        </Field>
        <Field label="Grid size">
          <NumberField
            ariaLabel="Grid size"
            value={settings.gridSize}
            min={2}
            max={128}
            step={2}
            suffix="px"
            onChange={(gridSize) => api.updateSettings({ gridSize })}
          />
        </Field>
        <Field label="Snap to grid">
          <Switch
            aria-label="Snap to grid"
            checked={settings.snap}
            onCheckedChange={(snap) => api.updateSettings({ snap })}
          />
        </Field>
        <Field label="Theme">
          <CompactSelect
            ariaLabel="Canvas theme"
            value={settings.theme}
            options={THEME_OPTIONS}
            onChange={(theme) => api.updateSettings({ theme })}
          />
        </Field>
      </Section>
    </>
  )
}
