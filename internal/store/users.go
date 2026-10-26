package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type User struct {
	ID         string
	Subject    string
	Email      string
	Name       string
	AvatarURL  string
	CreatedAt  time.Time
	LastSeenAt time.Time
}

const userColumns = `id, subject, email, name, avatar_url, created_at, last_seen_at`

func scanUser(row interface{ Scan(...any) error }) (User, error) {
	var (
		u                     User
		email, name, avatar   sql.NullString
		createdAt, lastSeenAt string
	)
	if err := row.Scan(&u.ID, &u.Subject, &email, &name, &avatar, &createdAt, &lastSeenAt); err != nil {
		return User{}, mapNotFound(err)
	}
	u.Email, u.Name, u.AvatarURL = email.String, name.String, avatar.String
	var err error
	if u.CreatedAt, err = parseTime(createdAt); err != nil {
		return User{}, err
	}
	if u.LastSeenAt, err = parseTime(lastSeenAt); err != nil {
		return User{}, err
	}
	return u, nil
}

func (s *Store) UpsertUserBySubject(ctx context.Context, subject, name, email, avatarURL string) (User, error) {
	now := formatTime(s.now())
	row := s.db.QueryRowContext(ctx, `
		INSERT INTO users (id, subject, email, name, avatar_url, created_at, last_seen_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (subject) DO UPDATE SET
			email = excluded.email,
			name = excluded.name,
			avatar_url = excluded.avatar_url,
			last_seen_at = excluded.last_seen_at
		RETURNING `+userColumns,
		newID(), subject, nullString(email), nullString(name), nullString(avatarURL), now, now)
	u, err := scanUser(row)
	if err != nil {
		return User{}, fmt.Errorf("upsert user: %w", err)
	}
	return u, nil
}

func (s *Store) GetUser(ctx context.Context, id string) (User, error) {
	u, err := scanUser(s.db.QueryRowContext(ctx, `SELECT `+userColumns+` FROM users WHERE id = ?`, id))
	if err != nil {
		return User{}, fmt.Errorf("get user: %w", err)
	}
	return u, nil
}

func (s *Store) TouchUserLastSeen(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `UPDATE users SET last_seen_at = ? WHERE id = ?`, formatTime(s.now()), id)
	if err != nil {
		return fmt.Errorf("touch user: %w", err)
	}
	n, err := rowsAffected(res)
	if err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("touch user: %w", ErrNotFound)
	}
	return nil
}
