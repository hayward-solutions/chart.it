import { findIcon, loadManifest } from '@/icons/manifest'
import type { IconRef } from '@/model'
import type { Rect } from './geometry'

export type IconAsset = {
  file: string
  url: string
  format: 'svg' | 'png'
  svg?: string
  dataUri?: string
}

export type IconLoader = (icon: IconRef) => Promise<IconAsset | null>

const ICON_BASE = '/icons/'
const assetCache = new Map<string, Promise<IconAsset | null>>()

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

async function fetchAsset(file: string, format: 'svg' | 'png'): Promise<IconAsset | null> {
  const url = `${ICON_BASE}${file}`
  const response = await fetch(url)
  if (!response.ok) {
    return null
  }
  if (format === 'png') {
    const data = toBase64(await response.arrayBuffer())
    return { file, url, format, dataUri: `data:image/png;base64,${data}` }
  }
  return { file, url, format, svg: await response.text() }
}

export const defaultIconLoader: IconLoader = async (icon) => {
  try {
    const manifest = await loadManifest()
    const entry = findIcon(manifest, icon)
    if (!entry) {
      return null
    }
    let pending = assetCache.get(entry.file)
    if (!pending) {
      pending = fetchAsset(entry.file, entry.format).catch(() => null)
      assetCache.set(entry.file, pending)
    }
    const asset = await pending
    if (!asset) {
      assetCache.delete(entry.file)
    }
    return asset
  } catch {
    return null
  }
}

export function clearIconCache(): void {
  assetCache.clear()
}

const ROOT = /<svg\b([^>]*)>([\s\S]*)<\/svg\s*>\s*$/i

function numberAttr(attrs: string, name: string): number | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*"([0-9.]+)(?:px)?"`, 'i').exec(attrs)
  return match ? Number(match[1]) : null
}

export function inlineIconSvg(raw: string, prefix: string, box: Rect): string | null {
  const cleaned = raw
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .trim()
  const match = ROOT.exec(cleaned)
  if (!match) {
    return null
  }
  const attrs = match[1] ?? ''
  let inner = match[2] ?? ''
  let viewBox = /\sviewBox\s*=\s*"([^"]+)"/i.exec(attrs)?.[1]
  if (!viewBox) {
    const width = numberAttr(attrs, 'width')
    const height = numberAttr(attrs, 'height')
    if (!width || !height) {
      return null
    }
    viewBox = `0 0 ${width} ${height}`
  }
  const ids = new Set(
    [...inner.matchAll(/\sid\s*=\s*"([^"]+)"/g)].map((entry) => entry[1] as string),
  )
  if (ids.size > 0) {
    inner = inner
      .replace(
        /(\sid\s*=\s*")([^"]+)(")/g,
        (_all, a: string, id: string, c: string) => `${a}${prefix}${id}${c}`,
      )
      .replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g, (all, quote: string, id: string) =>
        ids.has(id) ? `url(${quote}#${prefix}${id}${quote})` : all,
      )
      .replace(/((?:xlink:)?href\s*=\s*")#([^"]+)(")/g, (all, a: string, id: string, c: string) =>
        ids.has(id) ? `${a}#${prefix}${id}${c}` : all,
      )
  }
  const x = round(box.x)
  const y = round(box.y)
  return `<svg x="${x}" y="${y}" width="${round(box.width)}" height="${round(box.height)}" viewBox="${viewBox}" overflow="hidden">${inner}</svg>`
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
