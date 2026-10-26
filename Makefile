SHELL := bash
.DEFAULT_GOAL := help

GO_PKGS := ./cmd/... ./internal/... ./templates/...
IMAGE ?= chart.it:dev

.PHONY: dev
dev: ## Run the Go server with test auth on :8080 (serves internal/ui/dist; run make build-web first)
	CHARTIT_ALLOW_TEST_AUTH=1 go run ./cmd/chartit

.PHONY: dev-web
dev-web: ## Run the Vite dev server on :5173 proxying /api and /auth to :8080
	cd web && npm run dev

.PHONY: test
test: ## Run Go unit tests
	go test $(GO_PKGS)

.PHONY: test-web
test-web: ## Run web unit tests
	cd web && npm test

.PHONY: test-e2e
test-e2e: build ## Run Playwright against a freshly built binary
	cd e2e && npm test

.PHONY: lint
lint: lint-go lint-web ## Run all linters

.PHONY: lint-go
lint-go: ## golangci-lint and gofmt
	@test -z "$$(gofmt -l cmd internal templates 2>/dev/null)" || { echo "gofmt needed:"; gofmt -l cmd internal templates; exit 1; }
	golangci-lint run $(GO_PKGS)

.PHONY: lint-web
lint-web: ## Web lint and typecheck
	cd web && npm run lint && npm run typecheck

.PHONY: build-web
build-web: ## Build web/dist and copy it to internal/ui/dist for embedding
	cd web && npm ci && npm run build
	rm -rf internal/ui/dist && cp -R web/dist internal/ui/dist
	touch internal/ui/dist/.keep

.PHONY: build
build: build-web ## Build web/dist then the Go binary into bin/chartit
	CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o bin/chartit ./cmd/chartit

.PHONY: icons
icons: ## Regenerate web/public/icons
	cd tools/icons && go run . all

.PHONY: docker
docker: ## Build the container image locally
	docker build -t $(IMAGE) .

.PHONY: tidy
tidy: ## go mod tidy
	go mod tidy

.PHONY: clean
clean: ## Remove build output
	rm -rf bin

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*## "; printf "Targets:\n"} \
	     /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' \
	     $(MAKEFILE_LIST)
