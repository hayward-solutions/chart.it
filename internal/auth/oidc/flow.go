package oidc

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	flowCookieName = "chartit_oidc"
	flowCookiePath = "/auth"
	flowTTL        = 10 * time.Minute
	maxNextLength  = 2048
)

var errFlowCookie = errors.New("invalid login flow cookie")

type flowState struct {
	State    string `json:"s"`
	Nonce    string `json:"n"`
	Verifier string `json:"v"`
	Next     string `json:"r"`
	Expires  int64  `json:"e"`
}

func deriveKey(secret string) ([]byte, error) {
	key, err := hkdf.Key(sha256.New, []byte(secret), nil, "chartit oidc flow cookie v1", 32)
	if err != nil {
		return nil, fmt.Errorf("derive flow key: %w", err)
	}
	return key, nil
}

func newGCM(key []byte) (cipher.AEAD, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("create cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create gcm: %w", err)
	}
	return gcm, nil
}

func (a *Authenticator) seal(f flowState) (string, error) {
	plain, err := json.Marshal(f)
	if err != nil {
		return "", fmt.Errorf("encode flow state: %w", err)
	}
	nonce := make([]byte, a.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", fmt.Errorf("read random nonce: %w", err)
	}
	sealed := a.aead.Seal(nonce, nonce, plain, []byte(flowCookieName))
	return base64.RawURLEncoding.EncodeToString(sealed), nil
}

func (a *Authenticator) open(value string) (flowState, error) {
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil || len(raw) <= a.aead.NonceSize() {
		return flowState{}, errFlowCookie
	}
	nonce, ciphertext := raw[:a.aead.NonceSize()], raw[a.aead.NonceSize():]
	plain, err := a.aead.Open(nil, nonce, ciphertext, []byte(flowCookieName))
	if err != nil {
		return flowState{}, errFlowCookie
	}
	var f flowState
	if err := json.Unmarshal(plain, &f); err != nil {
		return flowState{}, errFlowCookie
	}
	if a.now().Unix() > f.Expires {
		return flowState{}, fmt.Errorf("%w: expired", errFlowCookie)
	}
	return f, nil
}

func (a *Authenticator) setFlowCookie(w http.ResponseWriter, value string) {
	http.SetCookie(w, &http.Cookie{ //nolint:gosec
		Name:     flowCookieName,
		Value:    value,
		Path:     flowCookiePath,
		MaxAge:   int(flowTTL.Seconds()),
		HttpOnly: true,
		Secure:   a.secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (a *Authenticator) clearFlowCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{ //nolint:gosec
		Name:     flowCookieName,
		Value:    "",
		Path:     flowCookiePath,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		Secure:   a.secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func randomToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("read random bytes: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func sanitizeNext(next string) string {
	if next == "" || len(next) > maxNextLength || !strings.HasPrefix(next, "/") {
		return "/"
	}
	if strings.HasPrefix(next, "//") || strings.HasPrefix(next, `/\`) {
		return "/"
	}
	for _, r := range next {
		if r < 0x20 || r == 0x7f || r == '\\' {
			return "/"
		}
	}
	u, err := url.Parse(next)
	if err != nil || u.Scheme != "" || u.Host != "" || u.User != nil {
		return "/"
	}
	return next
}
