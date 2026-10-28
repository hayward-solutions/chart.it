package single

import (
	"context"
	"fmt"
	"net/http"

	"github.com/hayward-solutions/chart.it/internal/auth"
	"github.com/hayward-solutions/chart.it/internal/store"
)

const (
	Subject  = "local:owner"
	UserName = "Local user"
)

type Authenticator struct {
	user auth.User
}

func New(ctx context.Context, st *store.Store) (*Authenticator, error) {
	u, err := st.UpsertUserBySubject(ctx, Subject, UserName, "", "")
	if err != nil {
		return nil, fmt.Errorf("single user: %w", err)
	}
	return &Authenticator{user: auth.FromStoreUser(u)}, nil
}

func (a *Authenticator) Name() string { return "single-user" }

func (a *Authenticator) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /login", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/", http.StatusFound)
	})
	mux.HandleFunc("POST /logout", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	return mux
}

func (a *Authenticator) Authenticate(*http.Request) (auth.User, error) {
	return a.user, nil
}

func (a *Authenticator) Logout(http.ResponseWriter, *http.Request) error {
	return nil
}
