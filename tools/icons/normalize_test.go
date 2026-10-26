package main

import (
	"bytes"
	"strings"
	"testing"
)

const inkscapeSample = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Created with Inkscape -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
  xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="18mm" height="17.5mm" viewBox="0 0 18 17.5" version="1.1" id="svg1" inkscape:version="0.91">
  <title>Pod</title>
  <desc>desc</desc>
  <metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></metadata>
  <sodipodi:namedview id="base" pagecolor="#ffffff"/>
  <defs id="defs1">
    <linearGradient id="g1"><stop offset="0" stop-color="#112233"/></linearGradient>
  </defs>
  <g id="unused" inkscape:label="x">
    <path id="p1" d="M0 0
      L10 10" fill="url(#g1)"/>
    <use xlink:href="#p1"/>
  </g>
</svg>`

func TestNormaliseStripsEditorNoise(t *testing.T) {
	out, err := normaliseSVG([]byte(inkscapeSample), "iabc123")
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	for _, bad := range []string{"inkscape", "sodipodi", "<title", "<desc", "<metadata", "<!--", "width=", "height=", "unused", "rdf", "version=", "id=\"svg1\""} {
		if strings.Contains(s, bad) {
			t.Errorf("output still contains %q:\n%s", bad, s)
		}
	}
	for _, want := range []string{`viewBox="0 0 18 17.5"`, `xmlns="http://www.w3.org/2000/svg"`, `xmlns:xlink=`, `id="iabc123-0"`, `fill="url(#iabc123-0)"`, `d="M0 0 L10 10"`} {
		if !strings.Contains(s, want) {
			t.Errorf("output missing %q:\n%s", want, s)
		}
	}
	if !strings.Contains(s, `href="#iabc123-`) {
		t.Errorf("href not rewritten:\n%s", s)
	}
	if err := checkSVGFile(out); err != nil {
		t.Errorf("normalised output invalid: %v", err)
	}
}

func TestNormaliseAddsViewBoxFromSize(t *testing.T) {
	out, err := normaliseSVG([]byte(`<svg xmlns="http://www.w3.org/2000/svg" width="24px" height="12"><rect width="1" height="1"/></svg>`), "ix")
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	if !strings.Contains(s, `viewBox="0 0 24 12"`) {
		t.Errorf("viewBox not derived: %s", s)
	}
	if !strings.Contains(s, `<rect width="1" height="1"/>`) {
		t.Errorf("child dimensions must survive: %s", s)
	}
	if strings.Contains(s, `<svg xmlns="http://www.w3.org/2000/svg" width`) {
		t.Errorf("root width kept: %s", s)
	}
}

func TestNormaliseRejects(t *testing.T) {
	big := strings.Repeat("A", maxDataURI+10)
	cases := map[string]string{
		"script":         `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script>alert(1)</script></svg>`,
		"foreignObject":  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><foreignObject/></svg>`,
		"external href":  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1 1"><use xlink:href="https://evil.example/x.svg#a"/></svg>`,
		"external image": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><image href="http://evil.example/a.png"/></svg>`,
		"big data uri":   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><image href="data:image/png;base64,` + big + `"/></svg>`,
		"event handler":  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" onload="x()"/>`,
		"external url":   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect fill="url(http://evil.example/p)"/></svg>`,
		"css import":     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><style>@import url(http://evil.example/a.css);</style></svg>`,
		"no size":        `<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`,
		"not svg":        `<html xmlns="http://www.w3.org/1999/xhtml"/>`,
		"malformed":      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><g></svg>`,
		"javascript":     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><a href="javascript:alert(1)"/></svg>`,
	}
	for name, in := range cases {
		if _, err := normaliseSVG([]byte(in), "ix"); err == nil {
			t.Errorf("%s: expected rejection", name)
		}
	}
}

func TestNormaliseAllowsSmallDataURI(t *testing.T) {
	in := `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><image href="data:image/png;base64,AAAA" width="1" height="1"/></svg>`
	if _, err := normaliseSVG([]byte(in), "ix"); err != nil {
		t.Fatalf("small data URI rejected: %v", err)
	}
}

func TestNormaliseScopesClasses(t *testing.T) {
	in := `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><defs><style>
	.st0 { fill: #4285f4; }
	.st1{fill:#ea4335}
	</style></defs><rect class="st0"/><rect class="st1 st0"/></svg>`
	out, err := normaliseSVG([]byte(in), "iq1")
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	for _, want := range []string{`.iq1-st0{ fill: #4285f4; }`, `class="iq1-st0"`, `class="iq1-st1 iq1-st0"`} {
		if !strings.Contains(strings.ReplaceAll(s, " ", ""), strings.ReplaceAll(want, " ", "")) {
			t.Errorf("missing %q in %s", want, s)
		}
	}
}

func TestNormaliseIdempotent(t *testing.T) {
	first, err := normaliseSVG([]byte(inkscapeSample), "iabc123")
	if err != nil {
		t.Fatal(err)
	}
	second, err := normaliseSVG(first, "iabc123")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(first, second) {
		t.Errorf("normalisation is not idempotent:\n%s\n%s", first, second)
	}
	again, _ := normaliseSVG([]byte(inkscapeSample), "iabc123")
	if !bytes.Equal(first, again) {
		t.Error("normalisation is not deterministic")
	}
}

func TestNormaliseKeepsTextWhitespace(t *testing.T) {
	in := `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><text xml:space="preserve"><tspan>a b</tspan> <tspan>c</tspan></text></svg>`
	out, err := normaliseSVG([]byte(in), "ix")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(out), `<tspan>a b</tspan> <tspan>c</tspan>`) {
		t.Errorf("text whitespace lost: %s", out)
	}
}

func TestDominantColour(t *testing.T) {
	svg := []byte(`<svg><rect fill="#ED7100"/><path fill="#FFFFFF"/><path fill="#fff"/><path style="fill:#4285f4"/><path fill="#4285F4"/></svg>`)
	if got := dominantColour(svg); got != "#4285F4" {
		t.Errorf("dominantColour = %q", got)
	}
	if got := dominantColour([]byte(`<svg><path fill="none" stroke="currentColor"/></svg>`)); got != "" {
		t.Errorf("dominantColour = %q, want empty", got)
	}
	if got := dominantColour([]byte(`<svg><path fill="#abc"/></svg>`)); got != "#AABBCC" {
		t.Errorf("dominantColour = %q", got)
	}
}
