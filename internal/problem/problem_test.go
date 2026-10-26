package problem

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWrite(t *testing.T) {
	rec := httptest.NewRecorder()
	Write(rec, http.StatusNotFound, "nothing here")
	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Equal(t, ContentType, rec.Header().Get("Content-Type"))

	var body map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	assert.Equal(t, "about:blank", body["type"])
	assert.Equal(t, "Not Found", body["title"])
	assert.EqualValues(t, 404, body["status"])
	assert.Equal(t, "nothing here", body["detail"])
}

func TestWriteExtraDoesNotOverrideReservedFields(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteExtra(rec, http.StatusConflict, "stale", map[string]any{"version": 4, "status": 999})

	var body map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	assert.EqualValues(t, 409, body["status"])
	assert.EqualValues(t, 4, body["version"])
}
