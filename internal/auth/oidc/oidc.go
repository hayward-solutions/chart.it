package oidc

import (
	"context"
	"crypto/cipher"
	"crypto/subtle"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	gooidc "github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"

	"github.com/hayward-solutions/chart.it/internal/auth"
	"github.com/hayward-solutions/chart.it/internal/config"
	"github.com/hayward-solutions/chart.it/internal/problem"
	"github.com/hayward-solutions/chart.it/internal/store"
)

const (
	discoveryTimeout = 10 * time.Second
	exchangeTimeout  = 15 * time.Second
	minSecretBytes   = 32
)

type Authenticator struct {
	cfg      config.Config
	store    *store.Store
	sessions *auth.Sessions
	aead     cipher.AEAD
	secure   bool
	client   *http.Client
	now      func() time.Time

	mu       sync.Mutex
	provider *gooidc.Provider
}

type Option func(*Authenticator)

func WithHTTPClient(c *http.Client) Option {
	return func(a *Authenticator) { a.client = c }
}

func WithClock(now func() time.Time) Option {
	return func(a *Authenticator) { a.now = now }
}

func New(cfg config.Config, st *store.Store, sessions *auth.Sessions, opts ...Option) (*Authenticator, error) {
	if !cfg.OIDCEnabled() {
		return nil, errors.New("oidc issuer and client id are required")
	}
	if len(cfg.SessionSecret) < minSecretBytes {
		return nil, fmt.Errorf("session secret must be at least %d bytes", minSecretBytes)
	}
	key, err := deriveKey(cfg.SessionSecret)
	if err != nil {
		return nil, err
	}
	aead, err := newGCM(key)
	if err != nil {
		return nil, err
	}
	a := &Authenticator{
		cfg:      cfg,
		store:    st,
		sessions: sessions,
		aead:     aead,
		secure:   cfg.SecureCookies(),
		client:   &http.Client{Timeout: exchangeTimeout},
		now:      time.Now,
	}
	for _, opt := range opts {
		opt(a)
	}
	return a, nil
}

func (a *Authenticator) Name() string { return "oidc" }

func (a *Authenticator) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /login", a.login)
	mux.HandleFunc("GET /callback", a.callback)
	mux.HandleFunc("POST /logout", a.logout)
	return mux
}

func (a *Authenticator) Authenticate(r *http.Request) (auth.User, error) {
	return a.sessions.Authenticate(r)
}

func (a *Authenticator) Logout(w http.ResponseWriter, r *http.Request) error {
	a.clearFlowCookie(w)
	return a.sessions.End(w, r)
}

func (a *Authenticator) providerFor(ctx context.Context) (*gooidc.Provider, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.provider != nil {
		return a.provider, nil
	}
	ctx, cancel := context.WithTimeout(gooidc.ClientContext(ctx, a.client), discoveryTimeout)
	defer cancel()
	p, err := gooidc.NewProvider(ctx, a.cfg.OIDC.Issuer)
	if err != nil {
		return nil, fmt.Errorf("discover oidc provider: %w", err)
	}
	a.provider = p
	return p, nil
}

func (a *Authenticator) oauthConfig(p *gooidc.Provider) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     a.cfg.OIDC.ClientID,
		ClientSecret: a.cfg.OIDC.ClientSecret,
		Endpoint:     p.Endpoint(),
		RedirectURL:  a.cfg.BaseURL + "/auth/callback",
		Scopes:       a.cfg.OIDC.Scopes,
	}
}

func (a *Authenticator) login(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	p, err := a.providerFor(r.Context())
	if err != nil {
		slog.ErrorContext(r.Context(), "oidc discovery", "err", err)
		problem.Write(w, http.StatusServiceUnavailable, "identity provider is unavailable, try again shortly")
		return
	}
	state, err := randomToken()
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	nonce, err := randomToken()
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	verifier := oauth2.GenerateVerifier()
	sealed, err := a.seal(flowState{
		State:    state,
		Nonce:    nonce,
		Verifier: verifier,
		Next:     sanitizeNext(r.URL.Query().Get("next")),
		Expires:  a.now().Add(flowTTL).Unix(),
	})
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	a.setFlowCookie(w, sealed)
	target := a.oauthConfig(p).AuthCodeURL(state, oauth2.S256ChallengeOption(verifier), gooidc.Nonce(nonce))
	http.Redirect(w, r, target, http.StatusFound)
}

type claims struct {
	Email           string `json:"email"`
	Name            string `json:"name"`
	CognitoUsername string `json:"cognito:username"`
	Picture         string `json:"picture"`
}

func (c claims) displayName() string {
	switch {
	case c.Name != "":
		return c.Name
	case c.CognitoUsername != "":
		return c.CognitoUsername
	}
	return c.Email
}

func (a *Authenticator) callback(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	a.clearFlowCookie(w)

	c, err := r.Cookie(flowCookieName)
	if err != nil {
		problem.Write(w, http.StatusBadRequest, "login session not found, start again from /auth/login")
		return
	}
	flow, err := a.open(c.Value)
	if err != nil {
		problem.Write(w, http.StatusBadRequest, "login session is invalid or expired, start again from /auth/login")
		return
	}

	q := r.URL.Query()
	if code := q.Get("error"); code != "" {
		slog.WarnContext(r.Context(), "oidc provider returned an error", "error", code, "description", q.Get("error_description"))
		problem.Write(w, http.StatusUnauthorized, "identity provider rejected the login: "+code)
		return
	}
	if subtle.ConstantTimeCompare([]byte(q.Get("state")), []byte(flow.State)) != 1 {
		problem.Write(w, http.StatusBadRequest, "state mismatch, start again from /auth/login")
		return
	}
	code := q.Get("code")
	if code == "" {
		problem.Write(w, http.StatusBadRequest, "authorization code is missing")
		return
	}

	p, err := a.providerFor(r.Context())
	if err != nil {
		slog.ErrorContext(r.Context(), "oidc discovery", "err", err)
		problem.Write(w, http.StatusServiceUnavailable, "identity provider is unavailable, try again shortly")
		return
	}

	ctx, cancel := context.WithTimeout(gooidc.ClientContext(r.Context(), a.client), exchangeTimeout)
	defer cancel()
	token, err := a.oauthConfig(p).Exchange(ctx, code, oauth2.VerifierOption(flow.Verifier))
	if err != nil {
		slog.WarnContext(r.Context(), "oidc code exchange", "err", err)
		problem.Write(w, http.StatusUnauthorized, "could not exchange the authorization code")
		return
	}
	rawID, ok := token.Extra("id_token").(string)
	if !ok || rawID == "" {
		problem.Write(w, http.StatusUnauthorized, "identity provider did not return an id_token")
		return
	}
	idToken, err := p.Verifier(&gooidc.Config{ClientID: a.cfg.OIDC.ClientID}).Verify(ctx, rawID)
	if err != nil {
		slog.WarnContext(r.Context(), "oidc id token verification", "err", err)
		problem.Write(w, http.StatusUnauthorized, "id_token verification failed")
		return
	}
	if subtle.ConstantTimeCompare([]byte(idToken.Nonce), []byte(flow.Nonce)) != 1 {
		problem.Write(w, http.StatusUnauthorized, "id_token nonce mismatch")
		return
	}
	var cl claims
	if err := idToken.Claims(&cl); err != nil {
		slog.WarnContext(r.Context(), "oidc claims", "err", err)
		problem.Write(w, http.StatusUnauthorized, "id_token claims could not be read")
		return
	}

	u, err := a.store.UpsertUserBySubject(r.Context(), idToken.Subject, cl.displayName(), cl.Email, cl.Picture)
	if err != nil {
		a.serverError(w, r, err)
		return
	}
	if err := a.sessions.Start(w, r, u); err != nil {
		a.serverError(w, r, err)
		return
	}
	http.Redirect(w, r, sanitizeNext(flow.Next), http.StatusFound)
}

func (a *Authenticator) logout(w http.ResponseWriter, r *http.Request) {
	if err := a.Logout(w, r); err != nil {
		a.serverError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *Authenticator) serverError(w http.ResponseWriter, r *http.Request, err error) {
	slog.ErrorContext(r.Context(), "oidc", "path", r.URL.Path, "err", err)
	problem.Write(w, http.StatusInternalServerError, "login failed")
}
