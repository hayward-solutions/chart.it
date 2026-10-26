package main

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
)

const (
	maxEntryBytes = 16 << 20
	maxTotalBytes = 512 << 20
)

func safeJoin(dst, name string) (string, error) {
	name = strings.ReplaceAll(name, "\\", "/")
	if strings.HasPrefix(name, "/") || strings.ContainsRune(name, 0) {
		return "", fmt.Errorf("unsafe path %q", name)
	}
	clean := path.Clean(name)
	if clean == "." || clean == ".." || strings.HasPrefix(clean, "../") {
		return "", fmt.Errorf("unsafe path %q", name)
	}
	full := filepath.Join(dst, filepath.FromSlash(clean))
	rel, err := filepath.Rel(dst, full)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("unsafe path %q", name)
	}
	return full, nil
}

func isJunk(name string) bool {
	base := path.Base(name)
	return strings.Contains(name, "__MACOSX/") || base == ".DS_Store" || strings.HasPrefix(base, "._")
}

type extractor struct {
	dst    string
	accept func(string) bool
	count  int
	total  int64
}

func (e *extractor) write(name string, r io.Reader) error {
	full, err := safeJoin(e.dst, name)
	if err != nil {
		return err
	}
	if err := mkdirAll(filepath.Dir(full)); err != nil {
		return err
	}
	f, err := createExclusive(full)
	if err != nil {
		if errors.Is(err, os.ErrExist) {
			return nil
		}
		return err
	}
	n, copyErr := io.Copy(f, io.LimitReader(r, maxEntryBytes+1))
	closeErr := f.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	if n > maxEntryBytes {
		removeQuiet(full)
		return fmt.Errorf("entry %q exceeds %d bytes", name, maxEntryBytes)
	}
	e.total += n
	if e.total > maxTotalBytes {
		return fmt.Errorf("archive exceeds %d bytes extracted", maxTotalBytes)
	}
	e.count++
	return nil
}

func extractZip(src, dst string, accept func(string) bool) (int, error) {
	zr, err := zip.OpenReader(src)
	if err != nil {
		return 0, fmt.Errorf("open zip: %w", err)
	}
	defer closeQuiet(zr)
	e := &extractor{dst: dst, accept: accept}
	for _, f := range zr.File {
		if f.FileInfo().IsDir() || f.Mode()&os.ModeSymlink != 0 || isJunk(f.Name) || !accept(f.Name) {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return e.count, fmt.Errorf("open %q: %w", f.Name, err)
		}
		err = e.write(f.Name, rc)
		closeQuiet(rc)
		if err != nil {
			return e.count, err
		}
	}
	return e.count, nil
}

func extractTarGz(src, dst string, accept func(string) bool) (int, string, error) {
	f, err := openRead(src)
	if err != nil {
		return 0, "", err
	}
	defer closeQuiet(f)
	gz, err := gzip.NewReader(f)
	if err != nil {
		return 0, "", fmt.Errorf("open gzip: %w", err)
	}
	defer closeQuiet(gz)
	tr := tar.NewReader(gz)
	e := &extractor{dst: dst, accept: accept}
	comment := ""
	for {
		h, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return e.count, comment, fmt.Errorf("read tar: %w", err)
		}
		if h.Typeflag == tar.TypeXGlobalHeader {
			if c, ok := h.PAXRecords["comment"]; ok {
				comment = c
			}
			continue
		}
		if h.Typeflag != tar.TypeReg {
			continue
		}
		name := h.Name
		i := strings.IndexByte(name, '/')
		if i < 0 {
			continue
		}
		name = name[i+1:]
		if name == "" || isJunk(name) || !accept(name) {
			continue
		}
		if err := e.write(name, tr); err != nil {
			return e.count, comment, err
		}
	}
	return e.count, comment, nil
}
