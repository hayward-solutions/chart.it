package store

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestShareLifecycle(t *testing.T) {
	f := newFixture(t)
	d, err := f.store.CreateDocument(f.ctx, f.alice.ID, "Shared", "body", "")
	require.NoError(t, err)

	first, err := f.store.CreateShare(f.ctx, f.alice.ID, d.ID)
	require.NoError(t, err)
	assert.Len(t, first.Token, 32)
	assert.Equal(t, "view", first.Permission)

	f.clock.Advance(time.Minute)
	second, err := f.store.CreateShare(f.ctx, f.alice.ID, d.ID)
	require.NoError(t, err)
	assert.NotEqual(t, first.Token, second.Token)

	list, err := f.store.ListShares(f.ctx, f.alice.ID, d.ID)
	require.NoError(t, err)
	require.Len(t, list, 2)
	assert.Equal(t, second.Token, list[0].Token)
	assert.Equal(t, first.Token, list[1].Token)

	got, err := f.store.GetSharedDocument(f.ctx, first.Token)
	require.NoError(t, err)
	assert.Equal(t, "Shared", got.Title)
	assert.Equal(t, "body", got.Content)
	assert.Equal(t, d.UpdatedAt, got.UpdatedAt)

	f.clock.Advance(time.Minute)
	_, err = f.store.SaveContent(f.ctx, f.alice.ID, d.ID, 1, "new body", "")
	require.NoError(t, err)
	got, err = f.store.GetSharedDocument(f.ctx, first.Token)
	require.NoError(t, err)
	assert.Equal(t, "new body", got.Content)
	assert.Equal(t, f.clock.Now(), got.UpdatedAt)

	require.NoError(t, f.store.RevokeShare(f.ctx, f.alice.ID, d.ID, first.Token))

	_, err = f.store.GetSharedDocument(f.ctx, first.Token)
	assert.ErrorIs(t, err, ErrNotFound)
	_, err = f.store.GetSharedDocument(f.ctx, second.Token)
	assert.NoError(t, err)

	list, err = f.store.ListShares(f.ctx, f.alice.ID, d.ID)
	require.NoError(t, err)
	require.Len(t, list, 1)
	assert.Equal(t, second.Token, list[0].Token)

	assert.ErrorIs(t, f.store.RevokeShare(f.ctx, f.alice.ID, d.ID, first.Token), ErrNotFound)
}

func TestShareScoping(t *testing.T) {
	f := newFixture(t)
	d := f.newDoc(t, f.alice, "Mine")
	other := f.newDoc(t, f.alice, "Other")
	sh, err := f.store.CreateShare(f.ctx, f.alice.ID, d.ID)
	require.NoError(t, err)

	assert.ErrorIs(t, f.store.RevokeShare(f.ctx, f.bob.ID, d.ID, sh.Token), ErrNotFound)
	assert.ErrorIs(t, f.store.RevokeShare(f.ctx, f.alice.ID, other.ID, sh.Token), ErrNotFound)
	assert.ErrorIs(t, f.store.RevokeShare(f.ctx, f.alice.ID, d.ID, "unknown"), ErrNotFound)

	_, err = f.store.GetSharedDocument(f.ctx, sh.Token)
	assert.NoError(t, err)

	_, err = f.store.GetSharedDocument(f.ctx, "unknown")
	assert.ErrorIs(t, err, ErrNotFound)
	_, err = f.store.GetSharedDocument(f.ctx, "")
	assert.ErrorIs(t, err, ErrNotFound)

	_, err = f.store.CreateShare(f.ctx, f.alice.ID, "missing")
	assert.ErrorIs(t, err, ErrNotFound)
}
