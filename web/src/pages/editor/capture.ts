import { toPng } from 'html-to-image'

const THUMBNAIL_MAX_WIDTH = 400
const THUMBNAIL_PIXEL_RATIO = 0.5

const CHROME_CLASSES = ['react-flow__minimap', 'react-flow__controls', 'react-flow__panel']

export function findFlowElement(root: ParentNode | null): HTMLElement | null {
  if (!root) {
    return null
  }
  return root.querySelector<HTMLElement>('.react-flow')
}

function isChrome(node: Node): boolean {
  return (
    node.nodeType === 1 &&
    CHROME_CLASSES.some((name) => (node as HTMLElement).classList.contains(name))
  )
}

export function captureThumbnail(element: HTMLElement): Promise<string> {
  const width = element.clientWidth || THUMBNAIL_MAX_WIDTH / THUMBNAIL_PIXEL_RATIO
  const pixelRatio = Math.min(THUMBNAIL_PIXEL_RATIO, THUMBNAIL_MAX_WIDTH / width)
  return toPng(element, { pixelRatio, cacheBust: false, filter: (node) => !isChrome(node) })
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload = ''] = dataUrl.split(',')
  const type = /data:([^;,]+)/.exec(header ?? '')?.[1] ?? 'application/octet-stream'
  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type })
}

export function slugify(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'diagram'
}
