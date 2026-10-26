# Pinned actions

Workflows reference every third-party action by full commit SHA. YAML comments are not allowed in this repository, so the version each SHA corresponds to is recorded here. Update this table whenever a pin changes (Dependabot bumps the SHAs; the table follows).

| Action | Version | Commit SHA |
|---|---|---|
| actions/checkout | v7.0.1 | 3d3c42e5aac5ba805825da76410c181273ba90b1 |
| actions/setup-go | v7.0.0 | b7ad1dad31e06c5925ef5d2fc7ad053ef454303e |
| actions/setup-node | v7.1.0 | 949feb2413d6458794dcd2491c4babbbce0c15c1 |
| actions/upload-artifact | v7.0.2 | cf430e030ddbb5b0abf93d22962f4752f3646cd9 |
| dorny/paths-filter | v4.0.3 | ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d |
| golangci/golangci-lint-action | v9.3.0 | ba0d7d2ec06a0ea1cb5fa41b2e4a3ab91d21278a |
| docker/setup-buildx-action | v4.4.1 | f87e5991a6d7451dcb8d9637bfbc97413f497069 |
| docker/login-action | v4.7.0 | 81c6f93d4bc991e510b342a00b419b3bb4efc5c6 |
| docker/build-push-action | v7.4.0 | c3c9e263c25d99ce0380d002d59b67737d91b0dc |
| azure/setup-helm | v5.0.1 | 9bc31f4ebc9c6b171d7bfbaa5d006ae7abdb4310 |
| aquasecurity/trivy-action | v0.36.0 | ed142fd0673e97e23eac54620cfb913e5ce36c25 |

## Tool versions set in workflow env

| Tool | Version | Where |
|---|---|---|
| Go | 1.26 | `GO_VERSION` in pull-request.yaml |
| Node | 24 | `NODE_VERSION` in pull-request.yaml |
| Helm | v4.1.1 | `HELM_VERSION` in all workflows; golden files are generated with this version |
| golangci-lint | v2.15.0 | `GOLANGCI_LINT_VERSION` in pull-request.yaml |
| govulncheck | v1.9.0 | `GOVULNCHECK_VERSION` in pull-request.yaml |
