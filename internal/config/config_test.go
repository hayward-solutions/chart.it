package config

import (
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestLoadFrom(t *testing.T) {
	secret := strings.Repeat("s", 32)

	tests := []struct {
		name    string
		env     map[string]string
		wantErr string
		check   func(t *testing.T, c Config)
	}{
		{
			name: "test auth defaults",
			env:  map[string]string{"CHARTIT_ALLOW_TEST_AUTH": "1"},
			check: func(t *testing.T, c Config) {
				assert.Equal(t, ":8080", c.Addr)
				assert.Equal(t, "http://localhost:8080", c.BaseURL)
				assert.True(t, c.AllowTestAuth)
				assert.False(t, c.OIDCEnabled())
				assert.False(t, c.SecureCookies())
				assert.Equal(t, slog.LevelInfo, c.LogLevel)
				assert.EqualValues(t, 5242880, c.MaxDocumentBytes)
				assert.Equal(t, []string{"openid", "profile", "email"}, c.OIDC.Scopes)
			},
		},
		{
			name: "oidc production",
			env: map[string]string{
				"CHARTIT_OIDC_ISSUER":    "https://idp.example.com",
				"CHARTIT_OIDC_CLIENT_ID": "abc",
				"CHARTIT_SESSION_SECRET": secret,
				"CHARTIT_BASE_URL":       "https://chart.example.com/",
				"CHARTIT_LOG_LEVEL":      "debug",
				"CHARTIT_OIDC_SCOPES":    "openid email",
			},
			check: func(t *testing.T, c Config) {
				assert.True(t, c.OIDCEnabled())
				assert.False(t, c.AllowTestAuth)
				assert.True(t, c.SecureCookies())
				assert.Equal(t, "https://chart.example.com", c.BaseURL)
				assert.Equal(t, slog.LevelDebug, c.LogLevel)
				assert.Equal(t, []string{"openid", "email"}, c.OIDC.Scopes)
			},
		},
		{
			name: "custom max bytes and addr",
			env: map[string]string{
				"CHARTIT_ALLOW_TEST_AUTH":    "true",
				"CHARTIT_MAX_DOCUMENT_BYTES": "1024",
				"CHARTIT_ADDR":               "127.0.0.1:9000",
			},
			check: func(t *testing.T, c Config) {
				assert.EqualValues(t, 1024, c.MaxDocumentBytes)
				assert.Equal(t, "127.0.0.1:9000", c.Addr)
			},
		},
		{
			name: "single user",
			env:  map[string]string{"CHARTIT_SINGLE_USER": "1"},
			check: func(t *testing.T, c Config) {
				assert.True(t, c.SingleUser)
				assert.False(t, c.AllowTestAuth)
				assert.False(t, c.OIDCEnabled())
			},
		},
		{
			name: "single user with test auth",
			env: map[string]string{
				"CHARTIT_SINGLE_USER":     "1",
				"CHARTIT_ALLOW_TEST_AUTH": "1",
			},
			wantErr: "CHARTIT_SINGLE_USER=1 cannot be combined with CHARTIT_ALLOW_TEST_AUTH=1",
		},
		{
			name: "single user with oidc",
			env: map[string]string{
				"CHARTIT_SINGLE_USER":    "true",
				"CHARTIT_OIDC_ISSUER":    "https://idp.example.com",
				"CHARTIT_OIDC_CLIENT_ID": "abc",
				"CHARTIT_SESSION_SECRET": secret,
			},
			wantErr: "CHARTIT_SINGLE_USER=1 cannot be combined with CHARTIT_OIDC_* settings",
		},
		{
			name:    "bad single user bool",
			env:     map[string]string{"CHARTIT_SINGLE_USER": "yes"},
			wantErr: "CHARTIT_SINGLE_USER",
		},
		{
			name:    "no auth configured",
			env:     map[string]string{},
			wantErr: "no authentication configured",
		},
		{
			name: "both test auth and oidc",
			env: map[string]string{
				"CHARTIT_ALLOW_TEST_AUTH": "1",
				"CHARTIT_OIDC_ISSUER":     "https://idp.example.com",
				"CHARTIT_OIDC_CLIENT_ID":  "abc",
				"CHARTIT_SESSION_SECRET":  secret,
			},
			wantErr: "cannot be combined",
		},
		{
			name: "test auth with only oidc secret",
			env: map[string]string{
				"CHARTIT_ALLOW_TEST_AUTH":    "1",
				"CHARTIT_OIDC_CLIENT_SECRET": "x",
			},
			wantErr: "cannot be combined",
		},
		{
			name: "oidc issuer without client id",
			env: map[string]string{
				"CHARTIT_OIDC_ISSUER":    "https://idp.example.com",
				"CHARTIT_SESSION_SECRET": secret,
			},
			wantErr: "no authentication configured",
		},
		{
			name: "oidc without secret",
			env: map[string]string{
				"CHARTIT_OIDC_ISSUER":    "https://idp.example.com",
				"CHARTIT_OIDC_CLIENT_ID": "abc",
			},
			wantErr: "CHARTIT_SESSION_SECRET",
		},
		{
			name: "oidc with short secret",
			env: map[string]string{
				"CHARTIT_OIDC_ISSUER":    "https://idp.example.com",
				"CHARTIT_OIDC_CLIENT_ID": "abc",
				"CHARTIT_SESSION_SECRET": "short",
			},
			wantErr: "at least 32 bytes",
		},
		{
			name:    "bad bool",
			env:     map[string]string{"CHARTIT_ALLOW_TEST_AUTH": "maybe"},
			wantErr: "CHARTIT_ALLOW_TEST_AUTH",
		},
		{
			name:    "bad log level",
			env:     map[string]string{"CHARTIT_ALLOW_TEST_AUTH": "1", "CHARTIT_LOG_LEVEL": "loud"},
			wantErr: "CHARTIT_LOG_LEVEL",
		},
		{
			name:    "bad max bytes",
			env:     map[string]string{"CHARTIT_ALLOW_TEST_AUTH": "1", "CHARTIT_MAX_DOCUMENT_BYTES": "-5"},
			wantErr: "CHARTIT_MAX_DOCUMENT_BYTES",
		},
		{
			name:    "bad base url",
			env:     map[string]string{"CHARTIT_ALLOW_TEST_AUTH": "1", "CHARTIT_BASE_URL": "localhost:8080"},
			wantErr: "CHARTIT_BASE_URL",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := filepath.Join(t.TempDir(), "nested", "data")
			e := map[string]string{"CHARTIT_DATA_DIR": dir}
			for k, v := range tt.env {
				e[k] = v
			}

			cfg, err := LoadFrom(env(e))
			if tt.wantErr != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.wantErr)
				_, statErr := os.Stat(dir)
				assert.True(t, os.IsNotExist(statErr), "data dir must not be created on failure")
				return
			}
			require.NoError(t, err)

			info, err := os.Stat(dir)
			require.NoError(t, err)
			assert.True(t, info.IsDir())
			assert.Equal(t, filepath.Join(dir, "chartit.db"), cfg.DBPath())
			tt.check(t, cfg)
		})
	}
}

func TestLoadReadsProcessEnv(t *testing.T) {
	t.Setenv("CHARTIT_ALLOW_TEST_AUTH", "1")
	t.Setenv("CHARTIT_DATA_DIR", filepath.Join(t.TempDir(), "d"))
	t.Setenv("CHARTIT_OIDC_ISSUER", "")
	t.Setenv("CHARTIT_OIDC_CLIENT_ID", "")
	t.Setenv("CHARTIT_OIDC_CLIENT_SECRET", "")

	cfg, err := Load()
	require.NoError(t, err)
	assert.True(t, cfg.AllowTestAuth)
}
