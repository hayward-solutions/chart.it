package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image/png"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"
)

const maxIconBytes = 200 * 1024

var validKinds = []string{"service", "resource", "group", "shape"}

type Pack struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Licence string `json:"licence"`
	Version string `json:"version,omitempty"`
}

type Icon struct {
	Pack     string   `json:"pack"`
	ID       string   `json:"id"`
	Category string   `json:"category"`
	Title    string   `json:"title"`
	Terms    []string `json:"terms"`
	File     string   `json:"file"`
	Format   string   `json:"format"`
	Kind     string   `json:"kind"`
	Colour   string   `json:"colour,omitempty"`
}

type Manifest struct {
	GeneratedAt string `json:"generatedAt"`
	Packs       []Pack `json:"packs"`
	Icons       []Icon `json:"icons"`
}

type builtIcon struct {
	Icon
	Data []byte
}

type rawIcon struct {
	Category  string
	Name      string
	ID        string
	Title     string
	Kind      string
	Format    string
	Data      []byte
	Terms     []string
	Priority  int
	Supersede bool
	Source    string
}

var requiredBadges = map[string][]string{
	"aws":   {"group-account", "group-auto-scaling", "group-cloud", "group-region", "group-vpc"},
	"azure": {"resource-group", "subscription", "vnet"},
	"gcp":   {"project", "vpc"},
	"k8s":   {"cluster", "namespace", "node", "pod"},
}

func idPrefix(pack, id string) string {
	sum := sha256.Sum256([]byte(pack + "/" + id))
	return "i" + hex.EncodeToString(sum[:3])
}

type pendingIcon struct {
	raw   rawIcon
	id    string
	extra []string
}

func finalise(pack string, raws []rawIcon) ([]builtIcon, []string) {
	sorted := slices.Clone(raws)
	sort.SliceStable(sorted, func(i, j int) bool {
		a, b := sorted[i], sorted[j]
		if (a.ID != "") != (b.ID != "") {
			return a.ID != ""
		}
		if a.Priority != b.Priority {
			return a.Priority < b.Priority
		}
		if ca, cb := slugify(a.Category), slugify(b.Category); ca != cb {
			return ca < cb
		}
		if a.Name != b.Name {
			return a.Name < b.Name
		}
		return a.Source < b.Source
	})

	var rejected []string
	taken := map[string]int{}
	var items []*pendingIcon
	for _, r := range sorted {
		explicit := r.ID != ""
		base := r.ID
		if !explicit {
			base = slugify(r.Name)
		}
		if base == "" {
			rejected = append(rejected, fmt.Sprintf("%s: empty identifier", r.Source))
			continue
		}
		hash := sha256.Sum256(r.Data)
		cat := slugify(r.Category)
		id := ""
		cands := []string{base}
		if r.Kind != "" && r.Kind != "service" {
			cands = append(cands, base+"-"+r.Kind)
		}
		if cat != "" {
			cands = append(cands, base+"-"+cat)
		}
		for n := 0; ; n++ {
			var cand string
			if n < len(cands) {
				cand = cands[n]
			} else {
				cand = base + "-" + strconv.Itoa(n-len(cands)+2)
			}
			idx, exists := taken[cand]
			if !exists {
				id = cand
				break
			}
			if sha256.Sum256(items[idx].raw.Data) == hash {
				items[idx].extra = append(items[idx].extra, tokens(r.Category)...)
				break
			}
			if r.Supersede {
				break
			}
			if explicit {
				rejected = append(rejected, fmt.Sprintf("%s: id %q already used by different content", r.Source, base))
				break
			}
		}
		if id == "" {
			continue
		}
		taken[id] = len(items)
		items = append(items, &pendingIcon{raw: r, id: id})
	}

	var out []builtIcon
	for _, it := range items {
		r := it.raw
		category := slugify(r.Category)
		if category == "" {
			category = "general"
		}
		data := r.Data
		colour := ""
		switch r.Format {
		case "svg":
			norm, err := normaliseSVG(r.Data, idPrefix(pack, it.id))
			if err != nil {
				rejected = append(rejected, fmt.Sprintf("%s/%s (%s): %v", pack, it.id, r.Source, err))
				continue
			}
			data = norm
			colour = dominantColour(norm)
		case "png":
			if _, err := png.DecodeConfig(bytes.NewReader(r.Data)); err != nil {
				rejected = append(rejected, fmt.Sprintf("%s/%s (%s): invalid png: %v", pack, it.id, r.Source, err))
				continue
			}
		default:
			rejected = append(rejected, fmt.Sprintf("%s/%s: unsupported format %q", pack, it.id, r.Format))
			continue
		}
		if len(data) > maxIconBytes {
			rejected = append(rejected, fmt.Sprintf("%s/%s (%s): %d bytes exceeds %d", pack, it.id, r.Source, len(data), maxIconBytes))
			continue
		}
		title := r.Title
		if title == "" {
			title = titleCase(r.Name)
		}
		extra := append(slices.Clone(r.Terms), it.extra...)
		out = append(out, builtIcon{
			Icon: Icon{
				Pack:     pack,
				ID:       it.id,
				Category: category,
				Title:    title,
				Terms:    computeTerms(it.id, title, category, extra),
				File:     pack + "/" + category + "/" + it.id + "." + r.Format,
				Format:   r.Format,
				Kind:     r.Kind,
				Colour:   colour,
			},
			Data: data,
		})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Category != out[j].Category {
			return out[i].Category < out[j].Category
		}
		return out[i].ID < out[j].ID
	})
	sort.Strings(rejected)
	return out, rejected
}

func missingBadges(pack string, icons []builtIcon) []string {
	var missing []string
	for _, id := range requiredBadges[pack] {
		ok := false
		for _, ic := range icons {
			if ic.ID == id && ic.Kind == "group" {
				ok = true
				break
			}
		}
		if !ok {
			missing = append(missing, id)
		}
	}
	return missing
}

func extraBadge(pack, id string) (rawIcon, error) {
	data, err := assets.ReadFile("extras/" + pack + "/" + id + ".svg")
	if err != nil {
		return rawIcon{}, fmt.Errorf("no authored badge for %s/%s: %w", pack, id, err)
	}
	return rawIcon{
		Category: "groups",
		Name:     id,
		ID:       id,
		Title:    titleCase(id),
		Kind:     "group",
		Format:   "svg",
		Data:     data,
		Priority: 9,
		Source:   "extras/" + pack + "/" + id + ".svg",
	}, nil
}

func assemble(pack string, raws []rawIcon) ([]builtIcon, []string, []string, error) {
	icons, rejected := finalise(pack, raws)
	missing := missingBadges(pack, icons)
	if len(missing) == 0 {
		return icons, rejected, nil, nil
	}
	all := slices.Clone(raws)
	for _, id := range missing {
		r, err := extraBadge(pack, id)
		if err != nil {
			return nil, nil, nil, err
		}
		all = append(all, r)
	}
	icons, rejected = finalise(pack, all)
	if still := missingBadges(pack, icons); len(still) > 0 {
		return nil, nil, nil, fmt.Errorf("badge icons missing for %s: %s", pack, strings.Join(still, ", "))
	}
	return icons, rejected, missing, nil
}

func (ws *workspace) generatedAt() string {
	if v := ws.getenv("SOURCE_DATE_EPOCH"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return time.Unix(n, 0).UTC().Format(time.RFC3339)
		}
	}
	return ws.now().UTC().Format(time.RFC3339)
}

func encodeManifest(m *Manifest) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(m); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func readManifest(path string) (*Manifest, error) {
	b, err := readFile(path)
	if err != nil {
		return nil, err
	}
	var m Manifest
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	return &m, nil
}

func sortManifest(m *Manifest) {
	order := func(p string) int {
		if i := slices.Index(allPacks, p); i >= 0 {
			return i
		}
		return len(allPacks)
	}
	sort.SliceStable(m.Packs, func(i, j int) bool { return order(m.Packs[i].ID) < order(m.Packs[j].ID) })
	sort.SliceStable(m.Icons, func(i, j int) bool {
		a, b := m.Icons[i], m.Icons[j]
		if oa, ob := order(a.Pack), order(b.Pack); oa != ob {
			return oa < ob
		}
		if a.Category != b.Category {
			return a.Category < b.Category
		}
		return a.ID < b.ID
	})
}
