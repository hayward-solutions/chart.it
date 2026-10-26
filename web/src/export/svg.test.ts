import { describe, expect, it } from 'vitest'
import { SHAPES } from '@/model'
import { renderDocumentSvg, renderDocumentSvgDetailed } from './svg'
import { makeDocument, makeEdge, makeNode, stubIconLoader } from './testing'

function parse(svg: string): Document {
  return new DOMParser().parseFromString(svg, 'image/svg+xml')
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

const options = { loadIcon: stubIconLoader }

function sampleDocument() {
  return makeDocument(
    [
      makeNode({
        id: 'vpc',
        type: 'container',
        containerKind: 'aws.vpc',
        label: 'Production VPC',
        x: 0,
        y: 0,
        width: 400,
        height: 300,
      }),
      makeNode({
        id: 'sub',
        type: 'container',
        containerKind: 'aws.subnet.public',
        label: 'Public subnet',
        x: 20,
        y: 60,
        width: 160,
        height: 200,
        parentId: 'vpc',
        zIndex: 1,
      }),
      makeNode({
        id: 'ec2',
        icon: { pack: 'aws', id: 'ec2' },
        label: 'Web',
        x: 40,
        y: 60,
        parentId: 'sub',
        zIndex: 5,
      }),
      makeNode({
        id: 'rds',
        icon: { pack: 'aws', id: 'rds' },
        label: 'Database',
        x: 260,
        y: 120,
        parentId: 'vpc',
        zIndex: 5,
      }),
    ],
    [
      makeEdge({ id: 'e1', source: 'ec2', target: 'rds', label: 'SQL', zIndex: 3 }),
      makeEdge({
        id: 'e2',
        source: 'rds',
        target: 'ec2',
        sourceHandle: 'left',
        targetHandle: 'right',
        zIndex: 3,
      }),
    ],
  )
}

describe('renderDocumentSvg', () => {
  it('produces a standalone, well-formed svg', async () => {
    const svg = await renderDocumentSvg(sampleDocument(), options)
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    const parsed = parse(svg)
    expect(parsed.querySelector('parsererror')).toBeNull()
    expect(parsed.documentElement.getAttribute('viewBox')).toMatch(/^-?\d+ -?\d+ \d+ \d+$/)
  })

  it('draws containers with the kind colour, dash, fill, badge and title', async () => {
    const svg = await renderDocumentSvg(sampleDocument(), options)
    expect(svg).toContain('stroke="#8C4FFF"')
    expect(svg).toContain('fill="#E9F3E6"')
    expect(svg).toContain('Production VPC')
    const doc = makeDocument([
      makeNode({
        id: 'r',
        type: 'container',
        containerKind: 'aws.region',
        label: 'Region',
        icon: { pack: 'aws', id: 'ec2' },
      }),
    ])
    const dashed = await renderDocumentSvg(doc, options)
    expect(dashed).toContain('stroke-dasharray=')
    expect(dashed).toContain('stroke="#00A4A6"')
    expect(dashed).toContain('<svg x="2" y="2" width="32" height="32"')
  })

  it('lets style override the container kind defaults', async () => {
    const doc = makeDocument([
      makeNode({
        id: 'g',
        type: 'container',
        containerKind: 'aws.vpc',
        label: 'x',
        style: { stroke: '#123456', strokeStyle: 'dashed', fill: '#abcdef' },
      }),
    ])
    const svg = await renderDocumentSvg(doc, options)
    expect(svg).toContain('stroke="#123456"')
    expect(svg).toContain('fill="#abcdef"')
    expect(svg).toContain('stroke-dasharray=')
    expect(svg).not.toContain('#8C4FFF')
  })

  it('inlines icons as nested svg with unique id prefixes', async () => {
    const svg = await renderDocumentSvg(sampleDocument(), options)
    expect(svg).toContain('id="ic0-g"')
    expect(svg).toContain('url(#ic0-g)')
    const prefixes = new Set([...svg.matchAll(/linearGradient id="(ic\d+-)g"/g)].map((m) => m[1]))
    expect(prefixes.size).toBe(count(svg, '<linearGradient'))
    expect(svg).not.toContain('id="g"')
  })

  it('references icon files when inlining is off', async () => {
    const svg = await renderDocumentSvg(sampleDocument(), { ...options, inlineIcons: false })
    expect(svg).toContain('href="/icons/aws/ec2.svg"')
    expect(svg).not.toContain('<linearGradient')
  })

  it('draws a placeholder for missing icons', async () => {
    const doc = makeDocument([
      makeNode({ id: 'm', icon: { pack: 'aws', id: 'missing' }, label: 'Gone' }),
    ])
    const svg = await renderDocumentSvg(doc, options)
    expect(svg).toContain('fill="#e5e7eb"')
    expect(svg).toContain('Gone')
  })

  it('escapes every piece of user text', async () => {
    const evil = `<script>alert("x")</script> & 'q'`
    const doc = makeDocument(
      [
        makeNode({ id: 'a', icon: { pack: 'aws', id: 'ec2' }, label: evil }),
        makeNode({ id: 'b', x: 300, icon: { pack: 'aws', id: 'ec2' }, label: 'B' }),
        makeNode({ id: 'c', type: 'container', containerKind: 'generic', label: evil, y: 200 }),
        makeNode({ id: 'd', type: 'text', label: evil, y: 500, width: 200, height: 30 }),
        makeNode({ id: 'e', type: 'shape', shape: 'rect', label: evil, y: 600 }),
      ],
      [makeEdge({ id: 'x', source: 'a', target: 'b', label: evil })],
      `Title ${evil}`,
    )
    const svg = await renderDocumentSvg(doc, options)
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;script&gt;')
    expect(svg).toContain('&amp;')
    expect(svg).toContain('&#39;q&#39;')
    expect(parse(svg).querySelector('parsererror')).toBeNull()
  })

  it('defines each marker once and reuses it', async () => {
    const doc = makeDocument(
      [makeNode({ id: 'a' }), makeNode({ id: 'b', x: 200 }), makeNode({ id: 'c', x: 400 })],
      [
        makeEdge({ id: 'e1', source: 'a', target: 'b' }),
        makeEdge({ id: 'e2', source: 'b', target: 'c' }),
        makeEdge({
          id: 'e3',
          source: 'a',
          target: 'c',
          markerStart: 'circle',
          markerEnd: 'diamond',
        }),
      ],
    )
    const svg = await renderDocumentSvg(doc, options)
    expect(count(svg, '<marker ')).toBe(3)
    expect(count(svg, 'id="chartit-marker-arrow-end-4b5563"')).toBe(1)
    expect(count(svg, 'marker-end="url(#chartit-marker-arrow-end-4b5563)"')).toBe(2)
    expect(count(svg, '<defs>')).toBe(1)
  })

  it('emits no defs when there are no markers', async () => {
    const svg = await renderDocumentSvg(makeDocument([makeNode({ id: 'a' })]), options)
    expect(svg).not.toContain('<defs>')
  })

  it('renders edge labels with a background rect and honours labelPosition', async () => {
    const doc = makeDocument(
      [makeNode({ id: 'a' }), makeNode({ id: 'b', x: 400 })],
      [
        makeEdge({ id: 'm', source: 'a', target: 'b', label: 'Middle' }),
        makeEdge({ id: 'n', source: 'a', target: 'b', label: 'Near', labelPosition: 0.1 }),
      ],
    )
    const svg = await renderDocumentSvg(doc, options)
    expect(svg).toContain('>Middle</text>')
    expect(svg).toContain('fill-opacity="0.92"')
    const x = (label: string) =>
      Number(new RegExp(`<text x="([\\d.]+)"[^>]*>${label}</text>`).exec(svg)?.[1])
    expect(x('Near')).toBeLessThan(x('Middle'))
  })

  it('renders straight, bezier and waypoint edges', async () => {
    const doc = makeDocument(
      [makeNode({ id: 'a' }), makeNode({ id: 'b', x: 300, y: 200 })],
      [
        makeEdge({ id: 's', source: 'a', target: 'b', type: 'straight' }),
        makeEdge({ id: 'z', source: 'a', target: 'b', type: 'bezier' }),
        makeEdge({
          id: 'w',
          source: 'a',
          target: 'b',
          sourceHandle: 'bottom',
          targetHandle: 'top',
          waypoints: [
            { x: 32, y: 300 },
            { x: 332, y: 300 },
          ],
        }),
      ],
    )
    const svg = await renderDocumentSvg(doc, options)
    expect(svg).toMatch(/<path d="M64 32L300 232"/)
    expect(svg).toMatch(/<path d="M64 32C/)
    expect(svg).toContain('300')
  })

  it('draws all shape kinds, text nodes and styled strokes', async () => {
    const nodes = SHAPES.map((shape, i) =>
      makeNode({
        id: `s${i}`,
        type: 'shape',
        shape: shape.kind,
        label: shape.label,
        x: i * 160,
        width: 140,
        height: 90,
        style: i === 0 ? { strokeStyle: 'dotted', fill: '#111111' } : {},
      }),
    )
    nodes.push(
      makeNode({
        id: 't',
        type: 'text',
        label: 'Some\nnotes',
        y: 200,
        width: 120,
        height: 40,
        style: { fill: '#ffeeaa', stroke: '#000000' },
      }),
    )
    const svg = await renderDocumentSvg(makeDocument(nodes), options)
    expect(count(svg, '<path d=')).toBeGreaterThanOrEqual(SHAPES.length)
    expect(svg).toContain('Rectangle')
    expect(svg).toContain('>notes</text>')
    expect(parse(svg).querySelector('parsererror')).toBeNull()
  })

  it('orders items by z index with parents before children', async () => {
    const svg = await renderDocumentSvg(sampleDocument(), options)
    const at = (id: string, kind = 'node') => svg.indexOf(`data-${kind}-id="${id}"`)
    expect(at('vpc')).toBeLessThan(at('sub'))
    expect(at('sub')).toBeLessThan(at('e1', 'edge'))
    expect(at('e1', 'edge')).toBeLessThan(at('ec2'))
    expect(at('ec2')).toBeLessThan(at('rds'))
  })

  it('pads the bounds and sizes the canvas', async () => {
    const doc = makeDocument([makeNode({ id: 'a', x: 100, y: 100, width: 50, height: 50 })])
    const { svg, width, height } = await renderDocumentSvgDetailed(doc, { ...options, padding: 10 })
    expect(width).toBe(70)
    expect(height).toBe(70)
    expect(svg).toContain('viewBox="90 90 70 70"')
  })

  it('exports only the selection and its descendants', async () => {
    const full = await renderDocumentSvgDetailed(sampleDocument(), options)
    const part = await renderDocumentSvgDetailed(sampleDocument(), {
      ...options,
      selectionIds: ['sub'],
    })
    expect(part.svg).toContain('data-node-id="sub"')
    expect(part.svg).toContain('data-node-id="ec2"')
    expect(part.svg).not.toContain('data-node-id="vpc"')
    expect(part.svg).not.toContain('data-node-id="rds"')
    expect(part.svg).not.toContain('data-edge-id')
    expect(part.width).toBeLessThan(full.width)
  })

  it('keeps edges whose endpoints are both selected', async () => {
    const svg = await renderDocumentSvg(sampleDocument(), {
      ...options,
      selectionIds: ['ec2', 'rds'],
    })
    expect(svg).toContain('data-edge-id="e1"')
  })

  it('handles transparent and explicit backgrounds', async () => {
    const doc = sampleDocument()
    expect(await renderDocumentSvg(doc, options)).toContain('data-role="background"')
    expect(await renderDocumentSvg(doc, { ...options, background: 'transparent' })).not.toContain(
      'data-role="background"',
    )
    const dark = await renderDocumentSvg(doc, { ...options, background: '#0f172a' })
    expect(dark).toContain('fill="#0f172a"')
    expect(dark).toContain('stroke="#9ca3af"')
  })

  it('renders an empty document', async () => {
    const result = await renderDocumentSvgDetailed(makeDocument([]), options)
    expect(result.width).toBeGreaterThan(0)
    expect(parse(result.svg).querySelector('parsererror')).toBeNull()
  })
})
