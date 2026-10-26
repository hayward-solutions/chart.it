package store

import (
	"context"
	"fmt"
	"time"
)

type Share struct {
	ID         string     `json:"-"`
	DocumentID string     `json:"-"`
	Token      string     `json:"token"`
	Permission string     `json:"permission"`
	CreatedAt  time.Time  `json:"createdAt"`
	RevokedAt  *time.Time `json:"-"`
}

type SharedDocument struct {
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (s *Store) CreateShare(ctx context.Context, ownerID, docID string) (Share, error) {
	sh := Share{ID: newID(), DocumentID: docID, Token: newID(), Permission: "view", CreatedAt: s.now()}
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO shares (id, document_id, token, permission, created_at)
		SELECT ?, id, ?, ?, ? FROM documents WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
		sh.ID, sh.Token, sh.Permission, formatTime(sh.CreatedAt), docID, ownerID)
	if err != nil {
		return Share{}, fmt.Errorf("create share: %w", err)
	}
	n, err := rowsAffected(res)
	if err != nil {
		return Share{}, err
	}
	if n == 0 {
		return Share{}, fmt.Errorf("create share: %w", ErrNotFound)
	}
	return sh, nil
}

func (s *Store) ListShares(ctx context.Context, ownerID, docID string) ([]Share, error) {
	if err := s.requireDocument(ctx, s.db, ownerID, docID); err != nil {
		return nil, fmt.Errorf("list shares: %w", err)
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, token, permission, created_at FROM shares WHERE document_id = ? AND revoked_at IS NULL ORDER BY created_at DESC, id`, docID)
	if err != nil {
		return nil, fmt.Errorf("list shares: %w", err)
	}
	defer func() { _ = rows.Close() }()

	out := []Share{}
	for rows.Next() {
		sh := Share{DocumentID: docID}
		var createdAt string
		if err := rows.Scan(&sh.ID, &sh.Token, &sh.Permission, &createdAt); err != nil {
			return nil, fmt.Errorf("scan share: %w", err)
		}
		if sh.CreatedAt, err = parseTime(createdAt); err != nil {
			return nil, err
		}
		out = append(out, sh)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list shares: %w", err)
	}
	return out, nil
}

func (s *Store) RevokeShare(ctx context.Context, ownerID, docID, token string) error {
	res, err := s.db.ExecContext(ctx, `
		UPDATE shares SET revoked_at = ?
		WHERE token = ? AND document_id = ? AND revoked_at IS NULL
		  AND EXISTS (SELECT 1 FROM documents WHERE id = shares.document_id AND owner_id = ?)`,
		formatTime(s.now()), token, docID, ownerID)
	if err != nil {
		return fmt.Errorf("revoke share: %w", err)
	}
	n, err := rowsAffected(res)
	if err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("revoke share: %w", ErrNotFound)
	}
	return nil
}

func (s *Store) GetSharedDocument(ctx context.Context, token string) (SharedDocument, error) {
	var (
		d         SharedDocument
		updatedAt string
	)
	err := s.db.QueryRowContext(ctx, `
		SELECT d.title, d.content, d.updated_at
		FROM shares sh JOIN documents d ON d.id = sh.document_id
		WHERE sh.token = ? AND sh.revoked_at IS NULL AND d.deleted_at IS NULL`, token).
		Scan(&d.Title, &d.Content, &updatedAt)
	if err != nil {
		return SharedDocument{}, fmt.Errorf("get shared document: %w", mapNotFound(err))
	}
	if d.UpdatedAt, err = parseTime(updatedAt); err != nil {
		return SharedDocument{}, err
	}
	return d, nil
}
