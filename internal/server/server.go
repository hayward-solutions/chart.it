package server

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/hayward-solutions/chart.it/internal/auth"
	"github.com/hayward-solutions/chart.it/internal/config"
	"github.com/hayward-solutions/chart.it/internal/problem"
	"github.com/hayward-solutions/chart.it/internal/store"
)

type RouteFunc func(r chi.Router)

type options struct {
	api      RouteFunc
	public   RouteFunc
	fallback http.Handler
}

type Option func(*options)

func WithAPI(fn RouteFunc) Option {
	return func(o *options) { o.api = fn }
}

func WithPublicAPI(fn RouteFunc) Option {
	return func(o *options) { o.public = fn }
}

func WithFallback(h http.Handler) Option {
	return func(o *options) { o.fallback = h }
}

func New(cfg config.Config, st *store.Store, a auth.Authenticator, opts ...Option) *http.Server {
	return &http.Server{
		Addr:              cfg.Addr,
		Handler:           NewHandler(cfg, st, a, opts...),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
}

func NewHandler(cfg config.Config, st *store.Store, a auth.Authenticator, opts ...Option) http.Handler {
	o := options{fallback: http.NotFoundHandler()}
	for _, opt := range opts {
		opt(&o)
	}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(requestLogger)
	r.Use(middleware.Recoverer)

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("ok"))
	})
	r.Get("/readyz", func(w http.ResponseWriter, req *http.Request) {
		ctx, cancel := context.WithTimeout(req.Context(), 2*time.Second)
		defer cancel()
		if err := st.Ping(ctx); err != nil {
			slog.ErrorContext(req.Context(), "readiness check failed", "err", err)
			problem.Write(w, http.StatusServiceUnavailable, "database unavailable")
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("ok"))
	})

	authRoutes := http.StripPrefix("/auth", a.Routes())
	r.Handle("/auth", authRoutes)
	r.Handle("/auth/*", authRoutes)

	r.Route("/api/v1", func(r chi.Router) {
		if o.public != nil {
			r.Group(func(r chi.Router) { o.public(r) })
		}
		r.Group(func(r chi.Router) {
			r.Use(auth.RequireUser(a))
			r.Use(auth.CSRF)
			r.Get("/me", me)
			if o.api != nil {
				o.api(r)
			}
		})
	})

	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		if strings.HasPrefix(req.URL.Path, "/api/") || strings.HasPrefix(req.URL.Path, "/auth/") {
			problem.Write(w, http.StatusNotFound, "no such resource")
			return
		}
		o.fallback.ServeHTTP(w, req)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) {
		problem.Write(w, http.StatusMethodNotAllowed, "method not allowed")
	})

	return r
}

func me(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(auth.FromContext(r.Context()))
}

func requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)

		level := slog.LevelInfo
		if r.URL.Path == "/healthz" || r.URL.Path == "/readyz" {
			level = slog.LevelDebug
		}
		status := ww.Status()
		if status == 0 {
			status = http.StatusOK
		}
		slog.LogAttrs(r.Context(), level, "request",
			slog.String("request_id", middleware.GetReqID(r.Context())),
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.Int("status", status),
			slog.Int("bytes", ww.BytesWritten()),
			slog.Duration("duration", time.Since(start)),
			slog.String("remote", r.RemoteAddr),
			slog.String("forwarded_for", r.Header.Get("X-Forwarded-For")),
		)
	})
}
