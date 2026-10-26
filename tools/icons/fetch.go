package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strings"
)

const (
	browserUA       = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
	diagramsURL     = "https://github.com/mingrammer/diagrams/archive/refs/heads/master.tar.gz"
	k8sTarballURL   = "https://github.com/kubernetes/community/archive/refs/heads/master.tar.gz"
	maxDownload     = 600 << 20
	maxLandingBytes = 32 << 20
)

type fetchOptions struct {
	force    bool
	fallback map[string]bool
}

type archiveMeta struct {
	Label  string `json:"label"`
	URL    string `json:"url"`
	File   string `json:"file"`
	SHA256 string `json:"sha256"`
	Bytes  int64  `json:"bytes"`
}

type sourceMeta struct {
	Pack     string        `json:"pack"`
	Fallback bool          `json:"fallback"`
	Reason   string        `json:"reason,omitempty"`
	Version  string        `json:"version,omitempty"`
	Archives []archiveMeta `json:"archives"`
}

type archiveSpec struct {
	Label  string
	URL    string
	Format string
	Accept func(string) bool
}

type source struct {
	discover func(ctx context.Context, ws *workspace) ([]archiveSpec, error)
	minFiles int
	version  func(specs []archiveSpec, comments map[string]string) string
}

func acceptExt(exts ...string) func(string) bool {
	return func(name string) bool {
		return slices.Contains(exts, strings.ToLower(path.Ext(name)))
	}
}

var sources = map[string]source{
	"aws":   {discover: discoverAWS, minFiles: 500, version: versionFromURL(`_(\d{8})\.`)},
	"azure": {discover: discoverAzure, minFiles: 300, version: versionFromURL(`_(V\d+)\.zip`)},
	"gcp":   {discover: discoverGCP, minFiles: 100, version: func([]archiveSpec, map[string]string) string { return "" }},
	"k8s":   {discover: discoverK8s, minFiles: 30, version: commitVersion("main")},
}

func versionFromURL(pattern string) func([]archiveSpec, map[string]string) string {
	re := regexp.MustCompile(pattern)
	return func(specs []archiveSpec, _ map[string]string) string {
		for _, s := range specs {
			if m := re.FindStringSubmatch(s.URL); m != nil {
				return m[1]
			}
		}
		return ""
	}
}

func commitVersion(label string) func([]archiveSpec, map[string]string) string {
	return func(_ []archiveSpec, comments map[string]string) string {
		c := comments[label]
		if len(c) >= 12 {
			return c[:12]
		}
		return c
	}
}

var zipLinkRe = regexp.MustCompile(`https?://[^"'\s<>\\]+?\.zip`)

func findZipLinks(page string) []string {
	seen := map[string]bool{}
	var out []string
	for _, m := range zipLinkRe.FindAllString(html.UnescapeString(page), -1) {
		if !seen[m] {
			seen[m] = true
			out = append(out, m)
		}
	}
	return out
}

func discoverAWS(ctx context.Context, ws *workspace) ([]archiveSpec, error) {
	page, err := ws.getText(ctx, "https://aws.amazon.com/architecture/icons/")
	if err != nil {
		return nil, err
	}
	var best string
	for _, l := range findZipLinks(page) {
		low := strings.ToLower(l)
		if !strings.Contains(low, "icon-package") && !strings.Contains(low, "asset-package") {
			continue
		}
		if strings.Contains(low, "pptx") || strings.Contains(low, "toolkit") {
			continue
		}
		if best == "" {
			best = l
		}
	}
	if best == "" {
		return nil, errors.New("no asset package zip link found on the AWS architecture icons page")
	}
	return []archiveSpec{{Label: "main", URL: best, Format: "zip", Accept: acceptExt(".svg")}}, nil
}

func discoverAzure(ctx context.Context, ws *workspace) ([]archiveSpec, error) {
	page, err := ws.getText(ctx, "https://learn.microsoft.com/en-us/azure/architecture/icons/")
	if err != nil {
		return nil, err
	}
	var cands []string
	for _, l := range findZipLinks(page) {
		if strings.Contains(l, "Azure_Public_Service_Icons") {
			cands = append(cands, l)
		}
	}
	if len(cands) == 0 {
		return nil, errors.New("no Azure_Public_Service_Icons zip link found on the Azure icons page")
	}
	sort.Strings(cands)
	return []archiveSpec{{Label: "main", URL: cands[len(cands)-1], Format: "zip", Accept: acceptExt(".svg")}}, nil
}

func discoverGCP(ctx context.Context, ws *workspace) ([]archiveSpec, error) {
	page, err := ws.getText(ctx, "https://cloud.google.com/icons")
	var links []string
	if err == nil {
		links = findZipLinks(page)
	}
	var specs []archiveSpec
	for _, l := range links {
		low := strings.ToLower(l)
		switch {
		case strings.Contains(low, "core-products"):
			specs = append(specs, archiveSpec{Label: "core", URL: l, Format: "zip", Accept: acceptExt(".svg")})
		case strings.Contains(low, "legacy"):
			specs = append(specs, archiveSpec{Label: "legacy", URL: l, Format: "zip", Accept: acceptExt(".svg")})
		}
	}
	if len(specs) == 0 {
		for _, guess := range []string{
			"https://cloud.google.com/static/icons/files/google-cloud-icons.zip",
			"https://cloud.google.com/static/icons/files/google-cloud-icons-svg.zip",
			"https://cloud.google.com/icons/files/google-cloud-icons.zip",
		} {
			if ws.probeZip(ctx, guess) {
				specs = append(specs, archiveSpec{Label: "legacy", URL: guess, Format: "zip", Accept: acceptExt(".svg")})
				break
			}
		}
	}
	if len(specs) == 0 {
		if err != nil {
			return nil, fmt.Errorf("landing page unavailable and no guessed link worked: %w", err)
		}
		return nil, errors.New("no icon zip link found on the Google Cloud icons page and no guessed link worked")
	}
	sort.Slice(specs, func(i, j int) bool { return specs[i].Label < specs[j].Label })
	return specs, nil
}

func discoverK8s(context.Context, *workspace) ([]archiveSpec, error) {
	accept := func(name string) bool {
		return strings.HasPrefix(name, "icons/svg/") && strings.EqualFold(path.Ext(name), ".svg")
	}
	return []archiveSpec{{Label: "main", URL: k8sTarballURL, Format: "tgz", Accept: accept}}, nil
}

func (ws *workspace) request(ctx context.Context, method, url string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", browserUA)
	req.Header.Set("Accept", "*/*")
	return ws.client.Do(req)
}

func (ws *workspace) getText(ctx context.Context, url string) (string, error) {
	resp, err := ws.request(ctx, http.MethodGet, url)
	if err != nil {
		return "", err
	}
	defer closeQuiet(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GET %s: %s", url, resp.Status)
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, maxLandingBytes))
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (ws *workspace) probeZip(ctx context.Context, url string) bool {
	resp, err := ws.request(ctx, http.MethodGet, url)
	if err != nil {
		return false
	}
	defer closeQuiet(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return false
	}
	head := make([]byte, 4)
	if _, err := io.ReadFull(resp.Body, head); err != nil {
		return false
	}
	return string(head) == "PK\x03\x04"
}

func (ws *workspace) ensureDownload(ctx context.Context, url, dest string, force bool) (archiveMeta, error) {
	m := archiveMeta{URL: url, File: dest}
	sidecar := dest + ".url"
	if !force {
		if st, err := os.Stat(dest); err == nil && st.Size() > 0 { //nolint:gosec
			if b, err := readFile(sidecar); err == nil && strings.TrimSpace(string(b)) == url {
				sum, n, err := hashFile(dest)
				if err == nil {
					m.SHA256, m.Bytes = sum, n
					ws.logf("  cached   %s\n", url)
					return m, nil
				}
			}
		}
	}
	if err := mkdirAll(filepath.Dir(dest)); err != nil {
		return m, err
	}
	ws.logf("  download %s\n", url)
	resp, err := ws.request(ctx, http.MethodGet, url)
	if err != nil {
		return m, err
	}
	defer closeQuiet(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return m, fmt.Errorf("GET %s: %s", url, resp.Status)
	}
	part := dest + ".part"
	f, err := createFile(part)
	if err != nil {
		return m, err
	}
	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(f, h), io.LimitReader(resp.Body, maxDownload+1))
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		removeQuiet(part)
		return m, err
	}
	if n > maxDownload {
		removeQuiet(part)
		return m, fmt.Errorf("download exceeds %d bytes", maxDownload)
	}
	if err := checkMagic(part); err != nil {
		removeQuiet(part)
		return m, fmt.Errorf("%s: %w", url, err)
	}
	if err := os.Rename(part, dest); err != nil { //nolint:gosec
		return m, err
	}
	if err := writeFile(sidecar, []byte(url+"\n")); err != nil {
		return m, err
	}
	m.SHA256, m.Bytes = hex.EncodeToString(h.Sum(nil)), n
	return m, nil
}

func hashFile(p string) (string, int64, error) {
	f, err := openRead(p)
	if err != nil {
		return "", 0, err
	}
	defer closeQuiet(f)
	h := sha256.New()
	n, err := io.Copy(h, f)
	return hex.EncodeToString(h.Sum(nil)), n, err
}

func checkMagic(p string) error {
	f, err := openRead(p)
	if err != nil {
		return err
	}
	defer closeQuiet(f)
	head := make([]byte, 4)
	if _, err := io.ReadFull(f, head); err != nil {
		return fmt.Errorf("downloaded file too short: %w", err)
	}
	if string(head) == "PK\x03\x04" || (head[0] == 0x1f && head[1] == 0x8b) {
		return nil
	}
	return errors.New("downloaded file is neither a zip nor a gzip archive")
}

func (ws *workspace) fetch(packs []string, opts fetchOptions) error {
	ctx := context.Background()
	var fellBack []string
	var failed []string
	for _, p := range packs {
		if p == "generic" {
			continue
		}
		ws.logf("fetch %s\n", p)
		var meta *sourceMeta
		var cause error
		if opts.fallback[p] {
			cause = errors.New("fallback requested with -fallback")
		} else {
			meta, cause = ws.fetchPrimary(ctx, p, opts.force)
			if cause != nil {
				ws.logf("  primary source failed: %v\n", cause)
			}
		}
		if meta == nil {
			var err error
			meta, err = ws.fetchFallback(ctx, p, cause, opts.force)
			if err != nil {
				ws.logf("  FALLBACK FAILED: %v\n", err)
				failed = append(failed, p)
				continue
			}
			fellBack = append(fellBack, p)
			ws.logf("  FALLBACK in use for %s: mingrammer/diagrams PNG set (MIT)\n", p)
		}
		if err := ws.writeMeta(meta); err != nil {
			return err
		}
	}
	for _, p := range fellBack {
		ws.logf("REPORT: %s uses the diagrams PNG fallback\n", p)
	}
	if len(failed) > 0 {
		return fmt.Errorf("no usable source for: %s", strings.Join(failed, ", "))
	}
	return nil
}

func (ws *workspace) writeMeta(m *sourceMeta) error {
	if err := mkdirAll(filepath.Dir(ws.metaPath(m.Pack))); err != nil {
		return err
	}
	b, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	return writeFile(ws.metaPath(m.Pack), append(b, '\n'))
}

func (ws *workspace) readMeta(pack string) (*sourceMeta, error) {
	b, err := readFile(ws.metaPath(pack))
	if err != nil {
		return nil, fmt.Errorf("no fetched source for %s (run fetch first): %w", pack, err)
	}
	var m sourceMeta
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, fmt.Errorf("read meta for %s: %w", pack, err)
	}
	return &m, nil
}

func (ws *workspace) fetchPrimary(ctx context.Context, pack string, force bool) (*sourceMeta, error) {
	src, ok := sources[pack]
	if !ok {
		return nil, fmt.Errorf("no source defined for %s", pack)
	}
	specs, err := src.discover(ctx, ws)
	if err != nil {
		return nil, err
	}
	root := filepath.Join(ws.cacheDir, "extract", pack)
	if err := removeAll(root); err != nil {
		return nil, err
	}
	meta := &sourceMeta{Pack: pack}
	comments := map[string]string{}
	total := 0
	for _, spec := range specs {
		ext := ".zip"
		if spec.Format == "tgz" {
			ext = ".tar.gz"
		}
		file := filepath.Join(ws.cacheDir, "downloads", pack, pack+"-"+spec.Label+ext)
		am, err := ws.ensureDownload(ctx, spec.URL, file, force)
		if err != nil {
			return nil, err
		}
		am.Label = spec.Label
		am.File = filepath.Base(file)
		dst := filepath.Join(root, spec.Label)
		if err := mkdirAll(dst); err != nil {
			return nil, err
		}
		var n int
		if spec.Format == "tgz" {
			var comment string
			n, comment, err = extractTarGz(file, dst, spec.Accept)
			comments[spec.Label] = comment
		} else {
			n, err = extractZip(file, dst, spec.Accept)
		}
		if err != nil {
			return nil, fmt.Errorf("extract %s: %w", spec.URL, err)
		}
		ws.logf("  extracted %d files from %s\n", n, spec.Label)
		total += n
		meta.Archives = append(meta.Archives, am)
	}
	if total < src.minFiles {
		return nil, fmt.Errorf("archive yielded %d icon files, expected at least %d", total, src.minFiles)
	}
	meta.Version = src.version(specs, comments)
	return meta, nil
}

var diagramsProviders = map[string]string{"aws": "aws", "azure": "azure", "gcp": "gcp", "k8s": "k8s"}

func (ws *workspace) fetchFallback(ctx context.Context, pack string, cause error, force bool) (*sourceMeta, error) {
	provider, ok := diagramsProviders[pack]
	if !ok {
		return nil, fmt.Errorf("no fallback for %s", pack)
	}
	file := filepath.Join(ws.cacheDir, "downloads", "diagrams", "diagrams-master.tar.gz")
	am, err := ws.ensureDownload(ctx, diagramsURL, file, force)
	if err != nil {
		return nil, err
	}
	am.Label = "diagrams"
	am.File = filepath.Base(file)
	root := filepath.Join(ws.cacheDir, "extract", pack)
	if err := removeAll(root); err != nil {
		return nil, err
	}
	dst := filepath.Join(root, "diagrams")
	if err := mkdirAll(dst); err != nil {
		return nil, err
	}
	prefix := "resources/" + provider + "/"
	n, comment, err := extractTarGz(file, dst, func(name string) bool {
		return strings.HasPrefix(name, prefix) && strings.EqualFold(path.Ext(name), ".png")
	})
	if err != nil {
		return nil, err
	}
	if n < 5 {
		return nil, fmt.Errorf("diagrams fallback yielded only %d PNG files for %s", n, provider)
	}
	ws.logf("  extracted %d PNG files from diagrams\n", n)
	version := comment
	if len(version) > 12 {
		version = version[:12]
	}
	reason := ""
	if cause != nil {
		reason = cause.Error()
	}
	return &sourceMeta{Pack: pack, Fallback: true, Reason: reason, Version: version, Archives: []archiveMeta{am}}, nil
}
