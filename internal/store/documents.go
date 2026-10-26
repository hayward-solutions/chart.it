package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

type Document struct {
	ID          string     `json:"id"`
	OwnerID     string     `json:"-"`
	Title       string     `json:"title"`
	Tags        []string   `json:"tags"`
	Content     string     `json:"content,omitempty"`
	Version     int        `json:"version"`
	TemplateKey string     `json:"templateKey,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	DeletedAt   *time.Time `json:"deletedAt"`
}

type DocumentSummary struct {
	ID           string    `json:"id"`
	Title        string    `json:"title"`
	Tags         []string  `json:"tags"`
	Version      int       `json:"version"`
	UpdatedAt    time.Time `json:"updatedAt"`
	CreatedAt    time.Time `json:"createdAt"`
	HasThumbnail bool      `json:"hasThumbnail"`
}

type ListFilter struct {
	Query   string
	Tag     string
	Trashed bool
}

type MetaUpdate struct {
	Title *string
	Tags  *[]string
}

type SaveResult struct {
	Version   int       `json:"version"`
	UpdatedAt time.Time `json:"updatedAt"`
}

const documentMetaColumns = `id, owner_id, title, tags, version, template_key, created_at, updated_at, deleted_at`

func scanDocument(row interface{ Scan(...any) error }, withContent bool) (Document, error) {
	var (
		d                          Document
		tags, createdAt, updatedAt string
		templateKey, deletedAt     sql.NullString
		content                    string
	)
	dest := []any{&d.ID, &d.OwnerID, &d.Title, &tags, &d.Version, &templateKey, &createdAt, &updatedAt, &deletedAt}
	if withContent {
		dest = append(dest, &content)
	}
	if err := row.Scan(dest...); err != nil {
		return Document{}, mapNotFound(err)
	}
	d.Content = content
	d.TemplateKey = templateKey.String
	if err := json.Unmarshal([]byte(tags), &d.Tags); err != nil {
		return Document{}, fmt.Errorf("decode tags: %w", err)
	}
	if d.Tags == nil {
		d.Tags = []string{}
	}
	var err error
	if d.CreatedAt, err = parseTime(createdAt); err != nil {
		return Document{}, err
	}
	if d.UpdatedAt, err = parseTime(updatedAt); err != nil {
		return Document{}, err
	}
	if d.DeletedAt, err = parseNullTime(deletedAt); err != nil {
		return Document{}, err
	}
	return d, nil
}

func normaliseTags(tags []string) []string {
	out := make([]string, 0, len(tags))
	seen := make(map[string]struct{}, len(tags))
	for _, t := range tags {
		t = strings.TrimSpace(t)
		if t == "" {
			continue
		}
		if _, dup := seen[t]; dup {
			continue
		}
		seen[t] = struct{}{}
		out = append(out, t)
	}
	return out
}

func encodeTags(tags []string) (string, error) {
	b, err := json.Marshal(normaliseTags(tags))
	if err != nil {
		return "", fmt.Errorf("encode tags: %w", err)
	}
	return string(b), nil
}

func (s *Store) loadDocument(ctx context.Context, q queryer, ownerID, id string, includeDeleted, withContent bool) (Document, error) {
	cols := documentMetaColumns
	if withContent {
		cols += ", content"
	}
	query := `SELECT ` + cols + ` FROM documents WHERE id = ? AND owner_id = ?`
	if !includeDeleted {
		query += ` AND deleted_at IS NULL`
	}
	return scanDocument(q.QueryRowContext(ctx, query, id, ownerID), withContent)
}

func insertSnapshot(ctx context.Context, q queryer, docID string, version int, content, label, createdBy string, now time.Time) error {
	_, err := q.ExecContext(ctx,
		`INSERT INTO document_versions (id, document_id, version, content, label, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		newID(), docID, version, content, nullString(label), nullString(createdBy), formatTime(now))
	if err != nil {
		return fmt.Errorf("insert snapshot: %w", err)
	}
	return nil
}

type newDocument struct {
	ownerID     string
	title       string
	tags        []string
	content     string
	templateKey string
	thumbnail   []byte
}

func (s *Store) insertDocument(ctx context.Context, nd newDocument) (Document, error) {
	tags, err := encodeTags(nd.tags)
	if err != nil {
		return Document{}, err
	}
	now := s.now()
	id := newID()
	err = s.inTx(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`INSERT INTO documents (id, owner_id, title, tags, content, version, thumbnail, template_key, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
			id, nd.ownerID, nd.title, tags, nd.content, nd.thumbnail, nullString(nd.templateKey), formatTime(now), formatTime(now))
		if err != nil {
			return fmt.Errorf("insert document: %w", err)
		}
		return insertSnapshot(ctx, tx, id, 1, nd.content, "", nd.ownerID, now)
	})
	if err != nil {
		return Document{}, err
	}
	return s.loadDocument(ctx, s.db, nd.ownerID, id, false, true)
}

func (s *Store) CreateDocument(ctx context.Context, ownerID, title, content, templateKey string) (Document, error) {
	d, err := s.insertDocument(ctx, newDocument{ownerID: ownerID, title: title, content: content, templateKey: templateKey})
	if err != nil {
		return Document{}, fmt.Errorf("create document: %w", err)
	}
	return d, nil
}

func (s *Store) GetDocument(ctx context.Context, ownerID, id string, includeDeleted bool) (Document, error) {
	d, err := s.loadDocument(ctx, s.db, ownerID, id, includeDeleted, true)
	if err != nil {
		return Document{}, fmt.Errorf("get document: %w", err)
	}
	return d, nil
}

func escapeLike(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return r.Replace(s)
}

func (s *Store) ListDocuments(ctx context.Context, ownerID string, f ListFilter) ([]DocumentSummary, error) {
	query := `SELECT id, title, tags, version, updated_at, created_at, thumbnail IS NOT NULL FROM documents WHERE owner_id = ?`
	args := []any{ownerID}
	order := `updated_at DESC, id`
	if f.Trashed {
		query += ` AND deleted_at IS NOT NULL`
		order = `deleted_at DESC, id`
	} else {
		query += ` AND deleted_at IS NULL`
	}
	if q := strings.TrimSpace(f.Query); q != "" {
		pat := "%" + escapeLike(q) + "%"
		query += ` AND (title LIKE ? ESCAPE '\' OR EXISTS (SELECT 1 FROM json_each(documents.tags) WHERE value LIKE ? ESCAPE '\'))`
		args = append(args, pat, pat)
	}
	if f.Tag != "" {
		query += ` AND EXISTS (SELECT 1 FROM json_each(documents.tags) WHERE value = ?)`
		args = append(args, f.Tag)
	}
	query += ` ORDER BY ` + order

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list documents: %w", err)
	}
	defer func() { _ = rows.Close() }()

	out := []DocumentSummary{}
	for rows.Next() {
		var (
			d                          DocumentSummary
			tags, updatedAt, createdAt string
		)
		if err := rows.Scan(&d.ID, &d.Title, &tags, &d.Version, &updatedAt, &createdAt, &d.HasThumbnail); err != nil {
			return nil, fmt.Errorf("scan document: %w", err)
		}
		if err := json.Unmarshal([]byte(tags), &d.Tags); err != nil {
			return nil, fmt.Errorf("decode tags: %w", err)
		}
		if d.Tags == nil {
			d.Tags = []string{}
		}
		if d.UpdatedAt, err = parseTime(updatedAt); err != nil {
			return nil, err
		}
		if d.CreatedAt, err = parseTime(createdAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list documents: %w", err)
	}
	return out, nil
}

func (s *Store) UpdateDocumentMeta(ctx context.Context, ownerID, id string, u MetaUpdate) (Document, error) {
	var title, tags sql.NullString
	if u.Title != nil {
		title = sql.NullString{String: *u.Title, Valid: true}
	}
	if u.Tags != nil {
		encoded, err := encodeTags(*u.Tags)
		if err != nil {
			return Document{}, fmt.Errorf("update document meta: %w", err)
		}
		tags = sql.NullString{String: encoded, Valid: true}
	}

	var d Document
	err := s.inTx(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `
			UPDATE documents
			SET title = COALESCE(?, title), tags = COALESCE(?, tags), updated_at = ?
			WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
			title, tags, formatTime(s.now()), id, ownerID)
		if err != nil {
			return fmt.Errorf("update document: %w", err)
		}
		n, err := rowsAffected(res)
		if err != nil {
			return err
		}
		if n == 0 {
			return ErrNotFound
		}
		d, err = s.loadDocument(ctx, tx, ownerID, id, false, false)
		return err
	})
	if err != nil {
		return Document{}, fmt.Errorf("update document meta: %w", err)
	}
	return d, nil
}

func (s *Store) SoftDeleteDocument(ctx context.Context, ownerID, id string) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE documents SET deleted_at = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
		formatTime(s.now()), id, ownerID)
	if err != nil {
		return fmt.Errorf("soft delete document: %w", err)
	}
	n, err := rowsAffected(res)
	if err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("soft delete document: %w", ErrNotFound)
	}
	return nil
}

func (s *Store) RestoreDocument(ctx context.Context, ownerID, id string) (Document, error) {
	_, err := s.db.ExecContext(ctx,
		`UPDATE documents SET deleted_at = NULL WHERE id = ? AND owner_id = ? AND deleted_at IS NOT NULL`, id, ownerID)
	if err != nil {
		return Document{}, fmt.Errorf("restore document: %w", err)
	}
	d, err := s.loadDocument(ctx, s.db, ownerID, id, false, false)
	if err != nil {
		return Document{}, fmt.Errorf("restore document: %w", err)
	}
	return d, nil
}

func (s *Store) DuplicateDocument(ctx context.Context, ownerID, id string) (Document, error) {
	src, err := s.loadDocument(ctx, s.db, ownerID, id, false, true)
	if err != nil {
		return Document{}, fmt.Errorf("duplicate document: %w", err)
	}
	var thumb []byte
	err = s.db.QueryRowContext(ctx, `SELECT thumbnail FROM documents WHERE id = ?`, id).Scan(&thumb)
	if err != nil {
		return Document{}, fmt.Errorf("duplicate document: %w", mapNotFound(err))
	}
	d, err := s.insertDocument(ctx, newDocument{
		ownerID:     ownerID,
		title:       src.Title + " (copy)",
		tags:        src.Tags,
		content:     src.Content,
		templateKey: src.TemplateKey,
		thumbnail:   thumb,
	})
	if err != nil {
		return Document{}, fmt.Errorf("duplicate document: %w", err)
	}
	return d, nil
}

func (s *Store) SaveContent(ctx context.Context, ownerID, id string, expectedVersion int, content, label string) (SaveResult, error) {
	var res SaveResult
	err := s.inTx(ctx, func(tx *sql.Tx) error {
		var err error
		res, err = s.saveContentTx(ctx, tx, ownerID, id, &expectedVersion, content, label)
		return err
	})
	if err != nil {
		return SaveResult{}, fmt.Errorf("save content: %w", err)
	}
	return res, nil
}

func (s *Store) saveContentTx(ctx context.Context, tx *sql.Tx, ownerID, id string, expected *int, content, label string) (SaveResult, error) {
	now := s.now()
	query := `UPDATE documents SET content = ?, version = version + 1, updated_at = ?
		WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`
	args := []any{content, formatTime(now), id, ownerID}
	if expected != nil {
		query += ` AND version = ?`
		args = append(args, *expected)
	}
	query += ` RETURNING version`

	var version int
	err := tx.QueryRowContext(ctx, query, args...).Scan(&version)
	if errors.Is(err, sql.ErrNoRows) {
		if expected == nil {
			return SaveResult{}, ErrNotFound
		}
		var current int
		var updatedAt string
		err := tx.QueryRowContext(ctx,
			`SELECT version, updated_at FROM documents WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
			id, ownerID).Scan(&current, &updatedAt)
		if err != nil {
			return SaveResult{}, mapNotFound(err)
		}
		t, err := parseTime(updatedAt)
		if err != nil {
			return SaveResult{}, err
		}
		return SaveResult{}, &VersionConflictError{Version: current, UpdatedAt: t}
	}
	if err != nil {
		return SaveResult{}, fmt.Errorf("update content: %w", err)
	}

	if err := s.snapshotIfDue(ctx, tx, id, ownerID, version, content, label, now); err != nil {
		return SaveResult{}, err
	}
	return SaveResult{Version: version, UpdatedAt: now}, nil
}

func (s *Store) snapshotIfDue(ctx context.Context, tx *sql.Tx, docID, ownerID string, version int, content, label string, now time.Time) error {
	take := label != ""
	if !take {
		var latest sql.NullString
		if err := tx.QueryRowContext(ctx, `SELECT MAX(created_at) FROM document_versions WHERE document_id = ?`, docID).Scan(&latest); err != nil {
			return fmt.Errorf("latest snapshot: %w", err)
		}
		if !latest.Valid {
			take = true
		} else {
			t, err := parseTime(latest.String)
			if err != nil {
				return err
			}
			take = now.Sub(t) > SnapshotInterval
		}
	}
	if !take {
		return nil
	}
	if err := insertSnapshot(ctx, tx, docID, version, content, label, ownerID, now); err != nil {
		return err
	}
	return pruneSnapshots(ctx, tx, docID, version)
}

func pruneSnapshots(ctx context.Context, tx *sql.Tx, docID string, keepVersion int) error {
	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM document_versions WHERE document_id = ?`, docID).Scan(&count); err != nil {
		return fmt.Errorf("count snapshots: %w", err)
	}
	excess := count - MaxSnapshots
	if excess <= 0 {
		return nil
	}
	_, err := tx.ExecContext(ctx, `
		DELETE FROM document_versions WHERE id IN (
			SELECT id FROM document_versions
			WHERE document_id = ? AND version <> ?
			ORDER BY (label IS NOT NULL), version ASC
			LIMIT ?
		)`, docID, keepVersion, excess)
	if err != nil {
		return fmt.Errorf("prune snapshots: %w", err)
	}
	return nil
}

func (s *Store) SetThumbnail(ctx context.Context, ownerID, id string, png []byte) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE documents SET thumbnail = ? WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`, png, id, ownerID)
	if err != nil {
		return fmt.Errorf("set thumbnail: %w", err)
	}
	n, err := rowsAffected(res)
	if err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("set thumbnail: %w", ErrNotFound)
	}
	return nil
}

func (s *Store) GetThumbnail(ctx context.Context, ownerID, id string) ([]byte, error) {
	var thumb []byte
	err := s.db.QueryRowContext(ctx, `SELECT thumbnail FROM documents WHERE id = ? AND owner_id = ?`, id, ownerID).Scan(&thumb)
	if err != nil {
		return nil, fmt.Errorf("get thumbnail: %w", mapNotFound(err))
	}
	if thumb == nil {
		return nil, fmt.Errorf("get thumbnail: %w", ErrNotFound)
	}
	return thumb, nil
}
