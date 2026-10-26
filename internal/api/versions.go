package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/hayward-solutions/chart.it/internal/problem"
)

type versionSummary struct {
	Version   int       `json:"version"`
	Label     *string   `json:"label"`
	CreatedAt time.Time `json:"createdAt"`
	CreatedBy *string   `json:"createdBy"`
}

type versionDetail struct {
	Version   int             `json:"version"`
	Label     *string         `json:"label"`
	CreatedAt time.Time       `json:"createdAt"`
	Content   json.RawMessage `json:"content"`
}

func optional(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func (a *API) listVersions(w http.ResponseWriter, r *http.Request) {
	versions, err := a.store.ListVersions(r.Context(), userID(r), chi.URLParam(r, "id"))
	if err != nil {
		a.storeError(w, r, err, "document")
		return
	}
	out := make([]versionSummary, 0, len(versions))
	for _, v := range versions {
		out = append(out, versionSummary{
			Version:   v.Version,
			Label:     optional(v.Label),
			CreatedAt: v.CreatedAt,
			CreatedBy: optional(v.CreatedBy),
		})
	}
	writeJSON(w, http.StatusOK, out)
}

func parseVersion(w http.ResponseWriter, r *http.Request) (int, bool) {
	v, err := strconv.Atoi(chi.URLParam(r, "v"))
	if err != nil || v < 1 {
		problem.Write(w, http.StatusBadRequest, "version must be a positive integer")
		return 0, false
	}
	return v, true
}

func (a *API) getVersion(w http.ResponseWriter, r *http.Request) {
	n, ok := parseVersion(w, r)
	if !ok {
		return
	}
	v, err := a.store.GetVersion(r.Context(), userID(r), chi.URLParam(r, "id"), n)
	if err != nil {
		a.storeError(w, r, err, "version")
		return
	}
	writeJSON(w, http.StatusOK, versionDetail{
		Version:   v.Version,
		Label:     optional(v.Label),
		CreatedAt: v.CreatedAt,
		Content:   json.RawMessage(v.Content),
	})
}

func (a *API) restoreVersion(w http.ResponseWriter, r *http.Request) {
	n, ok := parseVersion(w, r)
	if !ok {
		return
	}
	res, err := a.store.RestoreVersion(r.Context(), userID(r), chi.URLParam(r, "id"), n)
	if err != nil {
		a.storeError(w, r, err, "version")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Version int `json:"version"`
	}{Version: res.Version})
}
