package store

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func strPtr(s string) *string { return &s }

func tagsPtr(t ...string) *[]string { return &t }

func TestCreateAndGetDocument(t *testing.T) {
	f := newFixture(t)

	d, err := f.store.CreateDocument(f.ctx, f.alice.ID, "Network", `{"a":1}`, "aws-vpc")
	require.NoError(t, err)
	assert.Len(t, d.ID, 32)
	assert.Equal(t, 1, d.Version)
	assert.Equal(t, "aws-vpc", d.TemplateKey)
	assert.Equal(t, []string{}, d.Tags)
	assert.Nil(t, d.DeletedAt)
	assert.Equal(t, f.clock.Now(), d.CreatedAt)

	got, err := f.store.GetDocument(f.ctx, f.alice.ID, d.ID, false)
	require.NoError(t, err)
	assert.Equal(t, `{"a":1}`, got.Content)
	assert.Equal(t, d, got)

	versions, err := f.store.ListVersions(f.ctx, f.alice.ID, d.ID)
	require.NoError(t, err)
	require.Len(t, versions, 1)
	assert.Equal(t, 1, versions[0].Version)
	assert.Equal(t, f.alice.ID, versions[0].CreatedBy)
}

func TestOwnerScoping(t *testing.T) {
	f := newFixture(t)
	d := f.newDoc(t, f.alice, "Private")
	_, err := f.store.CreateShare(f.ctx, f.alice.ID, d.ID)
	require.NoError(t, err)

	steps := []struct {
		name string
		call func() error
	}{
		{"get", func() error { _, err := f.store.GetDocument(f.ctx, f.bob.ID, d.ID, true); return err }},
		{"meta", func() error {
			_, err := f.store.UpdateDocumentMeta(f.ctx, f.bob.ID, d.ID, MetaUpdate{Title: strPtr("x")})
			return err
		}},
		{"delete", func() error { return f.store.SoftDeleteDocument(f.ctx, f.bob.ID, d.ID) }},
		{"restore", func() error { _, err := f.store.RestoreDocument(f.ctx, f.bob.ID, d.ID); return err }},
		{"duplicate", func() error { _, err := f.store.DuplicateDocument(f.ctx, f.bob.ID, d.ID); return err }},
		{"save", func() error { _, err := f.store.SaveContent(f.ctx, f.bob.ID, d.ID, 1, "x", ""); return err }},
		{"set thumbnail", func() error { return f.store.SetThumbnail(f.ctx, f.bob.ID, d.ID, []byte("png")) }},
		{"get thumbnail", func() error { _, err := f.store.GetThumbnail(f.ctx, f.bob.ID, d.ID); return err }},
		{"list versions", func() error { _, err := f.store.ListVersions(f.ctx, f.bob.ID, d.ID); return err }},
		{"get version", func() error { _, err := f.store.GetVersion(f.ctx, f.bob.ID, d.ID, 1); return err }},
		{"restore version", func() error { _, err := f.store.RestoreVersion(f.ctx, f.bob.ID, d.ID, 1); return err }},
		{"create share", func() error { _, err := f.store.CreateShare(f.ctx, f.bob.ID, d.ID); return err }},
		{"list shares", func() error { _, err := f.store.ListShares(f.ctx, f.bob.ID, d.ID); return err }},
	}
	for _, s := range steps {
		t.Run(s.name, func(t *testing.T) {
			assert.ErrorIs(t, s.call(), ErrNotFound)
		})
	}

	list, err := f.store.ListDocuments(f.ctx, f.bob.ID, ListFilter{})
	require.NoError(t, err)
	assert.Empty(t, list)

	got, err := f.store.GetDocument(f.ctx, f.alice.ID, d.ID, false)
	require.NoError(t, err)
	assert.Equal(t, 1, got.Version)
	assert.Equal(t, "Private", got.Title)
}

func TestListDocuments(t *testing.T) {
	f := newFixture(t)

	a := f.newDoc(t, f.alice, "AWS prod")
	f.clock.Advance(time.Minute)
	b := f.newDoc(t, f.alice, "Azure 100%_dev")
	f.clock.Advance(time.Minute)
	c := f.newDoc(t, f.alice, "GCP edge")
	f.newDoc(t, f.bob, "AWS bob")

	_, err := f.store.UpdateDocumentMeta(f.ctx, f.alice.ID, a.ID, MetaUpdate{Tags: tagsPtr("prod", "aws")})
	require.NoError(t, err)
	f.clock.Advance(time.Minute)
	_, err = f.store.UpdateDocumentMeta(f.ctx, f.alice.ID, c.ID, MetaUpdate{Tags: tagsPtr("edge", "prod")})
	require.NoError(t, err)
	require.NoError(t, f.store.SetThumbnail(f.ctx, f.alice.ID, b.ID, []byte("png")))

	titles := func(l []DocumentSummary) []string {
		out := make([]string, len(l))
		for i, d := range l {
			out[i] = d.Title
		}
		return out
	}

	tests := []struct {
		name   string
		filter ListFilter
		want   []string
	}{
		{"all newest first", ListFilter{}, []string{"GCP edge", "AWS prod", "Azure 100%_dev"}},
		{"query case-insensitive", ListFilter{Query: "aws"}, []string{"AWS prod"}},
		{"query matches tag", ListFilter{Query: "edge"}, []string{"GCP edge"}},
		{"query escapes wildcards", ListFilter{Query: "100%_"}, []string{"Azure 100%_dev"}},
		{"query percent only does not match all", ListFilter{Query: "%"}, []string{"Azure 100%_dev"}},
		{"tag", ListFilter{Tag: "prod"}, []string{"GCP edge", "AWS prod"}},
		{"tag exact", ListFilter{Tag: "pro"}, []string{}},
		{"tag and query", ListFilter{Tag: "prod", Query: "gcp"}, []string{"GCP edge"}},
		{"trashed empty", ListFilter{Trashed: true}, []string{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := f.store.ListDocuments(f.ctx, f.alice.ID, tt.filter)
			require.NoError(t, err)
			assert.Equal(t, tt.want, titles(got))
		})
	}

	all, err := f.store.ListDocuments(f.ctx, f.alice.ID, ListFilter{})
	require.NoError(t, err)
	assert.True(t, all[2].HasThumbnail)
	assert.False(t, all[1].HasThumbnail)
	assert.Equal(t, []string{"edge", "prod"}, all[0].Tags)
}

func TestSoftDeleteVisibility(t *testing.T) {
	f := newFixture(t)
	d := f.newDoc(t, f.alice, "Doomed")
	require.NoError(t, f.store.SetThumbnail(f.ctx, f.alice.ID, d.ID, []byte("png")))
	share, err := f.store.CreateShare(f.ctx, f.alice.ID, d.ID)
	require.NoError(t, err)

	f.clock.Advance(time.Hour)
	require.NoError(t, f.store.SoftDeleteDocument(f.ctx, f.alice.ID, d.ID))
	assert.ErrorIs(t, f.store.SoftDeleteDocument(f.ctx, f.alice.ID, d.ID), ErrNotFound)

	_, err = f.store.GetDocument(f.ctx, f.alice.ID, d.ID, false)
	assert.ErrorIs(t, err, ErrNotFound)

	got, err := f.store.GetDocument(f.ctx, f.alice.ID, d.ID, true)
	require.NoError(t, err)
	require.NotNil(t, got.DeletedAt)
	assert.Equal(t, f.clock.Now(), *got.DeletedAt)

	live, err := f.store.ListDocuments(f.ctx, f.alice.ID, ListFilter{})
	require.NoError(t, err)
	assert.Empty(t, live)
	trashed, err := f.store.ListDocuments(f.ctx, f.alice.ID, ListFilter{Trashed: true})
	require.NoError(t, err)
	require.Len(t, trashed, 1)
	assert.True(t, trashed[0].HasThumbnail)

	_, err = f.store.SaveContent(f.ctx, f.alice.ID, d.ID, 1, "x", "")
	assert.ErrorIs(t, err, ErrNotFound)
	_, err = f.store.UpdateDocumentMeta(f.ctx, f.alice.ID, d.ID, MetaUpdate{Title: strPtr("x")})
	assert.ErrorIs(t, err, ErrNotFound)
	_, err = f.store.DuplicateDocument(f.ctx, f.alice.ID, d.ID)
	assert.ErrorIs(t, err, ErrNotFound)
	_, err = f.store.CreateShare(f.ctx, f.alice.ID, d.ID)
	assert.ErrorIs(t, err, ErrNotFound)
	_, err = f.store.ListVersions(f.ctx, f.alice.ID, d.ID)
	assert.ErrorIs(t, err, ErrNotFound)
	_, err = f.store.GetSharedDocument(f.ctx, share.Token)
	assert.ErrorIs(t, err, ErrNotFound)
	_, err = f.store.GetThumbnail(f.ctx, f.alice.ID, d.ID)
	assert.NoError(t, err)

	restored, err := f.store.RestoreDocument(f.ctx, f.alice.ID, d.ID)
	require.NoError(t, err)
	assert.Nil(t, restored.DeletedAt)

	_, err = f.store.GetDocument(f.ctx, f.alice.ID, d.ID, false)
	assert.NoError(t, err)
	shared, err := f.store.GetSharedDocument(f.ctx, share.Token)
	require.NoError(t, err)
	assert.Equal(t, "Doomed", shared.Title)

	again, err := f.store.RestoreDocument(f.ctx, f.alice.ID, d.ID)
	require.NoError(t, err)
	assert.Equal(t, restored, again)

	_, err = f.store.RestoreDocument(f.ctx, f.alice.ID, "missing")
	assert.ErrorIs(t, err, ErrNotFound)
}

func TestUpdateDocumentMeta(t *testing.T) {
	f := newFixture(t)
	d := f.newDoc(t, f.alice, "Before")

	f.clock.Advance(time.Minute)
	got, err := f.store.UpdateDocumentMeta(f.ctx, f.alice.ID, d.ID, MetaUpdate{Title: strPtr("After")})
	require.NoError(t, err)
	assert.Equal(t, "After", got.Title)
	assert.Equal(t, []string{}, got.Tags)
	assert.Empty(t, got.Content)
	assert.Equal(t, 1, got.Version)
	assert.Equal(t, f.clock.Now(), got.UpdatedAt)

	got, err = f.store.UpdateDocumentMeta(f.ctx, f.alice.ID, d.ID, MetaUpdate{Tags: tagsPtr(" a ", "b", "a", "")})
	require.NoError(t, err)
	assert.Equal(t, "After", got.Title)
	assert.Equal(t, []string{"a", "b"}, got.Tags)

	got, err = f.store.UpdateDocumentMeta(f.ctx, f.alice.ID, d.ID, MetaUpdate{Tags: tagsPtr()})
	require.NoError(t, err)
	assert.Equal(t, []string{}, got.Tags)
}

func TestDuplicateDocument(t *testing.T) {
	f := newFixture(t)
	d, err := f.store.CreateDocument(f.ctx, f.alice.ID, "Original", "body", "k8s")
	require.NoError(t, err)
	_, err = f.store.UpdateDocumentMeta(f.ctx, f.alice.ID, d.ID, MetaUpdate{Tags: tagsPtr("x")})
	require.NoError(t, err)
	require.NoError(t, f.store.SetThumbnail(f.ctx, f.alice.ID, d.ID, []byte("png")))
	_, err = f.store.SaveContent(f.ctx, f.alice.ID, d.ID, 1, "body2", "")
	require.NoError(t, err)

	cp, err := f.store.DuplicateDocument(f.ctx, f.alice.ID, d.ID)
	require.NoError(t, err)
	assert.NotEqual(t, d.ID, cp.ID)
	assert.Equal(t, "Original (copy)", cp.Title)
	assert.Equal(t, "body2", cp.Content)
	assert.Equal(t, []string{"x"}, cp.Tags)
	assert.Equal(t, "k8s", cp.TemplateKey)
	assert.Equal(t, 1, cp.Version)

	thumb, err := f.store.GetThumbnail(f.ctx, f.alice.ID, cp.ID)
	require.NoError(t, err)
	assert.Equal(t, []byte("png"), thumb)

	versions, err := f.store.ListVersions(f.ctx, f.alice.ID, cp.ID)
	require.NoError(t, err)
	assert.Len(t, versions, 1)
}

func TestThumbnail(t *testing.T) {
	f := newFixture(t)
	d := f.newDoc(t, f.alice, "T")

	_, err := f.store.GetThumbnail(f.ctx, f.alice.ID, d.ID)
	assert.ErrorIs(t, err, ErrNotFound)

	f.clock.Advance(time.Minute)
	require.NoError(t, f.store.SetThumbnail(f.ctx, f.alice.ID, d.ID, []byte{0x89, 'P', 'N', 'G'}))
	got, err := f.store.GetThumbnail(f.ctx, f.alice.ID, d.ID)
	require.NoError(t, err)
	assert.Equal(t, []byte{0x89, 'P', 'N', 'G'}, got)

	after, err := f.store.GetDocument(f.ctx, f.alice.ID, d.ID, false)
	require.NoError(t, err)
	assert.Equal(t, d.UpdatedAt, after.UpdatedAt)
	assert.Equal(t, 1, after.Version)

	assert.ErrorIs(t, f.store.SetThumbnail(f.ctx, f.alice.ID, "missing", []byte("x")), ErrNotFound)
	_, err = f.store.GetThumbnail(f.ctx, f.alice.ID, "missing")
	assert.ErrorIs(t, err, ErrNotFound)
}

func TestSaveContentVersioning(t *testing.T) {
	f := newFixture(t)
	d := f.newDoc(t, f.alice, "Doc")

	tests := []struct {
		name         string
		expected     int
		wantConflict bool
		wantVersion  int
	}{
		{"first save", 1, false, 2},
		{"second save", 2, false, 3},
		{"stale version", 2, true, 3},
		{"future version", 9, true, 3},
		{"zero version", 0, true, 3},
		{"recover after conflict", 3, false, 4},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f.clock.Advance(time.Second)
			res, err := f.store.SaveContent(f.ctx, f.alice.ID, d.ID, tt.expected, tt.name, "")
			if tt.wantConflict {
				require.ErrorIs(t, err, ErrVersionConflict)
				var ce *VersionConflictError
				require.ErrorAs(t, err, &ce)
				assert.Equal(t, tt.wantVersion, ce.Version)
				assert.False(t, ce.UpdatedAt.IsZero())
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.wantVersion, res.Version)
			assert.Equal(t, f.clock.Now(), res.UpdatedAt)

			got, err := f.store.GetDocument(f.ctx, f.alice.ID, d.ID, false)
			require.NoError(t, err)
			assert.Equal(t, tt.name, got.Content)
			assert.Equal(t, tt.wantVersion, got.Version)
			assert.Equal(t, res.UpdatedAt, got.UpdatedAt)
		})
	}

	_, err := f.store.SaveContent(f.ctx, f.alice.ID, "missing", 1, "x", "")
	assert.ErrorIs(t, err, ErrNotFound)
	assert.NotErrorIs(t, err, ErrVersionConflict)
}

func TestSaveContentConflictReportsStoredCopy(t *testing.T) {
	f := newFixture(t)
	d := f.newDoc(t, f.alice, "Doc")

	f.clock.Advance(time.Minute)
	res, err := f.store.SaveContent(f.ctx, f.alice.ID, d.ID, 1, "winner", "")
	require.NoError(t, err)

	f.clock.Advance(time.Minute)
	_, err = f.store.SaveContent(f.ctx, f.alice.ID, d.ID, 1, "loser", "")
	var ce *VersionConflictError
	require.ErrorAs(t, err, &ce)
	assert.Equal(t, res.Version, ce.Version)
	assert.Equal(t, res.UpdatedAt, ce.UpdatedAt)

	got, err := f.store.GetDocument(f.ctx, f.alice.ID, d.ID, false)
	require.NoError(t, err)
	assert.Equal(t, "winner", got.Content)
}

func TestSaveContentConcurrentWriters(t *testing.T) {
	f := newFixture(t)
	d := f.newDoc(t, f.alice, "Race")

	const writers = 16
	var (
		wg        sync.WaitGroup
		ok        atomic.Int32
		conflicts atomic.Int32
		other     atomic.Int32
	)
	start := make(chan struct{})
	for i := range writers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := f.store.SaveContent(f.ctx, f.alice.ID, d.ID, 1, string(rune('a'+i)), "")
			switch {
			case err == nil:
				ok.Add(1)
			case isConflict(err):
				conflicts.Add(1)
			default:
				other.Add(1)
				t.Errorf("unexpected error: %v", err)
			}
		}()
	}
	close(start)
	wg.Wait()

	assert.EqualValues(t, 1, ok.Load())
	assert.EqualValues(t, writers-1, conflicts.Load())
	assert.EqualValues(t, 0, other.Load())

	got, err := f.store.GetDocument(f.ctx, f.alice.ID, d.ID, false)
	require.NoError(t, err)
	assert.Equal(t, 2, got.Version)
}

func TestSaveContentConcurrentChain(t *testing.T) {
	f := newFixture(t)
	d := f.newDoc(t, f.alice, "Chain")

	const writers = 8
	const perWriter = 10
	var wg sync.WaitGroup
	for range writers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			done := 0
			for done < perWriter {
				cur, err := f.store.GetDocument(f.ctx, f.alice.ID, d.ID, false)
				if err != nil {
					t.Errorf("get: %v", err)
					return
				}
				_, err = f.store.SaveContent(f.ctx, f.alice.ID, d.ID, cur.Version, "x", "")
				if err == nil {
					done++
				} else if !isConflict(err) {
					t.Errorf("save: %v", err)
					return
				}
			}
		}()
	}
	wg.Wait()

	got, err := f.store.GetDocument(f.ctx, f.alice.ID, d.ID, false)
	require.NoError(t, err)
	assert.Equal(t, 1+writers*perWriter, got.Version)
}
