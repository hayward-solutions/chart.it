package main

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

func testWorkspace(t *testing.T, env map[string]string) *workspace {
	t.Helper()
	root := t.TempDir()
	return &workspace{
		root:     root,
		toolDir:  filepath.Join(root, "tools", "icons"),
		cacheDir: filepath.Join(root, "tools", "icons", ".cache"),
		outDir:   filepath.Join(root, "web", "public", "icons"),
		out:      io.Discard,
		getenv:   func(k string) string { return env[k] },
		now:      func() time.Time { return time.Date(2030, 1, 2, 3, 4, 5, 0, time.UTC) },
	}
}

func svgOf(colour string) []byte {
	return []byte(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" fill="` + colour + `"/></svg>`)
}

func readTree(t *testing.T, dir string) map[string]string {
	t.Helper()
	out := map[string]string{}
	err := filepath.WalkDir(dir, func(p string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(dir, p)
		out[filepath.ToSlash(rel)] = string(b)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestFinaliseIsOrderIndependent(t *testing.T) {
	raws := []rawIcon{
		{Category: "Compute", Name: "Amazon EC2", Kind: "service", Format: "svg", Data: svgOf("#ED7100"), Source: "a"},
		{Category: "Compute", Name: "Lambda", Kind: "service", Format: "svg", Data: svgOf("#ED7100"), Source: "b"},
		{Category: "Storage", Name: "S3", Kind: "service", Format: "svg", Data: svgOf("#7AA116"), Source: "c"},
		{Category: "Storage", Name: "S3", Kind: "resource", Format: "svg", Data: svgOf("#7AA117"), Source: "d", Priority: 1},
		{Category: "Groups", Name: "group-vpc", ID: "group-vpc", Kind: "group", Format: "svg", Data: svgOf("#8C4FFF"), Source: "e"},
	}
	a, rejA := finalise("aws", raws)
	reversed := slices.Clone(raws)
	slices.Reverse(reversed)
	b, rejB := finalise("aws", reversed)
	if len(rejA) != 0 || len(rejB) != 0 {
		t.Fatalf("unexpected rejections: %v %v", rejA, rejB)
	}
	if len(a) != len(b) {
		t.Fatalf("lengths differ %d vs %d", len(a), len(b))
	}
	for i := range a {
		if a[i].File != b[i].File || !bytes.Equal(a[i].Data, b[i].Data) {
			t.Errorf("entry %d differs: %s vs %s", i, a[i].File, b[i].File)
		}
	}
	ids := map[string]bool{}
	for _, ic := range a {
		if ids[ic.ID] {
			t.Errorf("duplicate id %s", ic.ID)
		}
		ids[ic.ID] = true
	}
	if !ids["s3"] || !ids["s3-resource"] {
		t.Errorf("expected s3 and s3-resource, got %v", ids)
	}
}

func TestFinaliseDedupesIdenticalAndSupersedes(t *testing.T) {
	same := svgOf("#123456")
	raws := []rawIcon{
		{Category: "A", Name: "Thing", Kind: "service", Format: "svg", Data: same, Source: "1"},
		{Category: "B", Name: "Thing", Kind: "service", Format: "svg", Data: same, Source: "2"},
		{Category: "A", Name: "Other", Kind: "service", Format: "svg", Data: svgOf("#111111"), Source: "3"},
		{Category: "C", Name: "Other", Kind: "service", Format: "svg", Data: svgOf("#222222"), Source: "4", Priority: 1, Supersede: true},
	}
	icons, _ := finalise("gcp", raws)
	if len(icons) != 2 {
		t.Fatalf("got %d icons, want 2: %+v", len(icons), icons)
	}
	for _, ic := range icons {
		if ic.ID == "thing" && !slices.Contains(ic.Terms, "b") {
			t.Errorf("merged category missing from terms: %v", ic.Terms)
		}
	}
}

func TestFinaliseRejectsBadInput(t *testing.T) {
	raws := []rawIcon{
		{Category: "A", Name: "Bad", Kind: "service", Format: "svg", Data: []byte(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script/></svg>`), Source: "bad.svg"},
		{Category: "A", Name: "Fake", Kind: "service", Format: "png", Data: []byte("nope"), Source: "fake.png"},
		{Category: "A", Name: "Huge", Kind: "service", Format: "svg", Data: []byte(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="` + strings.Repeat("M0 0 ", 60000) + `"/></svg>`), Source: "huge.svg"},
		{Category: "A", Name: "Good", Kind: "service", Format: "svg", Data: svgOf("#000000"), Source: "good.svg"},
	}
	icons, rejected := finalise("aws", raws)
	if len(icons) != 1 || icons[0].ID != "good" {
		t.Fatalf("icons = %+v", icons)
	}
	if len(rejected) != 3 {
		t.Fatalf("rejected = %v", rejected)
	}
}

func TestAssembleSuppliesMissingBadges(t *testing.T) {
	raws := []rawIcon{
		{Category: "x", Name: "Thing", Kind: "service", Format: "svg", Data: svgOf("#000000"), Source: "t"},
	}
	icons, _, filled, err := assemble("gcp", raws)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(filled, []string{"project", "vpc"}) {
		t.Errorf("filled = %v", filled)
	}
	got := map[string]string{}
	for _, ic := range icons {
		got[ic.ID] = ic.Kind
	}
	if got["project"] != "group" || got["vpc"] != "group" {
		t.Errorf("badges not kind group: %v", got)
	}
}

func TestEveryAuthoredBadgeExists(t *testing.T) {
	for pack, ids := range requiredBadges {
		for _, id := range ids {
			r, err := extraBadge(pack, id)
			if err != nil {
				t.Errorf("%s/%s: %v", pack, id, err)
				continue
			}
			if _, err := normaliseSVG(r.Data, "ix"); err != nil {
				t.Errorf("%s/%s: %v", pack, id, err)
			}
		}
	}
}

func TestGenericBuildIsByteIdentical(t *testing.T) {
	env := map[string]string{"SOURCE_DATE_EPOCH": "1700000000"}
	ws := testWorkspace(t, env)
	if err := ws.build([]string{"generic"}); err != nil {
		t.Fatal(err)
	}
	first := readTree(t, ws.outDir)
	if err := ws.build([]string{"generic"}); err != nil {
		t.Fatal(err)
	}
	second := readTree(t, ws.outDir)
	if len(first) != len(second) || len(first) < 40 {
		t.Fatalf("unexpected tree sizes %d %d", len(first), len(second))
	}
	for k, v := range first {
		if second[k] != v {
			t.Errorf("%s differs between builds", k)
		}
	}
	if !strings.Contains(first["manifest.json"], `"generatedAt": "2023-11-14T22:13:20Z"`) {
		t.Errorf("SOURCE_DATE_EPOCH ignored: %.200s", first["manifest.json"])
	}
	if err := ws.verify(); err != nil {
		t.Errorf("verify: %v", err)
	}
}

func TestGeneratedAtFallsBackToClock(t *testing.T) {
	ws := testWorkspace(t, nil)
	if got := ws.generatedAt(); got != "2030-01-02T03:04:05Z" {
		t.Errorf("generatedAt = %q", got)
	}
}

func putFile(t *testing.T, p string, data []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, data, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestBuildAWSFromSyntheticTree(t *testing.T) {
	ws := testWorkspace(t, map[string]string{"SOURCE_DATE_EPOCH": "1"})
	base := ws.extractDir("aws", "main")
	svc := filepath.Join(base, "Architecture-Service-Icons_01012030")
	res := filepath.Join(base, "Resource-Icons_01012030")
	grp := filepath.Join(base, "Architecture-Group-Icons_01012030")
	putFile(t, filepath.Join(svc, "Arch_Compute", "64", "Arch_Amazon-EC2_64.svg"), svgOf("#ED7100"))
	putFile(t, filepath.Join(svc, "Arch_Compute", "48", "Arch_Amazon-EC2_48.svg"), svgOf("#000001"))
	putFile(t, filepath.Join(svc, "Arch_Compute", "48", "Arch_AWS-Lambda_48.svg"), svgOf("#ED7101"))
	putFile(t, filepath.Join(svc, "Arch_Storage", "64", "Arch_Amazon-Simple-Storage-Service_64.svg"), svgOf("#7AA116"))
	putFile(t, filepath.Join(svc, "Arch_Storage", "64", "Arch_AWS-Marketplace_Dark_64.svg"), svgOf("#7AA116"))
	putFile(t, filepath.Join(res, "Res_Compute", "Res_Amazon-EC2_Instance_48.svg"), svgOf("#ED7102"))
	putFile(t, filepath.Join(res, "Res_General-Icons", "Res_48_Light", "Res_Server_48_Light.svg"), svgOf("#ED7103"))
	putFile(t, filepath.Join(res, "Res_General-Icons", "Res_48_Dark", "Res_Server_48_Dark.svg"), svgOf("#ED7104"))
	putFile(t, filepath.Join(grp, "Virtual-private-cloud-VPC_32.svg"), svgOf("#8C4FFF"))
	putFile(t, filepath.Join(grp, "Region_32.svg"), svgOf("#00A4A6"))
	putFile(t, filepath.Join(grp, "Region_32_Dark.svg"), svgOf("#00A4A7"))
	putFile(t, ws.metaPath("aws"), []byte(`{"pack":"aws","version":"01012030","archives":[]}`))

	icons, info, notes, err := ws.buildPack("aws")
	if err != nil {
		t.Fatal(err)
	}
	if info.Version != "01012030" {
		t.Errorf("version = %q", info.Version)
	}
	got := map[string]builtIcon{}
	for _, ic := range icons {
		got[ic.ID] = ic
	}
	for _, id := range []string{"ec2", "lambda", "s3", "ec2-instance", "server", "group-vpc", "group-region", "group-account", "group-cloud", "group-auto-scaling"} {
		if _, ok := got[id]; !ok {
			t.Errorf("missing id %s (have %v)", id, keys(got))
		}
	}
	if got["ec2"].Colour != "#ED7100" {
		t.Errorf("ec2 should use the 64px variant, colour = %q", got["ec2"].Colour)
	}
	if got["ec2"].File != "aws/compute/ec2.svg" || got["ec2"].Kind != "service" {
		t.Errorf("ec2 = %+v", got["ec2"].Icon)
	}
	if got["ec2-instance"].Kind != "resource" || got["server"].Category != "general" {
		t.Errorf("resource mapping wrong: %+v %+v", got["ec2-instance"].Icon, got["server"].Icon)
	}
	if got["group-vpc"].Kind != "group" {
		t.Errorf("group-vpc kind = %q", got["group-vpc"].Kind)
	}
	if _, dark := got["marketplace"]; dark {
		t.Error("dark variant should be skipped")
	}
	if len(notes) != 3 {
		t.Errorf("expected 3 supplied-badge notes, got %v", notes)
	}
}

func keys[V any](m map[string]V) []string {
	var out []string
	for k := range m {
		out = append(out, k)
	}
	slices.Sort(out)
	return out
}

func TestVerifyDetectsProblems(t *testing.T) {
	ws := testWorkspace(t, map[string]string{"SOURCE_DATE_EPOCH": "1"})
	if err := ws.build([]string{"generic"}); err != nil {
		t.Fatal(err)
	}
	if err := ws.verify(); err != nil {
		t.Fatal(err)
	}
	putFile(t, filepath.Join(ws.outDir, "generic", "stray.svg"), svgOf("#000000"))
	if err := ws.verify(); err == nil {
		t.Error("orphan file not detected")
	}
	os.Remove(filepath.Join(ws.outDir, "generic", "stray.svg"))
	if err := os.Remove(filepath.Join(ws.outDir, "generic", "people", "user.svg")); err != nil {
		t.Fatal(err)
	}
	if err := ws.verify(); err == nil {
		t.Error("missing file not detected")
	}
}

func zipBytes(t *testing.T, entries map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	names := keys(entries)
	for _, name := range names {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		w.Write([]byte(entries[name]))
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestExtractZipSkipsJunk(t *testing.T) {
	dir := t.TempDir()
	zp := filepath.Join(dir, "a.zip")
	putFile(t, zp, zipBytes(t, map[string]string{
		"top/ok.svg":          "<svg/>",
		"__MACOSX/top/ok.svg": "junk",
		"top/.DS_Store":       "junk",
		"top/._ok.svg":        "junk",
		"top/readme.txt":      "skip",
	}))
	dst := filepath.Join(dir, "out")
	if err := os.MkdirAll(dst, 0o755); err != nil {
		t.Fatal(err)
	}
	n, err := extractZip(zp, dst, acceptExt(".svg"))
	if err != nil || n != 1 {
		t.Fatalf("n=%d err=%v", n, err)
	}
	tree := readTree(t, dst)
	if len(tree) != 1 || tree["top/ok.svg"] != "<svg/>" {
		t.Errorf("tree = %v", keys(tree))
	}
}

func TestExtractZipRejectsTraversal(t *testing.T) {
	for _, name := range []string{"../evil.svg", "/abs.svg", "a/../../evil.svg"} {
		dir := t.TempDir()
		zp := filepath.Join(dir, "a.zip")
		putFile(t, zp, zipBytes(t, map[string]string{name: "evil"}))
		dst := filepath.Join(dir, "out")
		if err := os.MkdirAll(dst, 0o755); err != nil {
			t.Fatal(err)
		}
		if _, err := extractZip(zp, dst, acceptExt(".svg")); err == nil {
			t.Errorf("%s: expected an error", name)
		}
		if _, err := os.Stat(filepath.Join(dir, "evil.svg")); err == nil {
			t.Errorf("%s: file escaped the destination", name)
		}
		if _, err := os.Stat("/abs.svg"); err == nil {
			t.Errorf("%s: absolute path written", name)
		}
	}
}

func TestExtractTarGzStripsTopAndReadsCommit(t *testing.T) {
	dir := t.TempDir()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	tw.WriteHeader(&tar.Header{Typeflag: tar.TypeXGlobalHeader, Name: "pax_global_header", PAXRecords: map[string]string{"comment": "0123456789abcdef"}})
	add := func(name, body string) {
		tw.WriteHeader(&tar.Header{Name: name, Mode: 0o644, Size: int64(len(body)), Typeflag: tar.TypeReg})
		tw.Write([]byte(body))
	}
	add("repo-main/icons/svg/resources/labeled/pod.svg", "<svg/>")
	add("repo-main/docs/readme.md", "skip")
	add("repo-main/icons/svg/../../../escape.svg", "evil")
	tw.Close()
	gz.Close()
	tp := filepath.Join(dir, "a.tar.gz")
	putFile(t, tp, buf.Bytes())
	dst := filepath.Join(dir, "out")
	os.MkdirAll(dst, 0o755)
	_, comment, err := extractTarGz(tp, dst, func(n string) bool { return strings.HasPrefix(n, "icons/svg/") })
	if comment != "0123456789abcdef" {
		t.Errorf("comment = %q", comment)
	}
	if err == nil {
		t.Error("expected traversal entry to fail extraction")
	}
	tree := readTree(t, dst)
	if _, ok := tree["icons/svg/resources/labeled/pod.svg"]; !ok {
		t.Errorf("tree = %v", keys(tree))
	}
	if _, err := os.Stat(filepath.Join(dir, "escape.svg")); err == nil {
		t.Error("escape entry written")
	}
}

func TestSafeJoin(t *testing.T) {
	dst := t.TempDir()
	for _, bad := range []string{"../x", "a/../../x", "/etc/passwd", "..", "a\x00b", "..\\x"} {
		if _, err := safeJoin(dst, bad); err == nil {
			t.Errorf("safeJoin accepted %q", bad)
		}
	}
	if p, err := safeJoin(dst, "a/b c/d.svg"); err != nil || !strings.HasPrefix(p, dst) {
		t.Errorf("safeJoin rejected valid path: %v %q", err, p)
	}
}

func TestFindLinksAndVersions(t *testing.T) {
	page := `<a href="https://d1.awsstatic.com/x/Icon-package_07312026.abc.zip">a</a>
	<a href="https://d1.awsstatic.com/x/Microsoft-PPTx-toolkits_07312026.abc.zip">b</a>
	<a href="https://a.example/p.zip?x=1&amp;y=2">c</a>`
	links := findZipLinks(page)
	if len(links) != 3 {
		t.Fatalf("links = %v", links)
	}
	v := versionFromURL(`_(\d{8})\.`)([]archiveSpec{{URL: links[0]}}, nil)
	if v != "07312026" {
		t.Errorf("version = %q", v)
	}
	if got := commitVersion("main")(nil, map[string]string{"main": "0123456789abcdef"}); got != "0123456789ab" {
		t.Errorf("commit version = %q", got)
	}
}

func TestResolvePacks(t *testing.T) {
	got, err := resolvePacks([]string{"generic", "aws", "aws"})
	if err != nil || !slices.Equal(got, []string{"aws", "generic"}) {
		t.Errorf("got %v err %v", got, err)
	}
	if _, err := resolvePacks([]string{"nope"}); err == nil {
		t.Error("unknown pack accepted")
	}
	all, _ := resolvePacks(nil)
	if !slices.Equal(all, allPacks) {
		t.Errorf("default packs = %v", all)
	}
}
