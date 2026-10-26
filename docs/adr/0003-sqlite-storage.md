# 3. SQLite for storage

Status: accepted

## Context

Chart.it is a small, single-tenant-per-instance tool deployed to a single-node Kubernetes cluster or a plain container host. Its data is users, sessions, diagrams (JSON documents of at most a few megabytes), version snapshots and share tokens. Running and backing up a separate database server would be larger than the application itself.

## Decision

Store everything in one SQLite database file, `chartit.db` inside `CHARTIT_DATA_DIR`, using the pure-Go driver `modernc.org/sqlite` so the binary builds with `CGO_ENABLED=0` for amd64 and arm64 and runs in a distroless image.

- Connection settings (`internal/db`): WAL journal mode, `busy_timeout` of 5 seconds, `synchronous=NORMAL`, foreign keys on, immediate transactions, up to 8 pooled connections.
- Schema changes are goose migrations embedded from `internal/db/migrations/*.sql` and applied at every startup before the server listens.
- Diagram content is stored as a JSON text column on `documents`, with a `version` counter used for optimistic concurrency. Snapshots go in `document_versions` and are pruned to 200 per diagram.
- Timestamps are RFC 3339 UTC strings and ids are 20 random bytes in lowercase base32.
- In Kubernetes the database lives on one PersistentVolumeClaim mounted at `/data`. The Deployment has one replica and the `Recreate` strategy so that two pods never open the file at the same time.

## Consequences

- No database service to operate. Backup is a copy of the data directory (use SQLite's online backup or snapshot the volume to get a consistent copy while WAL files exist).
- Chart.it cannot scale horizontally and upgrades involve a short outage while the old pod stops. This is acceptable for the intended use and is documented in the chart notes.
- ReadWriteOnce volumes tie the pod to the storage backend; moving nodes requires the volume to be re-attachable.
- Migrations run in the application process, so a failed migration stops the pod from becoming ready. There is no separate migration job.
- Full-text search is not available. Dashboard search is a substring match (`LIKE`) on titles and tags.
- A move to PostgreSQL would need a new store implementation behind `internal/store` and a data migration. The API and the document format would not change.
