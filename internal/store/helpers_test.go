package store

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/hayward-solutions/chart.it/internal/db"
	"github.com/stretchr/testify/require"
)

type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func newFakeClock() *fakeClock {
	return &fakeClock{t: time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)}
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

type fixture struct {
	ctx   context.Context
	store *Store
	clock *fakeClock
	alice User
	bob   User
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	ctx := context.Background()
	conn, err := db.Open(ctx, filepath.Join(t.TempDir(), "chartit.db"))
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })
	require.NoError(t, db.Migrate(ctx, conn))

	clock := newFakeClock()
	st := NewWithClock(conn, clock.Now)
	alice, err := st.UpsertUserBySubject(ctx, "test:alice", "Alice", "alice@test.local", "")
	require.NoError(t, err)
	bob, err := st.UpsertUserBySubject(ctx, "test:bob", "Bob", "bob@test.local", "")
	require.NoError(t, err)
	return &fixture{ctx: ctx, store: st, clock: clock, alice: alice, bob: bob}
}

func (f *fixture) newDoc(t *testing.T, owner User, title string) Document {
	t.Helper()
	d, err := f.store.CreateDocument(f.ctx, owner.ID, title, `{"v":0}`, "")
	require.NoError(t, err)
	return d
}

func isConflict(err error) bool {
	return errors.Is(err, ErrVersionConflict)
}
