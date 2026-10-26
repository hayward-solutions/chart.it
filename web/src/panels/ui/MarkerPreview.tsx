import type { MarkerKind } from '@/model'

type MarkerPreviewProps = { kind: MarkerKind; flip?: boolean; className?: string }

export function MarkerPreview({ kind, flip = false, className }: MarkerPreviewProps) {
  return (
    <svg
      viewBox="0 0 28 12"
      width="28"
      height="12"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <g transform={flip ? 'translate(28 0) scale(-1 1)' : undefined}>
        <line x1="2" y1="6" x2={kind === 'none' ? 26 : 20} y2="6" fill="none" />
        {kind === 'arrow' ? <polygon points="19,2 27,6 19,10" /> : null}
        {kind === 'openArrow' ? <polyline points="20,2 26,6 20,10" fill="none" /> : null}
        {kind === 'diamond' ? <polygon points="18,6 22,2.5 26,6 22,9.5" /> : null}
        {kind === 'circle' ? <circle cx="22" cy="6" r="3.2" /> : null}
      </g>
    </svg>
  )
}
