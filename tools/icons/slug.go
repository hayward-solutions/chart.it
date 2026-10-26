package main

import (
	"strings"
	"unicode"
)

var acronyms = map[string]string{
	"ai": "AI", "api": "API", "apis": "APIs", "aws": "AWS", "cdn": "CDN", "cli": "CLI", "cpu": "CPU",
	"dns": "DNS", "ebs": "EBS", "ec2": "EC2", "ecs": "ECS", "efs": "EFS", "eks": "EKS", "ekm": "EKM",
	"elb": "ELB", "emr": "EMR", "gce": "GCE", "gcp": "GCP", "gke": "GKE", "gpu": "GPU", "hsm": "HSM",
	"iam": "IAM", "ids": "IDs", "iot": "IoT", "ip": "IP", "ml": "ML", "nat": "NAT", "nlp": "NLP",
	"os": "OS", "rds": "RDS", "s3": "S3", "sdk": "SDK", "sdks": "SDKs", "sql": "SQL", "sqs": "SQS",
	"sns": "SNS", "ssd": "SSD", "ssl": "SSL", "tls": "TLS", "tpu": "TPU", "ui": "UI", "url": "URL",
	"vm": "VM", "vms": "VMs", "vpc": "VPC", "vpn": "VPN", "waf": "WAF", "xml": "XML", "json": "JSON",
	"http": "HTTP", "https": "HTTPS", "ssh": "SSH", "sso": "SSO", "mfa": "MFA", "ci": "CI", "cd": "CD",
	"nosql": "NoSQL", "mysql": "MySQL", "postgresql": "PostgreSQL", "devops": "DevOps", "k8s": "K8s",
	"ocr": "OCR", "ssl/tls": "SSL/TLS", "vnet": "VNet", "hpa": "HPA", "crd": "CRD", "ssm": "SSM",
}

var expansions = map[string]string{
	"db": "Database", "mgmt": "Management", "svc": "Service", "lb": "Load Balancer", "fw": "Firewall",
}

var smallWords = map[string]bool{
	"and": true, "of": true, "for": true, "the": true, "in": true, "on": true, "to": true, "with": true,
	"a": true, "at": true, "by": true, "or": true,
}

var stopTerms = map[string]bool{
	"and": true, "of": true, "for": true, "the": true, "in": true, "on": true, "to": true, "with": true,
	"a": true, "at": true, "by": true, "or": true,
}

func slugify(s string) string {
	s = strings.ReplaceAll(s, "&", " and ")
	var b strings.Builder
	sep := true
	for _, r := range strings.ToLower(s) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			sep = false
			continue
		}
		if !sep {
			b.WriteByte('-')
			sep = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func splitWords(s string) []string {
	return strings.FieldsFunc(s, func(r rune) bool {
		return r == '-' || r == '_' || r == ' ' || r == '+'
	})
}

func titleCase(s string) string {
	words := splitWords(s)
	out := make([]string, 0, len(words))
	for i, w := range words {
		out = append(out, titleWord(w, i == 0))
	}
	return strings.Join(out, " ")
}

func titleWord(w string, first bool) string {
	lw := strings.ToLower(w)
	if exp, ok := expansions[lw]; ok {
		return exp
	}
	if a, ok := acronyms[lw]; ok {
		return a
	}
	if w == "&" {
		return w
	}
	if smallWords[lw] && !first {
		return lw
	}
	idx := strings.IndexFunc(w, unicode.IsLetter)
	if idx < 0 {
		return w
	}
	rest := w[idx:]
	if hasInnerUpperOrDigit(rest) {
		return w
	}
	runes := []rune(rest)
	runes[0] = unicode.ToUpper(runes[0])
	return w[:idx] + string(runes)
}

func hasInnerUpperOrDigit(s string) bool {
	for i, r := range s {
		if i == 0 {
			continue
		}
		if unicode.IsUpper(r) || unicode.IsDigit(r) {
			return true
		}
	}
	return false
}

func tokens(s string) []string {
	return strings.FieldsFunc(strings.ToLower(s), func(r rune) bool {
		return (r < 'a' || r > 'z') && (r < '0' || r > '9')
	})
}

func stripAny(s string, prefixes ...string) string {
	for _, p := range prefixes {
		if strings.HasPrefix(s, p) {
			return strings.TrimPrefix(s, p)
		}
	}
	return s
}

func trimSizeSuffix(s string) string {
	for {
		i := strings.LastIndexByte(s, '_')
		if i < 0 {
			return s
		}
		tail := s[i+1:]
		if tail == "" || !allDigits(tail) {
			return s
		}
		s = s[:i]
	}
}

func allDigits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return s != ""
}
