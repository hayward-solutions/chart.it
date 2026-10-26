package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/hayward-solutions/chart.it/internal/ids"
)

const (
	timeLayout       = "2006-01-02T15:04:05.000Z"
	SnapshotInterval = 5 * time.Minute
	MaxSnapshots     = 200
)

var ErrNotFound = errors.New("not found")

var ErrVersionConflict = errors.New("version conflict")

type VersionConflictError struct {
	Version   int
	UpdatedAt time.Time
}

func (e *VersionConflictError) Error() string {
	return fmt.Sprintf("version conflict: stored version is %d", e.Version)
}

func (e *VersionConflictError) Is(target error) bool {
	return target == ErrVersionConflict
}

type Clock func() time.Time

type Store struct {
	db    *sql.DB
	clock Clock
}

func New(db *sql.DB) *Store {
	return NewWithClock(db, time.Now)
}

func NewWithClock(db *sql.DB, clock Clock) *Store {
	return &Store{db: db, clock: clock}
}

func (s *Store) Ping(ctx context.Context) error {
	return s.db.PingContext(ctx)
}

func (s *Store) now() time.Time {
	return s.clock().UTC()
}

func formatTime(t time.Time) string {
	return t.UTC().Format(timeLayout)
}

func parseTime(s string) (time.Time, error) {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return time.Time{}, fmt.Errorf("parse time %q: %w", s, err)
	}
	return t.UTC(), nil
}

func parseNullTime(ns sql.NullString) (*time.Time, error) {
	if !ns.Valid {
		return nil, nil
	}
	t, err := parseTime(ns.String)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func nullString(s string) sql.NullString {
	return sql.NullString{String: s, Valid: s != ""}
}

func mapNotFound(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

func newID() string {
	return ids.New()
}

type queryer interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func (s *Store) inTx(ctx context.Context, fn func(tx *sql.Tx) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}
	return nil
}

func rowsAffected(res sql.Result) (int64, error) {
	n, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("rows affected: %w", err)
	}
	return n, nil
}
