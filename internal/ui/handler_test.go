package ui_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/hayward-solutions/chart.it/internal/ui"
)

const (
	indexHTML = "<!doctype html><title>spa</title>"
	wantCSP   = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
		"font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; " +
		"base-uri 'self'; form-action 'self'"
)

func newHandler() http.Handler {
	return ui.Handler(fstest.MapFS{
		"index.html":              {Data: []byte(indexHTML)},
		"assets/index-AbC123.js":  {Data: []byte("console.log(1)")},
		"assets/index-AbC123.css": {Data: []byte("body{}")},
		"icons/manifest.json":     {Data: []byte(`{"icons":[]}`)},
		"icons/aws/ec2.svg":       {Data: []byte("<svg/>")},
		"favicon.svg":             {Data: []byte("<svg/>")},
	})
}

func do(t *testing.T, h http.Handler, method, target string, hdr map[string]string) (*http.Response, string) {
	t.Helper()
	req := httptest.NewRequest(method, target, nil)
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	resp := rec.Result()
	t.Cleanup(func() { _ = resp.Body.Close() })
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return resp, string(body)
}

func TestIndexIsNoCache(t *testing.T) {
	h := newHandler()
	for _, target := range []string{"/", "/index.html"} {
		resp, body := do(t, h, http.MethodGet, target, nil)
		assert.Equal(t, http.StatusOK, resp.StatusCode, target)
		assert.Equal(t, indexHTML, body, target)
		assert.Equal(t, "no-cache", resp.Header.Get("Cache-Control"), target)
		assert.Equal(t, "text/html; charset=utf-8", resp.Header.Get("Content-Type"), target)
		assert.NotEmpty(t, resp.Header.Get("ETag"), target)
	}
}

func TestIndexSecurityHeaders(t *testing.T) {
	h := newHandler()
	for _, target := range []string{"/", "/index.html", "/d/abc123", "/s/sharetoken", "/login", "/some/deep/unknown/route"} {
		resp, _ := do(t, h, http.MethodGet, target, nil)
		assert.Equal(t, http.StatusOK, resp.StatusCode, target)
		assert.Equal(t, wantCSP, resp.Header.Get("Content-Security-Policy"), target)
		assert.Equal(t, "DENY", resp.Header.Get("X-Frame-Options"), target)
		assert.Equal(t, "nosniff", resp.Header.Get("X-Content-Type-Options"), target)
		assert.Equal(t, "no-referrer", resp.Header.Get("Referrer-Policy"), target)
	}
}

func TestIndexSecurityHeadersOnHead(t *testing.T) {
	resp, _ := do(t, newHandler(), http.MethodHead, "/d/abc", nil)
	assert.Equal(t, wantCSP, resp.Header.Get("Content-Security-Policy"))
	assert.Equal(t, "DENY", resp.Header.Get("X-Frame-Options"))
}

func TestAssetsHaveNoDocumentSecurityHeaders(t *testing.T) {
	h := newHandler()
	for _, target := range []string{
		"/assets/index-AbC123.js",
		"/assets/index-AbC123.css",
		"/icons/manifest.json",
		"/icons/aws/ec2.svg",
		"/favicon.svg",
	} {
		resp, _ := do(t, h, http.MethodGet, target, nil)
		assert.Equal(t, http.StatusOK, resp.StatusCode, target)
		assert.Empty(t, resp.Header.Get("Content-Security-Policy"), target)
		assert.Empty(t, resp.Header.Get("X-Frame-Options"), target)
	}
	resp, _ := do(t, h, http.MethodGet, "/assets/missing-123.js", nil)
	assert.Empty(t, resp.Header.Get("Content-Security-Policy"))
}

func TestIndexConditionalRequest(t *testing.T) {
	h := newHandler()
	resp, _ := do(t, h, http.MethodGet, "/", nil)
	etag := resp.Header.Get("ETag")
	require.NotEmpty(t, etag)

	resp, body := do(t, h, http.MethodGet, "/", map[string]string{"If-None-Match": etag})
	assert.Equal(t, http.StatusNotModified, resp.StatusCode)
	assert.Empty(t, body)
}

func TestHashedAssetsAreImmutable(t *testing.T) {
	h := newHandler()
	for target, wantType := range map[string]string{
		"/assets/index-AbC123.js":  "text/javascript",
		"/assets/index-AbC123.css": "text/css",
	} {
		resp, body := do(t, h, http.MethodGet, target, nil)
		assert.Equal(t, http.StatusOK, resp.StatusCode, target)
		assert.NotEmpty(t, body, target)
		assert.Equal(t, "public, max-age=31536000, immutable", resp.Header.Get("Cache-Control"), target)
		assert.True(t, strings.HasPrefix(resp.Header.Get("Content-Type"), wantType), resp.Header.Get("Content-Type"))
	}
}

func TestIconsCache(t *testing.T) {
	h := newHandler()
	for _, target := range []string{"/icons/manifest.json", "/icons/aws/ec2.svg"} {
		resp, _ := do(t, h, http.MethodGet, target, nil)
		assert.Equal(t, http.StatusOK, resp.StatusCode, target)
		assert.Equal(t, "public, max-age=86400", resp.Header.Get("Cache-Control"), target)
	}
	resp, _ := do(t, h, http.MethodGet, "/icons/aws/ec2.svg", nil)
	assert.Equal(t, "image/svg+xml", resp.Header.Get("Content-Type"))
}

func TestOtherStaticFilesRevalidate(t *testing.T) {
	resp, body := do(t, newHandler(), http.MethodGet, "/favicon.svg", nil)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "<svg/>", body)
	assert.Equal(t, "no-cache", resp.Header.Get("Cache-Control"))
}

func TestSPAFallback(t *testing.T) {
	h := newHandler()
	for _, target := range []string{"/d/abc123", "/s/sharetoken", "/login", "/some/deep/unknown/route", "/d/abc/"} {
		resp, body := do(t, h, http.MethodGet, target, nil)
		assert.Equal(t, http.StatusOK, resp.StatusCode, target)
		assert.Equal(t, indexHTML, body, target)
		assert.Equal(t, "no-cache", resp.Header.Get("Cache-Control"), target)
	}
}

func TestMissingAssetsAreNotFound(t *testing.T) {
	h := newHandler()
	for _, target := range []string{"/assets/missing-123.js", "/icons/nope.svg", "/assets/", "/assets", "/icons"} {
		resp, body := do(t, h, http.MethodGet, target, nil)
		assert.Equal(t, http.StatusNotFound, resp.StatusCode, target)
		assert.NotContains(t, body, "<title>spa</title>", target)
	}
}

func TestPathTraversalIsContained(t *testing.T) {
	h := newHandler()
	for _, target := range []string{"/../go.mod", "/assets/../../etc/passwd", "/%2e%2e/secret", "/assets/..%2f..%2fsecret"} {
		resp, body := do(t, h, http.MethodGet, target, nil)
		assert.Contains(t, []int{http.StatusOK, http.StatusNotFound, http.StatusMovedPermanently}, resp.StatusCode, target)
		if resp.StatusCode == http.StatusOK {
			assert.Equal(t, indexHTML, body, target)
		}
	}
}

func TestHeadAndMethods(t *testing.T) {
	h := newHandler()
	resp, body := do(t, h, http.MethodHead, "/d/abc", nil)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Empty(t, body)

	resp, _ = do(t, h, http.MethodPost, "/", nil)
	assert.Equal(t, http.StatusMethodNotAllowed, resp.StatusCode)
	assert.Equal(t, "GET, HEAD", resp.Header.Get("Allow"))
}

func TestMissingIndex(t *testing.T) {
	h := ui.Handler(fstest.MapFS{"assets/x.js": {Data: []byte("x")}})
	resp, _ := do(t, h, http.MethodGet, "/", nil)
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}

func TestEmbeddedAlwaysServesAnIndex(t *testing.T) {
	h := ui.Handler(ui.Embedded())
	resp, body := do(t, h, http.MethodGet, "/d/anything", nil)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Contains(t, body, "<html")
	assert.Equal(t, "no-cache", resp.Header.Get("Cache-Control"))
}
