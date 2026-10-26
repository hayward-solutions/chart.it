# 4. One binary with the SPA embedded

Status: accepted

## Context

Chart.it has a Go API and a React single-page app. They could be deployed as two containers behind one ingress, or the Go server could also serve the frontend. The target deployment is one pod on a small Kubernetes cluster, and the app is meant to be easy to run elsewhere with a single `docker run` or `go build`.

## Decision

The Go binary embeds the built frontend and serves it itself.

- The Dockerfile builds `web/` with Node, copies `web/dist` into `internal/ui/dist` in the Go build stage, and compiles with `CGO_ENABLED=0`. `make build-web` does the same locally.
- `internal/ui` embeds `dist` with `go:embed`. If `dist` has no `index.html` (a fresh checkout that has not built the frontend), it falls back to an embedded placeholder page so `go build` and `go test` still work.
- The handler serves files with cache headers by path: `assets/` is immutable for a year, `icons/` is cached for a day, everything else revalidates. `index.html` carries an ETag and is the fallback for unknown paths, so client-side routes such as `/d/<id>` and `/s/<token>` survive a reload. Unknown paths under `/assets/` and `/icons/` return 404 rather than the SPA, and `/api/` and `/auth/` misses return problem+json.
- The starter templates (`templates/*.json`) and database migrations are embedded in the same way.
- The runtime image is `gcr.io/distroless/static-debian12:nonroot` containing only `/app/chartit` and an empty `/data`.
- During development the Vite dev server (`make dev-web`, port 5173) proxies `/api` and `/auth` to the Go server (port 8080), so the frontend has hot reload without the embed step.

## Consequences

- One artefact to build, scan, version and deploy. The API and the SPA can never be out of step.
- The same origin serves both, so session cookies are first party and there is no CORS configuration.
- A frontend-only change needs a new image. There is no separate static hosting or CDN.
- The icon packs are static files in `web/public/icons` and so end up inside the binary, which makes it larger (the manifest lists about 1,700 icons).
- Backend tests and builds do not require Node, because of the placeholder fallback. Anything that exercises the real UI (`make build`, `make test-e2e`, `make docker`) does.
