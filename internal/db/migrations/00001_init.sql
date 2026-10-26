-- +goose Up
CREATE TABLE users (
    id           TEXT PRIMARY KEY,
    subject      TEXT NOT NULL UNIQUE,
    email        TEXT,
    name         TEXT,
    avatar_url   TEXT,
    created_at   TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
);

CREATE TABLE sessions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);
CREATE INDEX idx_sessions_user_id ON sessions (user_id);

CREATE TABLE documents (
    id           TEXT PRIMARY KEY,
    owner_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    tags         TEXT NOT NULL DEFAULT '[]',
    content      TEXT NOT NULL,
    version      INTEGER NOT NULL DEFAULT 1,
    thumbnail    BLOB,
    template_key TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT
);

CREATE INDEX idx_documents_owner ON documents (owner_id, deleted_at, updated_at);

CREATE TABLE document_versions (
    id          TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    version     INTEGER NOT NULL,
    content     TEXT NOT NULL,
    label       TEXT,
    created_by  TEXT REFERENCES users (id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL,
    UNIQUE (document_id, version)
);

CREATE INDEX idx_document_versions_doc_version ON document_versions (document_id, version);

CREATE TABLE shares (
    id          TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    token       TEXT NOT NULL UNIQUE,
    permission  TEXT NOT NULL DEFAULT 'view',
    created_at  TEXT NOT NULL,
    revoked_at  TEXT
);

CREATE INDEX idx_shares_token ON shares (token);
CREATE INDEX idx_shares_document ON shares (document_id);

-- +goose Down
DROP TABLE shares;
DROP TABLE document_versions;
DROP TABLE documents;
DROP TABLE sessions;
DROP TABLE users;
