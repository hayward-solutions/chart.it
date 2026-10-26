package db

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOpenAndMigrate(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "sub", "chartit.db")

	conn, err := Open(ctx, path)
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })

	require.NoError(t, Migrate(ctx, conn))
	require.NoError(t, Migrate(ctx, conn))

	tables := map[string]bool{}
	rows, err := conn.QueryContext(ctx, `SELECT name FROM sqlite_master WHERE type = 'table'`)
	require.NoError(t, err)
	for rows.Next() {
		var n string
		require.NoError(t, rows.Scan(&n))
		tables[n] = true
	}
	require.NoError(t, rows.Err())
	require.NoError(t, rows.Close())
	for _, want := range []string{"users", "sessions", "documents", "document_versions", "shares"} {
		assert.True(t, tables[want], want)
	}

	indexes := map[string]bool{}
	rows, err = conn.QueryContext(ctx, `SELECT name FROM sqlite_master WHERE type = 'index'`)
	require.NoError(t, err)
	for rows.Next() {
		var n string
		require.NoError(t, rows.Scan(&n))
		indexes[n] = true
	}
	require.NoError(t, rows.Close())
	for _, want := range []string{"idx_documents_owner", "idx_document_versions_doc_version", "idx_shares_token", "idx_sessions_expires_at"} {
		assert.True(t, indexes[want], want)
	}

	var mode string
	require.NoError(t, conn.QueryRowContext(ctx, `PRAGMA journal_mode`).Scan(&mode))
	assert.Equal(t, "wal", mode)

	var fk int
	require.NoError(t, conn.QueryRowContext(ctx, `PRAGMA foreign_keys`).Scan(&fk))
	assert.Equal(t, 1, fk)
}
