package store

import (
	"context"
	"fmt"
	"time"
)

type Session struct {
	ID        string
	UserID    string
	ExpiresAt time.Time
	CreatedAt time.Time
}

func (s *Store) CreateSession(ctx context.Context, userID string, ttl time.Duration) (Session, error) {
	now := s.now()
	sess := Session{ID: newID(), UserID: userID, CreatedAt: now, ExpiresAt: now.Add(ttl)}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
		sess.ID, sess.UserID, formatTime(sess.ExpiresAt), formatTime(sess.CreatedAt))
	if err != nil {
		return Session{}, fmt.Errorf("create session: %w", err)
	}
	return sess, nil
}

func (s *Store) GetSession(ctx context.Context, id string) (Session, error) {
	var userID, expiresAt, createdAt string
	err := s.db.QueryRowContext(ctx,
		`SELECT user_id, expires_at, created_at FROM sessions WHERE id = ? AND expires_at > ?`,
		id, formatTime(s.now())).Scan(&userID, &expiresAt, &createdAt)
	if err != nil {
		return Session{}, fmt.Errorf("get session: %w", mapNotFound(err))
	}
	sess := Session{ID: id, UserID: userID}
	if sess.ExpiresAt, err = parseTime(expiresAt); err != nil {
		return Session{}, err
	}
	if sess.CreatedAt, err = parseTime(createdAt); err != nil {
		return Session{}, err
	}
	return sess, nil
}

func (s *Store) DeleteSession(ctx context.Context, id string) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

func (s *Store) DeleteExpiredSessions(ctx context.Context) (int64, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at <= ?`, formatTime(s.now()))
	if err != nil {
		return 0, fmt.Errorf("delete expired sessions: %w", err)
	}
	return rowsAffected(res)
}
