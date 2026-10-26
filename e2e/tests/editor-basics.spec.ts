import {
  SELECTED,
  addToSelection,
  addShapeByKey,
  canvas,
  canvasBox,
  clearSelection,
  expect,
  expectSaved,
  flowNode,
  flowNodes,
  nodeCenter,
  openNewDiagram,
  savedContent,
  selectNode,
  test,
  uniqueTitle,
  zoomLabel,
  dragBy,
  waitForSaved,
} from '../fixtures'

test.describe.configure({ mode: 'parallel' })

test.describe('editor basics', () => {
  test('places a rectangle and an ellipse with shortcuts', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Shapes'))
    const rect = await addShapeByKey(page, 'r', 220, 200)
    const ellipse = await addShapeByKey(page, 'o', 520, 200)
    await expect(flowNodes(page)).toHaveCount(2)
    await expect(flowNode(page, rect)).toHaveClass(/react-flow__node-shape/)
    await expect(flowNode(page, ellipse)).toHaveClass(/react-flow__node-shape/)

    const content = await savedContent(page)
    const byId = new Map(content.nodes.map((node) => [node.id, node]))
    expect(byId.get(rect)?.data.shape).toBe('rect')
    expect(byId.get(ellipse)?.data.shape).toBe('ellipse')
    expect(byId.get(rect)?.type).toBe('shape')
  })

  test('the toolbar and library add shapes too', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Toolbar shapes'))
    await page.getByRole('toolbar', { name: 'Editor toolbar' }).getByRole('button', { name: 'Shapes', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Diamond' }).click()
    await expect(flowNodes(page)).toHaveCount(1)

    await page.getByRole('tab', { name: 'Shapes' }).click()
    await page.getByRole('group', { name: 'Basic shapes' }).getByRole('button', { name: 'Hexagon' }).click()
    await expect(flowNodes(page)).toHaveCount(2)
    await expectSaved(page, (doc) => doc.nodes.map((node) => node.data.shape).sort().join() === 'diamond,hexagon')
  })

  test('selects and deselects nodes', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Select'))
    const a = await addShapeByKey(page, 'r', 220, 200)
    const b = await addShapeByKey(page, 'r', 520, 200)

    await selectNode(page, a)
    await expect(flowNode(page, b)).not.toHaveClass(SELECTED)
    await selectNode(page, b)
    await expect(flowNode(page, a)).not.toHaveClass(SELECTED)

    await clearSelection(page)
    await expect(flowNode(page, b)).not.toHaveClass(SELECTED)
    await expect(page.getByRole('complementary', { name: 'Properties' }).getByText('Background')).toBeVisible()

    await selectNode(page, a)
    await addToSelection(page, b)
    await expect(flowNode(page, a)).toHaveClass(SELECTED)
    await expect(page.getByRole('complementary', { name: 'Properties' }).getByText('2 objects selected')).toBeVisible()
  })

  test('moves a selected node with the arrow keys', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Nudge'))
    const id = await addShapeByKey(page, 'r', 300, 260)
    const start = (await savedContent(page)).nodes.find((node) => node.id === id)!.position

    await selectNode(page, id)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Shift+ArrowDown')

    await expectSaved(page, (doc) => {
      const node = doc.nodes.find((entry) => entry.id === id)
      return node?.position.x === start.x + 3 && node.position.y === start.y + 10
    })
  })

  test('moves a node by dragging it', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Drag'))
    const id = await addShapeByKey(page, 'r', 300, 260)
    const start = (await savedContent(page)).nodes.find((node) => node.id === id)!.position
    const { x, y } = await nodeCenter(flowNode(page, id))
    await dragBy(page, { x, y }, 160, 64)
    await expectSaved(page, (doc) => {
      const node = doc.nodes.find((entry) => entry.id === id)
      return node !== undefined && Math.abs(node.position.x - (start.x + 160)) <= 16 && Math.abs(node.position.y - (start.y + 64)) <= 16
    })
  })

  test('deletes the selection with the Delete key and the toolbar', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Delete'))
    const a = await addShapeByKey(page, 'r', 220, 200)
    const b = await addShapeByKey(page, 'r', 520, 200)
    await selectNode(page, a)
    await page.keyboard.press('Delete')
    await expect(flowNodes(page)).toHaveCount(1)
    await expect(flowNode(page, a)).toHaveCount(0)

    await selectNode(page, b)
    await page.getByRole('toolbar', { name: 'Editor toolbar' }).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(flowNodes(page)).toHaveCount(0)
    await expectSaved(page, (doc) => doc.nodes.length === 0)
  })

  test('undo and redo through shortcuts and toolbar buttons', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('History'))
    await addShapeByKey(page, 'r', 220, 200)
    await addShapeByKey(page, 'o', 520, 200)
    await expect(flowNodes(page)).toHaveCount(2)

    await page.keyboard.press('ControlOrMeta+z')
    await expect(flowNodes(page)).toHaveCount(1)
    await page.keyboard.press('ControlOrMeta+z')
    await expect(flowNodes(page)).toHaveCount(0)
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect(flowNodes(page)).toHaveCount(1)

    const toolbar = page.getByRole('toolbar', { name: 'Editor toolbar' })
    await toolbar.getByRole('button', { name: 'Redo' }).click()
    await expect(flowNodes(page)).toHaveCount(2)
    await toolbar.getByRole('button', { name: 'Undo' }).click()
    await expect(flowNodes(page)).toHaveCount(1)
    await expect(toolbar.getByRole('button', { name: 'Redo' })).toBeEnabled()
    await expectSaved(page, (doc) => doc.nodes.length === 1)
  })

  test('duplicates the selection with the shortcut', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Duplicate'))
    const id = await addShapeByKey(page, 'o', 300, 260)
    await selectNode(page, id)
    await page.keyboard.press('ControlOrMeta+d')
    await expect(flowNodes(page)).toHaveCount(2)
    await expectSaved(page, (doc) => doc.nodes.length === 2 && doc.nodes.every((node) => node.data.shape === 'ellipse'))
  })

  test('groups and ungroups with shortcuts', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Group'))
    const a = await addShapeByKey(page, 'r', 220, 220)
    const b = await addShapeByKey(page, 'r', 520, 220)
    await selectNode(page, a)
    await addToSelection(page, b)

    await page.keyboard.press('ControlOrMeta+g')
    await expect(canvas(page).locator('.react-flow__node-container')).toHaveCount(1)
    await expectSaved(page, (doc) => {
      const container = doc.nodes.find((node) => node.type === 'container')
      const children = doc.nodes.filter((node) => node.parentId === container?.id)
      return container !== undefined && children.map((node) => node.id).sort().join() === [a, b].sort().join()
    })

    await page.keyboard.press('ControlOrMeta+Shift+g')
    await expect(canvas(page).locator('.react-flow__node-container')).toHaveCount(0)
    await expectSaved(page, (doc) => doc.nodes.length === 2 && doc.nodes.every((node) => node.parentId === undefined))
  })

  test('zoom controls change the zoom level', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Zoom'))
    const toolbar = page.getByRole('toolbar', { name: 'Editor toolbar' })
    await expect(zoomLabel(page)).toHaveText('100%')

    await toolbar.getByRole('button', { name: 'Zoom in' }).click()
    await expect(zoomLabel(page)).not.toHaveText('100%')
    const zoomedIn = parseInt((await zoomLabel(page).textContent()) ?? '0', 10)
    expect(zoomedIn).toBeGreaterThan(100)

    await toolbar.getByRole('button', { name: 'Zoom out' }).click()
    await toolbar.getByRole('button', { name: 'Zoom out' }).click()
    await expect.poll(async () => parseInt((await zoomLabel(page).textContent()) ?? '0', 10)).toBeLessThan(100)

    await zoomLabel(page).click()
    await page.getByRole('menuitem', { name: '150%' }).click()
    await expect(zoomLabel(page)).toHaveText('150%')

    await canvas(page).getByRole('button', { name: 'Zoom to 100%' }).click()
    await expect(zoomLabel(page)).toHaveText('100%')

    await canvas(page).getByRole('button', { name: 'Fit to screen' }).click()
    await expect(zoomLabel(page)).toHaveText(/%$/)
  })

  test('the command palette opens with the keyboard and runs commands', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Palette'))
    await page.keyboard.press('ControlOrMeta+k')
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette).toBeVisible()

    await palette.getByRole('combobox').fill('insert ellipse')
    await page.keyboard.press('Enter')
    await expect(palette).toBeHidden()
    await expect(flowNodes(page)).toHaveCount(1)
    await expectSaved(page, (doc) => doc.nodes.length === 1 && doc.nodes[0]?.data.shape === 'ellipse')

    await page.keyboard.press('ControlOrMeta+k')
    await expect(palette).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(palette).toBeHidden()
  })

  test('the keyboard shortcuts dialog opens with question mark', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Shortcuts'))
    const box = await canvasBox(page)
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.keyboard.press('Shift+?')
    await expect(page.getByRole('dialog', { name: /shortcuts/i })).toBeVisible()
    await page.keyboard.press('Escape')
    await waitForSaved(page)
  })
})
