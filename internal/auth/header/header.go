package header

import (
	"fmt"
	"html/template"
	"log/slog"
	"net/http"
	"regexp"

	"github.com/hayward-solutions/chart.it/internal/auth"
	"github.com/hayward-solutions/chart.it/internal/problem"
	"github.com/hayward-solutions/chart.it/internal/store"
)

var userPattern = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)

var loginPage = template.Must(template.New("login").Parse(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chart.it test login</title>
</head>
<body>
<form method="get" action="/auth/test-login">
<label>User <input name="user" required pattern="[A-Za-z0-9._-]{1,64}" autofocus></label>
<button type="submit">Sign in</button>
</form>
</body>
</html>
`))

type Authenticator struct {
	store    *store.Store
	sessions *auth.Sessions
}

func New(st *store.Store, sessions *auth.Sessions) *Authenticator {
	return &Authenticator{store: st, sessions: sessions}
}

func (a *Authenticator) Name() string { return "test" }

func (a *Authenticator) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /login", a.loginPage)
	mux.HandleFunc("GET /test-login", a.testLogin)
	mux.HandleFunc("POST /logout", a.logout)
	return mux
}

func (a *Authenticator) Authenticate(r *http.Request) (auth.User, error) {
	return a.sessions.Authenticate(r)
}

func (a *Authenticator) Logout(w http.ResponseWriter, r *http.Request) error {
	return a.sessions.End(w, r)
}

func (a *Authenticator) loginPage(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if err := loginPage.Execute(w, nil); err != nil {
		slog.Error("render login page", "err", err)
	}
}

func (a *Authenticator) testLogin(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("user")
	if !userPattern.MatchString(name) {
		problem.Write(w, http.StatusBadRequest, "user must match "+userPattern.String())
		return
	}
	u, err := a.store.UpsertUserBySubject(r.Context(), "test:"+name, name, fmt.Sprintf("%s@test.local", name), "")
	if err != nil {
		slog.ErrorContext(r.Context(), "test login upsert", "err", err)
		problem.Write(w, http.StatusInternalServerError, "login failed")
		return
	}
	if err := a.sessions.Start(w, r, u); err != nil {
		slog.ErrorContext(r.Context(), "test login session", "err", err)
		problem.Write(w, http.StatusInternalServerError, "login failed")
		return
	}
	http.Redirect(w, r, "/", http.StatusFound)
}

func (a *Authenticator) logout(w http.ResponseWriter, r *http.Request) {
	if err := a.Logout(w, r); err != nil {
		slog.ErrorContext(r.Context(), "logout", "err", err)
		problem.Write(w, http.StatusInternalServerError, "logout failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
