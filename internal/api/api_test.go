package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/hayward-solutions/chart.it/internal/api"
	"github.com/hayward-solutions/chart.it/internal/auth"
	"github.com/hayward-solutions/chart.it/internal/auth/header"
	"github.com/hayward-solutions/chart.it/internal/config"
	"github.com/hayward-solutions/chart.it/internal/db"
	"github.com/hayward-solutions/chart.it/internal/problem"
	"github.com/hayward-solutions/chart.it/internal/server"
	"github.com/hayward-solutions/chart.it/internal/store"
	"github.com/hayward-solutions/chart.it/templates"
)

const maxDocBytes = 4096

type env struct {
	ts    *httptest.Server
	store *store.Store
}

type reply struct {
	status int
	header http.Header
	body   []byte
}

func (r reply) json(t *testing.T) map[string]any {
	t.Helper()
	var out map[string]any
	require.NoError(t, json.Unmarshal(r.body, &out), string(r.body))
	return out
}

func (r reply) jsonList(t *testing.T) []map[string]any {
	t.Helper()
	var out []map[string]any
	require.NoError(t, json.Unmarshal(r.body, &out), string(r.body))
	return out
}

func newEnv(t *testing.T) *env {
	t.Helper()
	ctx := context.Background()
	conn, err := db.Open(ctx, filepath.Join(t.TempDir(), "chartit.db"))
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })
	require.NoError(t, db.Migrate(ctx, conn))

	cfg := config.Config{Addr: ":0", BaseURL: "http://localhost:8080", AllowTestAuth: true, MaxDocumentBytes: maxDocBytes}
	st := store.New(conn)
	a := header.New(st, auth.NewSessions(st, cfg.SecureCookies()))
	tpls, err := templates.Load()
	require.NoError(t, err)
	h := api.New(st, cfg, tpls)
	ts := httptest.NewServer(server.NewHandler(cfg, st, a, server.WithAPI(h.Routes), server.WithPublicAPI(h.PublicRoutes)))
	t.Cleanup(ts.Close)
	return &env{ts: ts, store: st}
}

func (e *env) client(t *testing.T) *http.Client {
	t.Helper()
	jar, err := cookiejar.New(nil)
	require.NoError(t, err)
	return &http.Client{
		Jar:           jar,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
}

func (e *env) login(t *testing.T, user string) *http.Client {
	t.Helper()
	c := e.client(t)
	resp, err := c.Get(e.ts.URL + "/auth/test-login?user=" + user)
	require.NoError(t, err)
	_ = resp.Body.Close()
	require.Equal(t, http.StatusFound, resp.StatusCode)
	return c
}

func (e *env) raw(t *testing.T, c *http.Client, method, path string, body io.Reader, hdr map[string]string) reply {
	t.Helper()
	req, err := http.NewRequest(method, e.ts.URL+path, body)
	require.NoError(t, err)
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	resp, err := c.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return reply{status: resp.StatusCode, header: resp.Header, body: data}
}

func (e *env) do(t *testing.T, c *http.Client, method, path string, payload any) reply {
	t.Helper()
	var body io.Reader
	hdr := map[string]string{"X-Requested-With": "chartit"}
	if payload != nil {
		b, err := json.Marshal(payload)
		require.NoError(t, err)
		body = bytes.NewReader(b)
		hdr["Content-Type"] = "application/json"
	}
	return e.raw(t, c, method, path, body, hdr)
}

func diagram(title string, extra ...string) map[string]any {
	doc := map[string]any{
		"schemaVersion": 1,
		"title":         title,
		"settings":      map[string]any{"background": "#fff", "grid": "dots", "snap": true, "gridSize": 20, "theme": "system"},
		"viewport":      map[string]any{"x": 0, "y": 0, "zoom": 1},
		"nodes":         []any{},
		"edges":         []any{},
	}
	if len(extra) > 0 {
		doc["padding"] = strings.Join(extra, "")
	}
	return doc
}

func (e *env) createDoc(t *testing.T, c *http.Client, title string) map[string]any {
	t.Helper()
	r := e.do(t, c, http.MethodPost, "/api/v1/documents", map[string]any{"title": title})
	require.Equal(t, http.StatusCreated, r.status, string(r.body))
	return r.json(t)
}

func (e *env) save(t *testing.T, c *http.Client, id string, version int, content any, label string) reply {
	t.Helper()
	body := map[string]any{"version": version, "content": content}
	if label != "" {
		body["label"] = label
	}
	return e.do(t, c, http.MethodPut, "/api/v1/documents/"+id+"/content", body)
}

func TestAuthRequiredAndCSRF(t *testing.T) {
	e := newEnv(t)
	anon := e.client(t)

	r := e.do(t, anon, http.MethodGet, "/api/v1/documents", nil)
	assert.Equal(t, http.StatusUnauthorized, r.status)
	assert.Equal(t, problem.ContentType, r.header.Get("Content-Type"))

	r = e.do(t, anon, http.MethodGet, "/api/v1/templates", nil)
	assert.Equal(t, http.StatusUnauthorized, r.status)

	c := e.login(t, "alice")
	r = e.raw(t, c, http.MethodPost, "/api/v1/documents", strings.NewReader(`{"title":"x"}`), map[string]string{"Content-Type": "application/json"})
	assert.Equal(t, http.StatusForbidden, r.status)
	assert.Equal(t, problem.ContentType, r.header.Get("Content-Type"))

	d := e.createDoc(t, c, "csrf")
	id := d["id"].(string)
	for _, tc := range []struct{ method, path string }{
		{http.MethodDelete, "/api/v1/documents/" + id},
		{http.MethodPatch, "/api/v1/documents/" + id},
		{http.MethodPut, "/api/v1/documents/" + id + "/content"},
		{http.MethodPost, "/api/v1/documents/" + id + "/shares"},
	} {
		r = e.raw(t, c, tc.method, tc.path, strings.NewReader(`{}`), nil)
		assert.Equal(t, http.StatusForbidden, r.status, tc.method+" "+tc.path)
	}
	r = e.do(t, c, http.MethodGet, "/api/v1/documents/"+id, nil)
	assert.Equal(t, http.StatusOK, r.status)
}

func TestMe(t *testing.T) {
	e := newEnv(t)
	c := e.login(t, "alice")
	r := e.do(t, c, http.MethodGet, "/api/v1/me", nil)
	require.Equal(t, http.StatusOK, r.status)
	assert.NotEmpty(t, r.json(t)["id"])
}

func TestTemplatesList(t *testing.T) {
	e := newEnv(t)
	c := e.login(t, "alice")
	r := e.do(t, c, http.MethodGet, "/api/v1/templates", nil)
	require.Equal(t, http.StatusOK, r.status)
	list := r.jsonList(t)
	keys := make([]string, 0, len(list))
	for _, item := range list {
		keys = append(keys, item["key"].(string))
		assert.NotEmpty(t, item["title"])
		assert.NotEmpty(t, item["description"])
		assert.NotEmpty(t, item["pack"])
		assert.NotContains(t, item, "Content")
		assert.NotContains(t, item, "content")
	}
	assert.Equal(t, []string{"aws-three-tier", "aws-eks", "azure-hub-spoke", "gcp-gke", "k8s-namespace"}, keys)
}

func TestCreateBlankDocument(t *testing.T) {
	e := newEnv(t)
	c := e.login(t, "alice")

	d := e.createDoc(t, c, "My diagram")
	assert.Equal(t, "My diagram", d["title"])
	assert.EqualValues(t, 1, d["version"])
	assert.Equal(t, []any{}, d["tags"])
	assert.Nil(t, d["templateKey"])
	assert.Nil(t, d["deletedAt"])
	assert.NotEmpty(t, d["createdAt"])

	content, ok := d["content"].(map[string]any)
	require.True(t, ok, "content must be an embedded object")
	assert.EqualValues(t, 1, content["schemaVersion"])
	assert.Equal(t, "My diagram", content["title"])
	assert.Equal(t, []any{}, content["nodes"])
	assert.Equal(t, []any{}, content["edges"])
	assert.Equal(t, map[string]any{"background": "#ffffff", "grid": "dots", "snap": true, "gridSize": float64(20), "theme": "system"}, content["settings"])
	assert.Equal(t, map[string]any{"x": float64(0), "y": float64(0), "zoom": float64(1)}, content["viewport"])

	d = e.createDoc(t, c, "")
	assert.Equal(t, "Untitled diagram", d["title"])
}

func TestCreateFromTemplate(t *testing.T) {
	e := newEnv(t)
	c := e.login(t, "alice")

	r := e.do(t, c, http.MethodPost, "/api/v1/documents", map[string]any{"title": "Prod cluster", "templateKey": "aws-eks"})
	require.Equal(t, http.StatusCreated, r.status, string(r.body))
	d := r.json(t)
	assert.Equal(t, "Prod cluster", d["title"])
	assert.Equal(t, "aws-eks", d["templateKey"])
	content := d["content"].(map[string]any)
	assert.EqualValues(t, 1, content["schemaVersion"])
	assert.Equal(t, "Prod cluster", content["title"])

	r = e.do(t, c, http.MethodPost, "/api/v1/documents", map[string]any{"templateKey": "gcp-gke"})
	require.Equal(t, http.StatusCreated, r.status)
	d = r.json(t)
	assert.Equal(t, "GCP GKE cluster", d["title"])
	assert.Equal(t, "GCP GKE cluster", d["content"].(map[string]any)["title"])

	r = e.do(t, c, http.MethodPost, "/api/v1/documents", map[string]any{"title": "x", "templateKey": "nope"})
	assert.Equal(t, http.StatusBadRequest, r.status)
	assert.Contains(t, r.json(t)["detail"], "nope")
}

func TestCreateValidation(t *testing.T) {
	e := newEnv(t)
	c := e.login(t, "alice")

	r := e.raw(t, c, http.MethodPost, "/api/v1/documents", strings.NewReader(`{not json`), map[string]string{"X-Requested-With": "chartit"})
	assert.Equal(t, http.StatusBadRequest, r.status)
	assert.Equal(t, problem.ContentType, r.header.Get("Content-Type"))

	r = e.raw(t, c, http.MethodPost, "/api/v1/documents", strings.NewReader(``), map[string]string{"X-Requested-With": "chartit"})
	assert.Equal(t, http.StatusBadRequest, r.status)

	r = e.do(t, c, http.MethodPost, "/api/v1/documents", map[string]any{"title": strings.Repeat("a", 201)})
	assert.Equal(t, http.StatusBadRequest, r.status)

	r = e.do(t, c, http.MethodPost, "/api/v1/documents", map[string]any{"title": "ok", "unknownField": 1})
	assert.Equal(t, http.StatusCreated, r.status)

	big := `{"title":"` + strings.Repeat("a", 1<<20) + `"}`
	r = e.raw(t, c, http.MethodPost, "/api/v1/documents", strings.NewReader(big), map[string]string{"X-Requested-With": "chartit"})
	assert.Equal(t, http.StatusRequestEntityTooLarge, r.status)
}

func TestListFilters(t *testing.T) {
	e := newEnv(t)
	c := e.login(t, "alice")
	a := e.createDoc(t, c, "Alpha network")
	b := e.createDoc(t, c, "Beta")
	e.do(t, c, http.MethodPatch, "/api/v1/documents/"+b["id"].(string), map[string]any{"tags": []string{"prod", "aws"}})

	r := e.do(t, c, http.MethodGet, "/api/v1/documents", nil)
	require.Equal(t, http.StatusOK, r.status)
	list := r.jsonList(t)
	require.Len(t, list, 2)
	for _, item := range list {
		assert.Contains(t, item, "hasThumbnail")
		assert.NotContains(t, item, "content")
	}

	r = e.do(t, c, http.MethodGet, "/api/v1/documents?q=alpha", nil)
	list = r.jsonList(t)
	require.Len(t, list, 1)
	assert.Equal(t, a["id"], list[0]["id"])

	r = e.do(t, c, http.MethodGet, "/api/v1/documents?tag=prod", nil)
	list = r.jsonList(t)
	require.Len(t, list, 1)
	assert.Equal(t, b["id"], list[0]["id"])

	r = e.do(t, c, http.MethodGet, "/api/v1/documents?trashed=true", nil)
	assert.Empty(t, r.jsonList(t))

	r = e.do(t, c, http.MethodGet, "/api/v1/documents?trashed=maybe", nil)
	assert.Equal(t, http.StatusBadRequest, r.status)

	empty := e.login(t, "carol")
	r = e.do(t, empty, http.MethodGet, "/api/v1/documents", nil)
	assert.JSONEq(t, `[]`, string(r.body))
}

func TestPatchDocument(t *testing.T) {
	e := newEnv(t)
	c := e.login(t, "alice")
	d := e.createDoc(t, c, "Before")
	id := d["id"].(string)

	r := e.do(t, c, http.MethodPatch, "/api/v1/documents/"+id, map[string]any{"title": "After", "tags": []string{"a", " b ", "a", ""}})
	require.Equal(t, http.StatusOK, r.status, string(r.body))
	got := r.json(t)
	assert.Equal(t, "After", got["title"])
	assert.Equal(t, []any{"a", "b"}, got["tags"])
	assert.NotContains(t, got, "content")

	r = e.do(t, c, http.MethodPatch, "/api/v1/documents/"+id, map[string]any{"title": "Only title"})
	assert.Equal(t, []any{"a", "b"}, r.json(t)["tags"])

	r = e.do(t, c, http.MethodPatch, "/api/v1/documents/"+id, map[string]any{"tags": []string{}})
	assert.Equal(t, []any{}, r.json(t)["tags"])

	r = e.do(t, c, http.MethodPatch, "/api/v1/documents/"+id, map[string]any{})
	assert.Equal(t, http.StatusBadRequest, r.status)

	r = e.do(t, c, http.MethodPatch, "/api/v1/documents/"+id, map[string]any{"title": "   "})
	assert.Equal(t, http.StatusBadRequest, r.status)

	tooMany := make([]string, 33)
	for i := range tooMany {
		tooMany[i] = fmt.Sprintf("tag%d", i)
	}
	r = e.do(t, c, http.MethodPatch, "/api/v1/documents/"+id, map[string]any{"tags": tooMany})
	assert.Equal(t, http.StatusBadRequest, r.status)

	r = e.do(t, c, http.MethodPatch, "/api/v1/documents/"+id, map[string]any{"tags": []string{strings.Repeat("x", 65)}})
	assert.Equal(t, http.StatusBadRequest, r.status)

	r = e.do(t, c, http.MethodPatch, "/api/v1/documents/doesnotexist", map[string]any{"title": "x"})
	assert.Equal(t, http.StatusNotFound, r.status)
}

func TestSaveContentVersioning(t *testing.T) {
	e := newEnv(t)
	c := e.login(t, "alice")
	d := e.createDoc(t, c, "Doc")
	id := d["id"].(string)

	content := diagram("Doc")
	content["nodes"] = []any{map[string]any{"id": "n1"}}
	r := e.save(t, c, id, 1, content, "")
	require.Equal(t, http.StatusOK, r.status, string(r.body))
	res := r.json(t)
	assert.EqualValues(t, 2, res["version"])
	assert.NotEmpty(t, res["updatedAt"])

	r = e.do(t, c, http.MethodGet, "/api/v1/documents/"+id, nil)
	got := r.json(t)
	assert.EqualValues(t, 2, got["version"])
	assert.Equal(t, []any{map[string]any{"id": "n1"}}, got["content"].(map[string]any)["nodes"])

	r = e.save(t, c, id, 1, diagram("Stale"), "")
	require.Equal(t, http.StatusConflict, r.status, string(r.body))
	assert.Equal(t, problem.ContentType, r.header.Get("Content-Type"))
	conflict := r.json(t)
	assert.EqualValues(t, 409, conflict["status"])
	assert.EqualValues(t, 2, conflict["version"])
	assert.NotEmpty(t, conflict["updatedAt"])
	assert.NotEmpty(t, conflict["detail"])

	r = e.save(t, c, id, 2, diagram("Fresh"), "")
	assert.Equal(t, http.StatusOK, r.status)
	assert.EqualValues(t, 3, r.json(t)["version"])

	r = e.save(t, c, "doesnotexist", 1, diagram("x"), "")
	assert.Equal(t, http.StatusNotFound, r.status)
}

func TestSaveContentValidation(t *testing.T) {
	e := newEnv(t)
	c := e.login(t, "alice")
	id := e.createDoc(t, c, "Doc")["id"].(string)
	hdr := map[string]string{"X-Requested-With": "chartit", "Content-Type": "application/json"}
	put := func(body string) reply {
		return e.raw(t, c, http.MethodPut, "/api/v1/documents/"+id+"/content", strings.NewReader(body), hdr)
	}

	assert.Equal(t, http.StatusBadRequest, put(`{"content":{"schemaVersion":1}}`).status)
	assert.Equal(t, http.StatusBadRequest, put(`{"version":1}`).status)
	assert.Equal(t, http.StatusBadRequest, put(`{"version":1,"content":null}`).status)
	assert.Equal(t, http.StatusBadRequest, put(`{"version":1,"content":"{\"schemaVersion\":1}"}`).status)
	assert.Equal(t, http.StatusBadRequest, put(`{"version":1,"content":[1,2]}`).status)
	assert.Equal(t, http.StatusBadRequest, put(`{"version":1,"content":{"title":"x"}}`).status)
	assert.Equal(t, http.StatusBadRequest, put(`{"version":1,"content":{"schemaVersion":2}}`).status)
	assert.Equal(t, http.StatusBadRequest, put(`{"version":1,"content":{"schemaVersion":"1"}}`).status)
	assert.Equal(t, http.StatusBadRequest, put(`{"version":1,"content":{"schemaVersion":1}`).status)
	assert.Equal(t, http.StatusBadRequest, put(`{"version":"one","content":{"schemaVersion":1}}`).status)

	r := put(`{"version":1,"label":"` + strings.Repeat("l", 201) + `","content":{"schemaVersion":1}}`)
	assert.Equal(t, http.StatusBadRequest, r.status)

	r = put(`{"version":1,"content":{"schemaVersion":1}}`)
	assert.Equal(t, http.StatusOK, r.status, string(r.body))
}

func TestSaveContentStoresCompactJSON(t *testing.T) {
	e := newEnv(t)
	c := e.login(t, "alice")
	d := e.createDoc(t, c, "Doc")
	id := d["id"].(string)
	hdr := map[string]string{"X-Requested-With": "chartit", "Content-Type": "application/json"}
	body := "{\"version\":1,\"content\":{\n  \"schemaVersion\": 1,\n  \"nodes\": [ ]\n}}"
	r := e.raw(t, c, http.MethodPut, "/api/v1/documents/"+id+"/content", strings.NewReader(body), hdr)
	require.Equal(t, http.StatusOK, r.status, string(r.body))

	user, err := e.store.UpsertUserBySubject(context.Background(), "test:alice", "alice", "", "")
	require.NoError(t, err)
	stored, err := e.store.GetDocument(context.Background(), user.ID, id, false)
	require.NoError(t, err)
	assert.Equal(t, `{"schemaVersion":1,"nodes":[]}`, stored.Content)
}

func TestSaveContentSizeLimit(t *testing.T) {
	e := newEnv(t)
	c := e.login(t, "alice")
	id := e.createDoc(t, c, "Doc")["id"].(string)

	r := e.save(t, c, id, 1, diagram("big", strings.Repeat("x", maxDocBytes)), "")
	assert.Equal(t, http.StatusRequestEntityTooLarge, r.status, string(r.body))
	assert.Equal(t, problem.ContentType, r.header.Get("Content-Type"))

	r = e.save(t, c, id, 1, diagram("huge", strings.Repeat("x", maxDocBytes+(128<<10))), "")
	assert.Equal(t, http.StatusRequestEntityTooLarge, r.status)

	r = e.save(t, c, id, 1, diagram("fits", strings.Repeat("x", 1000)), "")
	assert.Equal(t, http.StatusOK, r.status, string(r.body))
}

func TestOwnerIsolation(t *testing.T) {
	e := newEnv(t)
	alice := e.login(t, "alice")
	bob := e.login(t, "bob")
	d := e.createDoc(t, alice, "Secret")
	id := d["id"].(string)
	base := "/api/v1/documents/" + id

	sh := e.do(t, alice, http.MethodPost, base+"/shares", nil)
	require.Equal(t, http.StatusCreated, sh.status)
	token := sh.json(t)["token"].(string)

	r := e.do(t, bob, http.MethodGet, "/api/v1/documents", nil)
	assert.Empty(t, r.jsonList(t))

	for _, tc := range []struct {
		method, path string
		body         any
	}{
		{http.MethodGet, base, nil},
		{http.MethodPatch, base, map[string]any{"title": "pwn"}},
		{http.MethodDelete, base, nil},
		{http.MethodPost, base + "/restore", nil},
		{http.MethodPost, base + "/duplicate", nil},
		{http.MethodPut, base + "/content", map[string]any{"version": 1, "content": diagram("pwn")}},
		{http.MethodGet, base + "/thumbnail", nil},
		{http.MethodGet, base + "/versions", nil},
		{http.MethodGet, base + "/versions/1", nil},
		{http.MethodPost, base + "/versions/1/restore", nil},
		{http.MethodPost, base + "/shares", nil},
		{http.MethodGet, base + "/shares", nil},
		{http.MethodDelete, base + "/shares/" + token, nil},
	} {
		r := e.do(t, bob, tc.method, tc.path, tc.body)
		assert.Equal(t, http.StatusNotFound, r.status, tc.method+" "+tc.path)
		assert.Equal(t, problem.ContentType, r.header.Get("Content-Type"))
	}

	pngReq := e.raw(t, bob, http.MethodPut, base+"/thumbnail", bytes.NewReader(pngBytes(16)), map[string]string{"X-Requested-With": "chartit", "Content-Type": "image/png"})
	assert.Equal(t, http.StatusNotFound, pngReq.status)

	r = e.do(t, alice, http.MethodGet, base, nil)
	require.Equal(t, http.StatusOK, r.status)
	assert.Equal(t, "Secret", r.json(t)["title"])
	r = e.do(t, alice, http.MethodGet, base+"/shares", nil)
	assert.Len(t, r.jsonList(t), 1)
}

func TestSoftDeleteAndRestore(t *testing.T) {
	e := newEnv(t)
	c := e.login(t, "alice")
	id := e.createDoc(t, c, "Doc")["id"].(string)
	base := "/api/v1/documents/" + id

	r := e.do(t, c, http.MethodDelete, base, nil)
	assert.Equal(t, http.StatusNoContent, r.status)
	assert.Empty(t, r.body)

	assert.Equal(t, http.StatusNotFound, e.do(t, c, http.MethodGet, base, nil).status)
	assert.Equal(t, http.StatusNotFound, e.do(t, c, http.MethodDelete, base, nil).status)
	assert.Equal(t, http.StatusNotFound, e.save(t, c, id, 1, diagram("x"), "").status)
	assert.Empty(t, e.do(t, c, http.MethodGet, "/api/v1/documents", nil).jsonList(t))

	trashed := e.do(t, c, http.MethodGet, "/api/v1/documents?trashed=true", nil).jsonList(t)
	require.Len(t, trashed, 1)
	assert.Equal(t, id, trashed[0]["id"])

	r = e.do(t, c, http.MethodPost, base+"/restore", nil)
	require.Equal(t, http.StatusOK, r.status, string(r.body))
	restored := r.json(t)
	assert.Equal(t, id, restored["id"])
	assert.Nil(t, restored["deletedAt"])
	assert.NotContains(t, restored, "content")

	assert.Equal(t, http.StatusOK, e.do(t, c, http.MethodGet, base, nil).status)
	assert.Equal(t, http.StatusNotFound, e.do(t, c, http.MethodPost, "/api/v1/documents/nope/restore", nil).status)
}

func TestDuplicate(t *testing.T) {
	e := newEnv(t)
	c := e.login(t, "alice")
	id := e.createDoc(t, c, "Original")["id"].(string)
	content := diagram("Original")
	content["nodes"] = []any{map[string]any{"id": "n1"}}
	require.Equal(t, http.StatusOK, e.save(t, c, id, 1, content, "").status)
	e.do(t, c, http.MethodPatch, "/api/v1/documents/"+id, map[string]any{"tags": []string{"x"}})

	r := e.do(t, c, http.MethodPost, "/api/v1/documents/"+id+"/duplicate", nil)
	require.Equal(t, http.StatusCreated, r.status, string(r.body))
	dup := r.json(t)
	assert.NotEqual(t, id, dup["id"])
	assert.Equal(t, "Original (copy)", dup["title"])
	assert.Equal(t, []any{"x"}, dup["tags"])
	assert.EqualValues(t, 1, dup["version"])

	r = e.do(t, c, http.MethodGet, "/api/v1/documents/"+dup["id"].(string), nil)
	assert.Equal(t, []any{map[string]any{"id": "n1"}}, r.json(t)["content"].(map[string]any)["nodes"])

	assert.Equal(t, http.StatusNotFound, e.do(t, c, http.MethodPost, "/api/v1/documents/nope/duplicate", nil).status)
}

func TestVersions(t *testing.T) {
	e := newEnv(t)
	c := e.login(t, "alice")
	id := e.createDoc(t, c, "Doc")["id"].(string)
	base := "/api/v1/documents/" + id

	r := e.do(t, c, http.MethodGet, base+"/versions", nil)
	require.Equal(t, http.StatusOK, r.status)
	list := r.jsonList(t)
	require.Len(t, list, 1)
	assert.EqualValues(t, 1, list[0]["version"])
	assert.Nil(t, list[0]["label"])
	assert.NotEmpty(t, list[0]["createdAt"])
	assert.NotEmpty(t, list[0]["createdBy"])

	v2 := diagram("Doc")
	v2["nodes"] = []any{map[string]any{"id": "second"}}
	require.Equal(t, http.StatusOK, e.save(t, c, id, 1, v2, "Milestone").status)
	v3 := diagram("Doc")
	v3["nodes"] = []any{map[string]any{"id": "third"}}
	require.Equal(t, http.StatusOK, e.save(t, c, id, 2, v3, "").status)

	list = e.do(t, c, http.MethodGet, base+"/versions", nil).jsonList(t)
	require.Len(t, list, 2)
	assert.EqualValues(t, 2, list[0]["version"])
	assert.Equal(t, "Milestone", list[0]["label"])

	r = e.do(t, c, http.MethodGet, base+"/versions/2", nil)
	require.Equal(t, http.StatusOK, r.status, string(r.body))
	detail := r.json(t)
	assert.EqualValues(t, 2, detail["version"])
	assert.Equal(t, "Milestone", detail["label"])
	assert.NotEmpty(t, detail["createdAt"])
	assert.Equal(t, []any{map[string]any{"id": "second"}}, detail["content"].(map[string]any)["nodes"])

	assert.Equal(t, http.StatusNotFound, e.do(t, c, http.MethodGet, base+"/versions/99", nil).status)
	assert.Equal(t, http.StatusBadRequest, e.do(t, c, http.MethodGet, base+"/versions/abc", nil).status)

	r = e.do(t, c, http.MethodPost, base+"/versions/1/restore", nil)
	require.Equal(t, http.StatusOK, r.status, string(r.body))
	assert.JSONEq(t, `{"version":4}`, string(r.body))

	got := e.do(t, c, http.MethodGet, base, nil).json(t)
	assert.EqualValues(t, 4, got["version"])
	assert.Equal(t, []any{}, got["content"].(map[string]any)["nodes"])

	list = e.do(t, c, http.MethodGet, base+"/versions", nil).jsonList(t)
	assert.EqualValues(t, 4, list[0]["version"])
	assert.Equal(t, "Restored from version 1", list[0]["label"])

	assert.Equal(t, http.StatusNotFound, e.do(t, c, http.MethodPost, base+"/versions/99/restore", nil).status)
}

func TestShares(t *testing.T) {
	e := newEnv(t)
	c := e.login(t, "alice")
	id := e.createDoc(t, c, "Shared doc")["id"].(string)
	base := "/api/v1/documents/" + id
	content := diagram("Shared doc")
	content["nodes"] = []any{map[string]any{"id": "n1"}}
	require.Equal(t, http.StatusOK, e.save(t, c, id, 1, content, "").status)

	r := e.do(t, c, http.MethodPost, base+"/shares", nil)
	require.Equal(t, http.StatusCreated, r.status, string(r.body))
	created := r.json(t)
	token := created["token"].(string)
	assert.NotEmpty(t, token)
	assert.Equal(t, "http://localhost:8080/s/"+token, created["url"])

	list := e.do(t, c, http.MethodGet, base+"/shares", nil).jsonList(t)
	require.Len(t, list, 1)
	assert.Equal(t, token, list[0]["token"])
	assert.Equal(t, "http://localhost:8080/s/"+token, list[0]["url"])
	assert.NotEmpty(t, list[0]["createdAt"])

	anon := e.client(t)
	r = e.raw(t, anon, http.MethodGet, "/api/v1/shared/"+token, nil, nil)
	require.Equal(t, http.StatusOK, r.status, string(r.body))
	shared := r.json(t)
	assert.Equal(t, "Shared doc", shared["title"])
	assert.NotEmpty(t, shared["updatedAt"])
	assert.Equal(t, []any{map[string]any{"id": "n1"}}, shared["content"].(map[string]any)["nodes"])

	r = e.do(t, c, http.MethodDelete, base+"/shares/"+token, nil)
	assert.Equal(t, http.StatusNoContent, r.status)
	assert.Empty(t, e.do(t, c, http.MethodGet, base+"/shares", nil).jsonList(t))

	r = e.raw(t, anon, http.MethodGet, "/api/v1/shared/"+token, nil, nil)
	assert.Equal(t, http.StatusNotFound, r.status)
	assert.Equal(t, problem.ContentType, r.header.Get("Content-Type"))

	assert.Equal(t, http.StatusNotFound, e.do(t, c, http.MethodDelete, base+"/shares/"+token, nil).status)
	assert.Equal(t, http.StatusNotFound, e.raw(t, anon, http.MethodGet, "/api/v1/shared/unknown", nil, nil).status)
}

func TestSharedDocumentGoneWhenTrashed(t *testing.T) {
	e := newEnv(t)
	c := e.login(t, "alice")
	id := e.createDoc(t, c, "Doc")["id"].(string)
	token := e.do(t, c, http.MethodPost, "/api/v1/documents/"+id+"/shares", nil).json(t)["token"].(string)

	anon := e.client(t)
	assert.Equal(t, http.StatusOK, e.raw(t, anon, http.MethodGet, "/api/v1/shared/"+token, nil, nil).status)
	require.Equal(t, http.StatusNoContent, e.do(t, c, http.MethodDelete, "/api/v1/documents/"+id, nil).status)
	assert.Equal(t, http.StatusNotFound, e.raw(t, anon, http.MethodGet, "/api/v1/shared/"+token, nil, nil).status)
	assert.Equal(t, http.StatusNotFound, e.do(t, c, http.MethodPost, "/api/v1/documents/"+id+"/shares", nil).status)
}

func pngBytes(n int) []byte {
	out := []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}
	return append(out, bytes.Repeat([]byte{0}, n)...)
}

func TestThumbnail(t *testing.T) {
	e := newEnv(t)
	c := e.login(t, "alice")
	id := e.createDoc(t, c, "Doc")["id"].(string)
	base := "/api/v1/documents/" + id + "/thumbnail"
	png := map[string]string{"X-Requested-With": "chartit", "Content-Type": "image/png"}

	r := e.do(t, c, http.MethodGet, base, nil)
	assert.Equal(t, http.StatusNotFound, r.status)
	assert.Equal(t, problem.ContentType, r.header.Get("Content-Type"))

	data := pngBytes(200)
	r = e.raw(t, c, http.MethodPut, base, bytes.NewReader(data), png)
	require.Equal(t, http.StatusNoContent, r.status, string(r.body))

	r = e.do(t, c, http.MethodGet, base, nil)
	require.Equal(t, http.StatusOK, r.status)
	assert.Equal(t, "image/png", r.header.Get("Content-Type"))
	assert.Equal(t, data, r.body)

	list := e.do(t, c, http.MethodGet, "/api/v1/documents", nil).jsonList(t)
	require.Len(t, list, 1)
	assert.Equal(t, true, list[0]["hasThumbnail"])

	r = e.raw(t, c, http.MethodPut, base, strings.NewReader("not a png at all"), png)
	assert.Equal(t, http.StatusBadRequest, r.status)

	r = e.raw(t, c, http.MethodPut, base, strings.NewReader(""), png)
	assert.Equal(t, http.StatusBadRequest, r.status)

	r = e.raw(t, c, http.MethodPut, base, bytes.NewReader(data), map[string]string{"X-Requested-With": "chartit", "Content-Type": "image/jpeg"})
	assert.Equal(t, http.StatusUnsupportedMediaType, r.status)

	r = e.raw(t, c, http.MethodPut, base, bytes.NewReader(data), map[string]string{"X-Requested-With": "chartit"})
	assert.Equal(t, http.StatusUnsupportedMediaType, r.status)

	r = e.raw(t, c, http.MethodPut, base, bytes.NewReader(pngBytes(512<<10)), png)
	assert.Equal(t, http.StatusRequestEntityTooLarge, r.status)

	r = e.raw(t, c, http.MethodPut, base, bytes.NewReader(pngBytes(512<<10-8)), png)
	assert.Equal(t, http.StatusNoContent, r.status)

	r = e.raw(t, c, http.MethodPut, base, bytes.NewReader(data), map[string]string{"Content-Type": "image/png"})
	assert.Equal(t, http.StatusForbidden, r.status)

	assert.Equal(t, http.StatusNotFound, e.do(t, c, http.MethodGet, "/api/v1/documents/nope/thumbnail", nil).status)
}
