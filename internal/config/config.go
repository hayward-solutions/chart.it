package config

import (
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	minSessionSecretBytes   = 32
	defaultMaxDocumentBytes = 5 * 1024 * 1024
)

type OIDC struct {
	Issuer       string
	ClientID     string
	ClientSecret string
	Scopes       []string
}

type Config struct {
	Addr             string
	DataDir          string
	BaseURL          string
	SessionSecret    string
	OIDC             OIDC
	AllowTestAuth    bool
	SingleUser       bool
	LogLevel         slog.Level
	MaxDocumentBytes int64
}

func (c Config) DBPath() string {
	return filepath.Join(c.DataDir, "chartit.db")
}

func (c Config) SecureCookies() bool {
	u, err := url.Parse(c.BaseURL)
	return err == nil && u.Scheme == "https"
}

func (c Config) OIDCEnabled() bool {
	return c.OIDC.Issuer != "" && c.OIDC.ClientID != ""
}

func Load() (Config, error) {
	return LoadFrom(os.Getenv)
}

func LoadFrom(getenv func(string) string) (Config, error) {
	get := func(key, def string) string {
		if v := strings.TrimSpace(getenv(key)); v != "" {
			return v
		}
		return def
	}

	cfg := Config{
		Addr:          get("CHARTIT_ADDR", ":8080"),
		DataDir:       get("CHARTIT_DATA_DIR", "./data"),
		BaseURL:       strings.TrimRight(get("CHARTIT_BASE_URL", "http://localhost:8080"), "/"),
		SessionSecret: get("CHARTIT_SESSION_SECRET", ""),
		OIDC: OIDC{
			Issuer:       get("CHARTIT_OIDC_ISSUER", ""),
			ClientID:     get("CHARTIT_OIDC_CLIENT_ID", ""),
			ClientSecret: get("CHARTIT_OIDC_CLIENT_SECRET", ""),
			Scopes:       strings.Fields(get("CHARTIT_OIDC_SCOPES", "openid profile email")),
		},
		MaxDocumentBytes: defaultMaxDocumentBytes,
	}

	testAuth, err := parseBool(get("CHARTIT_ALLOW_TEST_AUTH", "0"))
	if err != nil {
		return Config{}, fmt.Errorf("CHARTIT_ALLOW_TEST_AUTH: %w", err)
	}
	cfg.AllowTestAuth = testAuth

	singleUser, err := parseBool(get("CHARTIT_SINGLE_USER", "0"))
	if err != nil {
		return Config{}, fmt.Errorf("CHARTIT_SINGLE_USER: %w", err)
	}
	cfg.SingleUser = singleUser

	if err := cfg.LogLevel.UnmarshalText([]byte(get("CHARTIT_LOG_LEVEL", "info"))); err != nil {
		return Config{}, fmt.Errorf("CHARTIT_LOG_LEVEL: %w", err)
	}

	if raw := get("CHARTIT_MAX_DOCUMENT_BYTES", ""); raw != "" {
		n, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || n <= 0 {
			return Config{}, fmt.Errorf("CHARTIT_MAX_DOCUMENT_BYTES: must be a positive integer, got %q", raw)
		}
		cfg.MaxDocumentBytes = n
	}

	if err := cfg.validate(); err != nil {
		return Config{}, err
	}

	if err := os.MkdirAll(cfg.DataDir, 0o750); err != nil {
		return Config{}, fmt.Errorf("create data dir: %w", err)
	}

	return cfg, nil
}

func (c Config) validate() error {
	u, err := url.Parse(c.BaseURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return fmt.Errorf("CHARTIT_BASE_URL: must be an absolute http(s) URL, got %q", c.BaseURL)
	}

	anyOIDC := c.OIDC.Issuer != "" || c.OIDC.ClientID != "" || c.OIDC.ClientSecret != ""

	if c.SingleUser {
		if c.AllowTestAuth {
			return errors.New("CHARTIT_SINGLE_USER=1 cannot be combined with CHARTIT_ALLOW_TEST_AUTH=1")
		}
		if anyOIDC {
			return errors.New("CHARTIT_SINGLE_USER=1 cannot be combined with CHARTIT_OIDC_* settings")
		}
		return nil
	}

	if c.AllowTestAuth {
		if anyOIDC {
			return errors.New("CHARTIT_ALLOW_TEST_AUTH=1 cannot be combined with CHARTIT_OIDC_* settings")
		}
		return nil
	}

	if !c.OIDCEnabled() {
		return errors.New("no authentication configured: set CHARTIT_OIDC_ISSUER and CHARTIT_OIDC_CLIENT_ID, CHARTIT_SINGLE_USER=1 or CHARTIT_ALLOW_TEST_AUTH=1")
	}
	if len(c.SessionSecret) < minSessionSecretBytes {
		return fmt.Errorf("CHARTIT_SESSION_SECRET: required and must be at least %d bytes", minSessionSecretBytes)
	}
	if len(c.OIDC.Scopes) == 0 {
		return errors.New("CHARTIT_OIDC_SCOPES: must not be empty")
	}
	return nil
}

func parseBool(s string) (bool, error) {
	switch strings.ToLower(s) {
	case "1", "true":
		return true, nil
	case "0", "false":
		return false, nil
	}
	return false, fmt.Errorf("expected 0 or 1, got %q", s)
}
