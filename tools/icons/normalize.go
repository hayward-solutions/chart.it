package main

import (
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

const (
	svgNS      = "http://www.w3.org/2000/svg"
	xlinkNS    = "http://www.w3.org/1999/xlink"
	xmlNS      = "http://www.w3.org/XML/1998/namespace"
	maxDataURI = 50 * 1024
)

type svgAttr struct {
	name  string
	value string
}

type svgNode struct {
	name     string
	attrs    []svgAttr
	children []*svgNode
	text     string
	isText   bool
}

var (
	urlRefRe      = regexp.MustCompile(`(?i)url\(\s*(['"]?)([^)'"]*)['"]?\s*\)`)
	urlHashRe     = regexp.MustCompile(`url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)`)
	cssIDRe       = regexp.MustCompile(`#([A-Za-z_][\w-]*)`)
	cssClassRe    = regexp.MustCompile(`\.([A-Za-z_][\w-]*)`)
	spaceRe       = regexp.MustCompile(`\s+`)
	enableBgRe    = regexp.MustCompile(`(?i)enable-background\s*:[^;]*;?`)
	lengthRe      = regexp.MustCompile(`^\s*([0-9]*\.?[0-9]+)\s*(px|pt|mm|cm|in|pc|em|ex)?\s*$`)
	colourRe      = regexp.MustCompile(`(?i)(?:fill|stop-color)\s*[:=]\s*["']?\s*#([0-9a-f]{6}|[0-9a-f]{3})\b`)
	droppedRootAt = map[string]bool{
		"width": true, "height": true, "x": true, "y": true, "version": true, "baseProfile": true,
		"id": true, "xml:space": true, "enable-background": true, "data-name": true,
	}
	droppedElements = map[string]bool{"title": true, "desc": true, "metadata": true}
	rejectElements  = map[string]bool{"script": true, "foreignobject": true}
	textElements    = map[string]bool{"text": true, "tspan": true, "textpath": true}
)

func parseSVG(data []byte) (*svgNode, error) {
	d := xml.NewDecoder(bytes.NewReader(data))
	d.Strict = true
	d.Entity = xml.HTMLEntity
	var root *svgNode
	var stack []*svgNode
	for {
		tok, err := d.Token()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("parse: %w", err)
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if t.Name.Space != "" && t.Name.Space != svgNS {
				if err := d.Skip(); err != nil {
					return nil, fmt.Errorf("parse: %w", err)
				}
				continue
			}
			lower := strings.ToLower(t.Name.Local)
			if rejectElements[lower] {
				return nil, fmt.Errorf("forbidden element <%s>", t.Name.Local)
			}
			if droppedElements[lower] {
				if err := d.Skip(); err != nil {
					return nil, fmt.Errorf("parse: %w", err)
				}
				continue
			}
			attrs, err := convertAttrs(t.Name.Local, t.Attr)
			if err != nil {
				return nil, err
			}
			n := &svgNode{name: t.Name.Local, attrs: attrs}
			if len(stack) == 0 {
				if root != nil {
					return nil, errors.New("multiple root elements")
				}
				if t.Name.Local != "svg" {
					return nil, fmt.Errorf("root element is <%s>, not <svg>", t.Name.Local)
				}
				root = n
			} else {
				parent := stack[len(stack)-1]
				parent.children = append(parent.children, n)
			}
			stack = append(stack, n)
		case xml.EndElement:
			if len(stack) == 0 {
				return nil, errors.New("unbalanced end element")
			}
			stack = stack[:len(stack)-1]
		case xml.CharData:
			if len(stack) == 0 {
				continue
			}
			parent := stack[len(stack)-1]
			if k := len(parent.children); k > 0 && parent.children[k-1].isText {
				parent.children[k-1].text += string(t)
			} else {
				parent.children = append(parent.children, &svgNode{isText: true, text: string(t)})
			}
		}
	}
	if root == nil {
		return nil, errors.New("no <svg> root element")
	}
	return root, nil
}

func convertAttrs(elem string, in []xml.Attr) ([]svgAttr, error) {
	var out []svgAttr
	for _, a := range in {
		var name string
		switch a.Name.Space {
		case "":
			if a.Name.Local == "xmlns" {
				continue
			}
			name = a.Name.Local
		case "xmlns":
			continue
		case xlinkNS:
			name = "xlink:" + a.Name.Local
		case xmlNS:
			name = "xml:" + a.Name.Local
		case svgNS:
			name = a.Name.Local
		default:
			continue
		}
		value := spaceRe.ReplaceAllString(strings.TrimSpace(a.Value), " ")
		if err := checkAttr(elem, name, value); err != nil {
			return nil, err
		}
		out = append(out, svgAttr{name: name, value: value})
	}
	return out, nil
}

func checkAttr(elem, name, value string) error {
	lname := strings.ToLower(name)
	if strings.HasPrefix(lname, "on") {
		return fmt.Errorf("event handler attribute %q", name)
	}
	if strings.Contains(strings.ToLower(value), "javascript:") {
		return fmt.Errorf("javascript URL in %q", name)
	}
	if lname == "href" || lname == "xlink:href" {
		switch {
		case strings.HasPrefix(value, "#"):
		case strings.EqualFold(elem, "image") && strings.HasPrefix(strings.ToLower(value), "data:"):
			if len(value) > maxDataURI {
				return fmt.Errorf("embedded image data URI is %d bytes (limit %d)", len(value), maxDataURI)
			}
		default:
			return fmt.Errorf("external reference in %q", name)
		}
	}
	return checkURLRefs(value)
}

func checkURLRefs(s string) error {
	for _, m := range urlRefRe.FindAllStringSubmatch(s, -1) {
		ref := strings.TrimSpace(m[2])
		switch {
		case strings.HasPrefix(ref, "#"):
		case strings.HasPrefix(strings.ToLower(ref), "data:"):
			if len(ref) > maxDataURI {
				return fmt.Errorf("embedded data URI is %d bytes (limit %d)", len(ref), maxDataURI)
			}
		default:
			return fmt.Errorf("external url() reference %q", truncate(ref, 40))
		}
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func normaliseSVG(data []byte, prefix string) ([]byte, error) {
	root, err := parseSVG(data)
	if err != nil {
		return nil, err
	}
	if err := checkStyles(root); err != nil {
		return nil, err
	}
	pruneEmpty(root)
	if err := normaliseRoot(root); err != nil {
		return nil, err
	}
	rewriteIdentifiers(root, prefix)
	return serialiseSVG(root), nil
}

func checkStyles(n *svgNode) error {
	if n.isText {
		return nil
	}
	if strings.EqualFold(n.name, "style") {
		var css strings.Builder
		for _, c := range n.children {
			css.WriteString(c.text)
		}
		text := css.String()
		if strings.Contains(strings.ToLower(text), "@import") {
			return errors.New("@import in stylesheet")
		}
		if err := checkURLRefs(text); err != nil {
			return err
		}
	}
	for _, c := range n.children {
		if err := checkStyles(c); err != nil {
			return err
		}
	}
	return nil
}

func pruneEmpty(n *svgNode) {
	kept := n.children[:0]
	for _, c := range n.children {
		if c.isText {
			kept = append(kept, c)
			continue
		}
		pruneEmpty(c)
		if strings.EqualFold(c.name, "defs") && len(c.children) == 0 {
			continue
		}
		if strings.EqualFold(c.name, "style") && strings.TrimSpace(textOf(c)) == "" {
			continue
		}
		kept = append(kept, c)
	}
	n.children = kept
}

func textOf(n *svgNode) string {
	var b strings.Builder
	for _, c := range n.children {
		if c.isText {
			b.WriteString(c.text)
		}
	}
	return b.String()
}

func getAttr(n *svgNode, name string) (string, bool) {
	for _, a := range n.attrs {
		if a.name == name {
			return a.value, true
		}
	}
	return "", false
}

func normaliseRoot(root *svgNode) error {
	viewBox, hasVB := getAttr(root, "viewBox")
	if hasVB {
		parts := strings.FieldsFunc(viewBox, func(r rune) bool { return r == ' ' || r == ',' })
		if len(parts) != 4 {
			return fmt.Errorf("invalid viewBox %q", viewBox)
		}
		var vals [4]float64
		for i, p := range parts {
			v, err := strconv.ParseFloat(p, 64)
			if err != nil {
				return fmt.Errorf("invalid viewBox %q", viewBox)
			}
			vals[i] = v
		}
		if vals[2] <= 0 || vals[3] <= 0 {
			return fmt.Errorf("empty viewBox %q", viewBox)
		}
		viewBox = strings.Join(parts, " ")
	} else {
		w, wok := getAttr(root, "width")
		h, hok := getAttr(root, "height")
		wv, werr := parseLength(w)
		hv, herr := parseLength(h)
		if !wok || !hok || werr != nil || herr != nil || wv <= 0 || hv <= 0 {
			return errors.New("no viewBox and no usable width/height")
		}
		viewBox = "0 0 " + strconv.FormatFloat(wv, 'f', -1, 64) + " " + strconv.FormatFloat(hv, 'f', -1, 64)
	}
	attrs := []svgAttr{{name: "viewBox", value: viewBox}}
	for _, a := range root.attrs {
		if a.name == "viewBox" || droppedRootAt[a.name] {
			continue
		}
		if a.name == "style" {
			v := strings.TrimSpace(strings.Trim(enableBgRe.ReplaceAllString(a.value, ""), "; "))
			if v == "" {
				continue
			}
			a.value = v
		}
		attrs = append(attrs, a)
	}
	root.attrs = attrs
	return nil
}

func parseLength(s string) (float64, error) {
	m := lengthRe.FindStringSubmatch(s)
	if m == nil {
		return 0, fmt.Errorf("unsupported length %q", s)
	}
	return strconv.ParseFloat(m[1], 64)
}

type walkFn func(n *svgNode)

func walk(n *svgNode, fn walkFn) {
	fn(n)
	for _, c := range n.children {
		walk(c, fn)
	}
}

func rewriteIdentifiers(root *svgNode, prefix string) {
	var ids []string
	idSeen := map[string]bool{}
	referenced := map[string]bool{}
	classes := map[string]bool{}
	hasStyle := false

	walk(root, func(n *svgNode) {
		if n.isText {
			return
		}
		if strings.EqualFold(n.name, "style") {
			hasStyle = true
		}
		for _, a := range n.attrs {
			switch a.name {
			case "id":
				if !idSeen[a.value] {
					idSeen[a.value] = true
					ids = append(ids, a.value)
				}
				continue
			case "class":
				for _, c := range strings.Fields(a.value) {
					classes[c] = true
				}
				continue
			case "href", "xlink:href":
				if strings.HasPrefix(a.value, "#") {
					referenced[a.value[1:]] = true
				}
			}
			for _, m := range urlHashRe.FindAllStringSubmatch(a.value, -1) {
				referenced[m[1]] = true
			}
		}
	})
	walk(root, func(n *svgNode) {
		if !n.isText {
			return
		}
		for _, m := range urlHashRe.FindAllStringSubmatch(n.text, -1) {
			referenced[m[1]] = true
		}
		for _, m := range cssIDRe.FindAllStringSubmatch(n.text, -1) {
			if idSeen[m[1]] {
				referenced[m[1]] = true
			}
		}
	})

	idMap := map[string]string{}
	for _, id := range ids {
		if referenced[id] {
			idMap[id] = prefix + "-" + strconv.Itoa(len(idMap))
		}
	}
	classMap := map[string]string{}
	if hasStyle {
		for c := range classes {
			if strings.HasPrefix(c, prefix+"-") {
				classMap[c] = c
			} else {
				classMap[c] = prefix + "-" + c
			}
		}
	}

	rewriteRefs := func(s string) string {
		return urlHashRe.ReplaceAllStringFunc(s, func(m string) string {
			sub := urlHashRe.FindStringSubmatch(m)
			if nid, ok := idMap[sub[1]]; ok {
				return "url(#" + nid + ")"
			}
			return m
		})
	}
	idDone := map[string]bool{}
	walk(root, func(n *svgNode) {
		if n.isText {
			return
		}
		attrs := n.attrs[:0]
		for _, a := range n.attrs {
			switch a.name {
			case "id":
				nid, ok := idMap[a.value]
				if !ok || idDone[a.value] {
					continue
				}
				idDone[a.value] = true
				a.value = nid
			case "class":
				if hasStyle {
					fields := strings.Fields(a.value)
					for i, f := range fields {
						fields[i] = classMap[f]
					}
					a.value = strings.Join(fields, " ")
				}
			case "href", "xlink:href":
				if strings.HasPrefix(a.value, "#") {
					if nid, ok := idMap[a.value[1:]]; ok {
						a.value = "#" + nid
					}
				}
			default:
				a.value = rewriteRefs(a.value)
			}
			attrs = append(attrs, a)
		}
		n.attrs = attrs
	})
	walk(root, func(n *svgNode) {
		if !n.isText {
			return
		}
		t := rewriteRefs(n.text)
		t = cssIDRe.ReplaceAllStringFunc(t, func(m string) string {
			if nid, ok := idMap[m[1:]]; ok {
				return "#" + nid
			}
			return m
		})
		if hasStyle {
			t = cssClassRe.ReplaceAllStringFunc(t, func(m string) string {
				if nc, ok := classMap[m[1:]]; ok {
					return "." + nc
				}
				return m
			})
		}
		n.text = t
	})
}

func serialiseSVG(root *svgNode) []byte {
	usesXlink := false
	walk(root, func(n *svgNode) {
		for _, a := range n.attrs {
			if strings.HasPrefix(a.name, "xlink:") {
				usesXlink = true
			}
		}
	})
	var b strings.Builder
	b.WriteString(`<svg xmlns="` + svgNS + `"`)
	if usesXlink {
		b.WriteString(` xmlns:xlink="` + xlinkNS + `"`)
	}
	writeAttrs(&b, root.attrs)
	if len(root.children) == 0 {
		b.WriteString("/>\n")
		return []byte(b.String())
	}
	b.WriteByte('>')
	writeChildren(&b, root, false)
	b.WriteString("</svg>\n")
	return []byte(b.String())
}

func writeAttrs(b *strings.Builder, attrs []svgAttr) {
	for _, a := range attrs {
		b.WriteByte(' ')
		b.WriteString(a.name)
		b.WriteString(`="`)
		b.WriteString(escapeAttr(a.value))
		b.WriteByte('"')
	}
}

func writeChildren(b *strings.Builder, parent *svgNode, keepSpace bool) {
	lower := strings.ToLower(parent.name)
	inText := keepSpace || textElements[lower]
	isStyle := lower == "style"
	for _, c := range parent.children {
		if c.isText {
			switch {
			case isStyle:
				b.WriteString(escapeText(strings.TrimSpace(spaceRe.ReplaceAllString(c.text, " "))))
			case inText:
				b.WriteString(escapeText(c.text))
			}
			continue
		}
		b.WriteByte('<')
		b.WriteString(c.name)
		writeAttrs(b, c.attrs)
		if len(c.children) == 0 {
			b.WriteString("/>")
			continue
		}
		b.WriteByte('>')
		writeChildren(b, c, inText)
		b.WriteString("</" + c.name + ">")
	}
}

func escapeAttr(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;")
	return r.Replace(s)
}

func escapeText(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;")
	return r.Replace(s)
}

func dominantColour(svg []byte) string {
	counts := map[string]int{}
	for _, m := range colourRe.FindAllSubmatch(svg, -1) {
		hex := strings.ToUpper(string(m[1]))
		if len(hex) == 3 {
			hex = string([]byte{hex[0], hex[0], hex[1], hex[1], hex[2], hex[2]})
		}
		if hex == "FFFFFF" {
			continue
		}
		counts[hex]++
	}
	keys := make([]string, 0, len(counts))
	for k := range counts {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	best, bestN := "", 0
	for _, k := range keys {
		if counts[k] > bestN {
			best, bestN = k, counts[k]
		}
	}
	if best == "" {
		return ""
	}
	return "#" + best
}

func checkSVGFile(data []byte) error {
	d := xml.NewDecoder(bytes.NewReader(data))
	d.Strict = true
	d.Entity = xml.HTMLEntity
	seenRoot := false
	depth := 0
	for {
		tok, err := d.Token()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if depth == 0 {
				if t.Name.Local != "svg" {
					return fmt.Errorf("root element is <%s>", t.Name.Local)
				}
				seenRoot = true
				hasVB := false
				for _, a := range t.Attr {
					if a.Name.Local == "viewBox" {
						hasVB = true
					}
				}
				if !hasVB {
					return errors.New("root <svg> has no viewBox")
				}
			}
			depth++
		case xml.EndElement:
			depth--
		}
	}
	if !seenRoot {
		return errors.New("no <svg> root element")
	}
	return nil
}
