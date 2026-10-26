import type { ShapeKind } from '@/model'

type ShapePreviewProps = { kind: ShapeKind | string; className?: string }

export function ShapePreview({ kind, className }: ShapePreviewProps) {
  return (
    <svg
      viewBox="0 0 40 28"
      width="40"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {renderShape(kind)}
    </svg>
  )
}

function renderShape(kind: string) {
  switch (kind) {
    case 'roundedRect':
      return <rect x="4" y="4" width="32" height="20" rx="6" />
    case 'ellipse':
      return <ellipse cx="20" cy="14" rx="16" ry="10" />
    case 'diamond':
      return <polygon points="20,3 37,14 20,25 3,14" />
    case 'cylinder':
      return (
        <>
          <path d="M5 7a15 4 0 0 1 30 0v14a15 4 0 0 1-30 0z" />
          <path d="M5 7a15 4 0 0 0 30 0" />
        </>
      )
    case 'hexagon':
      return <polygon points="11,4 29,4 37,14 29,24 11,24 3,14" />
    case 'parallelogram':
      return <polygon points="11,4 37,4 29,24 3,24" />
    case 'cloud':
      return <path d="M11 23A6 6 0 0 1 10.5 11A8.5 8.5 0 0 1 26 8.5A6.5 6.5 0 0 1 29 23Z" />
    case 'note':
      return (
        <>
          <polygon points="5,3 28,3 35,10 35,25 5,25" />
          <path d="M28 3v7h7" />
        </>
      )
    default:
      return <rect x="4" y="4" width="32" height="20" />
  }
}
