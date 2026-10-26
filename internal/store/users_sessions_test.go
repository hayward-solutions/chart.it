package store

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpsertUserBySubject(t *testing.T) {
	f := newFixture(t)

	again, err := f.store.UpsertUserBySubject(f.ctx, "test:alice", "Alice B", "alice2@test.local", "http://a/b.png")
	require.NoError(t, err)
	assert.Equal(t, f.alice.ID, again.ID)
	assert.Equal(t, "Alice B", again.Name)
	assert.Equal(t, "alice2@test.local", again.Email)
	assert.Equal(t, "http://a/b.png", again.AvatarURL)
	assert.Equal(t, f.alice.CreatedAt, again.CreatedAt)

	assert.Len(t, f.alice.ID, 32)
	assert.NotEqual(t, f.alice.ID, f.bob.ID)
}

func TestGetUserAndTouch(t *testing.T) {
	f := newFixture(t)

	got, err := f.store.GetUser(f.ctx, f.alice.ID)
	require.NoError(t, err)
	assert.Equal(t, "test:alice", got.Subject)

	_, err = f.store.GetUser(f.ctx, "missing")
	assert.ErrorIs(t, err, ErrNotFound)

	f.clock.Advance(time.Hour)
	require.NoError(t, f.store.TouchUserLastSeen(f.ctx, f.alice.ID))
	got, err = f.store.GetUser(f.ctx, f.alice.ID)
	require.NoError(t, err)
	assert.Equal(t, f.clock.Now(), got.LastSeenAt)

	assert.ErrorIs(t, f.store.TouchUserLastSeen(f.ctx, "missing"), ErrNotFound)
}

func TestSessions(t *testing.T) {
	f := newFixture(t)

	sess, err := f.store.CreateSession(f.ctx, f.alice.ID, time.Hour)
	require.NoError(t, err)
	assert.Len(t, sess.ID, 32)

	got, err := f.store.GetSession(f.ctx, sess.ID)
	require.NoError(t, err)
	assert.Equal(t, f.alice.ID, got.UserID)
	assert.Equal(t, sess.ExpiresAt, got.ExpiresAt)

	_, err = f.store.GetSession(f.ctx, "nope")
	assert.ErrorIs(t, err, ErrNotFound)

	f.clock.Advance(time.Hour - time.Millisecond)
	_, err = f.store.GetSession(f.ctx, sess.ID)
	assert.NoError(t, err)

	f.clock.Advance(time.Millisecond)
	_, err = f.store.GetSession(f.ctx, sess.ID)
	assert.ErrorIs(t, err, ErrNotFound)
}

func TestDeleteSessions(t *testing.T) {
	f := newFixture(t)

	short, err := f.store.CreateSession(f.ctx, f.alice.ID, time.Minute)
	require.NoError(t, err)
	long, err := f.store.CreateSession(f.ctx, f.alice.ID, time.Hour)
	require.NoError(t, err)
	gone, err := f.store.CreateSession(f.ctx, f.bob.ID, time.Hour)
	require.NoError(t, err)

	require.NoError(t, f.store.DeleteSession(f.ctx, gone.ID))
	_, err = f.store.GetSession(f.ctx, gone.ID)
	assert.ErrorIs(t, err, ErrNotFound)
	assert.NoError(t, f.store.DeleteSession(f.ctx, gone.ID))

	f.clock.Advance(2 * time.Minute)
	n, err := f.store.DeleteExpiredSessions(f.ctx)
	require.NoError(t, err)
	assert.EqualValues(t, 1, n)

	_, err = f.store.GetSession(f.ctx, short.ID)
	assert.ErrorIs(t, err, ErrNotFound)
	_, err = f.store.GetSession(f.ctx, long.ID)
	assert.NoError(t, err)
}
