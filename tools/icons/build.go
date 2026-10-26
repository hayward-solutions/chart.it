package main

import (
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

//go:embed generic/*.svg extras/*/*.svg
var assets embed.FS

var packInfo = map[string]Pack{
	"aws":     {ID: "aws", Title: "AWS Architecture Icons", Licence: "AWS Architecture Icons terms of use"},
	"azure":   {ID: "azure", Title: "Azure Icons", Licence: "Microsoft Azure icons terms of use"},
	"gcp":     {ID: "gcp", Title: "Google Cloud Icons", Licence: "Google Cloud icons terms of use"},
	"k8s":     {ID: "k8s", Title: "Kubernetes Icons", Licence: "CC BY 4.0"},
	"generic": {ID: "generic", Title: "Generic", Licence: "MIT (Chart.it project licence)"},
}

const fallbackLicence = "MIT (mingrammer/diagrams)"

func walkSorted(root, ext string) ([]string, error) {
	var out []string
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error { //nolint:gosec
		if err != nil {
			return err
		}
		if d.IsDir() || !d.Type().IsRegular() {
			return nil
		}
		if strings.EqualFold(filepath.Ext(p), ext) {
			rel, err := filepath.Rel(root, p)
			if err != nil {
				return err
			}
			out = append(out, filepath.ToSlash(rel))
		}
		return nil
	})
	sort.Strings(out)
	return out, err
}

func findSubdir(base, prefix string) (string, bool) {
	entries, err := os.ReadDir(base)
	if err != nil {
		return "", false
	}
	for _, e := range entries {
		if e.IsDir() && strings.HasPrefix(e.Name(), prefix) {
			return filepath.Join(base, e.Name()), true
		}
	}
	return "", false
}

func (ws *workspace) build(packs []string) error {
	manifestPath := filepath.Join(ws.outDir, "manifest.json")
	prev, _ := readManifest(manifestPath)
	next := &Manifest{GeneratedAt: ws.generatedAt()}
	built := map[string]bool{}
	for _, p := range packs {
		icons, info, notes, err := ws.buildPack(p)
		if err != nil {
			return fmt.Errorf("build %s: %w", p, err)
		}
		built[p] = true
		for _, n := range notes {
			ws.logf("  %s\n", n)
		}
		dir := filepath.Join(ws.outDir, p)
		if err := removeAll(dir); err != nil {
			return err
		}
		for _, ic := range icons {
			full := filepath.Join(ws.outDir, filepath.FromSlash(ic.File))
			if err := mkdirAll(filepath.Dir(full)); err != nil {
				return err
			}
			if err := writeFile(full, ic.Data); err != nil {
				return err
			}
			next.Icons = append(next.Icons, ic.Icon)
		}
		next.Packs = append(next.Packs, info)
		ws.logf("built %s: %d icons\n", p, len(icons))
	}
	if prev != nil {
		for _, pk := range prev.Packs {
			if !built[pk.ID] {
				next.Packs = append(next.Packs, pk)
			}
		}
		for _, ic := range prev.Icons {
			if !built[ic.Pack] {
				next.Icons = append(next.Icons, ic)
			}
		}
	}
	sortManifest(next)
	if err := mkdirAll(ws.outDir); err != nil {
		return err
	}
	b, err := encodeManifest(next)
	if err != nil {
		return err
	}
	return writeFile(manifestPath, b)
}

func (ws *workspace) buildPack(pack string) ([]builtIcon, Pack, []string, error) {
	info := packInfo[pack]
	var raws []rawIcon
	var err error
	if pack == "generic" {
		raws, err = rawGeneric()
	} else {
		var meta *sourceMeta
		meta, err = ws.readMeta(pack)
		if err != nil {
			return nil, info, nil, err
		}
		info.Version = meta.Version
		if meta.Fallback {
			info.Licence = fallbackLicence
			raws, err = ws.rawDiagrams(pack)
		} else {
			switch pack {
			case "aws":
				raws, err = ws.rawAWS()
			case "azure":
				raws, err = ws.rawAzure()
			case "gcp":
				raws, err = ws.rawGCP()
			case "k8s":
				raws, err = ws.rawK8s()
			default:
				err = fmt.Errorf("unknown pack %q", pack)
			}
		}
	}
	if err != nil {
		return nil, info, nil, err
	}
	icons, rejected, filled, err := assemble(pack, raws)
	if err != nil {
		return nil, info, nil, err
	}
	var notes []string
	for _, r := range rejected {
		notes = append(notes, "rejected "+r)
	}
	for _, id := range filled {
		notes = append(notes, fmt.Sprintf("badge %s/%s supplied from authored extras", pack, id))
	}
	if len(icons) == 0 {
		return nil, info, nil, fmt.Errorf("pack %s produced no icons", pack)
	}
	return icons, info, notes, nil
}
