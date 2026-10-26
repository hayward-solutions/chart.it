package oidc_test

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/hayward-solutions/chart.it/internal/auth"
	"github.com/hayward-solutions/chart.it/internal/auth/oidc"
	"github.com/hayward-solutions/chart.it/internal/config"
	"github.com/hayward-solutions/chart.it/internal/db"
	"github.com/hayward-solutions/chart.it/internal/problem"
	"github.com/hayward-solutions/chart.it/internal/server"
	"github.com/hayward-solutions/chart.it/internal/store"
)

const (
	clientID     = "chartit-client"
	clientSecret = "chartit-secret"
	sessionKey   = "0123456789abcdef0123456789abcdef"
)

type issued struct {
	nonce     string
	challenge string
	redirect  string
	claims    map[string]any
}

type fakeIssuer struct {
	*httptest.Server
	key *rsa.PrivateKey

	mu            sync.Mutex
	codes         map[string]issued
	claims        map[string]any
	nonceOverride string
	discoveryUp   atomic.Bool
	discoveryHits atomic.Int32
	rejectTokens  atomic.Bool
}

func newFakeIssuer(t *testing.T) *fakeIssuer {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	f := &fakeIssuer{key: key, codes: map[string]issued{}}
	f.discoveryUp.Store(true)
	f.claims = map[string]any{"sub": "user-123", "name": "Ada Lovelace", "email": "ada@example.com", "picture": "https://img.example/ada.png"}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /.well-known/openid-configuration", f.discovery)
	mux.HandleFunc("GET /jwks", f.jwks)
	mux.HandleFunc("GET /authorize", f.authorize)
	mux.HandleFunc("POST /token", f.token)
	f.Server = httptest.NewServer(mux)
	t.Cleanup(f.Close)
	return f
}

func (f *fakeIssuer) setClaims(c map[string]any) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.claims = c
}

func (f *fakeIssuer) setNonceOverride(n string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.nonceOverride = n
}

func (f *fakeIssuer) discovery(w http.ResponseWriter, _ *http.Request) {
	f.discoveryHits.Add(1)
	if !f.discoveryUp.Load() {
		http.Error(w, "down", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"issuer":                                f.URL,
		"authorization_endpoint":                f.URL + "/authorize",
		"token_endpoint":                        f.URL + "/token",
		"jwks_uri":                              f.URL + "/jwks",
		"response_types_supported":              []string{"code"},
		"subject_types_supported":               []string{"public"},
		"id_token_signing_alg_values_supported": []string{"RS256"},
	})
}

func (f *fakeIssuer) jwks(w http.ResponseWriter, _ *http.Request) {
	pub := f.key.PublicKey
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]any{{
		"kty": "RSA",
		"alg": "RS256",
		"use": "sig",
		"kid": "test-key",
		"n":   base64.RawURLEncoding.EncodeToString(pub.N.Bytes()),
		"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(pub.E)).Bytes()),
	}}})
}

func (f *fakeIssuer) authorize(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if q.Get("client_id") != clientID || q.Get("response_type") != "code" || q.Get("code_challenge_method") != "S256" {
		http.Error(w, "bad authorize request", http.StatusBadRequest)
		return
	}
	code := "code-" + q.Get("state")
	f.mu.Lock()
	claims := map[string]any{}
	for k, v := range f.claims {
		claims[k] = v
	}
	f.codes[code] = issued{nonce: q.Get("nonce"), challenge: q.Get("code_challenge"), redirect: q.Get("redirect_uri"), claims: claims}
	f.mu.Unlock()

	target, err := url.Parse(q.Get("redirect_uri"))
	if err != nil {
		http.Error(w, "bad redirect", http.StatusBadRequest)
		return
	}
	v := target.Query()
	v.Set("code", code)
	v.Set("state", q.Get("state"))
	target.RawQuery = v.Encode()
	http.Redirect(w, r, target.String(), http.StatusFound)
}

func (f *fakeIssuer) token(w http.ResponseWriter, r *http.Request) {
	if f.rejectTokens.Load() {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
		return
	}
	if err := r.ParseForm(); err != nil {
		http.Error(w, "bad form", http.StatusBadRequest)
		return
	}
	id, secret, hasBasic := r.BasicAuth()
	if !hasBasic {
		id, secret = r.PostForm.Get("client_id"), r.PostForm.Get("client_secret")
	}
	unescapedID, _ := url.QueryUnescape(id)
	unescapedSecret, _ := url.QueryUnescape(secret)
	if unescapedID != clientID || unescapedSecret != clientSecret {
		http.Error(w, `{"error":"invalid_client"}`, http.StatusUnauthorized)
		return
	}
	f.mu.Lock()
	rec, ok := f.codes[r.PostForm.Get("code")]
	delete(f.codes, r.PostForm.Get("code"))
	override := f.nonceOverride
	f.mu.Unlock()
	if !ok || r.PostForm.Get("grant_type") != "authorization_code" || r.PostForm.Get("redirect_uri") != rec.redirect {
		http.Error(w, `{"error":"invalid_grant"}`, http.StatusBadRequest)
		return
	}
	sum := sha256.Sum256([]byte(r.PostForm.Get("code_verifier")))
	if base64.RawURLEncoding.EncodeToString(sum[:]) != rec.challenge {
		http.Error(w, `{"error":"invalid_grant","error_description":"pkce"}`, http.StatusBadRequest)
		return
	}
	nonce := rec.nonce
	if override != "" {
		nonce = override
	}
	claims := rec.claims
	claims["iss"] = f.URL
	claims["aud"] = clientID
	claims["iat"] = time.Now().Unix()
	claims["exp"] = time.Now().Add(time.Hour).Unix()
	claims["nonce"] = nonce
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"access_token": "access",
		"token_type":   "Bearer",
		"expires_in":   3600,
		"id_token":     f.sign(claims),
	})
}

func (f *fakeIssuer) sign(claims map[string]any) string {
	header, _ := json.Marshal(map[string]any{"alg": "RS256", "typ": "JWT", "kid": "test-key"})
	payload, _ := json.Marshal(claims)
	signing := base64.RawURLEncoding.EncodeToString(header) + "." + base64.RawURLEncoding.EncodeToString(payload)
	sum := sha256.Sum256([]byte(signing))
	sig, err := rsa.SignPKCS1v15(rand.Reader, f.key, crypto.SHA256, sum[:])
	if err != nil {
		panic(err)
	}
	return signing + "." + base64.RawURLEncoding.EncodeToString(sig)
}

type app struct {
	ts     *httptest.Server
	store  *store.Store
	issuer *fakeIssuer
	now    atomic.Pointer[time.Time]
}

func newApp(t *testing.T) *app {
	t.Helper()
	ctx := context.Background()
	conn, err := db.Open(ctx, filepath.Join(t.TempDir(), "chartit.db"))
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })
	require.NoError(t, db.Migrate(ctx, conn))
	st := store.New(conn)

	issuer := newFakeIssuer(t)
	ts := httptest.NewUnstartedServer(nil)
	cfg := config.Config{
		Addr:          ":0",
		BaseURL:       "http://" + ts.Listener.Addr().String(),
		SessionSecret: sessionKey,
		OIDC: config.OIDC{
			Issuer:       issuer.URL,
			ClientID:     clientID,
			ClientSecret: clientSecret,
			Scopes:       []string{"openid", "profile", "email"},
		},
		MaxDocumentBytes: 1 << 20,
	}
	a := &app{ts: ts, store: st, issuer: issuer}
	now := time.Now()
	a.now.Store(&now)
	authn, err := oidc.New(cfg, st, auth.NewSessions(st, cfg.SecureCookies()), oidc.WithClock(func() time.Time { return *a.now.Load() }))
	require.NoError(t, err)
	ts.Config.Handler = server.NewHandler(cfg, st, authn)
	ts.Start()
	t.Cleanup(ts.Close)
	return a
}

func (a *app) client(t *testing.T) *http.Client {
	t.Helper()
	jar, err := cookiejar.New(nil)
	require.NoError(t, err)
	return &http.Client{
		Jar:           jar,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
}

func (a *app) get(t *testing.T, c *http.Client, rawURL string) *http.Response {
	t.Helper()
	resp, err := c.Get(rawURL)
	require.NoError(t, err)
	_ = resp.Body.Close()
	return resp
}

func (a *app) beginLogin(t *testing.T, c *http.Client, next string) string {
	t.Helper()
	path := "/auth/login"
	if next != "" {
		path += "?next=" + url.QueryEscape(next)
	}
	resp := a.get(t, c, a.ts.URL+path)
	require.Equal(t, http.StatusFound, resp.StatusCode)
	return resp.Header.Get("Location")
}

func (a *app) providerRedirect(t *testing.T, authorizeURL string) string {
	t.Helper()
	plain := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp := a.get(t, plain, authorizeURL)
	require.Equal(t, http.StatusFound, resp.StatusCode)
	return resp.Header.Get("Location")
}

func (a *app) status(t *testing.T, c *http.Client, method, path string) int {
	t.Helper()
	req, err := http.NewRequest(method, a.ts.URL+path, nil)
	require.NoError(t, err)
	resp, err := c.Do(req)
	require.NoError(t, err)
	_ = resp.Body.Close()
	return resp.StatusCode
}

func TestNewValidatesConfig(t *testing.T) {
	st := store.New(nil)
	sessions := auth.NewSessions(st, false)
	_, err := oidc.New(config.Config{}, st, sessions)
	require.Error(t, err)
	_, err = oidc.New(config.Config{OIDC: config.OIDC{Issuer: "https://x", ClientID: "c"}, SessionSecret: "short"}, st, sessions)
	require.Error(t, err)
}

func TestFullLoginFlow(t *testing.T) {
	a := newApp(t)
	c := a.client(t)

	assert.Equal(t, http.StatusUnauthorized, a.status(t, c, http.MethodGet, "/api/v1/me"))

	authorizeURL := a.beginLogin(t, c, "/d/abc123?x=1")
	parsed, err := url.Parse(authorizeURL)
	require.NoError(t, err)
	assert.Equal(t, a.issuer.URL+"/authorize", parsed.Scheme+"://"+parsed.Host+parsed.Path)
	q := parsed.Query()
	assert.Equal(t, clientID, q.Get("client_id"))
	assert.Equal(t, "code", q.Get("response_type"))
	assert.Equal(t, "S256", q.Get("code_challenge_method"))
	assert.NotEmpty(t, q.Get("code_challenge"))
	assert.NotEmpty(t, q.Get("state"))
	assert.NotEmpty(t, q.Get("nonce"))
	assert.Equal(t, "openid profile email", q.Get("scope"))
	assert.Equal(t, a.ts.URL+"/auth/callback", q.Get("redirect_uri"))

	callbackURL := a.providerRedirect(t, authorizeURL)
	resp := a.get(t, c, callbackURL)
	require.Equal(t, http.StatusFound, resp.StatusCode)
	assert.Equal(t, "/d/abc123?x=1", resp.Header.Get("Location"))

	var sessionCookie *http.Cookie
	for _, ck := range resp.Cookies() {
		if ck.Name == auth.CookieName {
			sessionCookie = ck
		}
	}
	require.NotNil(t, sessionCookie)
	assert.True(t, sessionCookie.HttpOnly)
	assert.Equal(t, http.SameSiteLaxMode, sessionCookie.SameSite)

	req, err := http.NewRequest(http.MethodGet, a.ts.URL+"/api/v1/me", nil)
	require.NoError(t, err)
	meResp, err := c.Do(req)
	require.NoError(t, err)
	defer meResp.Body.Close()
	require.Equal(t, http.StatusOK, meResp.StatusCode)
	var me auth.User
	require.NoError(t, json.NewDecoder(meResp.Body).Decode(&me))
	assert.Equal(t, "Ada Lovelace", me.Name)
	assert.Equal(t, "ada@example.com", me.Email)
	assert.Equal(t, "https://img.example/ada.png", me.AvatarURL)

	again := a.get(t, c, callbackURL)
	assert.Equal(t, http.StatusBadRequest, again.StatusCode)

	assert.Equal(t, http.StatusNoContent, a.status(t, c, http.MethodPost, "/auth/logout"))
	assert.Equal(t, http.StatusUnauthorized, a.status(t, c, http.MethodGet, "/api/v1/me"))
}

func TestSecondLoginReusesUser(t *testing.T) {
	a := newApp(t)
	var ids []string
	for range 2 {
		c := a.client(t)
		resp := a.get(t, c, a.providerRedirect(t, a.beginLogin(t, c, "")))
		require.Equal(t, http.StatusFound, resp.StatusCode)
		assert.Equal(t, "/", resp.Header.Get("Location"))
		req, err := http.NewRequest(http.MethodGet, a.ts.URL+"/api/v1/me", nil)
		require.NoError(t, err)
		meResp, err := c.Do(req)
		require.NoError(t, err)
		var me auth.User
		require.NoError(t, json.NewDecoder(meResp.Body).Decode(&me))
		_ = meResp.Body.Close()
		ids = append(ids, me.ID)
	}
	assert.Equal(t, ids[0], ids[1])
}

func TestDisplayNameFallbacks(t *testing.T) {
	cases := []struct {
		name   string
		claims map[string]any
		want   string
	}{
		{"cognito username", map[string]any{"sub": "s1", "cognito:username": "ada_l", "email": "a@x.io"}, "ada_l"},
		{"email", map[string]any{"sub": "s2", "email": "only@x.io"}, "only@x.io"},
		{"name wins", map[string]any{"sub": "s3", "name": "Named", "cognito:username": "u", "email": "e@x.io"}, "Named"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			a := newApp(t)
			a.issuer.setClaims(tc.claims)
			c := a.client(t)
			resp := a.get(t, c, a.providerRedirect(t, a.beginLogin(t, c, "")))
			require.Equal(t, http.StatusFound, resp.StatusCode)

			req, err := http.NewRequest(http.MethodGet, a.ts.URL+"/api/v1/me", nil)
			require.NoError(t, err)
			meResp, err := c.Do(req)
			require.NoError(t, err)
			defer meResp.Body.Close()
			var me auth.User
			require.NoError(t, json.NewDecoder(meResp.Body).Decode(&me))
			assert.Equal(t, tc.want, me.Name)
		})
	}
}

func TestNextIsRestrictedToRelativePaths(t *testing.T) {
	for _, next := range []string{"https://evil.example/x", "//evil.example/x", `/\evil.example`, "javascript:alert(1)", "evil", "/ok\nnewline"} {
		t.Run(next, func(t *testing.T) {
			a := newApp(t)
			c := a.client(t)
			resp := a.get(t, c, a.providerRedirect(t, a.beginLogin(t, c, next)))
			require.Equal(t, http.StatusFound, resp.StatusCode)
			assert.Equal(t, "/", resp.Header.Get("Location"))
		})
	}
}

func TestStateMismatch(t *testing.T) {
	a := newApp(t)
	c := a.client(t)
	callbackURL := a.providerRedirect(t, a.beginLogin(t, c, ""))
	parsed, err := url.Parse(callbackURL)
	require.NoError(t, err)
	q := parsed.Query()
	q.Set("state", "forged")
	parsed.RawQuery = q.Encode()

	resp := a.get(t, c, parsed.String())
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	assert.Equal(t, http.StatusUnauthorized, a.status(t, c, http.MethodGet, "/api/v1/me"))
}

func TestCallbackWithoutFlowCookie(t *testing.T) {
	a := newApp(t)
	c := a.client(t)
	callbackURL := a.providerRedirect(t, a.beginLogin(t, c, ""))

	fresh := a.client(t)
	resp := a.get(t, fresh, callbackURL)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestTamperedFlowCookie(t *testing.T) {
	a := newApp(t)
	c := a.client(t)
	callbackURL := a.providerRedirect(t, a.beginLogin(t, c, ""))

	req, err := http.NewRequest(http.MethodGet, callbackURL, nil)
	require.NoError(t, err)
	req.AddCookie(&http.Cookie{Name: "chartit_oidc", Value: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"})
	resp, err := a.client(t).Do(req)
	require.NoError(t, err)
	_ = resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestExpiredFlowCookie(t *testing.T) {
	a := newApp(t)
	c := a.client(t)
	callbackURL := a.providerRedirect(t, a.beginLogin(t, c, ""))
	later := time.Now().Add(11 * time.Minute)
	a.now.Store(&later)

	resp := a.get(t, c, callbackURL)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestFlowCookieAttributes(t *testing.T) {
	a := newApp(t)
	c := a.client(t)
	resp := a.get(t, c, a.ts.URL+"/auth/login")
	require.Equal(t, http.StatusFound, resp.StatusCode)
	var flow *http.Cookie
	for _, ck := range resp.Cookies() {
		if ck.Name == "chartit_oidc" {
			flow = ck
		}
	}
	require.NotNil(t, flow)
	assert.True(t, flow.HttpOnly)
	assert.Equal(t, 600, flow.MaxAge)
	assert.Equal(t, "/auth", flow.Path)
	assert.Equal(t, http.SameSiteLaxMode, flow.SameSite)
	assert.NotContains(t, flow.Value, "code_verifier")
	assert.Equal(t, "no-store", resp.Header.Get("Cache-Control"))
}

func TestNonceMismatch(t *testing.T) {
	a := newApp(t)
	a.issuer.setNonceOverride("attacker-nonce")
	c := a.client(t)
	resp := a.get(t, c, a.providerRedirect(t, a.beginLogin(t, c, "")))
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	assert.Equal(t, http.StatusUnauthorized, a.status(t, c, http.MethodGet, "/api/v1/me"))
}

func TestProviderErrorParameter(t *testing.T) {
	a := newApp(t)
	c := a.client(t)
	a.beginLogin(t, c, "")
	resp := a.get(t, c, a.ts.URL+"/auth/callback?error=access_denied&error_description=nope")
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	assert.Equal(t, problem.ContentType, resp.Header.Get("Content-Type"))
}

func TestTokenExchangeFailure(t *testing.T) {
	a := newApp(t)
	a.issuer.rejectTokens.Store(true)
	c := a.client(t)
	resp := a.get(t, c, a.providerRedirect(t, a.beginLogin(t, c, "")))
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestMissingCode(t *testing.T) {
	a := newApp(t)
	c := a.client(t)
	authorizeURL := a.beginLogin(t, c, "")
	parsed, err := url.Parse(authorizeURL)
	require.NoError(t, err)
	resp := a.get(t, c, a.ts.URL+"/auth/callback?state="+url.QueryEscape(parsed.Query().Get("state")))
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestDiscoveryIsLazyAndRetried(t *testing.T) {
	a := newApp(t)
	a.issuer.discoveryUp.Store(false)
	assert.Zero(t, a.issuer.discoveryHits.Load(), "constructing the authenticator must not contact the issuer")

	c := a.client(t)
	resp := a.get(t, c, a.ts.URL+"/auth/login")
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
	assert.Equal(t, problem.ContentType, resp.Header.Get("Content-Type"))
	assert.Equal(t, int32(1), a.issuer.discoveryHits.Load())

	assert.Equal(t, http.StatusOK, a.status(t, c, http.MethodGet, "/healthz"))
	assert.Equal(t, http.StatusOK, a.status(t, c, http.MethodGet, "/readyz"))

	a.issuer.discoveryUp.Store(true)
	resp = a.get(t, c, a.ts.URL+"/auth/login")
	assert.Equal(t, http.StatusFound, resp.StatusCode)
	hits := a.issuer.discoveryHits.Load()

	resp = a.get(t, c, a.ts.URL+"/auth/login")
	assert.Equal(t, http.StatusFound, resp.StatusCode)
	assert.Equal(t, hits, a.issuer.discoveryHits.Load(), "discovery result must be cached")
}

func TestLogoutWithoutSession(t *testing.T) {
	a := newApp(t)
	c := a.client(t)
	assert.Equal(t, http.StatusNoContent, a.status(t, c, http.MethodPost, "/auth/logout"))
	assert.Equal(t, http.StatusMethodNotAllowed, a.status(t, c, http.MethodGet, "/auth/logout"))
}
