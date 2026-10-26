package problem

import (
	"encoding/json"
	"net/http"
)

const ContentType = "application/problem+json"

func Write(w http.ResponseWriter, status int, detail string) {
	WriteExtra(w, status, detail, nil)
}

func WriteExtra(w http.ResponseWriter, status int, detail string, extra map[string]any) {
	body := map[string]any{
		"type":   "about:blank",
		"title":  http.StatusText(status),
		"status": status,
		"detail": detail,
	}
	for k, v := range extra {
		if _, reserved := body[k]; !reserved {
			body[k] = v
		}
	}
	w.Header().Set("Content-Type", ContentType)
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
