package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"slices"
	"strings"
)

var allPacks = []string{"aws", "azure", "gcp", "k8s", "generic"}

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func usage(w io.Writer) {
	printLine(w, "usage: icons <fetch|build|verify|all> [-force] [-fallback packs] [-root dir] [pack...]")
	printLine(w, "packs: "+strings.Join(allPacks, ", "))
}

func run(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		usage(stderr)
		return 2
	}
	cmd := args[0]
	if !slices.Contains([]string{"fetch", "build", "verify", "all"}, cmd) {
		usage(stderr)
		return 2
	}
	fs := flag.NewFlagSet(cmd, flag.ContinueOnError)
	fs.SetOutput(stderr)
	force := fs.Bool("force", false, "download archives again even when cached")
	fallback := fs.String("fallback", "", "comma separated packs to fetch from the diagrams fallback")
	root := fs.String("root", "", "repository root (default: nearest parent containing AGENTS.md)")
	if err := fs.Parse(args[1:]); err != nil {
		return 2
	}
	packs, err := resolvePacks(fs.Args())
	if err != nil {
		printLine(stderr, "error:", err)
		return 2
	}
	ws, err := newWorkspace(*root, stdout)
	if err != nil {
		printLine(stderr, "error:", err)
		return 1
	}
	opts := fetchOptions{force: *force, fallback: map[string]bool{}}
	for _, p := range strings.Split(*fallback, ",") {
		if p = strings.TrimSpace(p); p != "" {
			opts.fallback[p] = true
		}
	}
	var runErr error
	switch cmd {
	case "fetch":
		runErr = ws.fetch(packs, opts)
	case "build":
		runErr = ws.build(packs)
	case "verify":
		runErr = ws.verify()
	case "all":
		if runErr = ws.fetch(packs, opts); runErr == nil {
			if runErr = ws.build(packs); runErr == nil {
				runErr = ws.verify()
			}
		}
	}
	if runErr != nil {
		printLine(stderr, "error:", runErr)
		return 1
	}
	return 0
}

func resolvePacks(args []string) ([]string, error) {
	if len(args) == 0 {
		return slices.Clone(allPacks), nil
	}
	var out []string
	for _, a := range args {
		if !slices.Contains(allPacks, a) {
			return nil, fmt.Errorf("unknown pack %q", a)
		}
		if !slices.Contains(out, a) {
			out = append(out, a)
		}
	}
	slices.SortFunc(out, func(a, b string) int {
		return slices.Index(allPacks, a) - slices.Index(allPacks, b)
	})
	return out, nil
}
