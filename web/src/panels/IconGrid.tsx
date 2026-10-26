import type { DragEvent } from 'react'
import { iconUrl, shortTitle, type ManifestIcon } from '@/icons'
import { beginDrag, ICON_MIME, toIconPayload } from './drag'
import { LibraryTile, TileGrid } from './LibraryTile'

export function IconImage({
  icon,
  className,
}: {
  icon: Pick<ManifestIcon, 'file'>
  className?: string
}) {
  return (
    <img
      src={iconUrl(icon)}
      alt=""
      width={32}
      height={32}
      loading="lazy"
      draggable={false}
      className={className ?? 'size-8 object-contain'}
    />
  )
}

type IconGridProps = {
  icons: readonly ManifestIcon[]
  onPick: (icon: ManifestIcon) => void
  onDragIcon?: (icon: ManifestIcon) => void
  draggable?: boolean
  label?: string
  showPack?: boolean
}

export function IconGrid({
  icons,
  onPick,
  onDragIcon,
  draggable = true,
  label,
  showPack = false,
}: IconGridProps) {
  return (
    <TileGrid label={label}>
      {icons.map((icon) => (
        <LibraryTile
          key={`${icon.pack}/${icon.id}`}
          label={shortTitle(icon.title)}
          title={showPack ? `${icon.title} (${icon.pack})` : icon.title}
          onActivate={() => onPick(icon)}
          onDragStart={
            draggable
              ? (event: DragEvent<HTMLDivElement>) => {
                  beginDrag(event, ICON_MIME, toIconPayload(icon))
                  onDragIcon?.(icon)
                }
              : undefined
          }
        >
          <IconImage icon={icon} />
        </LibraryTile>
      ))}
    </TileGrid>
  )
}
