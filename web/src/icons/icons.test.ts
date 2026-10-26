import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_RECENT_ICONS,
  RECENT_ICONS_KEY,
  createIconIndex,
  createIconLookup,
  findIcon,
  groupByCategory,
  humanizeCategory,
  iconUrl,
  loadManifest,
  pushRecentIcon,
  resetManifestCache,
  shortTitle,
  searchIcons,
} from '.'
import { fixtureManifest } from './testing'

afterEach(() => {
  resetManifestCache()
  window.localStorage.clear()
})

describe('loadManifest', () => {
  it('fetches the manifest once and caches the promise', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(fixtureManifest)))
    vi.stubGlobal('fetch', fetchMock)
    const [first, second] = await Promise.all([loadManifest(), loadManifest()])
    await loadManifest()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/icons/manifest.json')
    expect(first.icons).toHaveLength(fixtureManifest.icons.length)
    expect(second).toBe(first)
    vi.unstubAllGlobals()
  })

  it('does not cache a failed request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockResolvedValueOnce(Response.json(fixtureManifest))
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadManifest()).rejects.toThrow(/500/)
    await expect(loadManifest()).resolves.toMatchObject({
      generatedAt: fixtureManifest.generatedAt,
    })
    vi.unstubAllGlobals()
  })
})

describe('searchIcons', () => {
  const index = createIconIndex(fixtureManifest)

  it('ranks title matches first', () => {
    const results = searchIcons(index, 'ec2')
    expect(results[0]?.id).toBe('ec2')
  })

  it('matches search terms', () => {
    const ids = searchIcons(index, 'serverless').map((icon) => icon.id)
    expect(ids).toContain('lambda')
  })

  it('filters by pack and kind', () => {
    const azure = searchIcons(index, 'virtual', { pack: 'azure' })
    expect(azure.every((icon) => icon.pack === 'azure')).toBe(true)
    expect(azure.map((icon) => icon.id)).toContain('virtual-machine')
    const groups = searchIcons(index, 'vpc', { kind: 'group' })
    expect(groups.map((icon) => icon.id)).toEqual(['group-vpc'])
  })

  it('returns filtered icons for an empty query and honours the limit', () => {
    expect(searchIcons(index, '  ', { pack: 'aws' })).toHaveLength(4)
    expect(searchIcons(index, '', { limit: 2 })).toHaveLength(2)
  })

  it('returns nothing for gibberish', () => {
    expect(searchIcons(index, 'zzzzqqqq')).toEqual([])
  })
})

describe('helpers', () => {
  it('builds icon urls from the manifest file', () => {
    const icon = fixtureManifest.icons[0]!
    expect(iconUrl(icon)).toBe('/icons/aws/compute/ec2.svg')
  })

  it('looks icons up by pack and id, falling back to the group variant', () => {
    expect(createIconLookup(fixtureManifest).get('aws/ec2')?.title).toBe('Amazon EC2')
    expect(findIcon(fixtureManifest, { pack: 'aws', id: 'vpc' })?.id).toBe('group-vpc')
    expect(findIcon(fixtureManifest, { pack: 'aws', id: 'missing' })).toBeUndefined()
    expect(findIcon(undefined, { pack: 'aws', id: 'ec2' })).toBeUndefined()
  })

  it('groups by category alphabetically with readable labels', () => {
    const groups = groupByCategory(fixtureManifest.icons.filter((icon) => icon.pack === 'aws'))
    expect(groups.map((group) => group.category)).toEqual(['compute', 'groups', 'storage'])
    expect(groups[0]?.icons.map((icon) => icon.id)).toEqual(['ec2', 'lambda'])
    expect(humanizeCategory('networking-content-delivery')).toBe('Networking Content Delivery')
    expect(shortTitle('Amazon EC2')).toBe('EC2')
    expect(shortTitle('AWS Lambda')).toBe('Lambda')
    expect(shortTitle('Pod')).toBe('Pod')
  })
})

describe('recent icons', () => {
  const make = (id: string) => ({ pack: 'aws', id, title: id, kind: 'service' })

  it('puts the latest first, de-duplicates and caps at the maximum', () => {
    pushRecentIcon(make('a'))
    pushRecentIcon(make('b'))
    pushRecentIcon(make('a'))
    const stored = JSON.parse(window.localStorage.getItem(RECENT_ICONS_KEY) ?? '[]') as {
      id: string
    }[]
    expect(stored.map((item) => item.id)).toEqual(['a', 'b'])
    for (let n = 0; n < MAX_RECENT_ICONS + 10; n += 1) {
      pushRecentIcon(make(`icon-${n}`))
    }
    const capped = JSON.parse(window.localStorage.getItem(RECENT_ICONS_KEY) ?? '[]') as unknown[]
    expect(capped).toHaveLength(MAX_RECENT_ICONS)
  })
})
