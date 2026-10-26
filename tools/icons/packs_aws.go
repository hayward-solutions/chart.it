package main

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
)

var awsServiceAlias = map[string]string{
	"simple-storage-service":             "s3",
	"simple-queue-service":               "sqs",
	"simple-notification-service":        "sns",
	"simple-email-service":               "ses",
	"elastic-block-store":                "ebs",
	"elastic-container-registry":         "ecr",
	"elastic-container-service":          "ecs",
	"elastic-kubernetes-service":         "eks",
	"identity-and-access-management":     "iam",
	"key-management-service":             "kms",
	"virtual-private-cloud":              "vpc",
	"elastic-load-balancing":             "elb",
	"managed-streaming-for-apache-kafka": "msk",
	"opensearch-service":                 "opensearch",
	"cloud-development-kit":              "cdk",
	"command-line-interface":             "cli",
	"systems-manager":                    "ssm",
}

var awsCategoryAlias = map[string]string{
	"iot":                   "internet-of-things",
	"management-governance": "management-tools",
	"general-icons":         "general",
}

type awsGroup struct {
	id    string
	title string
}

var awsGroups = map[string]awsGroup{
	"AWS-Account":                   {"group-account", "AWS Account"},
	"AWS-Cloud":                     {"group-cloud", "AWS Cloud"},
	"AWS-Cloud-logo":                {"group-cloud-logo", "AWS Cloud (logo)"},
	"AWS-IoT-Greengrass-Deployment": {"group-iot-greengrass-deployment", "AWS IoT Greengrass Deployment"},
	"Auto-Scaling-group":            {"group-auto-scaling", "Auto Scaling Group"},
	"Corporate-data-center":         {"group-corporate-data-center", "Corporate Data Center"},
	"EC2-instance-contents":         {"group-ec2-instance-contents", "EC2 Instance Contents"},
	"Private-subnet":                {"group-private-subnet", "Private Subnet"},
	"Public-subnet":                 {"group-public-subnet", "Public Subnet"},
	"Region":                        {"group-region", "Region"},
	"Server-contents":               {"group-server-contents", "Server Contents"},
	"Spot-Fleet":                    {"group-spot-fleet", "Spot Fleet"},
	"Virtual-private-cloud-VPC":     {"group-vpc", "Virtual Private Cloud (VPC)"},
}

var awsGroupExtraTerms = map[string][]string{
	"group-account":        {"account", "aws account"},
	"group-cloud":          {"aws cloud", "cloud"},
	"group-region":         {"region", "location"},
	"group-vpc":            {"vpc", "virtual private cloud", "network"},
	"group-auto-scaling":   {"auto scaling", "scaling", "asg"},
	"group-public-subnet":  {"subnet", "public"},
	"group-private-subnet": {"subnet", "private"},
}

func awsShort(bareSlug string) (string, bool) {
	if s, ok := awsServiceAlias[bareSlug]; ok {
		return s, true
	}
	for long, short := range awsServiceAlias {
		if strings.HasPrefix(bareSlug, long+"-") {
			return short + strings.TrimPrefix(bareSlug, long), true
		}
	}
	return bareSlug, false
}

func awsNames(stem string) (name, title string, extra []string) {
	parts := strings.Split(stem, "_")
	service := parts[0]
	bare := slugify(stripAny(service, "Amazon-", "AWS-"))
	short, aliased := awsShort(bare)
	nameParts := []string{short}
	titleParts := []string{titleCase(service)}
	if aliased {
		extra = append(extra, strings.ReplaceAll(bare, "-", " "))
	}
	for _, p := range parts[1:] {
		nameParts = append(nameParts, p)
		titleParts = append(titleParts, titleCase(p))
	}
	return strings.Join(nameParts, " "), strings.Join(titleParts, " "), extra
}

func awsCategory(dir, prefix string) string {
	c := slugify(strings.TrimPrefix(dir, prefix))
	if a, ok := awsCategoryAlias[c]; ok {
		return a
	}
	return c
}

var resourceSizeRe = regexp.MustCompile(`_(Light|Dark)$`)

func (ws *workspace) rawAWS() ([]rawIcon, error) {
	base := ws.extractDir("aws", "main")
	svcRoot, ok := findSubdir(base, "Architecture-Service-Icons")
	if !ok {
		return nil, fmt.Errorf("Architecture-Service-Icons folder not found in %s", base)
	}
	var raws []rawIcon

	files, err := walkSorted(svcRoot, ".svg")
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	for _, size := range []string{"64", "48"} {
		for _, rel := range files {
			parts := strings.Split(rel, "/")
			if len(parts) != 3 || parts[1] != size {
				continue
			}
			stem := trimSizeSuffix(stripAny(strings.TrimSuffix(parts[2], ".svg"), "Arch_"))
			if strings.HasSuffix(stem, "_Dark") {
				continue
			}
			stem = strings.TrimSuffix(stem, "_Light")
			cat := awsCategory(parts[0], "Arch_")
			key := cat + "/" + stem
			if seen[key] {
				continue
			}
			seen[key] = true
			data, err := readFile(filepath.Join(svcRoot, filepath.FromSlash(rel)))
			if err != nil {
				return nil, err
			}
			name, title, extra := awsNames(stem)
			raws = append(raws, rawIcon{Category: cat, Name: name, Title: title, Kind: "service", Format: "svg", Data: data, Terms: extra, Source: rel})
		}
	}

	if resRoot, ok := findSubdir(base, "Resource-Icons"); ok {
		files, err := walkSorted(resRoot, ".svg")
		if err != nil {
			return nil, err
		}
		seenRes := map[string]bool{}
		for _, rel := range files {
			parts := strings.Split(rel, "/")
			if len(parts) < 2 || strings.Contains(rel, "Dark") {
				continue
			}
			stem := strings.TrimSuffix(parts[len(parts)-1], ".svg")
			stem = trimSizeSuffix(resourceSizeRe.ReplaceAllString(trimSizeSuffix(stripAny(stem, "Res_")), ""))
			cat := awsCategory(parts[0], "Res_")
			key := cat + "/" + stem
			if seenRes[key] {
				continue
			}
			seenRes[key] = true
			data, err := readFile(filepath.Join(resRoot, filepath.FromSlash(rel)))
			if err != nil {
				return nil, err
			}
			name, title, extra := awsNames(stem)
			raws = append(raws, rawIcon{Category: cat, Name: name, Title: title, Kind: "resource", Format: "svg", Data: data, Terms: extra, Priority: 1, Source: rel})
		}
	} else {
		ws.logln("  warning: Resource-Icons folder not found")
	}

	if grpRoot, ok := findSubdir(base, "Architecture-Group-Icons"); ok {
		files, err := walkSorted(grpRoot, ".svg")
		if err != nil {
			return nil, err
		}
		for _, rel := range files {
			if strings.Contains(rel, "Dark") || strings.Contains(rel, "/") {
				continue
			}
			stem := trimSizeSuffix(strings.TrimSuffix(rel, ".svg"))
			data, err := readFile(filepath.Join(grpRoot, filepath.FromSlash(rel)))
			if err != nil {
				return nil, err
			}
			g, known := awsGroups[stem]
			if !known {
				g = awsGroup{id: "group-" + slugify(stem), title: titleCase(stem)}
			}
			raws = append(raws, rawIcon{Category: "groups", Name: g.id, ID: g.id, Title: g.title, Kind: "group", Format: "svg", Data: data, Terms: awsGroupExtraTerms[g.id], Priority: 2, Source: rel})
		}
	} else {
		ws.logln("  warning: Architecture-Group-Icons folder not found")
	}
	return raws, nil
}
