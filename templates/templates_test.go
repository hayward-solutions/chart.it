package templates

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoadListsExpectedKeys(t *testing.T) {
	list, err := Load()
	require.NoError(t, err)
	keys := make([]string, 0, len(list))
	for _, tpl := range list {
		keys = append(keys, tpl.Key)
	}
	assert.Equal(t, []string{"aws-three-tier", "aws-eks", "azure-hub-spoke", "gcp-gke", "k8s-namespace"}, keys)
}

func TestEveryTemplateIsSchemaV1(t *testing.T) {
	list, err := Load()
	require.NoError(t, err)
	for _, tpl := range list {
		t.Run(tpl.Key, func(t *testing.T) {
			assert.NotEmpty(t, tpl.Title)
			assert.NotEmpty(t, tpl.Description)
			assert.Contains(t, []string{"aws", "azure", "gcp", "k8s"}, tpl.Pack)
			var doc map[string]json.RawMessage
			require.NoError(t, json.Unmarshal(tpl.Content, &doc))
			for _, field := range []string{"schemaVersion", "title", "settings", "viewport", "nodes", "edges"} {
				assert.Contains(t, doc, field)
			}
			assert.JSONEq(t, "1", string(doc["schemaVersion"]))
		})
	}
}

func TestGet(t *testing.T) {
	tpl, err := Get("aws-eks")
	require.NoError(t, err)
	assert.Equal(t, "aws-eks", tpl.Key)
	assert.NotEmpty(t, tpl.Content)

	_, err = Get("nope")
	require.ErrorIs(t, err, ErrUnknown)
}
