package single

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/hayward-solutions/chart.it/internal/db"
	"github.com/hayward-solutions/chart.it/internal/store"
)

func newStore(t *testing.T) *store.Store {
	t.Helper()
	ctx := context.Background()
	conn, err := db.Open(ctx, filepath.Join(t.TempDir(), "chartit.db"))
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })
	require.NoError(t, db.Migrate(ctx, conn))
	return store.New(conn)
}

func TestAuthenticateReturnsTheLocalUser(t *testing.T) {
	st := newStore(t)
	a, err := New(context.Background(), st)
	require.NoError(t, err)

	u, err := a.Authenticate(httptest.NewRequest(http.MethodGet, "/api/v1/me", nil))
	require.NoError(t, err)
	assert.Equal(t, UserName, u.Name)
	assert.NotEmpty(t, u.ID)

	stored, err := st.GetUser(context.Background(), u.ID)
	require.NoError(t, err)
	assert.Equal(t, Subject, stored.Subject)
}

func TestNewReusesTheSameUserAcrossRestarts(t *testing.T) {
	st := newStore(t)
	first, err := New(context.Background(), st)
	require.NoError(t, err)
	second, err := New(context.Background(), st)
	require.NoError(t, err)
	assert.Equal(t, first.user.ID, second.user.ID)
}

func TestRoutes(t *testing.T) {
	a, err := New(context.Background(), newStore(t))
	require.NoError(t, err)
	h := a.Routes()

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/login", nil))
	assert.Equal(t, http.StatusFound, rec.Code)
	assert.Equal(t, "/", rec.Header().Get("Location"))

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/logout", nil))
	assert.Equal(t, http.StatusNoContent, rec.Code)
}
