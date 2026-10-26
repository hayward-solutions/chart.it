import {
  addShapeByKey,
  canvas,
  dragBy,
  expect,
  expectSaved,
  flowNode,
  nodeCenter,
  openNewDiagram,
  properties,
  selectNode,
  test,
  uniqueTitle,
} from '../fixtures'

test.describe.configure({ mode: 'parallel' })

test.describe('properties panel', () => {
  test('changes fill, stroke and font of a shape', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Style'))
    const id = await addShapeByKey(page, 'r', 300, 240)
    await selectNode(page, id)
    const panel = properties(page)

    await panel.getByRole('textbox', { name: 'Label', exact: true }).fill('Styled')
    await expect(flowNode(page, id).getByText('Styled', { exact: true })).toBeVisible()

    const fill = panel.getByRole('textbox', { name: 'Fill hex' })
    await fill.fill('#ff0000')
    await fill.press('Enter')
    const stroke = panel.getByRole('textbox', { name: 'Stroke hex' })
    await stroke.fill('#00aa00')
    await stroke.press('Enter')

    await panel.getByRole('combobox', { name: 'Font family' }).click()
    await page.getByRole('option', { name: 'Georgia' }).click()
    const size = panel.getByRole('textbox', { name: 'Font size', exact: true })
    await size.fill('24')
    await size.press('Enter')
    await panel.getByRole('combobox', { name: 'Font weight' }).click()
    await page.getByRole('option', { name: 'Bold', exact: true }).click()

    await expectSaved(page, (doc) => {
      const style = doc.nodes.find((node) => node.id === id)?.data.style as Record<string, unknown> | undefined
      return (
        String(style?.fill).toLowerCase() === '#ff0000' &&
        String(style?.stroke).toLowerCase() === '#00aa00' &&
        style?.fontFamily === 'Georgia' &&
        style?.fontSize === 24 &&
        Number(style?.fontWeight) === 700
      )
    })

    const path = flowNode(page, id).locator('svg path').first()
    await expect(path).toHaveAttribute('fill', /#ff0000/i)
    await expect(path).toHaveAttribute('stroke', /#00aa00/i)
    const label = flowNode(page, id).getByText('Styled', { exact: true })
    await expect(label).toHaveCSS('font-size', '24px')
    await expect(label).toHaveCSS('font-family', /Georgia/)
    await expect(label).toHaveCSS('font-weight', '700')
  })

  test('picks a fill from the swatches', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Swatch'))
    const id = await addShapeByKey(page, 'o', 300, 240)
    await selectNode(page, id)
    await properties(page).getByRole('button', { name: 'Fill', exact: true }).click()
    const swatches = page.getByRole('group', { name: 'Fill swatches' })
    await expect(swatches).toBeVisible()
    await swatches.getByRole('button').nth(3).click()
    await expectSaved(page, (doc) => {
      const fill = doc.nodes.find((node) => node.id === id)?.data.style.fill
      return typeof fill === 'string' && fill.toLowerCase() !== '#ffffff'
    })
  })

  test('changes the kind of a container', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Container kind'))
    await page.keyboard.press('ControlOrMeta+k')
    await page.getByRole('dialog', { name: 'Command palette' }).getByRole('combobox').fill('Insert container: AWS VPC')
    await page.keyboard.press('Enter')
    const container = canvas(page).locator('.react-flow__node-container')
    await expect(container).toHaveCount(1)
    const id = (await container.getAttribute('data-id'))!
    await expectSaved(page, (doc) => doc.nodes.find((node) => node.id === id)?.data.containerKind === 'aws.vpc')

    const panel = properties(page)
    await expect(panel.getByRole('combobox', { name: 'Container kind' })).toBeVisible()
    await panel.getByRole('combobox', { name: 'Container kind' }).click()
    await page.getByRole('option', { name: 'Kubernetes: Namespace' }).click()

    await expectSaved(page, (doc) => doc.nodes.find((node) => node.id === id)?.data.containerKind === 'k8s.namespace')
    await expect(panel.getByRole('combobox', { name: 'Container kind' })).toContainText('Namespace')
  })

  test('a locked node cannot be dragged and unlocking restores dragging', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Lock'))
    const id = await addShapeByKey(page, 'r', 300, 240)
    await selectNode(page, id)
    const lock = properties(page).getByRole('switch', { name: 'Locked' })
    await lock.click()
    await expect(lock).toBeChecked()
    await expectSaved(page, (doc) => doc.nodes.find((node) => node.id === id)?.locked === true)

    const before = await flowNode(page, id).boundingBox()
    const { x, y } = await nodeCenter(flowNode(page, id))
    await dragBy(page, { x, y }, 140, 90)
    const after = await flowNode(page, id).boundingBox()
    expect(after!.x).toBeCloseTo(before!.x, 0)
    expect(after!.y).toBeCloseTo(before!.y, 0)

    await lock.click()
    await expect(lock).not.toBeChecked()
    const center = await nodeCenter(flowNode(page, id))
    await dragBy(page, { x: center.x, y: center.y }, 140, 90)
    const moved = await flowNode(page, id).boundingBox()
    expect(moved!.x).toBeGreaterThan(before!.x + 100)
    await expectSaved(page, (doc) => doc.nodes.find((node) => node.id === id)?.locked !== true)
  })

  test('changes canvas settings when nothing is selected', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Canvas settings'))
    const panel = properties(page)
    await panel.getByRole('combobox', { name: 'Grid style' }).click()
    await page.getByRole('option', { name: 'Lines' }).click()
    const snap = panel.getByRole('switch', { name: 'Snap to grid' })
    await snap.click()
    await expect(snap).not.toBeChecked()
    await expectSaved(page, (doc) => {
      const settings = doc.settings as { grid: string; snap: boolean }
      return settings.grid === 'lines' && settings.snap === false
    })
  })
})
