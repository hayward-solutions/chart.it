package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type Version struct {
	Version   int       `json:"version"`
	Label     string    `json:"label"`
	CreatedAt time.Time `json:"createdAt"`
	CreatedBy string    `json:"createdBy"`
	Content   string    `json:"content,omitempty"`
}

func (s *Store) requireDocument(ctx context.Context, q queryer, ownerID, id string) error {
	var one int
	err := q.QueryRowContext(ctx,
		`SELECT 1 FROM documents WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`, id, ownerID).Scan(&one)
	return mapNotFound(err)
}

func scanVersion(row interface{ Scan(...any) error }, withContent bool) (Version, error) {
	var (
		v                Version
		label, createdBy sql.NullString
		createdAt        string
		content          string
	)
	dest := []any{&v.Version, &label, &createdBy, &createdAt}
	if withContent {
		dest = append(dest, &content)
	}
	if err := row.Scan(dest...); err != nil {
		return Version{}, mapNotFound(err)
	}
	v.Label, v.CreatedBy, v.Content = label.String, createdBy.String, content
	var err error
	if v.CreatedAt, err = parseTime(createdAt); err != nil {
		return Version{}, err
	}
	return v, nil
}

func (s *Store) ListVersions(ctx context.Context, ownerID, id string) ([]Version, error) {
	if err := s.requireDocument(ctx, s.db, ownerID, id); err != nil {
		return nil, fmt.Errorf("list versions: %w", err)
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT version, label, created_by, created_at FROM document_versions WHERE document_id = ? ORDER BY version DESC`, id)
	if err != nil {
		return nil, fmt.Errorf("list versions: %w", err)
	}
	defer func() { _ = rows.Close() }()

	out := []Version{}
	for rows.Next() {
		v, err := scanVersion(rows, false)
		if err != nil {
			return nil, fmt.Errorf("list versions: %w", err)
		}
		out = append(out, v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list versions: %w", err)
	}
	return out, nil
}

func (s *Store) GetVersion(ctx context.Context, ownerID, id string, version int) (Version, error) {
	if err := s.requireDocument(ctx, s.db, ownerID, id); err != nil {
		return Version{}, fmt.Errorf("get version: %w", err)
	}
	v, err := scanVersion(s.db.QueryRowContext(ctx,
		`SELECT version, label, created_by, created_at, content FROM document_versions WHERE document_id = ? AND version = ?`,
		id, version), true)
	if err != nil {
		return Version{}, fmt.Errorf("get version: %w", err)
	}
	return v, nil
}

func (s *Store) RestoreVersion(ctx context.Context, ownerID, id string, version int) (SaveResult, error) {
	var res SaveResult
	err := s.inTx(ctx, func(tx *sql.Tx) error {
		if err := s.requireDocument(ctx, tx, ownerID, id); err != nil {
			return err
		}
		var content string
		err := tx.QueryRowContext(ctx,
			`SELECT content FROM document_versions WHERE document_id = ? AND version = ?`, id, version).Scan(&content)
		if err != nil {
			return mapNotFound(err)
		}
		res, err = s.saveContentTx(ctx, tx, ownerID, id, nil, content, fmt.Sprintf("Restored from version %d", version))
		return err
	})
	if err != nil {
		return SaveResult{}, fmt.Errorf("restore version: %w", err)
	}
	return res, nil
}
