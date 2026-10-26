package store

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func versionNumbers(vs []Version) []int {
	out := make([]int, len(vs))
	for i, v := range vs {
		out[i] = v.Version
	}
	return out
}

func TestSnapshotRules(t *testing.T) {
	type step struct {
		advance  time.Duration
		label    string
		snapshot bool
	}
	tests := []struct {
		name  string
		steps []step
	}{
		{
			name: "quick saves do not snapshot",
			steps: []step{
				{advance: time.Second},
				{advance: time.Minute},
				{advance: time.Minute},
			},
		},
		{
			name: "exactly five minutes does not snapshot",
			steps: []step{
				{advance: 5 * time.Minute},
			},
		},
		{
			name: "just over five minutes snapshots",
			steps: []step{
				{advance: 5*time.Minute + time.Millisecond, snapshot: true},
			},
		},
		{
			name: "interval is measured from the latest snapshot",
			steps: []step{
				{advance: 4 * time.Minute},
				{advance: 2 * time.Minute, snapshot: true},
				{advance: 4 * time.Minute},
				{advance: 2 * time.Minute, snapshot: true},
			},
		},
		{
			name: "label forces a snapshot",
			steps: []step{
				{advance: time.Second, label: "Milestone", snapshot: true},
				{advance: time.Second, label: "Another", snapshot: true},
			},
		},
		{
			name: "label resets the interval",
			steps: []step{
				{advance: 4 * time.Minute},
				{advance: time.Minute, label: "Label", snapshot: true},
				{advance: 4 * time.Minute},
				{advance: 2 * time.Minute, snapshot: true},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newFixture(t)
			d := f.newDoc(t, f.alice, "Doc")

			want := []int{1}
			version := 1
			for i, s := range tt.steps {
				f.clock.Advance(s.advance)
				res, err := f.store.SaveContent(f.ctx, f.alice.ID, d.ID, version, fmt.Sprintf("c%d", i), s.label)
				require.NoError(t, err)
				version = res.Version
				if s.snapshot {
					want = append([]int{version}, want...)
				}
			}

			versions, err := f.store.ListVersions(f.ctx, f.alice.ID, d.ID)
			require.NoError(t, err)
			assert.Equal(t, want, versionNumbers(versions))
		})
	}
}

func TestSnapshotContentAndLabel(t *testing.T) {
	f := newFixture(t)
	d := f.newDoc(t, f.alice, "Doc")

	f.clock.Advance(time.Second)
	_, err := f.store.SaveContent(f.ctx, f.alice.ID, d.ID, 1, "labelled body", "Release 1")
	require.NoError(t, err)

	v, err := f.store.GetVersion(f.ctx, f.alice.ID, d.ID, 2)
	require.NoError(t, err)
	assert.Equal(t, "labelled body", v.Content)
	assert.Equal(t, "Release 1", v.Label)
	assert.Equal(t, f.alice.ID, v.CreatedBy)
	assert.Equal(t, f.clock.Now(), v.CreatedAt)

	first, err := f.store.GetVersion(f.ctx, f.alice.ID, d.ID, 1)
	require.NoError(t, err)
	assert.Equal(t, `{"v":0}`, first.Content)
	assert.Empty(t, first.Label)

	_, err = f.store.GetVersion(f.ctx, f.alice.ID, d.ID, 99)
	assert.ErrorIs(t, err, ErrNotFound)

	list, err := f.store.ListVersions(f.ctx, f.alice.ID, d.ID)
	require.NoError(t, err)
	require.Len(t, list, 2)
	assert.Empty(t, list[0].Content)
}

func TestSnapshotCap(t *testing.T) {
	t.Run("oldest unlabelled are deleted first", func(t *testing.T) {
		f := newFixture(t)
		d := f.newDoc(t, f.alice, "Doc")

		version := 1
		save := func(label string) {
			f.clock.Advance(6 * time.Minute)
			res, err := f.store.SaveContent(f.ctx, f.alice.ID, d.ID, version, "c", label)
			require.NoError(t, err)
			version = res.Version
		}
		for i := range 3 {
			save(fmt.Sprintf("keep-%d", i))
		}
		for range MaxSnapshots + 30 {
			save("")
		}

		versions, err := f.store.ListVersions(f.ctx, f.alice.ID, d.ID)
		require.NoError(t, err)
		assert.Len(t, versions, MaxSnapshots)
		assert.Equal(t, version, versions[0].Version)

		labelled := 0
		for _, v := range versions {
			if v.Label != "" {
				labelled++
			}
		}
		assert.Equal(t, 3, labelled)
		assert.NotContains(t, versionNumbers(versions), 1)
		assert.Contains(t, versionNumbers(versions), 2)
		assert.Contains(t, versionNumbers(versions), 3)
		assert.Contains(t, versionNumbers(versions), 4)

		oldestUnlabelled := 0
		for i := len(versions) - 1; i >= 0; i-- {
			if versions[i].Label == "" {
				oldestUnlabelled = versions[i].Version
				break
			}
		}
		assert.Equal(t, version-(MaxSnapshots-3)+1, oldestUnlabelled)
	})

	t.Run("all labelled drops the oldest labelled but keeps the newest", func(t *testing.T) {
		f := newFixture(t)
		d := f.newDoc(t, f.alice, "Doc")

		version := 1
		total := MaxSnapshots + 5
		for i := range total {
			f.clock.Advance(time.Second)
			res, err := f.store.SaveContent(f.ctx, f.alice.ID, d.ID, version, "c", fmt.Sprintf("L%d", i))
			require.NoError(t, err)
			version = res.Version
		}

		versions, err := f.store.ListVersions(f.ctx, f.alice.ID, d.ID)
		require.NoError(t, err)
		assert.Len(t, versions, MaxSnapshots)
		assert.Equal(t, version, versions[0].Version)
		assert.Equal(t, version-MaxSnapshots+1, versions[len(versions)-1].Version)
	})

	t.Run("cap is per document", func(t *testing.T) {
		f := newFixture(t)
		a := f.newDoc(t, f.alice, "A")
		b := f.newDoc(t, f.alice, "B")

		version := 1
		for range MaxSnapshots + 2 {
			f.clock.Advance(6 * time.Minute)
			res, err := f.store.SaveContent(f.ctx, f.alice.ID, a.ID, version, "c", "")
			require.NoError(t, err)
			version = res.Version
		}

		vb, err := f.store.ListVersions(f.ctx, f.alice.ID, b.ID)
		require.NoError(t, err)
		assert.Len(t, vb, 1)
	})
}

func TestRestoreVersion(t *testing.T) {
	f := newFixture(t)
	d, err := f.store.CreateDocument(f.ctx, f.alice.ID, "Doc", "original", "")
	require.NoError(t, err)

	f.clock.Advance(time.Minute)
	_, err = f.store.SaveContent(f.ctx, f.alice.ID, d.ID, 1, "edited", "")
	require.NoError(t, err)
	f.clock.Advance(time.Minute)
	_, err = f.store.SaveContent(f.ctx, f.alice.ID, d.ID, 2, "edited again", "")
	require.NoError(t, err)

	f.clock.Advance(time.Minute)
	res, err := f.store.RestoreVersion(f.ctx, f.alice.ID, d.ID, 1)
	require.NoError(t, err)
	assert.Equal(t, 4, res.Version)
	assert.Equal(t, f.clock.Now(), res.UpdatedAt)

	got, err := f.store.GetDocument(f.ctx, f.alice.ID, d.ID, false)
	require.NoError(t, err)
	assert.Equal(t, "original", got.Content)
	assert.Equal(t, 4, got.Version)

	v, err := f.store.GetVersion(f.ctx, f.alice.ID, d.ID, 4)
	require.NoError(t, err)
	assert.Equal(t, "original", v.Content)
	assert.Equal(t, "Restored from version 1", v.Label)

	old, err := f.store.GetVersion(f.ctx, f.alice.ID, d.ID, 1)
	require.NoError(t, err)
	assert.Equal(t, "original", old.Content)

	_, err = f.store.RestoreVersion(f.ctx, f.alice.ID, d.ID, 77)
	assert.ErrorIs(t, err, ErrNotFound)
	after, err := f.store.GetDocument(f.ctx, f.alice.ID, d.ID, false)
	require.NoError(t, err)
	assert.Equal(t, 4, after.Version)
}
