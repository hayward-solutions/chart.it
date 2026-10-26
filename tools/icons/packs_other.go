package main

import (
	"fmt"
	"path"
	"path/filepath"
	"sort"
	"strings"
)

type genericEntry struct {
	category string
	title    string
	terms    []string
}

var genericEntries = map[string]genericEntry{
	"user":              {"people", "User", []string{"person", "account", "profile", "human"}},
	"users":             {"people", "Users", []string{"group", "people", "team", "persons"}},
	"laptop":            {"devices", "Laptop", []string{"computer", "workstation", "pc", "client", "notebook"}},
	"mobile":            {"devices", "Mobile", []string{"phone", "smartphone", "device", "app", "ios", "android"}},
	"browser":           {"devices", "Browser", []string{"web", "client", "chrome", "window", "frontend"}},
	"terminal":          {"devices", "Terminal", []string{"shell", "cli", "console", "command line", "bash"}},
	"server":            {"compute", "Server", []string{"host", "machine", "node", "backend"}},
	"vm":                {"compute", "Virtual Machine", []string{"vm", "instance", "virtual machine", "guest"}},
	"container":         {"compute", "Container", []string{"docker", "oci", "image", "pod"}},
	"function":          {"compute", "Function", []string{"lambda", "serverless", "faas", "cloud function"}},
	"database":          {"data", "Database", []string{"db", "sql", "data store", "rdbms", "persistence"}},
	"storage":           {"data", "Storage", []string{"disk", "volume", "block storage", "drive"}},
	"bucket":            {"data", "Bucket", []string{"object storage", "blob", "s3", "store"}},
	"queue":             {"data", "Queue", []string{"fifo", "message queue", "buffer", "sqs"}},
	"message-bus":       {"data", "Message Bus", []string{"event bus", "broker", "pubsub", "kafka", "messaging"}},
	"cache":             {"data", "Cache", []string{"redis", "memcached", "in-memory", "fast"}},
	"file":              {"data", "File", []string{"document", "blob", "text"}},
	"folder":            {"data", "Folder", []string{"directory", "path", "files"}},
	"log":               {"data", "Log", []string{"logs", "logging", "audit", "records"}},
	"firewall":          {"network", "Firewall", []string{"security", "waf", "filter", "protection"}},
	"load-balancer":     {"network", "Load Balancer", []string{"lb", "balancer", "proxy", "traffic", "alb", "nlb"}},
	"router":            {"network", "Router", []string{"routing", "gateway", "network"}},
	"switch":            {"network", "Switch", []string{"network switch", "lan", "ethernet"}},
	"internet":          {"network", "Internet", []string{"web", "wan", "public", "cloud"}},
	"cloud":             {"network", "Cloud", []string{"saas", "hosted", "remote"}},
	"globe":             {"network", "Globe", []string{"world", "web", "earth", "global", "region"}},
	"cdn":               {"network", "CDN", []string{"content delivery", "edge", "cache"}},
	"dns":               {"network", "DNS", []string{"domain", "name server", "resolver", "nameserver"}},
	"vpn":               {"network", "VPN", []string{"tunnel", "secure", "private network"}},
	"lock":              {"security", "Lock", []string{"security", "private", "secure", "encrypted"}},
	"key":               {"security", "Key", []string{"secret", "credential", "encryption", "kms"}},
	"certificate":       {"security", "Certificate", []string{"tls", "ssl", "cert", "pki", "trust"}},
	"api":               {"integration", "API", []string{"rest", "endpoint", "http", "interface", "graphql"}},
	"webhook":           {"integration", "Webhook", []string{"callback", "hook", "http callback", "event"}},
	"email":             {"integration", "Email", []string{"mail", "smtp", "message", "inbox"}},
	"cron":              {"operations", "Cron", []string{"scheduler", "job", "schedule", "timer", "batch"}},
	"clock":             {"operations", "Clock", []string{"time", "timer", "schedule", "delay"}},
	"monitoring":        {"operations", "Monitoring", []string{"metrics", "observability", "dashboard", "telemetry"}},
	"alert":             {"operations", "Alert", []string{"alarm", "notification", "warning", "pager", "incident"}},
	"git":               {"development", "Git", []string{"repository", "version control", "vcs", "repo", "source"}},
	"group-datacenter":  {"groups", "Data Center", []string{"datacenter", "on premises", "on-prem", "building"}},
	"group-network":     {"groups", "Network", []string{"lan", "network boundary", "segment"}},
	"group-subnet":      {"groups", "Subnet", []string{"network", "cidr", "segment"}},
	"group-security":    {"groups", "Security Group", []string{"firewall", "security boundary"}},
	"group-cluster":     {"groups", "Cluster", []string{"nodes", "pool", "fleet"}},
	"group-environment": {"groups", "Environment", []string{"stage", "production", "staging", "dev"}},
}

func rawGeneric() ([]rawIcon, error) {
	entries, err := assets.ReadDir("generic")
	if err != nil {
		return nil, err
	}
	var raws []rawIcon
	for _, e := range entries {
		if e.IsDir() || path.Ext(e.Name()) != ".svg" {
			continue
		}
		id := strings.TrimSuffix(e.Name(), ".svg")
		data, err := assets.ReadFile("generic/" + e.Name())
		if err != nil {
			return nil, err
		}
		meta, ok := genericEntries[id]
		if !ok {
			return nil, fmt.Errorf("generic icon %q has no entry in genericEntries", id)
		}
		kind := "service"
		if strings.HasPrefix(id, "group-") {
			kind = "group"
		}
		raws = append(raws, rawIcon{Category: meta.category, Name: id, ID: id, Title: meta.title, Kind: kind, Format: "svg", Data: data, Terms: meta.terms, Source: "generic/" + e.Name()})
	}
	sort.Slice(raws, func(i, j int) bool { return raws[i].ID < raws[j].ID })
	return raws, nil
}

func (ws *workspace) rawDiagrams(pack string) ([]rawIcon, error) {
	provider := diagramsProviders[pack]
	base := filepath.Join(ws.extractDir(pack, "diagrams"), "resources", provider)
	files, err := walkSorted(base, ".png")
	if err != nil {
		return nil, err
	}
	var raws []rawIcon
	for _, rel := range files {
		parts := strings.Split(rel, "/")
		cat := "general"
		if len(parts) > 1 {
			cat = parts[0]
		}
		stem := strings.TrimSuffix(parts[len(parts)-1], ".png")
		data, err := readFile(filepath.Join(base, filepath.FromSlash(rel)))
		if err != nil {
			return nil, err
		}
		raws = append(raws, rawIcon{Category: cat, Name: stem, Kind: "service", Format: "png", Data: data, Source: rel})
	}
	return raws, nil
}
