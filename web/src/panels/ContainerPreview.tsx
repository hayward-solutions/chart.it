import { findIcon, type Manifest } from '@/icons'
import type { ContainerKindSpec } from '@/model'
import { IconImage } from './IconGrid'

type ContainerPreviewProps = { spec: ContainerKindSpec; manifest: Manifest | undefined }

export function ContainerPreview({ spec, manifest }: ContainerPreviewProps) {
  const badge = spec.badge ? findIcon(manifest, spec.badge) : undefined
  return (
    <div
      className="relative h-7 w-9 rounded-[3px]"
      style={{
        border: `1.5px ${spec.border} ${spec.colour}`,
        backgroundColor: spec.fill ?? '#ffffff',
      }}
    >
      {badge ? (
        <IconImage icon={badge} className="absolute top-0 left-0 size-3.5 object-contain" />
      ) : null}
    </div>
  )
}
