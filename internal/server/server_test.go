package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/hayward-solutions/chart.it/internal/auth"
	"github.com/hayward-solutions/chart.it/internal/auth/header"
	"github.com/hayward-solutions/chart.it/internal/auth/single"
	"github.com/hayward-solutions/chart.it/internal/config"
	"github.com/hayward-solutions/chart.it/internal/db"
	"github.com/hayward-solutions/chart.it/internal/problem"
	"github.com/hayward-solutions/chart.it/internal/store"
)

type env struct {
	ts    *httptest.Server
	store *store.Store
	cfg   config.Config
}

func newEnv(t *testing.T, opts ...Option) *env {
	t.Helper()
	ctx := context.Background()
	conn, err := db.Open(ctx, filepath.Join(t.TempDir(), "chartit.db"))
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })
	require.NoError(t, db.Migrate(ctx, conn))

	cfg := config.Config{Addr: ":0", BaseURL: "http://localhost:8080", AllowTestAuth: true}
	st := store.New(conn)
	a := header.New(st, auth.NewSessions(st, cfg.SecureCookies()))
	ts := httptest.NewServer(NewHandler(cfg, st, a, opts...))
	t.Cleanup(ts.Close)
	return &env{ts: ts, store: st, cfg: cfg}
}

func (e *env) client(t *testing.T) *http.Client {
	t.Helper()
	jar, err := cookiejar.New(nil)
	require.NoError(t, err)
	return &http.Client{
		Jar: jar,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

func (e *env) do(t *testing.T, c *http.Client, method, path string, hdr map[string]string) (*http.Response, string) {
	t.Helper()
	req, err := http.NewRequest(method, e.ts.URL+path, nil)
	require.NoError(t, err)
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	resp, err := c.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return resp, string(body)
}

func (e *env) login(t *testing.T, c *http.Client, user string) {
	t.Helper()
	resp, _ := e.do(t, c, http.MethodGet, "/auth/test-login?user="+user, nil)
	require.Equal(t, http.StatusFound, resp.StatusCode)
	require.Equal(t, "/", resp.Header.Get("Location"))
}

func assertProblem(t *testing.T, resp *http.Response, body string, status int) {
	t.Helper()
	assert.Equal(t, status, resp.StatusCode)
	assert.Equal(t, problem.ContentType, resp.Header.Get("Content-Type"))
	var p map[string]any
	require.NoError(t, json.Unmarshal([]byte(body), &p))
	assert.EqualValues(t, status, p["status"])
	assert.NotEmpty(t, p["title"])
	assert.NotEmpty(t, p["detail"])
	assert.NotEmpty(t, p["type"])
}

func TestHealthz(t *testing.T) {
	e := newEnv(t)
	resp, body := e.do(t, e.client(t), http.MethodGet, "/healthz", nil)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "ok", body)
}

func TestReadyz(t *testing.T) {
	e := newEnv(t)
	resp, body := e.do(t, e.client(t), http.MethodGet, "/readyz", nil)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "ok", body)
}

func TestMeUnauthenticated(t *testing.T) {
	e := newEnv(t)
	resp, body := e.do(t, e.client(t), http.MethodGet, "/api/v1/me", nil)
	assertProblem(t, resp, body, http.StatusUnauthorized)
}

func TestMeWithGarbageCookie(t *testing.T) {
	e := newEnv(t)
	resp, body := e.do(t, e.client(t), http.MethodGet, "/api/v1/me", map[string]string{"Cookie": auth.CookieName + "=bogus"})
	assertProblem(t, resp, body, http.StatusUnauthorized)
}

func TestTestLoginThenMe(t *testing.T) {
	e := newEnv(t)
	c := e.client(t)
	e.login(t, c, "matt")

	resp, body := e.do(t, c, http.MethodGet, "/api/v1/me", nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "application/json", resp.Header.Get("Content-Type"))

	var me map[string]any
	require.NoError(t, json.Unmarshal([]byte(body), &me))
	assert.Equal(t, "matt", me["name"])
	assert.Equal(t, "matt@test.local", me["email"])
	assert.Equal(t, "", me["avatarUrl"])
	assert.Len(t, me["id"], 32)

	e.login(t, c, "matt")
	_, body2 := e.do(t, c, http.MethodGet, "/api/v1/me", nil)
	var again map[string]any
	require.NoError(t, json.Unmarshal([]byte(body2), &again))
	assert.Equal(t, me["id"], again["id"])

	other := e.client(t)
	e.login(t, other, "ann")
	_, body3 := e.do(t, other, http.MethodGet, "/api/v1/me", nil)
	var ann map[string]any
	require.NoError(t, json.Unmarshal([]byte(body3), &ann))
	assert.NotEqual(t, me["id"], ann["id"])
}

func TestSessionCookieAttributes(t *testing.T) {
	e := newEnv(t)
	resp, _ := e.do(t, e.client(t), http.MethodGet, "/auth/test-login?user=matt", nil)
	var cookie *http.Cookie
	for _, c := range resp.Cookies() {
		if c.Name == auth.CookieName {
			cookie = c
		}
	}
	require.NotNil(t, cookie)
	assert.True(t, cookie.HttpOnly)
	assert.False(t, cookie.Secure)
	assert.Equal(t, http.SameSiteLaxMode, cookie.SameSite)
	assert.Equal(t, "/", cookie.Path)
	assert.Len(t, cookie.Value, 32)
	assert.WithinDuration(t, time.Now().Add(auth.SessionTTL), cookie.Expires, time.Minute)
}

func TestSecureCookieForHTTPSBaseURL(t *testing.T) {
	w := httptest.NewRecorder()
	auth.SetSessionCookie(w, "abc", time.Now().Add(time.Hour), true)
	cookies := w.Result().Cookies()
	require.Len(t, cookies, 1)
	assert.True(t, cookies[0].Secure)
}

func TestTestLoginRejectsBadUser(t *testing.T) {
	e := newEnv(t)
	for _, u := range []string{"", "a b", "../x", strings.Repeat("a", 65), "<script>"} {
		resp, body := e.do(t, e.client(t), http.MethodGet, "/auth/test-login?user="+strings.ReplaceAll(u, " ", "%20"), nil)
		assertProblem(t, resp, body, http.StatusBadRequest)
	}
}

func TestLoginPage(t *testing.T) {
	e := newEnv(t)
	resp, body := e.do(t, e.client(t), http.MethodGet, "/auth/login", nil)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Content-Type"), "text/html")
	assert.Contains(t, body, `action="/auth/test-login"`)
	assert.Contains(t, body, `name="user"`)
}

func TestCSRFRejection(t *testing.T) {
	var hits int
	e := newEnv(t, WithAPI(func(r chi.Router) {
		r.Post("/ping", func(w http.ResponseWriter, _ *http.Request) {
			hits++
			w.WriteHeader(http.StatusNoContent)
		})
		r.Delete("/ping", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
		r.Get("/ping", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	}))
	c := e.client(t)
	e.login(t, c, "matt")

	tests := []struct {
		name   string
		method string
		hdr    map[string]string
		want   int
	}{
		{"get needs no header", http.MethodGet, nil, http.StatusNoContent},
		{"post without header", http.MethodPost, nil, http.StatusForbidden},
		{"post wrong value", http.MethodPost, map[string]string{"X-Requested-With": "XMLHttpRequest"}, http.StatusForbidden},
		{"delete without header", http.MethodDelete, nil, http.StatusForbidden},
		{"post with header", http.MethodPost, map[string]string{"X-Requested-With": "chartit"}, http.StatusNoContent},
		{"delete with header", http.MethodDelete, map[string]string{"X-Requested-With": "chartit"}, http.StatusNoContent},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp, body := e.do(t, c, tt.method, "/api/v1/ping", tt.hdr)
			if tt.want == http.StatusForbidden {
				assertProblem(t, resp, body, http.StatusForbidden)
				return
			}
			assert.Equal(t, tt.want, resp.StatusCode)
		})
	}
	assert.Equal(t, 1, hits)
}

func TestUnauthenticatedMutationIs401NotCSRF(t *testing.T) {
	e := newEnv(t, WithAPI(func(r chi.Router) {
		r.Post("/ping", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	}))
	resp, body := e.do(t, e.client(t), http.MethodPost, "/api/v1/ping", map[string]string{"X-Requested-With": "chartit"})
	assertProblem(t, resp, body, http.StatusUnauthorized)
}

func TestPublicAPIRequiresNoAuth(t *testing.T) {
	e := newEnv(t, WithPublicAPI(func(r chi.Router) {
		r.Get("/shared/{token}", func(w http.ResponseWriter, req *http.Request) {
			_, _ = w.Write([]byte(chi.URLParam(req, "token")))
		})
	}))
	resp, body := e.do(t, e.client(t), http.MethodGet, "/api/v1/shared/abc", nil)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "abc", body)
}

func TestLogout(t *testing.T) {
	e := newEnv(t)
	c := e.client(t)
	e.login(t, c, "matt")

	resp, _ := e.do(t, c, http.MethodPost, "/auth/logout", nil)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)

	resp, body := e.do(t, c, http.MethodGet, "/api/v1/me", nil)
	assertProblem(t, resp, body, http.StatusUnauthorized)

	resp, _ = e.do(t, c, http.MethodPost, "/auth/logout", nil)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestLogoutInvalidatesServerSideSession(t *testing.T) {
	e := newEnv(t)
	c := e.client(t)
	resp, _ := e.do(t, c, http.MethodGet, "/auth/test-login?user=matt", nil)
	var sessionID string
	for _, ck := range resp.Cookies() {
		if ck.Name == auth.CookieName {
			sessionID = ck.Value
		}
	}
	require.NotEmpty(t, sessionID)

	e.do(t, c, http.MethodPost, "/auth/logout", nil)

	replay := e.client(t)
	resp, body := e.do(t, replay, http.MethodGet, "/api/v1/me", map[string]string{"Cookie": auth.CookieName + "=" + sessionID})
	assertProblem(t, resp, body, http.StatusUnauthorized)
}

func TestFallbackAndNotFound(t *testing.T) {
	e := newEnv(t)
	c := e.client(t)

	resp, _ := e.do(t, c, http.MethodGet, "/some/spa/route", nil)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)

	resp, body := e.do(t, c, http.MethodGet, "/api/v1/nope", nil)
	assertProblem(t, resp, body, http.StatusNotFound)

	resp, _ = e.do(t, c, http.MethodGet, "/auth/nope", nil)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)

	withSPA := newEnv(t, WithFallback(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("spa"))
	})))
	resp, body = withSPA.do(t, withSPA.client(t), http.MethodGet, "/some/spa/route", nil)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "spa", body)
}

func TestNewServerTimeouts(t *testing.T) {
	e := newEnv(t)
	st := e.store
	a := header.New(st, auth.NewSessions(st, false))
	srv := New(config.Config{Addr: ":1234"}, st, a)
	assert.Equal(t, ":1234", srv.Addr)
	assert.Equal(t, 5*time.Second, srv.ReadHeaderTimeout)
	assert.Equal(t, 30*time.Second, srv.ReadTimeout)
	assert.Equal(t, 60*time.Second, srv.WriteTimeout)
	assert.Equal(t, 120*time.Second, srv.IdleTimeout)
}

func newSingleUserEnv(t *testing.T, baseURL string) *env {
	t.Helper()
	ctx := context.Background()
	conn, err := db.Open(ctx, filepath.Join(t.TempDir(), "chartit.db"))
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })
	require.NoError(t, db.Migrate(ctx, conn))

	cfg := config.Config{Addr: ":0", BaseURL: baseURL, SingleUser: true}
	st := store.New(conn)
	a, err := single.New(ctx, st)
	require.NoError(t, err)
	ts := httptest.NewServer(NewHandler(cfg, st, a,
		WithPublicAPI(func(r chi.Router) {
			r.Get("/shared/{token}", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("public")) })
		}),
		WithAPI(func(r chi.Router) {
			r.Post("/documents", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusCreated) })
		}),
	))
	t.Cleanup(ts.Close)
	return &env{ts: ts, store: st, cfg: cfg}
}

func (e *env) doWithHost(t *testing.T, method, path, host string) (*http.Response, string) {
	t.Helper()
	req, err := http.NewRequest(method, e.ts.URL+path, nil)
	require.NoError(t, err)
	req.Host = host
	resp, err := e.client(t).Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return resp, string(body)
}

func TestSingleUserMeWithoutLogin(t *testing.T) {
	e := newSingleUserEnv(t, "http://localhost:8080")
	resp, body := e.do(t, e.client(t), http.MethodGet, "/api/v1/me", nil)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var me map[string]any
	require.NoError(t, json.Unmarshal([]byte(body), &me))
	assert.Equal(t, single.UserName, me["name"])
	assert.Equal(t, true, me["singleUser"])
	assert.Len(t, me["id"], 32)
}

func TestTestAuthMeReportsNotSingleUser(t *testing.T) {
	e := newEnv(t)
	c := e.client(t)
	e.login(t, c, "matt")
	_, body := e.do(t, c, http.MethodGet, "/api/v1/me", nil)
	var me map[string]any
	require.NoError(t, json.Unmarshal([]byte(body), &me))
	assert.Equal(t, false, me["singleUser"])
}

func TestSingleUserStillRequiresCSRFHeader(t *testing.T) {
	e := newSingleUserEnv(t, "http://localhost:8080")
	resp, body := e.do(t, e.client(t), http.MethodPost, "/api/v1/documents", nil)
	assertProblem(t, resp, body, http.StatusForbidden)

	resp, _ = e.do(t, e.client(t), http.MethodPost, "/api/v1/documents", map[string]string{auth.CSRFHeader: auth.CSRFValue})
	assert.Equal(t, http.StatusCreated, resp.StatusCode)
}

func TestSingleUserLoginAndLogout(t *testing.T) {
	e := newSingleUserEnv(t, "http://localhost:8080")
	resp, _ := e.do(t, e.client(t), http.MethodGet, "/auth/login", nil)
	assert.Equal(t, http.StatusFound, resp.StatusCode)
	assert.Equal(t, "/", resp.Header.Get("Location"))

	resp, _ = e.do(t, e.client(t), http.MethodPost, "/auth/logout", nil)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestSingleUserHostGuard(t *testing.T) {
	e := newSingleUserEnv(t, "http://diagrams.lan:9000")

	tests := []struct {
		host string
		want int
	}{
		{"localhost:8080", http.StatusOK},
		{"127.0.0.1:1234", http.StatusOK},
		{"[::1]:8080", http.StatusOK},
		{"app.localhost", http.StatusOK},
		{"diagrams.lan:9000", http.StatusOK},
		{"DIAGRAMS.LAN", http.StatusOK},
		{"attacker.example", http.StatusForbidden},
		{"192.168.1.20:8080", http.StatusForbidden},
	}
	for _, tt := range tests {
		t.Run(tt.host, func(t *testing.T) {
			resp, body := e.doWithHost(t, http.MethodGet, "/api/v1/me", tt.host)
			if tt.want == http.StatusForbidden {
				assertProblem(t, resp, body, http.StatusForbidden)
				return
			}
			assert.Equal(t, tt.want, resp.StatusCode)
		})
	}

	resp, body := e.doWithHost(t, http.MethodGet, "/api/v1/shared/abc", "attacker.example")
	assertProblem(t, resp, body, http.StatusForbidden)
	resp, body = e.doWithHost(t, http.MethodGet, "/auth/login", "attacker.example")
	assertProblem(t, resp, body, http.StatusForbidden)

	resp, body = e.doWithHost(t, http.MethodGet, "/healthz", "10.0.0.5:8080")
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "ok", body)
}

func TestHostGuardOffOutsideSingleUser(t *testing.T) {
	e := newEnv(t)
	resp, body := e.doWithHost(t, http.MethodGet, "/api/v1/me", "attacker.example")
	assertProblem(t, resp, body, http.StatusUnauthorized)
}
