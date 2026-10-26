package main

import (
	"path/filepath"
	"strings"
)

type gcpRule struct {
	category string
	tokens   []string
	subs     []string
}

var gcpRules = []gcpRule{
	{"security-identity", []string{"iam", "kms", "hsm", "ekm", "dlp", "ids", "waf"}, []string{"security", "identity", "armor", "key-management", "key-access", "secret", "certificate", "beyondcorp", "binary-authorization", "access-context", "audit", "data-loss", "phishing", "risk-manager", "web-risk", "assured", "policy-analyzer", "permissions", "threat", "mandiant", "secops", "workload-identity"}},
	{"migration", nil, []string{"migrate", "migration", "transfer", "bare-metal"}},
	{"ai-machine-learning", []string{"ai", "automl", "tpu"}, []string{"vision", "speech", "translat", "natural-language", "dialogflow", "vertex", "tensorflow", "inference", "recommendations", "agent-assist", "contact-center", "video-intelligence", "visual-inspection", "retail-api", "data-labeling", "healthcare-nlp", "text-to-speech", "hypercomputer", "media-translation"}},
	{"analytics", nil, []string{"bigquery", "dataflow", "dataproc", "dataprep", "dataplex", "datalab", "looker", "data-studio", "data-fusion", "data-catalog", "data-qna", "analytics-hub", "datashare", "data-layers", "datapol", "datastream", "stream-suite", "real-world-insights"}},
	{"integration", nil, []string{"pubsub", "eventarc", "cloud-tasks", "workflows", "cloud-scheduler", "connectors", "api-gateway", "cloud-endpoints", "apigee", "api-monetization", "api-analytics", "cloud-apis", "developer-portal"}},
	{"databases", []string{"sql"}, []string{"spanner", "bigtable", "firestore", "datastore", "memorystore", "alloydb", "database"}},
	{"storage", nil, []string{"storage", "filestore", "persistent-disk", "local-ssd", "hyperdisk"}},
	{"containers", nil, []string{"kubernetes", "gke", "anthos", "container", "kuberun", "artifact-registry"}},
	{"serverless", nil, []string{"cloud-run", "cloud-functions", "app-engine"}},
	{"compute", nil, []string{"compute-engine", "gce", "batch", "vmware", "gpu", "os-patch", "os-inventory", "os-configuration", "game-servers"}},
	{"networking", nil, []string{"network", "vpc", "virtual-private", "vpn", "dns", "cdn", "load-balanc", "nat", "router", "interconnect", "routes", "firewall", "connectivity", "traffic", "private-service", "service-discovery", "external-ip", "domains", "tier"}},
	{"internet-of-things", []string{"iot"}, nil},
	{"maps-geospatial", nil, []string{"maps", "fleet-engine"}},
	{"marketplace", nil, []string{"marketplace"}},
	{"developer-tools", []string{"code"}, []string{"cloud-build", "cloud-deploy", "source", "test-lab", "tools-for", "sdk"}},
	{"management-tools", nil, []string{"monitoring", "logging", "trace", "debugger", "profiler", "error-reporting", "cloud-ops", "stackdriver", "quotas", "billing", "administration", "deployment-manager", "cloud-shell", "asset", "config", "release-notes", "support", "launcher", "catalog", "onboarding", "free-trial", "my-cloud", "home", "user-preferences", "performance-dashboard", "partner-portal", "producer-portal", "early-access", "advanced-solutions-lab", "quantum-engine", "cloud-generic", "cloud-media-edge", "cloud-for-marketing"}},
}

func gcpCategory(slug string) string {
	toks := tokens(slug)
	for _, r := range gcpRules {
		for _, t := range r.tokens {
			for _, st := range toks {
				if st == t {
					return r.category
				}
			}
		}
		for _, s := range r.subs {
			if strings.Contains(slug, s) {
				return r.category
			}
		}
	}
	return "other"
}

func (ws *workspace) rawGCP() ([]rawIcon, error) {
	var raws []rawIcon

	coreBase := ws.extractDir("gcp", "core")
	if files, err := walkSorted(coreBase, ".svg"); err == nil {
		seen := map[string]bool{}
		for _, rel := range files {
			parts := strings.Split(rel, "/")
			if len(parts) < 3 {
				continue
			}
			folder := parts[len(parts)-3]
			if seen[folder] {
				continue
			}
			seen[folder] = true
			data, err := readFile(filepath.Join(coreBase, filepath.FromSlash(rel)))
			if err != nil {
				return nil, err
			}
			slug := slugify(folder)
			raws = append(raws, rawIcon{Category: gcpCategory(slug), Name: folder, Kind: "service", Format: "svg", Data: data, Source: "core/" + rel})
		}
	}

	legacyBase := ws.extractDir("gcp", "legacy")
	if files, err := walkSorted(legacyBase, ".svg"); err == nil {
		for _, rel := range files {
			parts := strings.Split(rel, "/")
			if len(parts) < 1 {
				continue
			}
			folder := parts[0]
			if len(parts) == 1 {
				folder = strings.TrimSuffix(parts[0], ".svg")
			}
			data, err := readFile(filepath.Join(legacyBase, filepath.FromSlash(rel)))
			if err != nil {
				return nil, err
			}
			slug := slugify(folder)
			r := rawIcon{Category: gcpCategory(slug), Name: folder, Kind: "service", Format: "svg", Data: data, Priority: 1, Supersede: true, Source: "legacy/" + rel}
			switch folder {
			case "virtual_private_cloud":
				r.ID, r.Title, r.Kind, r.Category = "vpc", "Virtual Private Cloud (VPC)", "group", "networking"
				r.Terms = []string{"virtual private cloud", "network"}
				r.Supersede = false
				r.Priority = 0
			case "project":
				r.ID, r.Title, r.Kind, r.Category = "project", "Project", "group", "management-tools"
				r.Terms = []string{"gcp project"}
				r.Supersede = false
				r.Priority = 0
			}
			raws = append(raws, r)
		}
	}
	return raws, nil
}
