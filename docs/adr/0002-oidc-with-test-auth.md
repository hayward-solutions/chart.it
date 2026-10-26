# 2. OIDC sign-in with a gated test login

Status: accepted

## Context

Chart.it is self-hosted and stores diagrams per user. It must not hold passwords. Sign-in goes through standard OpenID Connect, so any OIDC provider such as Cognito, Authentik or Keycloak should work without code changes.

Development, end-to-end tests and the Docker Compose quick start need to sign in without an identity provider. A bypass like that is dangerous if it ever reaches a real deployment.

## Decision

Production authentication is the OIDC authorisation code flow implemented with `coreos/go-oidc` and `golang.org/x/oauth2` in `internal/auth/oidc`:

- Provider discovery from `CHARTIT_OIDC_ISSUER` on first use, PKCE (S256), `state` and `nonce`.
- The state, nonce, verifier and post-login redirect travel in a short-lived (10 minute) `chartit_oidc` cookie sealed with AES-GCM under a key derived (HKDF) from `CHARTIT_SESSION_SECRET`. The post-login `next` path is restricted to same-origin absolute paths.
- The ID token is verified against the client id and the nonce. Users are upserted by the `sub` claim; the display name is taken from `name`, then `cognito:username`, then `email`.
- A server-side session (`sessions` table, random id in the `chartit_session` HttpOnly, SameSite=Lax cookie, 30 day lifetime) is created after login. The identity provider is not consulted again until the session expires.

A second `Authenticator` in `internal/auth/header` provides test login, enabled only by `CHARTIT_ALLOW_TEST_AUTH=1`. `GET /auth/test-login?user=<name>` upserts a user with subject `test:<name>` and starts a session through the same session code as OIDC.

Configuration loading enforces the separation (`internal/config`): when test auth is on and any of `CHARTIT_OIDC_ISSUER`, `CHARTIT_OIDC_CLIENT_ID` or `CHARTIT_OIDC_CLIENT_SECRET` is set, startup fails. When test auth is off, OIDC issuer, client id and a session secret of at least 32 bytes are mandatory. `main` selects exactly one authenticator and logs a warning when test auth is active.

All `/api/v1` routes except the public share endpoint require a session, and mutating requests must carry `X-Requested-With: chartit`.

## Consequences

- No passwords, password reset or user administration in Chart.it. Access control is whatever the identity provider allows for the client.
- Any OIDC-compliant provider can be used by changing issuer, client id, secret and scopes.
- A deployment cannot accidentally run both modes. The failure is at startup, not at request time.
- Test login has no secret: anyone who can reach the port can become any user. It must only be used on localhost or an otherwise trusted network. The Helm chart does not set it, but `env` can inject it, so reviewing values files for `CHARTIT_ALLOW_TEST_AUTH` matters.
- Sessions are opaque ids stored in SQLite, so logout and expiry are enforceable server-side, at the cost of a database read per request.
- Only the `sub`, name, e-mail and picture claims are stored. There is no role or group mapping; every authenticated user may create diagrams and sees only their own.
