package main

import (
	"fmt"
	"io"
	"os"
)

func readFile(p string) ([]byte, error) {
	return os.ReadFile(p) //nolint:gosec
}

func writeFile(p string, data []byte) error {
	return os.WriteFile(p, data, 0o644) //nolint:gosec
}

func mkdirAll(p string) error {
	return os.MkdirAll(p, 0o755) //nolint:gosec
}

func removeAll(p string) error {
	return os.RemoveAll(p) //nolint:gosec
}

func openRead(p string) (*os.File, error) {
	return os.Open(p) //nolint:gosec
}

func createFile(p string) (*os.File, error) {
	return os.Create(p) //nolint:gosec
}

func createExclusive(p string) (*os.File, error) {
	return os.OpenFile(p, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644) //nolint:gosec
}

func closeQuiet(c io.Closer) {
	_ = c.Close()
}

func removeQuiet(p string) {
	_ = os.Remove(p) //nolint:gosec
}

func printLine(w io.Writer, args ...any) {
	_, _ = fmt.Fprintln(w, args...)
}

func (ws *workspace) logf(format string, args ...any) {
	_, _ = fmt.Fprintf(ws.out, format, args...)
}

func (ws *workspace) logln(args ...any) {
	_, _ = fmt.Fprintln(ws.out, args...)
}
