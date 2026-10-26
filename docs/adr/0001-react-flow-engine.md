# 1. React Flow as the canvas engine

Status: accepted

## Context

Chart.it needs an interactive diagram canvas with pan and zoom, node dragging and resizing, nested containers, connection handles, selection, a minimap and a grid. The options considered were:

- a custom SVG engine written for this project
- tldraw
- React Flow (`@xyflow/react`)

A custom engine gives full control but means building hit-testing, pointer handling, viewport maths, selection and accessibility from scratch, which is most of the work in a diagramming tool and none of what makes Chart.it distinct. tldraw is capable, but its licence requires a watermark on the canvas unless a commercial licence is bought, which does not suit a self-hosted tool that is meant to be embedded in the user's own deployment.

## Decision

Use React Flow for the editor canvas. Nodes and edges are registered as custom node and edge types (`icon`, `container`, `shape`, `text`; `orthogonal`, `straight`, `bezier`), and the project owns the data model on top of it.

The document model in `web/src/model` is the source of truth and is independent of React Flow. `web/src/editor/adapters.ts` converts between the document and React Flow nodes and edges, and the zustand store (with zundo for history) holds the document, not the React Flow state. Export (`web/src/export`) and layout (`web/src/layout`) work on the document and do not import React Flow.

## Consequences

- Pan, zoom, drag, selection box, minimap and parent-child node nesting come from the library, so editor work concentrates on shapes, containers, edges and panels.
- The file format is ours. Replacing React Flow later means rewriting `src/editor` and its adapters, not migrating stored diagrams.
- Orthogonal routing with waypoints, marker rendering, and container behaviour (drop to reparent, resize) are implemented in Chart.it code because React Flow only provides primitives for them.
- Thumbnails and the share view still render through React Flow (`EditorCanvas`, with `readOnly` for shared links). Image and document exports do not, so they do not depend on what the browser happens to have rendered.
- The project follows React Flow's release line and its MIT licence; there is no watermark or licence key.
