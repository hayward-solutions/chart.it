package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/hayward-solutions/chart.it/internal/api"
	"github.com/hayward-solutions/chart.it/internal/auth"
	"github.com/hayward-solutions/chart.it/internal/auth/header"
	"github.com/hayward-solutions/chart.it/internal/auth/oidc"
	"github.com/hayward-solutions/chart.it/internal/config"
	"github.com/hayward-solutions/chart.it/internal/db"
	"github.com/hayward-solutions/chart.it/internal/server"
	"github.com/hayward-solutions/chart.it/internal/store"
	"github.com/hayward-solutions/chart.it/internal/ui"
	"github.com/hayward-solutions/chart.it/templates"
)

var version = "dev"

const (
	shutdownTimeout = 15 * time.Second
	sessionSweep    = time.Hour
)

func main() {
	if err := run(); err != nil {
		slog.Error("chartit exited", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: cfg.LogLevel})))

	slog.Info("starting chartit", "version", version)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	conn, err := db.Open(ctx, cfg.DBPath())
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer func() { _ = conn.Close() }()

	if err := db.Migrate(ctx, conn); err != nil {
		return fmt.Errorf("migrate database: %w", err)
	}

	st := store.New(conn)
	authenticator, err := newAuthenticator(cfg, st)
	if err != nil {
		return err
	}
	slog.Info("authentication configured", "authenticator", authenticator.Name())

	go sweepSessions(ctx, st)

	tpls, err := templates.Load()
	if err != nil {
		return fmt.Errorf("load templates: %w", err)
	}
	handlers := api.New(st, cfg, tpls)

	srv := server.New(cfg, st, authenticator,
		server.WithAPI(handlers.Routes),
		server.WithPublicAPI(handlers.PublicRoutes),
		server.WithFallback(ui.Handler(ui.Embedded())),
	)

	errCh := make(chan error, 1)
	go func() {
		slog.Info("listening", "addr", cfg.Addr, "base_url", cfg.BaseURL)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	select {
	case err := <-errCh:
		if err != nil {
			return fmt.Errorf("serve: %w", err)
		}
		return nil
	case <-ctx.Done():
		slog.Info("shutting down")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	return nil
}

func newAuthenticator(cfg config.Config, st *store.Store) (auth.Authenticator, error) {
	sessions := auth.NewSessions(st, cfg.SecureCookies())
	if cfg.AllowTestAuth {
		slog.Warn("test authentication enabled; never use this in production")
		return header.New(st, sessions), nil
	}
	authenticator, err := oidc.New(cfg, st, sessions)
	if err != nil {
		return nil, fmt.Errorf("configure oidc: %w", err)
	}
	return authenticator, nil
}

func sweepSessions(ctx context.Context, st *store.Store) {
	t := time.NewTicker(sessionSweep)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			n, err := st.DeleteExpiredSessions(ctx)
			if err != nil {
				slog.Error("delete expired sessions", "err", err)
				continue
			}
			if n > 0 {
				slog.Info("deleted expired sessions", "count", n)
			}
		}
	}
}
