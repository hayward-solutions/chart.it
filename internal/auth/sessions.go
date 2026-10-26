package auth

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/hayward-solutions/chart.it/internal/store"
)

const (
	CookieName     = "chartit_session"
	SessionTTL     = 30 * 24 * time.Hour
	touchThreshold = time.Minute
)

type Sessions struct {
	store  *store.Store
	secure bool
	ttl    time.Duration
	now    func() time.Time
}

func NewSessions(st *store.Store, secureCookies bool) *Sessions {
	return &Sessions{store: st, secure: secureCookies, ttl: SessionTTL, now: time.Now}
}

func (s *Sessions) Start(w http.ResponseWriter, r *http.Request, u store.User) error {
	sess, err := s.store.CreateSession(r.Context(), u.ID, s.ttl)
	if err != nil {
		return fmt.Errorf("start session: %w", err)
	}
	SetSessionCookie(w, sess.ID, sess.ExpiresAt, s.secure)
	return nil
}

func (s *Sessions) Authenticate(r *http.Request) (User, error) {
	c, err := r.Cookie(CookieName)
	if err != nil || c.Value == "" {
		return User{}, ErrUnauthenticated
	}
	sess, err := s.store.GetSession(r.Context(), c.Value)
	if errors.Is(err, store.ErrNotFound) {
		return User{}, ErrUnauthenticated
	}
	if err != nil {
		return User{}, fmt.Errorf("authenticate: %w", err)
	}
	u, err := s.store.GetUser(r.Context(), sess.UserID)
	if errors.Is(err, store.ErrNotFound) {
		return User{}, ErrUnauthenticated
	}
	if err != nil {
		return User{}, fmt.Errorf("authenticate: %w", err)
	}
	if s.now().Sub(u.LastSeenAt) > touchThreshold {
		if err := s.store.TouchUserLastSeen(r.Context(), u.ID); err != nil {
			slog.WarnContext(r.Context(), "touch user last seen", "err", err)
		}
	}
	return FromStoreUser(u), nil
}

func (s *Sessions) End(w http.ResponseWriter, r *http.Request) error {
	defer ClearSessionCookie(w, s.secure)
	c, err := r.Cookie(CookieName)
	if err != nil || c.Value == "" {
		return nil
	}
	if err := s.store.DeleteSession(r.Context(), c.Value); err != nil {
		return fmt.Errorf("end session: %w", err)
	}
	return nil
}

func FromStoreUser(u store.User) User {
	return User{ID: u.ID, Name: u.Name, Email: u.Email, AvatarURL: u.AvatarURL}
}

func SetSessionCookie(w http.ResponseWriter, id string, expires time.Time, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    id,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func ClearSessionCookie(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}
