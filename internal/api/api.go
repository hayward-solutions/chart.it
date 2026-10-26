package api

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/hayward-solutions/chart.it/internal/auth"
	"github.com/hayward-solutions/chart.it/internal/config"
	"github.com/hayward-solutions/chart.it/internal/problem"
	"github.com/hayward-solutions/chart.it/internal/store"
	"github.com/hayward-solutions/chart.it/templates"
)

const (
	maxMetadataBytes  = 1 << 20
	maxThumbnailBytes = 512 << 10
	maxEnvelopeBytes  = 64 << 10
	maxTitleRunes     = 200
	maxLabelRunes     = 200
	maxTags           = 32
	maxTagRunes       = 64
)

type API struct {
	store     *store.Store
	cfg       config.Config
	templates []templates.Template
	byKey     map[string]templates.Template
}

func New(st *store.Store, cfg config.Config, tpls []templates.Template) *API {
	byKey := make(map[string]templates.Template, len(tpls))
	for _, t := range tpls {
		byKey[t.Key] = t
	}
	if tpls == nil {
		tpls = []templates.Template{}
	}
	return &API{store: st, cfg: cfg, templates: tpls, byKey: byKey}
}

func (a *API) Routes(r chi.Router) {
	r.Get("/templates", a.listTemplates)

	r.Get("/documents", a.listDocuments)
	r.Post("/documents", a.createDocument)
	r.Route("/documents/{id}", func(r chi.Router) {
		r.Get("/", a.getDocument)
		r.Patch("/", a.patchDocument)
		r.Delete("/", a.deleteDocument)
		r.Post("/restore", a.restoreDocument)
		r.Post("/duplicate", a.duplicateDocument)
		r.Put("/content", a.putContent)
		r.Put("/thumbnail", a.putThumbnail)
		r.Get("/thumbnail", a.getThumbnail)
		r.Get("/versions", a.listVersions)
		r.Get("/versions/{v}", a.getVersion)
		r.Post("/versions/{v}/restore", a.restoreVersion)
		r.Post("/shares", a.createShare)
		r.Get("/shares", a.listShares)
		r.Delete("/shares/{token}", a.revokeShare)
	})
}

func (a *API) PublicRoutes(r chi.Router) {
	r.Get("/shared/{token}", a.getShared)
}

func userID(r *http.Request) string {
	return auth.FromContext(r.Context()).ID
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("encode response", "err", err)
	}
}

func decodeJSON(w http.ResponseWriter, r *http.Request, limit int64, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(dst); err != nil {
		writeBodyError(w, err)
		return false
	}
	_, err := dec.Token()
	if err == nil {
		problem.Write(w, http.StatusBadRequest, "request body must contain a single JSON value")
		return false
	}
	if !errors.Is(err, io.EOF) {
		writeBodyError(w, err)
		return false
	}
	return true
}

func writeBodyError(w http.ResponseWriter, err error) {
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		problem.Write(w, http.StatusRequestEntityTooLarge, "request body exceeds the limit of "+byteCount(tooLarge.Limit))
		return
	}
	if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
		problem.Write(w, http.StatusBadRequest, "request body is empty or truncated JSON")
		return
	}
	problem.Write(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
}

func byteCount(n int64) string {
	switch {
	case n >= 1<<20 && n%(1<<20) == 0:
		return strconv.FormatInt(n>>20, 10) + " MiB"
	case n >= 1<<10 && n%(1<<10) == 0:
		return strconv.FormatInt(n>>10, 10) + " KiB"
	}
	return strconv.FormatInt(n, 10) + " bytes"
}

func (a *API) storeError(w http.ResponseWriter, r *http.Request, err error, what string) {
	var conflict *store.VersionConflictError
	switch {
	case errors.As(err, &conflict):
		problem.WriteExtra(w, http.StatusConflict,
			"document was changed elsewhere: stored version is "+strconv.Itoa(conflict.Version),
			map[string]any{"version": conflict.Version, "updatedAt": conflict.UpdatedAt})
	case errors.Is(err, store.ErrNotFound):
		problem.Write(w, http.StatusNotFound, what+" not found")
	default:
		slog.ErrorContext(r.Context(), "api store error", "path", r.URL.Path, "err", err)
		problem.Write(w, http.StatusInternalServerError, "internal error")
	}
}
