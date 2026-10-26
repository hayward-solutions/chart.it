package main

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
)

var azurePrefixRe = regexp.MustCompile(`^\d+\s*-icon-service-`)

type azureBadge struct {
	id    string
	title string
	terms []string
}

var azureBadges = map[string]azureBadge{
	"subscriptions":    {"subscription", "Subscription", []string{"subscriptions", "billing"}},
	"resource-groups":  {"resource-group", "Resource Group", []string{"resource groups", "rg"}},
	"virtual-networks": {"vnet", "Virtual Network", []string{"virtual networks", "vnet", "network"}},
}

var azureLowPriorityCategories = map[string]bool{"other": true, "new-icons": true, "azure-ecosystem": true}

func (ws *workspace) rawAzure() ([]rawIcon, error) {
	base := ws.extractDir("azure", "main")
	files, err := walkSorted(base, ".svg")
	if err != nil {
		return nil, err
	}
	var raws []rawIcon
	for _, rel := range files {
		parts := strings.Split(rel, "/")
		idx := -1
		for i, p := range parts {
			if p == "Icons" {
				idx = i
				break
			}
		}
		if idx < 0 || len(parts) < idx+3 {
			continue
		}
		cat := slugify(parts[idx+1])
		stem := azurePrefixRe.ReplaceAllString(strings.TrimSuffix(parts[len(parts)-1], ".svg"), "")
		data, err := readFile(filepath.Join(base, filepath.FromSlash(rel)))
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", rel, err)
		}
		r := rawIcon{Category: cat, Name: stem, Kind: "service", Format: "svg", Data: data, Source: rel}
		if azureLowPriorityCategories[cat] {
			r.Priority = 1
		}
		if b, ok := azureBadges[slugify(stem)]; ok {
			r.ID = b.id
			r.Title = b.title
			r.Kind = "group"
			r.Terms = b.terms
		}
		raws = append(raws, r)
	}
	return raws, nil
}
