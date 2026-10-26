package ui

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var distFS embed.FS

//go:embed all:placeholder
var placeholderFS embed.FS

func Embedded() fs.FS {
	if dist, err := fs.Sub(distFS, "dist"); err == nil && hasIndex(dist) {
		return dist
	}
	placeholder, err := fs.Sub(placeholderFS, "placeholder")
	if err != nil {
		panic("ui: embedded placeholder is missing: " + err.Error())
	}
	return placeholder
}

func hasIndex(fsys fs.FS) bool {
	info, err := fs.Stat(fsys, indexFile)
	return err == nil && !info.IsDir()
}
