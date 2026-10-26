package templates

import (
	"bytes"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
)

//go:embed *.json
var files embed.FS

var ErrUnknown = errors.New("unknown template")

type Template struct {
	Key         string          `json:"key"`
	Title       string          `json:"title"`
	Description string          `json:"description"`
	Pack        string          `json:"pack"`
	Content     json.RawMessage `json:"-"`
}

func Load() ([]Template, error) {
	raw, err := files.ReadFile("index.json")
	if err != nil {
		return nil, fmt.Errorf("read template index: %w", err)
	}
	var list []Template
	if err := json.Unmarshal(raw, &list); err != nil {
		return nil, fmt.Errorf("parse template index: %w", err)
	}
	seen := make(map[string]struct{}, len(list))
	for i := range list {
		t := &list[i]
		if t.Key == "" || t.Title == "" {
			return nil, fmt.Errorf("template index entry %d: key and title are required", i)
		}
		if _, dup := seen[t.Key]; dup {
			return nil, fmt.Errorf("template %q: duplicate key", t.Key)
		}
		seen[t.Key] = struct{}{}
		content, err := files.ReadFile(t.Key + ".json")
		if err != nil {
			return nil, fmt.Errorf("read template %q: %w", t.Key, err)
		}
		var doc struct {
			SchemaVersion int    `json:"schemaVersion"`
			Title         string `json:"title"`
		}
		if err := json.Unmarshal(content, &doc); err != nil {
			return nil, fmt.Errorf("parse template %q: %w", t.Key, err)
		}
		if doc.SchemaVersion != 1 || doc.Title == "" {
			return nil, fmt.Errorf("template %q: not a schema v1 document with a title", t.Key)
		}
		var compact bytes.Buffer
		if err := json.Compact(&compact, content); err != nil {
			return nil, fmt.Errorf("compact template %q: %w", t.Key, err)
		}
		t.Content = compact.Bytes()
	}
	return list, nil
}

func Get(key string) (Template, error) {
	list, err := Load()
	if err != nil {
		return Template{}, err
	}
	for _, t := range list {
		if t.Key == key {
			return t, nil
		}
	}
	return Template{}, fmt.Errorf("%w: %q", ErrUnknown, key)
}
