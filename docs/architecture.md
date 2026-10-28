# Architecture

Chart.it is one Go process that serves a JSON API, an authentication flow and an embedded React single-page app, backed by one SQLite file. [AGENTS.md](../AGENTS.md) holds the full HTTP API table and the document schema; this page explains how the parts fit together. Decisions behind the shape are in [docs/adr](adr/).

## Request flow

```
client
  |
  v
chi router (internal/server)
  RequestID -> request logger (slog JSON) -> Recoverer
  |
  |- GET /healthz              200 "ok"
  |- GET /readyz               200 when the database answers a ping (2s timeout), else 503
  |- /auth, /auth/*            authenticator routes, mounted with the /auth prefix stripped
  |                              OIDC: GET /login, GET /callback, POST /logout
  |                              test: GET /login, GET /test-login, POST /logout
  |                              single-user: GET /login (302 /), POST /logout (204)
  |- /api/v1                  single-user mode only: Host must be local or the CHARTIT_BASE_URL host, else 403
  |    |- public group         GET /shared/{token}
  |    '- protected group      RequireUser -> CSRF -> handlers
  |                              GET /me and everything in internal/api
  '- anything else             /api/* and /auth/* -> 404 problem+json
                               otherwise the embedded SPA (internal/ui)
```

Protected API requests go through two middlewares in `internal/auth`:

1. `RequireUser` reads the `chartit_session` cookie, looks the session up in SQLite, loads the user and puts it in the request context. No valid session is a 401 problem+json for `/api/` paths. In single-user mode the authenticator returns the one built-in user for every request, so there is no session lookup.
2. `CSRF` rejects any method other than GET, HEAD and OPTIONS that lacks `X-Requested-With: chartit` with 403.

Handlers in `internal/api` decode the body (size-limited, a single JSON value), call `internal/store` with the authenticated user's id, and answer with JSON or `application/problem+json` (`internal/problem`). Every store query that touches a document is scoped by `owner_id`, so a foreign or unknown id is indistinguishable and returns 404. Store errors map to HTTP in one place: `ErrNotFound` to 404, a stale save to 409 with the stored `version` and `updatedAt`, anything else to a logged 500.

Sign-in with OIDC:

```
browser                 chartit                          identity provider
  | GET /auth/login        |                                     |
  |----------------------->| discovery (cached), state, nonce,   |
  |                        | PKCE verifier sealed into the       |
  |<-----------------------| chartit_oidc cookie, 302            |
  | authorize ...............................................>   |
  | GET /auth/callback?code&state                                |
  |----------------------->| check cookie + state, exchange code |
  |                        | verify id_token and nonce           |
  |                        | upsert user by sub, create session  |
  |<-----------------------| Set-Cookie chartit_session, 302 /   |
```

Startup (`cmd/chartit/main.go`): load config, open SQLite, apply goose migrations, build the store, choose the authenticator (single-user, test or OIDC), start the hourly expired-session sweep, load the embedded templates, build the router, listen. SIGINT and SIGTERM trigger a graceful shutdown with a 15 second budget.

## Module map

Backend (Go module `github.com/hayward-solutions/chart.it`):

| Package | Responsibility |
|---|---|
| `cmd/chartit` | Entrypoint: config, database, migrations, authenticator, server, shutdown. |
| `internal/config` | `CHARTIT_*` environment parsing and validation. |
| `internal/db` | `Open()` (SQLite pragmas, pool) and `Migrate()` (embedded goose migrations). |
| `internal/store` | Typed SQL access: users, sessions, documents, versions, shares. Snapshot and pruning rules live here. |
| `internal/auth` | `Authenticator` interface, session cookie handling, `RequireUser` and `CSRF` middleware. |
| `internal/auth/oidc` | Authorisation code flow with PKCE, state and nonce, encrypted flow cookie. |
| `internal/auth/header` | Test login, only constructed when `CHARTIT_ALLOW_TEST_AUTH=1`. |
| `internal/auth/single` | Single-user mode, only constructed when `CHARTIT_SINGLE_USER=1`. Every request is one built-in user; no sessions. |
| `internal/api` | Route table and handlers: documents, content, thumbnails, versions, shares, templates. |
| `internal/server` | `http.Server` timeouts, router wiring, request logging, recover, health endpoints. |
| `internal/ui` | Embedded SPA, SPA fallback and cache headers, placeholder when no build exists. |
| `internal/problem` | `application/problem+json` writer. |
| `internal/ids` | 20 random bytes, lowercase base32 without padding. |
| `templates` | Starter diagrams (`index.json` plus one schema v1 file per key), validated at load. |
| `tools/icons` | Separate Go module that builds the icon packs and manifest. |

Frontend (`web/src`):

| Folder | Responsibility |
|---|---|
| `app` | Router, providers, shell, auth guard, theme. Routes: `/login`, `/s/:token`, `/` (dashboard), `/d/:id` (editor). Editor and share pages load lazily. |
| `api` | Typed fetch client (adds `X-Requested-With`), endpoints, TanStack Query hooks, MSW mocks for tests. |
| `model` | Zod schema for document v1, TypeScript types, `migrateDocument`, container kind and shape tables. |
| `editor` | React Flow canvas, zustand store with zundo history, node and edge renderers, command registry (`commands.ts`), key handling (`shortcuts.ts`), command palette, clipboard, adapters between model and React Flow. |
| `panels` | Shape library, properties panels, toolbar, version history, share and export dialogs, shortcuts dialog, conflict banner. |
| `icons` | Manifest loader, search index (Fuse), recently used icons. |
| `export` | Model-driven PNG, SVG, PDF and JSON export, JSON import. |
| `layout` | ELK auto layout and the grid-based edge router. |
| `pages` | Dashboard, Editor (autosave, thumbnails, leave guard, export wiring), Share, Login. |
| `components/ui` | Radix-based primitives styled with Tailwind. |
| `public/icons` | Generated icon packs and `manifest.json`. Do not edit by hand. |

## Document schema and versioning

A document is a single JSON object stored in `documents.content`:

```
schemaVersion  1
title          string
settings       background, grid (dots|lines|none), snap, gridSize, theme (light|dark|system)
viewport       x, y, zoom
nodes[]        id, type (icon|container|shape|text), position, size, parentId?, zIndex, locked?,
               data { label, icon?{pack,id}, shape?, containerKind?, style }
edges[]        id, source, target, sourceHandle, targetHandle (top|right|bottom|left),
               type (orthogonal|straight|bezier), zIndex,
               data { label?, labelPosition?, markerStart, markerEnd, waypoints?, style }
```

Rules that matter:

- A child node's `position` is relative to its parent. Edge `waypoints` are absolute canvas coordinates and only apply to orthogonal edges.
- Icons are referenced by `{pack, id}` and resolved through `web/public/icons/manifest.json`, so documents never embed icon data. A container's badge is its `icon` or the default for its `containerKind` (`web/src/model/containers.ts`).
- The server treats the document as opaque apart from three checks: it must be a JSON object, `schemaVersion` must be `1`, and it must fit in `CHARTIT_MAX_DOCUMENT_BYTES`. It stores the compacted JSON. All structural validation (Zod) happens in the client when a document is loaded or imported.
- `migrateDocument` upgrades older documents step by step to the current version and rejects unknown or missing versions. The migration table is empty because v1 is the only version.

Versioning and snapshots (`internal/store`):

- `documents.version` starts at 1 and increases by one on every content save. A save must send the version it was based on; if the stored version differs the transaction changes nothing and the API answers 409 with the stored `version` and `updatedAt`. The editor then shows the conflict banner with Reload (adopt the server copy) or Overwrite (resend based on the stored version).
- A row in `document_versions` is written when a document is created (version 1), when a save carries a `label`, and when more than five minutes have passed since the newest snapshot of that document. Plain autosaves inside the five minute window update only `documents`.
- At most 200 snapshots are kept per document. Pruning deletes the oldest unlabelled snapshots first, then the oldest labelled ones, and never the snapshot just written.
- Restoring version N does not rewind: it saves the old content as a new version labelled `Restored from version N`, so the history stays linear.
- Soft-deleted documents (`deleted_at`) are hidden from every read except the trash list and restore. Share tokens are stored in `shares` with a `revoked_at` marker; the public endpoint only returns title, content and `updatedAt`.
- The editor autosaves after 1 second of quiet (at most 5 seconds after the first unsaved change), flushes with `keepalive` when the page is hidden, and retries with backoff on failure. Thumbnails are captured from the canvas at most every 30 seconds after a save and uploaded as PNG (512 KiB limit).

## Export renders from the model

`web/src/export` never reads the DOM. `renderDocumentSvgDetailed(doc, options)` builds an SVG string from the document alone:

1. Index the nodes, optionally restrict to a selection plus all descendants, and drop edges whose endpoints are not included.
2. Load every referenced icon through an `IconLoader` (by default `fetch` of `/icons/<file>` located through the manifest); SVG icons are inlined with scoped ids, PNG fallbacks become data URIs. An icon that cannot be loaded renders as a grey placeholder box (nothing for a container badge) instead of failing the export.
3. Convert each node to markup at its absolute position (parent chain summed), compute edge geometry (orthogonal routes through waypoints, straight, bezier), markers and label boxes.
4. Sort by effective z-order (a child is never below its container; containers draw before leaf nodes at the same z), compute the union bounds plus padding, and emit one `<svg>` with a background rect unless transparent.

PNG rasterises that SVG through an `Image` onto a canvas, scaled 1x, 2x or 4x and clamped to 16384 px per side and 100 megapixels. PDF rasterises the same SVG and places it on a single page sized to the diagram (`jspdf`, loaded on demand). JSON export is the document itself, and import runs it through `migrateDocument`. Because the output depends only on the model and the icon files, it is independent of zoom, scroll position, selection chrome, theme and fonts of the page, and it is unit-testable in jsdom. The only DOM-based capture in the app is the dashboard thumbnail (`pages/editor/capture.ts`, `html-to-image`).

## Layout with ELK in a worker

`web/src/layout/elk.ts` turns a document (or the subtree of the selected nodes) into an ELK graph: containers become compound nodes with padding for their title, icon nodes get the extra size of their label, locked nodes keep their position, and `hierarchyHandling: INCLUDE_CHILDREN` lets edges cross container borders. Options are the layered algorithm with orthogonal edge routing, direction `DOWN` or `RIGHT`, and a spacing of 48 by default. The result is mapped back onto positions, container sizes (never smaller than their children plus padding), handle sides and edge waypoints, and returned as a new document.

ELK is loaded lazily and runs off the main thread: `elkjs/lib/elk-api` is combined with `elk-worker.min.js` through Vite's `?worker` import. If `Worker` is not available (tests, jsdom) or the worker fails to start or to lay out, it falls back to `elkjs/lib/elk.bundled.js` on the main thread. The editor applies the result with a single store update (`applyLayout`, which keeps the current viewport) and refuses it if the document changed while the layout was computing.

Separately, `layout/router.ts` is a deterministic grid router for orthogonal edges: it marks node rectangles (padded) as obstacles on a grid, runs a turn-penalised search between the stub points of the two handles, and returns waypoints only if the straight orthogonal route would cross another node. It backs the "Reroute edges" command and the "Tidy edges" menu item.
