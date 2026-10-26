package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
)

type shareResponse struct {
	Token     string    `json:"token"`
	URL       string    `json:"url"`
	CreatedAt time.Time `json:"createdAt"`
}

type createdShareResponse struct {
	Token string `json:"token"`
	URL   string `json:"url"`
}

func (a *API) shareURL(token string) string {
	return a.cfg.BaseURL + "/s/" + token
}

func (a *API) createShare(w http.ResponseWriter, r *http.Request) {
	sh, err := a.store.CreateShare(r.Context(), userID(r), chi.URLParam(r, "id"))
	if err != nil {
		a.storeError(w, r, err, "document")
		return
	}
	writeJSON(w, http.StatusCreated, createdShareResponse{Token: sh.Token, URL: a.shareURL(sh.Token)})
}

func (a *API) listShares(w http.ResponseWriter, r *http.Request) {
	shares, err := a.store.ListShares(r.Context(), userID(r), chi.URLParam(r, "id"))
	if err != nil {
		a.storeError(w, r, err, "document")
		return
	}
	out := make([]shareResponse, 0, len(shares))
	for _, sh := range shares {
		out = append(out, shareResponse{Token: sh.Token, URL: a.shareURL(sh.Token), CreatedAt: sh.CreatedAt})
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *API) revokeShare(w http.ResponseWriter, r *http.Request) {
	if err := a.store.RevokeShare(r.Context(), userID(r), chi.URLParam(r, "id"), chi.URLParam(r, "token")); err != nil {
		a.storeError(w, r, err, "share")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type sharedResponse struct {
	Title     string          `json:"title"`
	Content   json.RawMessage `json:"content"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

func (a *API) getShared(w http.ResponseWriter, r *http.Request) {
	d, err := a.store.GetSharedDocument(r.Context(), chi.URLParam(r, "token"))
	if err != nil {
		a.storeError(w, r, err, "share")
		return
	}
	w.Header().Set("Referrer-Policy", "no-referrer")
	writeJSON(w, http.StatusOK, sharedResponse{Title: d.Title, Content: json.RawMessage(d.Content), UpdatedAt: d.UpdatedAt})
}
