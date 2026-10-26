package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"

	"github.com/hayward-solutions/chart.it/internal/problem"
	"github.com/hayward-solutions/chart.it/internal/store"
)

const defaultTitle = "Untitled diagram"

type documentResponse struct {
	ID          string          `json:"id"`
	Title       string          `json:"title"`
	Tags        []string        `json:"tags"`
	Version     int             `json:"version"`
	Content     json.RawMessage `json:"content,omitempty"`
	TemplateKey *string         `json:"templateKey"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
	DeletedAt   *time.Time      `json:"deletedAt"`
}

func toDocumentResponse(d store.Document, withContent bool) documentResponse {
	out := documentResponse{
		ID:        d.ID,
		Title:     d.Title,
		Tags:      d.Tags,
		Version:   d.Version,
		CreatedAt: d.CreatedAt,
		UpdatedAt: d.UpdatedAt,
		DeletedAt: d.DeletedAt,
	}
	if out.Tags == nil {
		out.Tags = []string{}
	}
	if d.TemplateKey != "" {
		key := d.TemplateKey
		out.TemplateKey = &key
	}
	if withContent && d.Content != "" {
		out.Content = json.RawMessage(d.Content)
	}
	return out
}

func (a *API) listDocuments(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := store.ListFilter{Query: q.Get("q"), Tag: q.Get("tag")}
	switch strings.ToLower(q.Get("trashed")) {
	case "", "0", "false":
	case "1", "true":
		filter.Trashed = true
	default:
		problem.Write(w, http.StatusBadRequest, "trashed must be true or false")
		return
	}
	docs, err := a.store.ListDocuments(r.Context(), userID(r), filter)
	if err != nil {
		a.storeError(w, r, err, "documents")
		return
	}
	writeJSON(w, http.StatusOK, docs)
}

type createDocumentRequest struct {
	Title       string `json:"title"`
	TemplateKey string `json:"templateKey"`
}

func (a *API) createDocument(w http.ResponseWriter, r *http.Request) {
	var req createDocumentRequest
	if !decodeJSON(w, r, maxMetadataBytes, &req) {
		return
	}
	title := strings.TrimSpace(req.Title)
	if utf8.RuneCountInString(title) > maxTitleRunes {
		problem.Write(w, http.StatusBadRequest, fmt.Sprintf("title must be at most %d characters", maxTitleRunes))
		return
	}

	var (
		content     string
		templateKey string
	)
	if req.TemplateKey != "" {
		tpl, ok := a.byKey[req.TemplateKey]
		if !ok {
			problem.Write(w, http.StatusBadRequest, fmt.Sprintf("unknown templateKey %q", req.TemplateKey))
			return
		}
		if title == "" {
			title = tpl.Title
		}
		templateKey = tpl.Key
		retitled, err := withTitle(tpl.Content, title)
		if err != nil {
			a.storeError(w, r, fmt.Errorf("retitle template %q: %w", tpl.Key, err), "template")
			return
		}
		content = retitled
	} else {
		if title == "" {
			title = defaultTitle
		}
		blank, err := blankContent(title)
		if err != nil {
			a.storeError(w, r, fmt.Errorf("build blank document: %w", err), "document")
			return
		}
		content = blank
	}

	d, err := a.store.CreateDocument(r.Context(), userID(r), title, content, templateKey)
	if err != nil {
		a.storeError(w, r, err, "document")
		return
	}
	writeJSON(w, http.StatusCreated, toDocumentResponse(d, true))
}

func withTitle(content []byte, title string) (string, error) {
	var doc map[string]json.RawMessage
	if err := json.Unmarshal(content, &doc); err != nil {
		return "", fmt.Errorf("decode content: %w", err)
	}
	encoded, err := json.Marshal(title)
	if err != nil {
		return "", fmt.Errorf("encode title: %w", err)
	}
	doc["title"] = encoded
	out, err := json.Marshal(doc)
	if err != nil {
		return "", fmt.Errorf("encode content: %w", err)
	}
	return string(out), nil
}

func blankContent(title string) (string, error) {
	doc := map[string]any{
		"schemaVersion": 1,
		"title":         title,
		"settings": map[string]any{
			"background": "#ffffff",
			"grid":       "dots",
			"snap":       true,
			"gridSize":   20,
			"theme":      "system",
		},
		"viewport": map[string]any{"x": 0, "y": 0, "zoom": 1},
		"nodes":    []any{},
		"edges":    []any{},
	}
	out, err := json.Marshal(doc)
	if err != nil {
		return "", fmt.Errorf("encode blank document: %w", err)
	}
	return string(out), nil
}

func (a *API) getDocument(w http.ResponseWriter, r *http.Request) {
	d, err := a.store.GetDocument(r.Context(), userID(r), chi.URLParam(r, "id"), false)
	if err != nil {
		a.storeError(w, r, err, "document")
		return
	}
	writeJSON(w, http.StatusOK, toDocumentResponse(d, true))
}

type patchDocumentRequest struct {
	Title *string   `json:"title"`
	Tags  *[]string `json:"tags"`
}

func (a *API) patchDocument(w http.ResponseWriter, r *http.Request) {
	var req patchDocumentRequest
	if !decodeJSON(w, r, maxMetadataBytes, &req) {
		return
	}
	if req.Title == nil && req.Tags == nil {
		problem.Write(w, http.StatusBadRequest, "provide title and/or tags")
		return
	}
	update := store.MetaUpdate{}
	if req.Title != nil {
		title := strings.TrimSpace(*req.Title)
		if title == "" {
			problem.Write(w, http.StatusBadRequest, "title must not be empty")
			return
		}
		if utf8.RuneCountInString(title) > maxTitleRunes {
			problem.Write(w, http.StatusBadRequest, fmt.Sprintf("title must be at most %d characters", maxTitleRunes))
			return
		}
		update.Title = &title
	}
	if req.Tags != nil {
		if len(*req.Tags) > maxTags {
			problem.Write(w, http.StatusBadRequest, fmt.Sprintf("at most %d tags are allowed", maxTags))
			return
		}
		for _, tag := range *req.Tags {
			if utf8.RuneCountInString(strings.TrimSpace(tag)) > maxTagRunes {
				problem.Write(w, http.StatusBadRequest, fmt.Sprintf("tags must be at most %d characters", maxTagRunes))
				return
			}
		}
		update.Tags = req.Tags
	}
	d, err := a.store.UpdateDocumentMeta(r.Context(), userID(r), chi.URLParam(r, "id"), update)
	if err != nil {
		a.storeError(w, r, err, "document")
		return
	}
	writeJSON(w, http.StatusOK, toDocumentResponse(d, false))
}

func (a *API) deleteDocument(w http.ResponseWriter, r *http.Request) {
	if err := a.store.SoftDeleteDocument(r.Context(), userID(r), chi.URLParam(r, "id")); err != nil {
		a.storeError(w, r, err, "document")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) restoreDocument(w http.ResponseWriter, r *http.Request) {
	d, err := a.store.RestoreDocument(r.Context(), userID(r), chi.URLParam(r, "id"))
	if err != nil {
		a.storeError(w, r, err, "document")
		return
	}
	writeJSON(w, http.StatusOK, toDocumentResponse(d, false))
}

func (a *API) duplicateDocument(w http.ResponseWriter, r *http.Request) {
	d, err := a.store.DuplicateDocument(r.Context(), userID(r), chi.URLParam(r, "id"))
	if err != nil {
		a.storeError(w, r, err, "document")
		return
	}
	d.Content = ""
	writeJSON(w, http.StatusCreated, toDocumentResponse(d, false))
}

type contentRequest struct {
	Version *int            `json:"version"`
	Content json.RawMessage `json:"content"`
	Label   string          `json:"label"`
}

func (a *API) putContent(w http.ResponseWriter, r *http.Request) {
	var req contentRequest
	if !decodeJSON(w, r, a.cfg.MaxDocumentBytes+maxEnvelopeBytes, &req) {
		return
	}
	if req.Version == nil {
		problem.Write(w, http.StatusBadRequest, "version is required")
		return
	}
	if utf8.RuneCountInString(req.Label) > maxLabelRunes {
		problem.Write(w, http.StatusBadRequest, fmt.Sprintf("label must be at most %d characters", maxLabelRunes))
		return
	}
	compact, status, detail := a.validateContent(req.Content)
	if status != 0 {
		problem.Write(w, status, detail)
		return
	}
	res, err := a.store.SaveContent(r.Context(), userID(r), chi.URLParam(r, "id"), *req.Version, compact, strings.TrimSpace(req.Label))
	if err != nil {
		a.storeError(w, r, err, "document")
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (a *API) validateContent(raw json.RawMessage) (string, int, string) {
	if len(raw) == 0 {
		return "", http.StatusBadRequest, "content is required"
	}
	if int64(len(raw)) > a.cfg.MaxDocumentBytes {
		return "", http.StatusRequestEntityTooLarge, "document content exceeds the limit of " + byteCount(a.cfg.MaxDocumentBytes)
	}
	var doc map[string]json.RawMessage
	if err := json.Unmarshal(raw, &doc); err != nil {
		return "", http.StatusBadRequest, "content must be a JSON object"
	}
	var schema int
	if v, ok := doc["schemaVersion"]; !ok || json.Unmarshal(v, &schema) != nil || schema != 1 {
		return "", http.StatusBadRequest, `content must have "schemaVersion": 1`
	}
	var compact bytes.Buffer
	if err := json.Compact(&compact, raw); err != nil {
		return "", http.StatusBadRequest, "content is not valid JSON"
	}
	return compact.String(), 0, ""
}
