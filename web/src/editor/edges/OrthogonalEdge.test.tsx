import { ReactFlowProvider, type EdgeProps } from '@xyflow/react'
import { render } from '@testing-library/react'
import type { EditorFlowEdge } from '../adapters'
import { EditorProvider } from '../EditorProvider'
import { buildSampleDocument } from '../sample'
import { OrthogonalEdge } from './OrthogonalEdge'
import { OVERLAY_LAYER } from './layers'

function props(overrides: Partial<EdgeProps<EditorFlowEdge>> = {}): EdgeProps<EditorFlowEdge> {
  return {
    id: 'e-alb-a',
    source: 'alb',
    target: 'ec2-a',
    type: 'orthogonal',
    selected: false,
    selectable: true,
    deletable: true,
    animated: false,
    sourceX: 400,
    sourceY: 300,
    targetX: 700,
    targetY: 420,
    sourcePosition: 'right',
    targetPosition: 'left',
    data: {
      markerStart: 'none',
      markerEnd: 'none',
      style: {},
    },
    ...overrides,
  } as EdgeProps<EditorFlowEdge>
}

function renderEdge(edgeProps: EdgeProps<EditorFlowEdge>, readOnly: boolean) {
  return render(
    <EditorProvider document={buildSampleDocument()} readOnly={readOnly}>
      <ReactFlowProvider>
        <svg>
          <OrthogonalEdge {...edgeProps} />
        </svg>
      </ReactFlowProvider>
    </EditorProvider>,
  )
}

describe('OrthogonalEdge', () => {
  it.each([false, true])(
    'draws from the handle positions it is given (readOnly=%s)',
    (readOnly) => {
      const { container } = renderEdge(props(), readOnly)
      const d = container.querySelector('path.react-flow__edge-path')?.getAttribute('d') ?? ''
      expect(d.startsWith('M 400 300')).toBe(true)
      expect(d).toContain('L 700 420')
      const numbers = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
      expect(Math.max(...numbers)).toBeLessThanOrEqual(700)
      expect(Math.min(...numbers)).toBeGreaterThanOrEqual(300)
    },
  )

  it('does not offer segment handles or reset when read only', () => {
    const { container } = renderEdge(props({ selected: true }), true)
    expect(container.querySelector('.chartit-segment-handle')).toBeNull()
  })

  it('places labels and handles above the node layer', () => {
    expect(OVERLAY_LAYER).toBeGreaterThan(100_000)
  })
})
