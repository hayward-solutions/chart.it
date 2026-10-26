package main

import (
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

type workspace struct {
	root     string
	toolDir  string
	cacheDir string
	outDir   string
	out      io.Writer
	client   *http.Client
	getenv   func(string) string
	now      func() time.Time
}

func newWorkspace(root string, out io.Writer) (*workspace, error) {
	if root == "" {
		wd, err := os.Getwd()
		if err != nil {
			return nil, err
		}
		root, err = findRoot(wd)
		if err != nil {
			return nil, err
		}
	}
	root, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	toolDir := filepath.Join(root, "tools", "icons")
	return &workspace{
		root:     root,
		toolDir:  toolDir,
		cacheDir: filepath.Join(toolDir, ".cache"),
		outDir:   filepath.Join(root, "web", "public", "icons"),
		out:      out,
		client:   &http.Client{Timeout: 15 * time.Minute},
		getenv:   os.Getenv,
		now:      time.Now,
	}, nil
}

func findRoot(start string) (string, error) {
	dir := start
	for {
		if _, err := os.Stat(filepath.Join(dir, "AGENTS.md")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", errors.New("repository root not found: no AGENTS.md in any parent directory")
		}
		dir = parent
	}
}

func (ws *workspace) extractDir(pack, label string) string {
	return filepath.Join(ws.cacheDir, "extract", pack, label)
}

func (ws *workspace) metaPath(pack string) string {
	return filepath.Join(ws.cacheDir, "meta", pack+".json")
}
