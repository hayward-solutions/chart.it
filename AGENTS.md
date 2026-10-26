# Chart.it — agent contract

Chart.it is a self-hosted architecture diagramming tool (a best-effort Lucidchart clone for AWS, Azure, GCP and Kubernetes diagrams). One Go binary serves a JSON API and an embedded React SPA. It runs as a container (amd64 or arm64) on Kubernetes or Docker, stores everything in SQLite on a persistent volume, and authenticates users with any OpenID Connect provider.

This file is the single source of truth for conventions and contracts. Read it fully before changing anything.

## Rules for every change

- No code comments of any kind (explanatory, section, TODO, docblock). Put explanations in your report instead. Licence headers, shebangs, pragmas, lint directives and generated-code markers are allowed.
- Only touch the paths you were assigned. Report any change you needed outside them instead of making it.
- Never run `git commit`, `git add` or any other git write. The orchestrator commits.
- Report explicitly: files created, dependencies added, anything you could not finish, and the exact commands you ran to verify.
- Go: `go 1.26`, module `github.com/hayward-solutions/chart.it`, `gofmt`, golangci-lint v2 with the baseline in `.golangci.yml`, tests with the standard library plus `github.com/stretchr/testify`. Errors wrap with `%w` and lowercase messages. Logging via `log/slog`.
- Web: TypeScript strict, React 19 function components, Tailwind 4 for styling, `npm` (not pnpm/yarn). ESLint and Prettier must pass. Tests with Vitest and Testing Library.
- Never add a frontend dependency beyond the fixed list below without reporting it.

## Repository layout

```
cmd/chartit/main.go              entrypoint: config -> db -> migrate -> server
internal/
  config/        env-driven config (CHARTIT_* vars)
  db/            Open() + Migrate(), goose migrations embedded from migrations/*.sql
  store/         typed SQL access: users, sessions, documents, versions, shares
  auth/          Authenticator interface, session cookie, middleware
  auth/oidc/     go-oidc + oauth2 code flow with PKCE
  auth/header/   test auth, only when CHARTIT_ALLOW_TEST_AUTH=1
  api/           chi router, JSON handlers, problem+json errors
  ui/            embed.FS of web/dist, SPA fallback, cache headers
  server/        http.Server wiring, timeouts, logging, recover, healthz/readyz
templates/                       starter diagrams as schema-v1 JSON, embedded
web/                             Vite + React 19 + TypeScript SPA
  src/app/       router, providers, layout shell, auth guard
  src/api/       typed fetch client + TanStack Query hooks
  src/model/     document schema v1 (zod), types, migrations
  src/editor/    React Flow canvas, zustand store, nodes/, edges/, tools/, shortcuts
  src/panels/    ShapeLibrary, Properties, Toolbar, VersionHistory, ExportDialog
  src/icons/     manifest loader, search index
  src/export/    png/svg/pdf/json
  src/layout/    ELK worker, edge router
  src/pages/     Dashboard, Editor, Share, Login
  public/icons/  generated icon packs + manifest.json (do not hand-edit)
tools/icons/                     Go CLI that fetches and normalises icon packs
charts/chart-it/                 Helm chart
e2e/                             Playwright
.github/workflows/               pull-request.yaml, merge.yaml, release.yaml
```

## Configuration (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `CHARTIT_ADDR` | `:8080` | listen address |
| `CHARTIT_DATA_DIR` | `./data` | directory holding `chartit.db` |
| `CHARTIT_BASE_URL` | `http://localhost:8080` | public URL, used for OIDC redirect and share links |
| `CHARTIT_SESSION_SECRET` | required in production | 32+ byte secret for cookie signing |
| `CHARTIT_OIDC_ISSUER` | | OIDC issuer URL |
| `CHARTIT_OIDC_CLIENT_ID` | | |
| `CHARTIT_OIDC_CLIENT_SECRET` | | |
| `CHARTIT_OIDC_SCOPES` | `openid profile email` | |
| `CHARTIT_ALLOW_TEST_AUTH` | `0` | `1` enables `/auth/test-login?user=<name>`; the binary refuses to combine this with OIDC settings |
| `CHARTIT_LOG_LEVEL` | `info` | |
| `CHARTIT_MAX_DOCUMENT_BYTES` | `5242880` | server-side size limit for document content |

Startup fails if neither OIDC nor test auth is configured.

## Data model (SQLite, goose migrations)

```
users              id TEXT PK, subject TEXT UNIQUE NOT NULL, email TEXT, name TEXT, avatar_url TEXT,
                   created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
sessions           id TEXT PK, user_id TEXT FK users, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
documents          id TEXT PK, owner_id TEXT FK users, title TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]',
                   content TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, thumbnail BLOB,
                   template_key TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
document_versions  id TEXT PK, document_id TEXT FK documents, version INTEGER NOT NULL, content TEXT NOT NULL,
                   label TEXT, created_by TEXT FK users, created_at TEXT NOT NULL, UNIQUE(document_id, version)
shares             id TEXT PK, document_id TEXT FK documents, token TEXT UNIQUE NOT NULL,
                   permission TEXT NOT NULL DEFAULT 'view', created_at TEXT NOT NULL, revoked_at TEXT
```

IDs are 20 random bytes, base32 lowercase without padding. Timestamps are RFC 3339 UTC strings. Every content save bumps `documents.version` by one. A `document_versions` row is written when the save carries a `label`, or when more than 5 minutes have passed since the latest snapshot for that document. Keep at most 200 snapshots per document (delete the oldest unlabelled first).

## HTTP API

All API routes live under `/api/v1`, speak JSON, and need a session cookie (`chartit_session`, HttpOnly, SameSite=Lax, Secure when the base URL is https). Mutating requests must carry the header `X-Requested-With: chartit` or they are rejected with 403. Errors use `application/problem+json` with `type`, `title`, `status`, `detail`.

```
GET    /api/v1/me                                   -> {id, name, email, avatarUrl}
GET    /api/v1/documents?q=&tag=&trashed=            -> [{id, title, tags, version, updatedAt, createdAt, hasThumbnail}]
POST   /api/v1/documents                             {title, templateKey?} -> document (with content)
GET    /api/v1/documents/{id}                        -> document with content
PATCH  /api/v1/documents/{id}                        {title?, tags?} -> document (no content)
DELETE /api/v1/documents/{id}                        soft delete -> 204
POST   /api/v1/documents/{id}/restore                -> document
POST   /api/v1/documents/{id}/duplicate              -> new document
PUT    /api/v1/documents/{id}/content                {version, content, label?} -> {version, updatedAt}; 409 if version != stored version, body carries {version, updatedAt} of the stored copy
PUT    /api/v1/documents/{id}/thumbnail              body image/png (max 512 KiB) -> 204
GET    /api/v1/documents/{id}/thumbnail              -> image/png or 404
GET    /api/v1/documents/{id}/versions               -> [{version, label, createdAt, createdBy}]
GET    /api/v1/documents/{id}/versions/{v}           -> {version, label, createdAt, content}
POST   /api/v1/documents/{id}/versions/{v}/restore   -> {version} (writes a new version from the old content)
POST   /api/v1/documents/{id}/shares                 -> {token, url}
GET    /api/v1/documents/{id}/shares                 -> [{token, url, createdAt}]
DELETE /api/v1/documents/{id}/shares/{token}         -> 204
GET    /api/v1/shared/{token}                        public, no auth -> {title, content, updatedAt}
GET    /api/v1/templates                             -> [{key, title, description, pack}]
GET    /auth/login     redirects to the IdP (or to /auth/test-login page in test mode)
GET    /auth/callback
POST   /auth/logout    -> 204, clears session
GET    /auth/test-login?user=<name>   test mode only; upserts a user with subject "test:<name>" and sets a session, then redirects to /
GET    /healthz   -> 200 "ok"
GET    /readyz    -> 200 when the database answers
```

Only the owner can read or change a document. Unknown or foreign document ids return 404.

Document JSON field names are camelCase: `{id, title, tags, version, content, templateKey, createdAt, updatedAt, deletedAt}`.

## Document schema v1 (the file format)

```ts
type Document = {
  schemaVersion: 1
  title: string
  settings: { background: string; grid: 'dots' | 'lines' | 'none'; snap: boolean; gridSize: number; theme: 'light' | 'dark' | 'system' }
  viewport: { x: number; y: number; zoom: number }
  nodes: Node[]
  edges: Edge[]
}

type NodeStyle = { fill?: string; stroke?: string; strokeWidth?: number; strokeStyle?: 'solid' | 'dashed' | 'dotted';
  opacity?: number; radius?: number; fontFamily?: string; fontSize?: number; fontWeight?: number | string; fontColor?: string;
  textAlign?: 'left' | 'center' | 'right'; labelPosition?: 'top' | 'bottom' | 'inside' | 'left' | 'right' }

type Node = {
  id: string
  type: 'icon' | 'container' | 'shape' | 'text'
  position: { x: number; y: number }          relative to parent when parentId is set
  size: { width: number; height: number }
  parentId?: string
  zIndex: number
  locked?: boolean
  data: {
    label: string
    icon?: { pack: string; id: string }        for type 'icon', and the badge of a 'container'
    shape?: 'rect' | 'roundedRect' | 'ellipse' | 'diamond' | 'cylinder' | 'hexagon' | 'parallelogram' | 'cloud' | 'note'
    containerKind?: string                     e.g. 'aws.region', 'aws.vpc', 'aws.subnet.public', 'azure.resourceGroup', 'gcp.project', 'k8s.namespace', 'generic'
    style: NodeStyle
  }
}

type EdgeStyle = { stroke?: string; strokeWidth?: number; strokeStyle?: 'solid' | 'dashed' | 'dotted'; opacity?: number;
  fontSize?: number; fontColor?: string; labelBackground?: string }

type Edge = {
  id: string
  source: string; target: string
  sourceHandle: 'top' | 'right' | 'bottom' | 'left'; targetHandle: 'top' | 'right' | 'bottom' | 'left'
  type: 'orthogonal' | 'straight' | 'bezier'
  zIndex: number
  data: {
    label?: string
    labelPosition?: number                     0..1 along the path, default 0.5
    markerStart: 'none' | 'arrow' | 'openArrow' | 'diamond' | 'circle'
    markerEnd: 'none' | 'arrow' | 'openArrow' | 'diamond' | 'circle'
    waypoints?: { x: number; y: number }[]     absolute canvas coordinates, orthogonal edges only
    style: EdgeStyle
  }
}
```

Container kinds and their default look (all overridable through `style`):

| kind | border | colour | badge icon | title |
|---|---|---|---|---|
| `aws.cloud` | solid | #232F3E | aws cloud | top-left |
| `aws.region` | dashed | #00A4A6 | aws region | top-left |
| `aws.account` | solid | #E7157B | aws account | top-left |
| `aws.vpc` | solid | #8C4FFF | aws vpc | top-left |
| `aws.availabilityZone` | dashed | #00A4A6 | none | top-left |
| `aws.subnet.public` | solid, fill #E9F3E6 | #7AA116 | none | top-left |
| `aws.subnet.private` | solid, fill #E6F2F8 | #00A4A6 | none | top-left |
| `aws.securityGroup` | dashed | #DD344C | none | top-left |
| `aws.autoScaling` | dashed | #ED7100 | aws auto scaling | top-centre |
| `azure.subscription` | solid | #0078D4 | azure subscription | top-left |
| `azure.resourceGroup` | dashed | #7A7A7A | azure resource group | top-left |
| `azure.vnet` | solid | #0078D4 | azure vnet | top-left |
| `azure.subnet` | solid, fill #EAF3FB | #0078D4 | none | top-left |
| `gcp.project` | solid | #4285F4 | gcp project | top-left |
| `gcp.vpc` | solid | #4285F4 | gcp vpc | top-left |
| `gcp.region` | dashed | #4285F4 | none | top-left |
| `gcp.zone` | dashed | #9AA0A6 | none | top-left |
| `k8s.cluster` | solid | #326CE5 | k8s cluster | top-left |
| `k8s.namespace` | dashed | #326CE5 | k8s namespace | top-left |
| `k8s.node` | solid | #326CE5 | k8s node | top-left |
| `k8s.pod` | solid | #326CE5 | k8s pod | top-left |
| `generic` | solid | #6B7280 | none | top-left |

## Icon manifest (`web/public/icons/manifest.json`)

```ts
type Manifest = {
  generatedAt: string
  packs: { id: 'aws' | 'azure' | 'gcp' | 'k8s' | 'generic'; title: string; licence: string; version?: string }[]
  icons: { pack: string; id: string; category: string; title: string; terms: string[];
           file: string; format: 'svg' | 'png'; kind: 'service' | 'resource' | 'group' | 'shape'; colour?: string }[]
}
```

`file` is relative to `/icons/`, e.g. `aws/compute/ec2.svg`. `id` is unique within a pack and is what documents reference.

## Frontend dependency list (fixed)

Runtime: `react`, `react-dom`, `react-router`, `@tanstack/react-query`, `@xyflow/react`, `zustand`, `zundo`, `zod`, `elkjs`, `html-to-image`, `jspdf`, `file-saver`, `fuse.js`, `lucide-react`, `tailwindcss`, `@tailwindcss/vite`, `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `cmdk`, `sonner`.
Dev: `typescript`, `vite`, `@vitejs/plugin-react`, `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`, `msw`, `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, `eslint-plugin-react-refresh`, `prettier`, `@playwright/test`, `@types/react`, `@types/react-dom`, `@types/file-saver`.

## Commands

```
make dev          Run the Go server with test auth on :8080 (serves web/dist if built)
make dev-web      Run the Vite dev server on :5173 proxying /api and /auth to :8080
make test         Run Go unit tests
make test-web     Run web unit tests
make test-e2e     Run Playwright against a freshly built binary
make lint         Run all linters
make lint-go      golangci-lint and gofmt
make lint-web     Web lint and typecheck
make build-web    Build web/dist and copy it to internal/ui/dist for embedding
make build        Build web/dist then the Go binary into bin/chartit
make icons        Regenerate web/public/icons
make docker       Build the container image locally
make tidy         go mod tidy
make clean        Remove build output
make help         Show this help
```

`make dev` embeds whatever is in `internal/ui/dist` at compile time (populated by `make build-web`) and otherwise serves a placeholder page; use `make dev-web` for frontend work.

## Where things live

Frontend editor modules (all under `web/src`):

- `editor/commands.ts`: the command registry. Every command has an id, title, group, optional `shortcut` and `aliases` (`mod` means Cmd on macOS and Ctrl elsewhere), and `enabled`/`mutates` guards. The command palette and the keyboard handler both read this list.
- `editor/shortcuts.ts`: shortcut parsing and formatting, `useEditorShortcuts` (keydown matching, typing and overlay guards, Space-to-pan) and `useEditorClipboardEvents`.
- `editor/store.ts`: zustand store holding the document, selection, tool and clipboard, with zundo history (100 steps). `editor/ops.ts` has the pure document operations behind it and `editor/actions.ts` the actions the UI calls.
- `editor/adapters.ts`: conversion between the document model and React Flow nodes and edges.
- `editor/nodes/`, `editor/edges/`: node and edge renderers, handles, resizer, markers and edge geometry.
- `editor/EditorCanvas.tsx`: the React Flow canvas. `editor/CommandPalette.tsx`: the Mod+K palette.
- `panels/`: shape library, properties, toolbar, version history, and the share, export and shortcuts dialogs. `panels/ShortcutsDialog.tsx` is a hand-written list that must be kept in step with `editor/commands.ts`.
- `pages/editor/`: editor page glue: autosave, thumbnails, export wiring, layout menu, leave guard.
- `export/`: model-driven PNG, SVG, PDF and JSON export. `layout/`: ELK layout (`elk.ts`) and edge router (`router.ts`).
- `model/`: document schema (zod), `migrateDocument`, container kind and shape tables.

See `docs/architecture.md` for the request flow and how these fit together.
