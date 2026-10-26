# Chart.it icon pack pipeline

Standalone Go module (`github.com/hayward-solutions/chart.it/tools/icons`, standard library only) that downloads the vendor icon sets, normalises them and writes `web/public/icons/<pack>/<category>/<id>.<svg|png>` plus `web/public/icons/manifest.json` (the `Manifest` type in `AGENTS.md`). Never hand-edit the output.

## Commands

Run from `tools/icons` (the repository root is found by walking up to `AGENTS.md`, or pass `-root`):

```
go run . fetch [-force] [-fallback pack,pack] [pack...]
go run . build [pack...]
go run . verify
go run . all [-force] [pack...]
```

- Flags go before pack names. Packs: `aws azure gcp k8s generic` (default: all). `generic` has nothing to fetch.
- `make icons` should call `cd tools/icons && go run . all`.
- `fetch` downloads into `tools/icons/.cache/downloads/<pack>/` (gitignored) and extracts into a freshly emptied `.cache/extract/<pack>/`. Archives are untrusted: only `.svg` (or `.png` for the fallback) entries are extracted, with path traversal, symlink, junk-file and size guards; nothing from an archive is ever executed. Downloads are reused when the URL is unchanged; `-force` re-downloads.
- `build` rewrites each requested pack directory, then merges with the existing manifest entries of packs that were not requested. Output is deterministic: everything is sorted, SVG ids and classes are renamed deterministically, and `generatedAt` is the only field that changes between runs. Set `SOURCE_DATE_EPOCH` to pin it.
- `verify` checks every manifest entry (file exists, parses, at most 200 KiB, id unique per pack, `file` matches `pack/category/id.format`, kind and format valid), that no file on disk is missing from the manifest, that every required badge exists with kind `group`, and prints counts per pack.

## Sources

| pack | source | notes |
|---|---|---|
| aws | zip linked from https://aws.amazon.com/architecture/icons/ (`Icon-package_*.zip`) | services from `Architecture-Service-Icons` (64px SVG, 48px if no 64px), resources from `Resource-Icons` (48px, light variant), groups from `Architecture-Group-Icons` (light variant) |
| azure | zip linked from https://learn.microsoft.com/en-us/azure/architecture/icons/ (`Azure_Public_Service_Icons_V*.zip`) | `Icons/<category>/NNNNN-icon-service-<Name>.svg`; identical icons in several folders are merged |
| gcp | zips linked from https://cloud.google.com/icons (`core-products-icons.zip`, `google-cloud-legacy-icons.zip`) | core (new style) icons win over legacy icons with the same id; categories for GCP are derived from keyword rules in `packs_gcp.go` |
| k8s | https://github.com/kubernetes/community/archive/refs/heads/master.tar.gz | `icons/svg/resources/labeled`, `infrastructure_components/labeled`, `control_plane_components/labeled`; abbreviations are expanded through `k8sEntries` |
| generic | authored in `generic/*.svg` | 2px stroke, `currentColor`, viewBox `0 0 48 48` |

If a primary source cannot be discovered, downloaded, or yields too few icons, `fetch` falls back to https://github.com/mingrammer/diagrams (MIT) and uses `resources/<provider>/<category>/*.png`. The pack is then emitted with `format: "png"` and the licence in the manifest says so. `fetch` prints a `REPORT:` line for every pack that fell back. `-fallback gcp` forces the fallback for a pack (useful for testing).

## Normalisation (SVG)

- Parsed as XML; non-SVG namespaces (inkscape, sodipodi, rdf, illustrator) and their elements and attributes are dropped, as are `<title>`, `<desc>`, `<metadata>`, comments, processing instructions and empty `<defs>`.
- Root `width`/`height`/`x`/`y`/`version`/`id` are removed; `viewBox` is kept or derived from `width`/`height` (units ignored).
- Embedded `<style>` blocks and presentation attributes are kept. Ids that are referenced are renamed to `i<hash>-<n>` and unreferenced ids are removed; class names used with a `<style>` block are prefixed the same way, so icons can be inlined in one page without clashing.
- Rejected (reported as `rejected ...`, the icon is skipped): `<script>`, `<foreignObject>`, event handler attributes, `javascript:` URLs, any external `href` or `url(...)` reference, `@import`, `<image>` data URIs over 50 KiB, SVGs without a usable size, and outputs over 200 KiB.
- `colour` is the most frequent non-white `fill`/`stop-color` hex value, when there is one.

## Ids, titles and terms

- Ids are lowercase kebab-case, derived from the file name with prefixes (`Arch_`, `Res_`, `Amazon-`, `AWS-`, Azure numeric prefixes) and size suffixes (`_48`, `_64`) stripped, and a few long AWS names shortened (`Simple-Storage-Service` becomes `s3`, `Elastic-Kubernetes-Service` becomes `eks`, and so on). AWS resources are `<service>-<resource>`, for example `ec2-instance`, `s3-bucket`.
- Id clashes with different content get `-<kind>`, then `-<category>`, then a number; clashes with identical content are merged.
- `terms` is the sorted, de-duplicated set of title tokens, category tokens, id tokens, shared aliases from `terms.go` (for example `ec2` adds `virtual machine`, `compute`; `rds` adds `database`, `sql`) and per-icon extras.

## Container badge ids

Every badge below exists in the manifest with `kind: "group"`; use it as `data.icon = { pack, id }` on the matching container kind.

| containerKind | pack | icon id |
|---|---|---|
| `aws.cloud` | aws | `group-cloud` |
| `aws.region` | aws | `group-region` |
| `aws.account` | aws | `group-account` |
| `aws.vpc` | aws | `group-vpc` |
| `aws.autoScaling` | aws | `group-auto-scaling` |
| `azure.subscription` | azure | `subscription` |
| `azure.resourceGroup` | azure | `resource-group` |
| `azure.vnet` | azure | `vnet` |
| `gcp.project` | gcp | `project` |
| `gcp.vpc` | gcp | `vpc` |
| `k8s.cluster` | k8s | `cluster` |
| `k8s.namespace` | k8s | `namespace` |
| `k8s.node` | k8s | `node` |
| `k8s.pod` | k8s | `pod` |

Notes:

- AWS also ships `group-public-subnet`, `group-private-subnet`, `group-corporate-data-center`, `group-ec2-instance-contents`, `group-server-contents`, `group-spot-fleet`, `group-iot-greengrass-deployment` and `group-cloud-logo`. Dark variants are not included.
- The `azure/subscription`, `azure/resource-group` and `azure/vnet` icons are the official Subscriptions, Resource Groups and Virtual Networks icons, emitted once under the badge id with kind `group`. `gcp/vpc` is the official Virtual Private Cloud icon.
- Kubernetes has no cluster icon, and any official badge could go missing in a future release: when a required badge is missing from the official set, or the official file is rejected, an authored badge from `extras/<pack>/<id>.svg` is used and `build` prints `badge <pack>/<id> supplied from authored extras`. With the current sources only `k8s/cluster` comes from `extras/`.
- The generic pack also carries neutral group badges for containers without an official icon: `group-datacenter`, `group-network`, `group-subnet`, `group-security`, `group-cluster`, `group-environment` (kind `group`).
- Kinds: official service icons are `service`, AWS resource icons are `resource`, K8s resources are `resource`, K8s infrastructure and control-plane components are `service`, generic iconography is `service`.

## Generic pack icons

`user users laptop mobile browser terminal server vm container function database storage bucket queue message-bus cache file folder log firewall load-balancer router switch internet cloud globe cdn dns vpn lock key certificate api webhook email cron clock monitoring alert git` plus the six `group-*` badges above.

## Layout

- `generic/*.svg` authored generic icons (embedded into the binary).
- `extras/<pack>/<id>.svg` authored fallback badges (embedded).
- `*_test.go` cover slugging, titles, terms, normalisation (including rejection rules and idempotency), manifest determinism, archive safety and the verifier. Run `go vet ./... && go test ./...`.

## Adding or changing an icon

Generic icons: drop a 48x48 stroke SVG into `generic/`, add its entry to `genericEntries` in `packs_other.go`, run `go run . build generic && go run . verify`. For vendor packs, change the id/title/terms tables (`awsServiceAlias`, `azureBadges`, `k8sEntries`, `termRules`) and rebuild.
