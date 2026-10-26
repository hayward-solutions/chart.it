package ui

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/hayward-solutions/chart.it/internal/problem"
)

const (
	indexFile       = "index.html"
	assetsPrefix    = "assets/"
	iconsPrefix     = "icons/"
	cacheImmutable  = "public, max-age=31536000, immutable"
	cacheIcons      = "public, max-age=86400"
	cacheRevalidate = "no-cache"

	contentSecurityPolicy = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
		"font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; " +
		"base-uri 'self'; form-action 'self'"
)

type handler struct {
	dist      fs.FS
	index     []byte
	indexETag string
}

func Handler(dist fs.FS) http.Handler {
	h := &handler{dist: dist}
	index, err := fs.ReadFile(dist, indexFile)
	if err != nil {
		slog.Error("ui: index.html is missing from the embedded assets", "err", err)
		return h
	}
	sum := sha256.Sum256(index)
	h.index = index
	h.indexETag = `"` + hex.EncodeToString(sum[:16]) + `"`
	return h
}

func (h *handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		problem.Write(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if h.index == nil {
		problem.Write(w, http.StatusServiceUnavailable, "web assets not built")
		return
	}

	name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	if name == "" || name == indexFile {
		h.serveIndex(w, r)
		return
	}

	file, info, ok := h.open(name)
	if ok {
		defer func() { _ = file.Close() }()
		w.Header().Set("Cache-Control", cacheFor(name))
		w.Header().Set("X-Content-Type-Options", "nosniff")
		serveFile(w, r, name, info, file)
		return
	}

	if guarded := name + "/"; strings.HasPrefix(guarded, assetsPrefix) || strings.HasPrefix(guarded, iconsPrefix) {
		problem.Write(w, http.StatusNotFound, "no such asset")
		return
	}
	h.serveIndex(w, r)
}

func (h *handler) open(name string) (fs.File, fs.FileInfo, bool) {
	if !fs.ValidPath(name) {
		return nil, nil, false
	}
	f, err := h.dist.Open(name)
	if err != nil {
		return nil, nil, false
	}
	info, err := f.Stat()
	if err != nil || info.IsDir() {
		_ = f.Close()
		return nil, nil, false
	}
	return f, info, true
}

func cacheFor(name string) string {
	switch {
	case strings.HasPrefix(name, assetsPrefix):
		return cacheImmutable
	case strings.HasPrefix(name, iconsPrefix):
		return cacheIcons
	}
	return cacheRevalidate
}

func serveFile(w http.ResponseWriter, r *http.Request, name string, info fs.FileInfo, f fs.File) {
	if rs, ok := f.(io.ReadSeeker); ok {
		http.ServeContent(w, r, name, info.ModTime(), rs)
		return
	}
	data, err := io.ReadAll(f)
	if err != nil {
		slog.ErrorContext(r.Context(), "ui: read asset", "name", name, "err", err)
		problem.Write(w, http.StatusInternalServerError, "internal error")
		return
	}
	http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(data))
}

func (h *handler) serveIndex(w http.ResponseWriter, r *http.Request) {
	hdr := w.Header()
	hdr.Set("Cache-Control", cacheRevalidate)
	hdr.Set("ETag", h.indexETag)
	hdr.Set("Content-Type", "text/html; charset=utf-8")
	hdr.Set("Referrer-Policy", "no-referrer")
	hdr.Set("X-Content-Type-Options", "nosniff")
	hdr.Set("Content-Security-Policy", contentSecurityPolicy)
	hdr.Set("X-Frame-Options", "DENY")
	http.ServeContent(w, r, indexFile, time.Time{}, bytes.NewReader(h.index))
}
