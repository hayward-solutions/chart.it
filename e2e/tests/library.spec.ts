import {
  addIconFromLibrary,
  canvas,
  canvasBox,
  expect,
  expectSaved,
  flowNode,
  flowNodes,
  openNewDiagram,
  savedContent,
  test,
  uniqueTitle,
  type Page,
} from '../fixtures'

test.describe.configure({ mode: 'parallel' })

function library(page: Page) {
  return page.getByRole('complementary', { name: 'Shape library' })
}

async function searchFor(page: Page, query: string) {
  await library(page).getByRole('textbox', { name: 'Search shapes' }).fill(query)
}

async function expectImageLoaded(page: Page, id: string) {
  const image = flowNode(page, id).locator('img').first()
  await expect(image).toBeVisible()
  await expect
    .poll(async () => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0))
    .toBe(true)
}

test.describe('shape library', () => {
  test('searching ec2 and clicking adds an AWS EC2 icon node whose image loads', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Icon search'))
    const id = await addIconFromLibrary(page, 'ec2', 'Amazon EC2 (aws)')
    await expect(flowNodes(page)).toHaveCount(1)
    await expect(flowNode(page, id)).toHaveClass(/react-flow__node-icon/)
    await expectImageLoaded(page, id)

    const content = await savedContent(page)
    const node = content.nodes.find((entry) => entry.id === id)
    expect(node?.type).toBe('icon')
    expect(node?.data.icon).toEqual({ pack: 'aws', id: 'ec2' })
    expect(node?.data.label).toBe('Amazon EC2')
  })

  test('shows a message when nothing matches', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('No icons'))
    await searchFor(page, 'zzzzqqqqxx')
    await expect(library(page).getByText(/No icons match/)).toBeVisible()
    await library(page).getByRole('button', { name: 'Clear search' }).click()
    await expect(library(page).getByRole('tab', { name: 'AWS' })).toBeVisible()
  })

  test('pack tabs list their icons', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Packs'))
    for (const name of ['Azure', 'GCP', 'K8s', 'AWS']) {
      const tab = library(page).getByRole('tab', { name, exact: false }).first()
      await tab.click()
      await expect(tab).toHaveAttribute('aria-selected', 'true')
      await expect(library(page).getByRole('tabpanel').getByRole('button').first()).toBeVisible()
    }
  })

  test('dragging an icon tile onto the canvas drops a node there', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Icon drag'))
    await searchFor(page, 'ec2')
    const tile = library(page).getByRole('button', { name: 'Amazon EC2 (aws)', exact: true })
    const box = await canvasBox(page)
    await tile.dragTo(page.locator('.react-flow__pane'), { targetPosition: { x: 300, y: 260 } })
    await expect(flowNodes(page)).toHaveCount(1)

    const content = await savedContent(page)
    const node = content.nodes[0]!
    expect(node.data.icon).toEqual({ pack: 'aws', id: 'ec2' })
    const placed = await flowNodes(page).first().boundingBox()
    expect(placed).not.toBeNull()
    expect(Math.abs(placed!.x + placed!.width / 2 - (box.x + 300))).toBeLessThan(40)
    expect(Math.abs(placed!.y + placed!.height / 2 - (box.y + 260))).toBeLessThan(40)
  })

  test('a VPC container from the Shapes tab adopts an icon dropped inside it', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('VPC container'))
    await library(page).getByRole('tab', { name: 'Shapes' }).click()
    const containers = library(page).getByRole('group', { name: 'AWS containers' })
    await containers.getByRole('button', { name: 'VPC container' }).click()
    await expect(canvas(page).locator('.react-flow__node-container')).toHaveCount(1)

    const containerNode = canvas(page).locator('.react-flow__node-container').first()
    const containerBox = (await containerNode.boundingBox())!
    const containerId = (await containerNode.getAttribute('data-id'))!
    const pane = (await canvasBox(page))!

    await library(page).getByRole('tab', { name: 'AWS' }).first().click()
    await searchFor(page, 'ec2')
    const tile = library(page).getByRole('button', { name: 'Amazon EC2 (aws)', exact: true })
    await tile.dragTo(page.locator('.react-flow__pane'), {
      targetPosition: {
        x: containerBox.x + containerBox.width / 2 - pane.x,
        y: containerBox.y + containerBox.height / 2 - pane.y,
      },
    })
    await expect(flowNodes(page)).toHaveCount(2)

    await expectSaved(page, (doc) => {
      const container = doc.nodes.find((node) => node.id === containerId)
      const icon = doc.nodes.find((node) => node.type === 'icon')
      return container?.data.containerKind === 'aws.vpc' && icon?.parentId === containerId
    })
    const content = await savedContent(page)
    const icon = content.nodes.find((node) => node.type === 'icon')!
    expect(icon.position.x).toBeGreaterThanOrEqual(0)
    expect(icon.position.y).toBeGreaterThanOrEqual(0)
  })

  test('dragging an existing icon into a container reparents it', async ({ loggedInPage: page }) => {
    await openNewDiagram(page, uniqueTitle('Reparent'))
    const iconId = await addIconFromLibrary(page, 'ec2', 'Amazon EC2 (aws)')
    await library(page).getByRole('tab', { name: 'Shapes' }).click()
    await library(page).getByRole('group', { name: 'AWS containers' }).getByRole('button', { name: 'VPC container' }).click()
    await expect(canvas(page).locator('.react-flow__node-container')).toHaveCount(1)
    await expectSaved(page, (doc) => doc.nodes.length === 2)
    const content = await savedContent(page)
    const containerId = content.nodes.find((node) => node.type === 'container')!.id
    expect(content.nodes.find((node) => node.id === iconId)?.parentId).toBeUndefined()

    const containerBox = (await flowNode(page, containerId).boundingBox())!
    const iconBox = (await flowNode(page, iconId).boundingBox())!
    const from = { x: iconBox.x + iconBox.width / 2, y: iconBox.y + iconBox.height / 2 }
    const to = { x: containerBox.x + containerBox.width / 2, y: containerBox.y + containerBox.height / 2 }
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 10 })
    await page.mouse.move(to.x, to.y, { steps: 10 })
    await page.mouse.up()

    await expectSaved(page, (doc) => doc.nodes.find((node) => node.id === iconId)?.parentId === containerId)
  })
})
