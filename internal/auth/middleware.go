package auth

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/hayward-solutions/chart.it/internal/problem"
)

const (
	CSRFHeader = "X-Requested-With"
	CSRFValue  = "chartit"
	LoginPath  = "/auth/login"
)

func RequireUser(a Authenticator) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u, err := a.Authenticate(r)
			if err != nil {
				if errors.Is(err, ErrUnauthenticated) {
					if strings.HasPrefix(r.URL.Path, "/api/") {
						problem.Write(w, http.StatusUnauthorized, "authentication required")
						return
					}
					http.Redirect(w, r, LoginPath, http.StatusFound)
					return
				}
				slog.ErrorContext(r.Context(), "authenticate", "err", err)
				problem.Write(w, http.StatusInternalServerError, "authentication failed")
				return
			}
			next.ServeHTTP(w, r.WithContext(WithUser(r.Context(), u)))
		})
	}
}

func CSRF(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}
		if r.Header.Get(CSRFHeader) != CSRFValue {
			problem.Write(w, http.StatusForbidden, "missing "+CSRFHeader+": "+CSRFValue+" header")
			return
		}
		next.ServeHTTP(w, r)
	})
}
