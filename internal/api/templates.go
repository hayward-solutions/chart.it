package api

import "net/http"

func (a *API) listTemplates(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, a.templates)
}
