package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/hayward-solutions/chart.it/internal/db"
	"github.com/hayward-solutions/chart.it/internal/store"
)

type stubAuthenticator struct {
	user User
	err  error
}

func (s stubAuthenticator) Name() string                                    { return "stub" }
func (s stubAuthenticator) Routes() http.Handler                            { return http.NotFoundHandler() }
func (s stubAuthenticator) Authenticate(*http.Request) (User, error)        { return s.user, s.err }
func (s stubAuthenticator) Logout(http.ResponseWriter, *http.Request) error { return nil }

func TestRequireUser(t *testing.T) {
	ok := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(FromContext(r.Context()).ID))
	})

	tests := []struct {
		name         string
		auth         stubAuthenticator
		path         string
		wantStatus   int
		wantLocation string
		wantBody     string
		wantProblem  bool
	}{
		{"authenticated", stubAuthenticator{user: User{ID: "u1"}}, "/api/v1/me", http.StatusOK, "", "u1", false},
		{"api unauthenticated", stubAuthenticator{err: ErrUnauthenticated}, "/api/v1/me", http.StatusUnauthorized, "", "", true},
		{"page unauthenticated redirects", stubAuthenticator{err: ErrUnauthenticated}, "/d/abc", http.StatusFound, "/auth/login", "", false},
		{"backend failure", stubAuthenticator{err: assert.AnError}, "/api/v1/me", http.StatusInternalServerError, "", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			RequireUser(tt.auth)(ok).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tt.path, nil))
			assert.Equal(t, tt.wantStatus, rec.Code)
			assert.Equal(t, tt.wantLocation, rec.Header().Get("Location"))
			if tt.wantProblem {
				assert.Equal(t, "application/problem+json", rec.Header().Get("Content-Type"))
			}
			if tt.wantBody != "" {
				assert.Equal(t, tt.wantBody, rec.Body.String())
			}
		})
	}
}

func TestSessionsLifecycle(t *testing.T) {
	ctx := context.Background()
	conn, err := db.Open(ctx, filepath.Join(t.TempDir(), "chartit.db"))
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })
	require.NoError(t, db.Migrate(ctx, conn))

	now := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)
	st := store.NewWithClock(conn, func() time.Time { return now })
	sessions := NewSessions(st, true)
	sessions.now = func() time.Time { return now }

	u, err := st.UpsertUserBySubject(ctx, "s:1", "Ann", "ann@x", "http://img")
	require.NoError(t, err)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	require.NoError(t, sessions.Start(rec, req, u))
	cookies := rec.Result().Cookies()
	require.Len(t, cookies, 1)
	assert.True(t, cookies[0].Secure)
	assert.True(t, cookies[0].HttpOnly)
	assert.Equal(t, now.Add(SessionTTL), cookies[0].Expires.UTC())

	authed := httptest.NewRequest(http.MethodGet, "/", nil)
	authed.AddCookie(cookies[0])
	got, err := sessions.Authenticate(authed)
	require.NoError(t, err)
	assert.Equal(t, User{ID: u.ID, Name: "Ann", Email: "ann@x", AvatarURL: "http://img"}, got)

	_, err = sessions.Authenticate(httptest.NewRequest(http.MethodGet, "/", nil))
	assert.ErrorIs(t, err, ErrUnauthenticated)

	end := httptest.NewRecorder()
	require.NoError(t, sessions.End(end, authed))
	cleared := end.Result().Cookies()
	require.Len(t, cleared, 1)
	assert.Equal(t, -1, cleared[0].MaxAge)

	_, err = sessions.Authenticate(authed)
	assert.ErrorIs(t, err, ErrUnauthenticated)

	now = now.Add(SessionTTL + time.Hour)
	rec = httptest.NewRecorder()
	require.NoError(t, sessions.Start(rec, req, u))
	expired := httptest.NewRequest(http.MethodGet, "/", nil)
	expired.AddCookie(rec.Result().Cookies()[0])
	now = now.Add(SessionTTL + time.Hour)
	_, err = sessions.Authenticate(expired)
	assert.ErrorIs(t, err, ErrUnauthenticated)
}

func TestContextHelpers(t *testing.T) {
	assert.Equal(t, User{}, FromContext(context.Background()))
	u := User{ID: "x", Name: "n"}
	assert.Equal(t, u, FromContext(WithUser(context.Background(), u)))
}
