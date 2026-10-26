package main

import (
	"path/filepath"
	"strings"
)

type k8sEntry struct {
	id    string
	title string
	kind  string
	terms []string
}

var k8sEntries = map[string]k8sEntry{
	"c-role":        {"cluster-role", "Cluster Role", "resource", []string{"c-role", "clusterrole", "rbac"}},
	"cm":            {"config-map", "Config Map", "resource", []string{"cm", "configmap", "configuration"}},
	"crb":           {"cluster-role-binding", "Cluster Role Binding", "resource", []string{"crb", "clusterrolebinding", "rbac"}},
	"crd":           {"custom-resource-definition", "Custom Resource Definition", "resource", []string{"crd", "operator", "extension"}},
	"cronjob":       {"cron-job", "Cron Job", "resource", []string{"cronjob", "schedule", "batch"}},
	"deploy":        {"deployment", "Deployment", "resource", []string{"deploy", "replicas", "rollout"}},
	"ds":            {"daemon-set", "Daemon Set", "resource", []string{"ds", "daemonset"}},
	"ep":            {"endpoints", "Endpoints", "resource", []string{"ep", "endpoint"}},
	"group":         {"group", "Group", "resource", []string{"rbac", "users"}},
	"hpa":           {"horizontal-pod-autoscaler", "Horizontal Pod Autoscaler", "resource", []string{"hpa", "autoscaling", "scaling"}},
	"ing":           {"ingress", "Ingress", "resource", []string{"ing", "http", "route", "load balancer"}},
	"job":           {"job", "Job", "resource", []string{"batch"}},
	"limits":        {"limit-range", "Limit Range", "resource", []string{"limits", "limitrange"}},
	"netpol":        {"network-policy", "Network Policy", "resource", []string{"netpol", "networkpolicy", "firewall"}},
	"ns":            {"namespace", "Namespace", "group", []string{"ns", "scope", "isolation"}},
	"pod":           {"pod", "Pod", "group", []string{"container", "workload"}},
	"psp":           {"pod-security-policy", "Pod Security Policy", "resource", []string{"psp", "security"}},
	"pv":            {"persistent-volume", "Persistent Volume", "resource", []string{"pv", "storage", "disk"}},
	"pvc":           {"persistent-volume-claim", "Persistent Volume Claim", "resource", []string{"pvc", "storage", "disk"}},
	"quota":         {"resource-quota", "Resource Quota", "resource", []string{"quota", "resourcequota", "limits"}},
	"rb":            {"role-binding", "Role Binding", "resource", []string{"rb", "rolebinding", "rbac"}},
	"role":          {"role", "Role", "resource", []string{"rbac", "permissions"}},
	"rs":            {"replica-set", "Replica Set", "resource", []string{"rs", "replicaset"}},
	"sa":            {"service-account", "Service Account", "resource", []string{"sa", "serviceaccount", "identity"}},
	"sc":            {"storage-class", "Storage Class", "resource", []string{"sc", "storageclass", "storage"}},
	"secret":        {"secret", "Secret", "resource", []string{"credentials", "password", "key"}},
	"sts":           {"stateful-set", "Stateful Set", "resource", []string{"sts", "statefulset"}},
	"svc":           {"service", "Service", "resource", []string{"svc", "networking", "endpoint", "load balancer"}},
	"user":          {"user", "User", "resource", []string{"rbac", "person", "account"}},
	"vol":           {"volume", "Volume", "resource", []string{"vol", "storage", "disk"}},
	"api":           {"api-server", "API Server", "service", []string{"api", "kube-apiserver", "control plane"}},
	"c-c-m":         {"cloud-controller-manager", "Cloud Controller Manager", "service", []string{"c-c-m", "ccm", "control plane"}},
	"c-m":           {"controller-manager", "Controller Manager", "service", []string{"c-m", "kube-controller-manager", "control plane"}},
	"k-proxy":       {"kube-proxy", "Kube Proxy", "service", []string{"k-proxy", "proxy", "networking"}},
	"kubelet":       {"kubelet", "Kubelet", "service", []string{"agent", "node"}},
	"sched":         {"scheduler", "Scheduler", "service", []string{"sched", "kube-scheduler", "control plane"}},
	"control-plane": {"control-plane", "Control Plane", "service", []string{"master", "kubernetes"}},
	"etcd":          {"etcd", "etcd", "service", []string{"key value", "store", "database"}},
	"node":          {"node", "Node", "group", []string{"worker", "machine", "server"}},
}

var k8sSections = []struct {
	dir      string
	category string
	kind     string
}{
	{"resources/labeled", "resources", "resource"},
	{"infrastructure_components/labeled", "infrastructure", "service"},
	{"control_plane_components/labeled", "control-plane", "service"},
}

func (ws *workspace) rawK8s() ([]rawIcon, error) {
	base := ws.extractDir("k8s", "main")
	var raws []rawIcon
	for _, sec := range k8sSections {
		dir := filepath.Join(base, "icons", "svg", filepath.FromSlash(sec.dir))
		files, err := walkSorted(dir, ".svg")
		if err != nil {
			return nil, err
		}
		for _, rel := range files {
			if strings.Contains(rel, "/") {
				continue
			}
			stem := strings.TrimSuffix(rel, ".svg")
			data, err := readFile(filepath.Join(dir, rel))
			if err != nil {
				return nil, err
			}
			r := rawIcon{Category: sec.category, Name: stem, Kind: sec.kind, Format: "svg", Data: data, Source: sec.dir + "/" + rel}
			if e, ok := k8sEntries[stem]; ok {
				r.ID, r.Title, r.Kind, r.Terms = e.id, e.title, e.kind, e.terms
			}
			raws = append(raws, r)
		}
	}
	return raws, nil
}
