package main

import (
	"sort"
	"strings"
)

type termRule struct {
	keys  []string
	terms []string
}

var termRules = []termRule{
	{[]string{"ec2", "virtual-machine", "virtual-machines", "compute-engine", "gce", "vm", "lightsail", "vmss", "virtual-machine-scale-sets"}, []string{"virtual machine", "vm", "compute", "server", "instance"}},
	{[]string{"rds", "aurora", "sql-database", "sql-server", "sql-managed-instance", "mysql", "postgresql", "mariadb", "cloud-sql", "alloydb", "oracle-database", "database-for-mysql", "database-for-postgresql"}, []string{"database", "sql", "relational", "db"}},
	{[]string{"dynamodb", "cosmos-db", "firestore", "datastore", "bigtable", "keyspaces", "documentdb", "mongodb", "table-storage", "neptune", "cassandra"}, []string{"database", "nosql", "key value", "db"}},
	{[]string{"s3", "simple-storage-service", "cloud-storage", "blob-storage", "storage-accounts", "storage-account", "bucket", "buckets"}, []string{"object storage", "bucket", "blob", "storage"}},
	{[]string{"lambda", "cloud-functions", "functions", "function-apps", "function", "azure-functions"}, []string{"function", "serverless", "faas"}},
	{[]string{"elastic-load-balancing", "elb", "load-balancer", "load-balancers", "load-balancing", "cloud-load-balancing", "application-gateway", "application-gateways"}, []string{"load balancer", "lb", "alb", "nlb", "traffic"}},
	{[]string{"vpc", "virtual-private-cloud", "virtual-network", "virtual-networks", "vnet", "virtual-networks-classic"}, []string{"network", "vpc", "vnet", "virtual network"}},
	{[]string{"route-53", "cloud-dns", "dns", "dns-zones", "dns-private-resolver", "domains", "dns-zone"}, []string{"dns", "domain", "name resolution"}},
	{[]string{"cloudfront", "cloud-cdn", "front-doors", "front-door", "cdn", "cdn-profiles"}, []string{"cdn", "content delivery", "edge"}},
	{[]string{"api-gateway", "api-management", "apigee", "cloud-endpoints", "api-management-services", "api-gateway-v2"}, []string{"api", "gateway", "rest"}},
	{[]string{"sqs", "simple-queue-service", "service-bus", "queue", "queues", "pubsub", "pub-sub", "cloud-tasks", "mq", "event-hubs", "event-grid-topics", "eventbridge", "sns", "simple-notification-service", "kinesis", "kafka", "msk"}, []string{"queue", "message", "messaging", "event", "stream"}},
	{[]string{"eks", "elastic-kubernetes-service", "kubernetes-services", "kubernetes-service", "gke", "google-kubernetes-engine", "kubernetes", "aks"}, []string{"kubernetes", "k8s", "container", "cluster"}},
	{[]string{"ecs", "elastic-container-service", "fargate", "container-instances", "container-apps", "cloud-run", "app-runner", "container", "containers"}, []string{"container", "docker"}},
	{[]string{"ecr", "elastic-container-registry", "container-registry", "container-registries", "artifact-registry"}, []string{"container registry", "docker", "image", "registry"}},
	{[]string{"iam", "identity-and-access-management", "iam-identity-center", "entra", "active-directory", "cognito", "identity-platform", "azure-ad", "managed-identities"}, []string{"identity", "access", "auth", "authentication", "permissions"}},
	{[]string{"kms", "key-management-service", "key-vaults", "key-vault", "secrets-manager", "secret-manager", "cloudhsm", "cloud-hsm", "hsm", "key-management"}, []string{"key", "secret", "encryption", "vault", "kms"}},
	{[]string{"waf", "shield", "firewall", "firewalls", "network-firewall", "cloud-armor", "firewall-manager", "web-application-firewall", "cloud-firewall-rules"}, []string{"firewall", "security", "waf", "protection"}},
	{[]string{"cloudwatch", "monitor", "cloud-monitoring", "application-insights", "log-analytics-workspaces", "cloud-logging", "cloudtrail", "x-ray", "stackdriver", "logs", "grafana", "prometheus"}, []string{"monitoring", "observability", "logs", "metrics"}},
	{[]string{"step-functions", "logic-apps", "workflows", "cloud-composer", "airflow"}, []string{"workflow", "orchestration", "state machine"}},
	{[]string{"scheduler", "cloud-scheduler", "eventbridge-scheduler", "cron", "scheduler-job-collections"}, []string{"cron", "schedule", "timer", "job"}},
	{[]string{"transit-gateway", "vpn", "site-to-site-vpn", "client-vpn", "vpn-gateway", "vpn-gateways", "cloud-vpn", "expressroute-circuits", "direct-connect", "cloud-interconnect", "virtual-network-gateways", "local-network-gateways"}, []string{"vpn", "network", "connectivity", "tunnel"}},
	{[]string{"elasticache", "memorystore", "cache", "redis", "cache-redis", "memcached", "memorydb", "memorydb-for-redis"}, []string{"cache", "redis", "in-memory", "memcached"}},
	{[]string{"redshift", "bigquery", "synapse-analytics", "athena", "emr", "dataproc", "databricks", "data-lake-analytics", "hd-insight"}, []string{"data warehouse", "analytics", "big data", "query"}},
	{[]string{"sagemaker", "bedrock", "vertex-ai", "vertexai", "machine-learning", "ai-platform", "automl", "azure-openai"}, []string{"ml", "ai", "machine learning", "model"}},
	{[]string{"cloudformation", "deployment-manager", "resource-manager", "terraform", "bicep", "infrastructure-composer", "cloud-development-kit"}, []string{"iac", "infrastructure as code", "template", "provisioning"}},
	{[]string{"codepipeline", "codebuild", "codedeploy", "cloud-build", "cloud-deploy", "pipelines", "devops", "azure-devops"}, []string{"ci", "cd", "pipeline", "build", "deploy"}},
	{[]string{"ebs", "elastic-block-store", "persistent-disk", "managed-disks", "disks", "disk", "hyperdisk", "local-ssd"}, []string{"disk", "block storage", "volume"}},
	{[]string{"efs", "filestore", "files", "fsx", "azure-files", "azure-netapp-files", "file-cache"}, []string{"file storage", "nfs", "file system", "share"}},
	{[]string{"ses", "simple-email-service", "email", "mail", "workmail", "email-communication-services"}, []string{"email", "smtp", "mail"}},
	{[]string{"certificate-manager", "private-certificate-authority", "certificate-authority-service", "app-service-certificates", "certificate", "certificates"}, []string{"certificate", "tls", "ssl", "cert"}},
	{[]string{"nat", "nat-gateway", "cloud-nat", "nat-gateways"}, []string{"nat", "network address translation", "gateway"}},
	{[]string{"internet-gateway", "internet", "cloud-router", "router", "route-tables", "route-table", "routes"}, []string{"internet", "gateway", "routing"}},
	{[]string{"app-service", "app-services", "elastic-beanstalk", "app-engine", "app-service-plans", "amplify"}, []string{"paas", "web app", "application"}},
	{[]string{"codecommit", "git", "cloud-source-repositories", "repos", "github", "repository"}, []string{"git", "source control", "repository", "vcs"}},
	{[]string{"glacier", "archive", "archive-storage", "backup", "backups", "recovery-services-vaults"}, []string{"archive", "cold storage", "backup"}},
	{[]string{"waf", "ddos-protection", "security-center", "security-hub", "guardduty", "defender", "sentinel", "security-command-center", "inspector", "macie"}, []string{"security", "threat", "protection"}},
	{[]string{"sso", "single-sign-on"}, []string{"sso", "login", "authentication"}},
	{[]string{"cloud-shell", "cloudshell", "terminal", "command-line-interface"}, []string{"terminal", "shell", "cli", "console"}},
	{[]string{"user", "users", "person", "people"}, []string{"person", "people", "account"}},
	{[]string{"iot-core", "iot-hub", "iot-central", "iot-edge", "greengrass", "iot"}, []string{"iot", "device", "sensor", "edge"}},
}

func containsSeq(hay, needle []string) bool {
	if len(needle) == 0 || len(needle) > len(hay) {
		return false
	}
	for i := 0; i+len(needle) <= len(hay); i++ {
		match := true
		for j := range needle {
			if hay[i+j] != needle[j] {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}

func computeTerms(id, title, category string, extra []string) []string {
	set := map[string]bool{}
	add := func(s string) {
		s = strings.ToLower(strings.TrimSpace(s))
		if s != "" {
			set[s] = true
		}
	}
	idTokens := tokens(id)
	titleTokens := tokens(title)
	for _, t := range titleTokens {
		if len(t) > 1 && !stopTerms[t] {
			add(t)
		}
	}
	for _, t := range tokens(category) {
		if len(t) > 1 && !stopTerms[t] {
			add(t)
		}
	}
	for _, t := range idTokens {
		if len(t) > 1 && !stopTerms[t] {
			add(t)
		}
	}
	for _, rule := range termRules {
		for _, key := range rule.keys {
			kt := tokens(key)
			if containsSeq(idTokens, kt) || containsSeq(titleTokens, kt) {
				for _, t := range rule.terms {
					add(t)
				}
				break
			}
		}
	}
	for _, e := range extra {
		add(e)
	}
	out := make([]string, 0, len(set))
	for t := range set {
		out = append(out, t)
	}
	sort.Strings(out)
	return out
}
