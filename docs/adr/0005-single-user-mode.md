# 5. Single-user mode for local use

Status: accepted

## Context

Chart.it is built as a shared service behind OIDC (see [ADR 2](0002-oidc-with-test-auth.md)). People also want to run it as one container on their own machine, where an identity provider is overkill. Test login works there, but it asks for a user name, shows a Sign out entry, and is documented as a development bypass that must not be exposed.

An unauthenticated server on localhost has one well-known weakness: a web page the user visits can point a hostname it controls at 127.0.0.1 (DNS rebinding) and then read the API as same-origin.

## Decision

`CHARTIT_SINGLE_USER=1` selects a third `Authenticator` in `internal/auth/single`:

- At startup it upserts one user with subject `local:owner` and name `Local user`. Every request is authenticated as that user. It creates no sessions and sets no cookies.
- `GET /auth/login` redirects to `/`; `POST /auth/logout` returns 204 and does nothing.
- `GET /api/v1/me` carries `singleUser: true`, and the SPA hides Sign out.
- When the mode is on, `/api/v1` and `/auth` reject with 403 any request whose `Host` is not `localhost`, `*.localhost`, `127.0.0.1`, `::1` or the host of `CHARTIT_BASE_URL`. The port is ignored. `/healthz`, `/readyz` and the static SPA are not checked.
- The CSRF header rule still applies to mutating requests.
- Configuration refuses to combine it with `CHARTIT_ALLOW_TEST_AUTH` or any `CHARTIT_OIDC_*` variable. A session secret is not needed.

The container image does not turn it on by default. `docker-compose.yml` does, and publishes the port on `127.0.0.1` only.

## Consequences

- `docker run -e CHARTIT_SINGLE_USER=1 -p 127.0.0.1:8080:8080 -v chartit-data:/data ...` is a complete local install.
- Anyone who can reach the port has full access. That is acceptable for loopback or a trusted LAN, and the startup log warns about it.
- A deployment that forgets its OIDC settings still fails at startup rather than silently running without sign-in, because the mode must be asked for explicitly.
- Browsing to the server under a name other than a local one requires setting `CHARTIT_BASE_URL` to that address, which share links need anyway.
- Diagrams created in single-user mode belong to the `local:owner` user. Switching the same database to OIDC later leaves them under that user; moving them would need a manual `UPDATE documents SET owner_id = ...`.
