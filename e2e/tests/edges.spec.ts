import {
  addShapeByKey,
  connectNodes,
  edgeIds,
  edgePoint,
  expect,
  expectSaved,
  handleCenter,
  selectNode,
  flowEdge,
  flowEdges,
  openNewDiagram,
  properties,
  savedContent,
  selectEdge,
  test,
  uniqueTitle,
  waitForSaved,
  dragBy,
  canvas,
  type DocEdge,
} from '../fixtures'

test.describe.configure({ mode: 'parallel' })

async function twoNodes(page: import('@playwright/test').Page, offsetY = 0) {
  const a = await addShapeByKey(page, 'r', 200, 200)
  const b = await addShapeByKey(page, 'r', 560, 200 + offsetY)
  return { a, b }
}

function roundPath(d: string | null): string {
  return (d ?? '').replace(/-?\d+(\.\d+)?/g, (value) => String(Math.round(Number(value))))
}

function edgeOf(doc: { edges: DocEdge[] }, id: string) {
  return doc.edges.find((edge) => edge.id === id)
}

test.describe('edges', () => {
  test('dragging from one handle to another creates an arrowed edge', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Connect'))
    const { a, b } = await twoNodes(page)
    const edge = await connectNodes(page, a, b)

    await expect(flowEdges(page)).toHaveCount(1)
    const path = flowEdge(page, edge).locator('path.react-flow__edge-path').first()
    await expect(path).toHaveAttribute('marker-end', /url\(#.+\)/)

    const content = await savedContent(page)
    const stored = edgeOf(content, edge)!
    expect(stored.source).toBe(a)
    expect(stored.target).toBe(b)
    expect(stored.sourceHandle).toBe('right')
    expect(stored.targetHandle).toBe('left')
    expect(stored.type).toBe('orthogonal')
    expect(stored.data.markerEnd).toBe('arrow')
    expect(stored.data.markerStart).toBe('none')
  })

  test('dropping a connection on empty canvas creates no edge, and duplicates are refused', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('No dangling'))
    const { a, b } = await twoNodes(page)
    await connectNodes(page, a, b)
    await expect(flowEdges(page)).toHaveCount(1)
    const ids = await edgeIds(page)
    expect(ids).toHaveLength(1)

    const from = await handleCenter(page, a, 'right')
    const to = await handleCenter(page, b, 'left')
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 10 })
    await page.mouse.up()
    await expect(flowEdges(page)).toHaveCount(1)

    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 60, from.y + 160, { steps: 10 })
    await page.mouse.up()
    await expect(flowEdges(page)).toHaveCount(1)
  })

  test('changes the connector type and markers in Properties', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Edge props'))
    const { a, b } = await twoNodes(page)
    const edge = await connectNodes(page, a, b)
    await selectEdge(page, edge)

    const panel = properties(page)
    await panel.getByRole('group', { name: 'Connector type' }).getByRole('button', { name: 'Straight' }).click()
    await panel.getByRole('group', { name: 'End marker' }).getByRole('button', { name: 'Open arrow' }).click()
    await panel.getByRole('group', { name: 'Start marker' }).getByRole('button', { name: 'Diamond' }).click()

    await expectSaved(page, (doc) => {
      const stored = edgeOf(doc, edge)
      return stored?.type === 'straight' && stored.data.markerEnd === 'openArrow' && stored.data.markerStart === 'diamond'
    })

    const path = flowEdge(page, edge).locator('path.react-flow__edge-path').first()
    await expect(path).toHaveAttribute('marker-start', /url\(#.+\)/)
    await expect(path).toHaveAttribute('marker-end', /url\(#.+\)/)

    await panel.getByRole('group', { name: 'End marker' }).getByRole('button', { name: 'No marker' }).click()
    await expect(path).not.toHaveAttribute('marker-end', /url/)
    await panel.getByRole('group', { name: 'Connector type' }).getByRole('button', { name: 'Curved' }).click()
    await expectSaved(page, (doc) => {
      const stored = edgeOf(doc, edge)
      return stored?.type === 'bezier' && stored.data.markerEnd === 'none'
    })
  })

  test('styles an edge stroke and dash', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Edge style'))
    const { a, b } = await twoNodes(page)
    const edge = await connectNodes(page, a, b)
    await selectEdge(page, edge)

    const panel = properties(page)
    await panel.getByRole('spinbutton', { name: 'Stroke width' }).or(panel.getByRole('textbox', { name: 'Stroke width' })).fill('5')
    await page.keyboard.press('Enter')
    await panel.getByRole('combobox', { name: 'Stroke dash' }).click()
    await page.getByRole('option', { name: 'Dashed' }).click()

    await expectSaved(page, (doc) => {
      const style = edgeOf(doc, edge)?.data.style
      return style?.strokeWidth === 5 && style.strokeStyle === 'dashed'
    })
  })

  test('adds a label by double-clicking the edge', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Edge label'))
    const { a, b } = await twoNodes(page)
    const edge = await connectNodes(page, a, b)

    const { x, y } = await edgePoint(page, edge)
    await page.mouse.dblclick(x, y)
    const input = canvas(page).getByRole('textbox', { name: 'Edge label' })
    await expect(input).toBeVisible()
    await input.fill('HTTPS')
    await input.press('Enter')
    await expect(canvas(page).getByText('HTTPS', { exact: true })).toBeVisible()

    await expectSaved(page, (doc) => edgeOf(doc, edge)?.data.label === 'HTTPS')

    await selectEdge(page, edge, 0.2)
    await expect(properties(page).getByRole('textbox', { name: 'Label', exact: true })).toHaveValue('HTTPS')
    await properties(page).getByRole('textbox', { name: 'Label', exact: true }).fill('gRPC')
    await expect(canvas(page).getByText('gRPC', { exact: true })).toBeVisible()
    await expectSaved(page, (doc) => edgeOf(doc, edge)?.data.label === 'gRPC')
  })

  test('waypoints persist after a reload', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Waypoints'))
    const { a, b } = await twoNodes(page, 140)
    const edge = await connectNodes(page, a, b)
    await selectEdge(page, edge)

    const handles = canvas(page).locator('.chartit-segment-handle')
    await expect(handles.first()).toBeVisible()
    const count = await handles.count()
    let moved = false
    for (let index = 0; index < count && !moved; index += 1) {
      const handle = handles.nth(index)
      const axis = await handle.getAttribute('data-axis')
      const box = (await handle.boundingBox())!
      const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      if (axis === 'y') {
        await dragBy(page, start, 40, 0)
        moved = true
      }
    }
    expect(moved).toBe(true)

    await expectSaved(page, (doc) => (edgeOf(doc, edge)?.data.waypoints?.length ?? 0) > 0)
    const before = (await savedContent(page)).edges.find((entry) => entry.id === edge)!.data.waypoints!
    const pathBefore = roundPath(await flowEdge(page, edge).locator('path.react-flow__edge-path').first().getAttribute('d'))

    await waitForSaved(page)
    await page.reload()
    await expect(flowEdge(page, edge)).toBeVisible()
    await expect
      .poll(async () => roundPath(await flowEdge(page, edge).locator('path.react-flow__edge-path').first().getAttribute('d')))
      .toBe(pathBefore)

    const after = (await savedContent(page)).edges.find((entry) => entry.id === edge)!.data.waypoints!
    expect(after).toEqual(before)

    await selectEdge(page, edge)
    await canvas(page).getByRole('button', { name: 'Reset route' }).click()
    await expectSaved(page, (doc) => (edgeOf(doc, edge)?.data.waypoints?.length ?? 0) === 0)
  })

  test('deleting a node removes its edges, and undo brings both back', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Cascade'))
    const { a, b } = await twoNodes(page)
    await connectNodes(page, a, b)
    await page.keyboard.press('Escape')
    await selectNode(page, a)
    await page.keyboard.press('Delete')
    await expect(flowEdges(page)).toHaveCount(0)
    await page.keyboard.press('ControlOrMeta+z')
    await expect(flowEdges(page)).toHaveCount(1)
  })
})
