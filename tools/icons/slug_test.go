package main

import "testing"

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Amazon-EC2":                      "amazon-ec2",
		"Elemental-Appliances-&-Software": "elemental-appliances-and-software",
		"Virtual-Networks-(Classic)":      "virtual-networks-classic",
		"  Cloud_SQL  ":                   "cloud-sql",
		"ai + machine learning":           "ai-machine-learning",
		"Microservice-Extractor-for-.NET": "microservice-extractor-for-net",
		"":                                "",
		"---":                             "",
	}
	for in, want := range cases {
		if got := slugify(in); got != want {
			t.Errorf("slugify(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestTitleCase(t *testing.T) {
	cases := map[string]string{
		"Amazon-EC2":                 "Amazon EC2",
		"cloud_sql":                  "Cloud SQL",
		"Virtual-Machine":            "Virtual Machine",
		"Amazon-S3-on-Outposts":      "Amazon S3 on Outposts",
		"AWS-IoT-Core":               "AWS IoT Core",
		"Amazon-ElastiCache":         "Amazon ElastiCache",
		"Virtual-Networks-(Classic)": "Virtual Networks (Classic)",
		"gke_on-prem":                "GKE on Prem",
		"db-mgmt":                    "Database Management",
		"Auto-Scaling-group":         "Auto Scaling Group",
	}
	for in, want := range cases {
		if got := titleCase(in); got != want {
			t.Errorf("titleCase(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestTrimSizeSuffix(t *testing.T) {
	cases := map[string]string{
		"Amazon-EC2_64": "Amazon-EC2",
		"Server_48":     "Server",
		"Foo_48_64":     "Foo",
		"Foo_Light":     "Foo_Light",
		"Cloud9":        "Cloud9",
		"Amazon-EC2":    "Amazon-EC2",
	}
	for in, want := range cases {
		if got := trimSizeSuffix(in); got != want {
			t.Errorf("trimSizeSuffix(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestAWSNames(t *testing.T) {
	name, title, extra := awsNames("Amazon-Simple-Storage-Service_Bucket")
	if slugify(name) != "s3-bucket" {
		t.Errorf("name = %q", name)
	}
	if title != "Amazon Simple Storage Service Bucket" {
		t.Errorf("title = %q", title)
	}
	if len(extra) != 1 || extra[0] != "simple storage service" {
		t.Errorf("extra = %v", extra)
	}
	name, _, _ = awsNames("AWS-Lambda_Lambda-Function")
	if slugify(name) != "lambda-lambda-function" {
		t.Errorf("name = %q", name)
	}
	name, _, _ = awsNames("Amazon-Simple-Storage-Service-Glacier")
	if slugify(name) != "s3-glacier" {
		t.Errorf("name = %q", name)
	}
}

func TestComputeTermsDeterministic(t *testing.T) {
	a := computeTerms("ec2", "Amazon EC2", "compute", []string{"zeta", "Alpha"})
	b := computeTerms("ec2", "Amazon EC2", "compute", []string{"Alpha", "zeta"})
	if len(a) != len(b) {
		t.Fatalf("length differs: %v vs %v", a, b)
	}
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("terms differ: %v vs %v", a, b)
		}
	}
	for i := 1; i < len(a); i++ {
		if a[i-1] >= a[i] {
			t.Fatalf("terms not sorted and unique: %v", a)
		}
	}
	want := map[string]bool{"virtual machine": true, "compute": true, "ec2": true, "amazon": true}
	for _, term := range a {
		delete(want, term)
	}
	if len(want) != 0 {
		t.Errorf("missing terms %v in %v", want, a)
	}
}

func TestGCPCategory(t *testing.T) {
	cases := map[string]string{
		"cloud-sql":                      "databases",
		"bigquery":                       "analytics",
		"compute-engine":                 "compute",
		"cloud-storage":                  "storage",
		"identity-and-access-management": "security-identity",
		"cloud-vpn":                      "networking",
		"gke":                            "containers",
		"zzz-unknown":                    "other",
	}
	for in, want := range cases {
		if got := gcpCategory(in); got != want {
			t.Errorf("gcpCategory(%q) = %q, want %q", in, got, want)
		}
	}
}
