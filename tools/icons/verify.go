package main

import (
	"bytes"
	"fmt"
	"image/png"
	"io/fs"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"time"
)

type packStats struct {
	count int
	bytes int64
	kinds map[string]int
}

func (ws *workspace) verify() error {
	manifestPath := filepath.Join(ws.outDir, "manifest.json")
	m, err := readManifest(manifestPath)
	if err != nil {
		return fmt.Errorf("read manifest: %w", err)
	}
	var problems []string
	fail := func(format string, args ...any) {
		problems = append(problems, fmt.Sprintf(format, args...))
	}
	if _, err := time.Parse(time.RFC3339, m.GeneratedAt); err != nil {
		fail("generatedAt %q is not RFC 3339", m.GeneratedAt)
	}
	packSet := map[string]bool{}
	for _, p := range m.Packs {
		if packSet[p.ID] {
			fail("duplicate pack %q", p.ID)
		}
		packSet[p.ID] = true
		if !slices.Contains(allPacks, p.ID) {
			fail("unknown pack %q", p.ID)
		}
		if p.Title == "" || p.Licence == "" {
			fail("pack %q needs a title and licence", p.ID)
		}
	}

	stats := map[string]*packStats{}
	ids := map[string]bool{}
	files := map[string]bool{}
	for _, ic := range m.Icons {
		label := ic.Pack + "/" + ic.ID
		if !packSet[ic.Pack] {
			fail("%s: pack %q is not declared in packs", label, ic.Pack)
		}
		if ic.ID == "" || ic.Category == "" || ic.Title == "" || ic.File == "" || len(ic.Terms) == 0 {
			fail("%s: missing required field", label)
		}
		if ids[label] {
			fail("%s: duplicate id", label)
		}
		ids[label] = true
		if files[ic.File] {
			fail("%s: duplicate file %s", label, ic.File)
		}
		files[ic.File] = true
		if !slices.Contains(validKinds, ic.Kind) {
			fail("%s: invalid kind %q", label, ic.Kind)
		}
		if ic.Format != "svg" && ic.Format != "png" {
			fail("%s: invalid format %q", label, ic.Format)
		}
		if want := ic.Pack + "/" + ic.Category + "/" + ic.ID + "." + ic.Format; ic.File != want {
			fail("%s: file %q should be %q", label, ic.File, want)
		}
		st := stats[ic.Pack]
		if st == nil {
			st = &packStats{kinds: map[string]int{}}
			stats[ic.Pack] = st
		}
		st.count++
		st.kinds[ic.Kind]++
		full := filepath.Join(ws.outDir, filepath.FromSlash(ic.File))
		data, err := readFile(full)
		if err != nil {
			fail("%s: file missing: %v", label, err)
			continue
		}
		st.bytes += int64(len(data))
		if len(data) > maxIconBytes {
			fail("%s: %d bytes exceeds %d", label, len(data), maxIconBytes)
		}
		switch ic.Format {
		case "svg":
			if err := checkSVGFile(data); err != nil {
				fail("%s: invalid svg: %v", label, err)
			}
		case "png":
			if _, err := png.DecodeConfig(bytes.NewReader(data)); err != nil {
				fail("%s: invalid png: %v", label, err)
			}
		}
	}

	for pack, badges := range requiredBadges {
		if !packSet[pack] {
			continue
		}
		for _, id := range badges {
			found := false
			for _, ic := range m.Icons {
				if ic.Pack == pack && ic.ID == id && ic.Kind == "group" {
					found = true
				}
			}
			if !found {
				fail("%s: required badge %q missing or not kind group", pack, id)
			}
		}
	}

	var total int64
	err = filepath.WalkDir(ws.outDir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(ws.outDir, p)
		rel = filepath.ToSlash(rel)
		if info, err := d.Info(); err == nil {
			total += info.Size()
		}
		if rel != "manifest.json" && !files[rel] {
			fail("orphan file not in manifest: %s", rel)
		}
		return nil
	})
	if err != nil {
		return err
	}

	names := make([]string, 0, len(stats))
	for p := range stats {
		names = append(names, p)
	}
	sort.Slice(names, func(i, j int) bool {
		return slices.Index(allPacks, names[i]) < slices.Index(allPacks, names[j])
	})
	for _, p := range names {
		st := stats[p]
		var kinds []string
		for _, k := range validKinds {
			if st.kinds[k] > 0 {
				kinds = append(kinds, fmt.Sprintf("%s=%d", k, st.kinds[k]))
			}
		}
		ws.logf("%-8s %5d icons  %8.1f KiB  %s\n", p, st.count, float64(st.bytes)/1024, strings.Join(kinds, " "))
	}
	ws.logf("total    %5d icons  %8.2f MiB on disk (including manifest)\n", len(m.Icons), float64(total)/(1<<20))

	if len(problems) > 0 {
		sort.Strings(problems)
		for _, p := range problems {
			ws.logln("FAIL", p)
		}
		return fmt.Errorf("verify failed with %d problem(s)", len(problems))
	}
	ws.logln("verify ok")
	return nil
}
