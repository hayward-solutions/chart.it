package api

import (
	"bytes"
	"io"
	"mime"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/hayward-solutions/chart.it/internal/problem"
)

var pngMagic = []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}

func (a *API) putThumbnail(w http.ResponseWriter, r *http.Request) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "image/png" {
		problem.Write(w, http.StatusUnsupportedMediaType, "thumbnail must be sent as image/png")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxThumbnailBytes)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeBodyError(w, err)
		return
	}
	if len(body) == 0 {
		problem.Write(w, http.StatusBadRequest, "thumbnail body is empty")
		return
	}
	if !bytes.HasPrefix(body, pngMagic) {
		problem.Write(w, http.StatusBadRequest, "thumbnail is not a PNG image")
		return
	}
	if err := a.store.SetThumbnail(r.Context(), userID(r), chi.URLParam(r, "id"), body); err != nil {
		a.storeError(w, r, err, "document")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) getThumbnail(w http.ResponseWriter, r *http.Request) {
	png, err := a.store.GetThumbnail(r.Context(), userID(r), chi.URLParam(r, "id"))
	if err != nil {
		a.storeError(w, r, err, "thumbnail")
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "private, no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write(png)
}
