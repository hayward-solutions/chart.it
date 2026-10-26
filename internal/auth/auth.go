package auth

import (
	"context"
	"errors"
	"net/http"
)

type User struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	AvatarURL string `json:"avatarUrl"`
}

var ErrUnauthenticated = errors.New("auth: unauthenticated")

type Authenticator interface {
	Name() string
	Routes() http.Handler
	Authenticate(r *http.Request) (User, error)
	Logout(w http.ResponseWriter, r *http.Request) error
}

type ctxKey struct{}

func WithUser(ctx context.Context, u User) context.Context {
	return context.WithValue(ctx, ctxKey{}, u)
}

func FromContext(ctx context.Context) User {
	u, _ := ctx.Value(ctxKey{}).(User)
	return u
}
