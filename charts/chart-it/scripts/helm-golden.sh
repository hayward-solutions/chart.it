#!/usr/bin/env bash
set -euo pipefail

chart_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
golden_dir="${chart_dir}/tests/golden"
mode="write"

case "${1:-}" in
  "") ;;
  --check) mode="check" ;;
  *)
    echo "usage: $0 [--check]" >&2
    exit 2
    ;;
esac

render() {
  helm template chart-it "${chart_dir}" --namespace chart-it --values "$1"
}

mkdir -p "${golden_dir}"
status=0
expected=()

for values in "${chart_dir}"/tests/values-*.yaml; do
  name="$(basename "${values}" .yaml)"
  name="${name#values-}"
  golden="${golden_dir}/${name}.yaml"
  expected+=("${golden}")

  if [ "${mode}" = "write" ]; then
    render "${values}" > "${golden}"
    echo "wrote ${golden#"${chart_dir}"/}"
    continue
  fi

  if [ ! -f "${golden}" ]; then
    echo "missing golden file for ${name}" >&2
    status=1
    continue
  fi
  if ! diff -u "${golden}" <(render "${values}"); then
    echo "golden mismatch for ${name}" >&2
    status=1
  fi
done

for golden in "${golden_dir}"/*.yaml; do
  [ -e "${golden}" ] || continue
  found=0
  for known in "${expected[@]}"; do
    [ "${known}" = "${golden}" ] && found=1
  done
  if [ "${found}" -eq 0 ]; then
    if [ "${mode}" = "write" ]; then
      rm "${golden}"
      echo "removed stale ${golden#"${chart_dir}"/}"
    else
      echo "stale golden file ${golden#"${chart_dir}"/}" >&2
      status=1
    fi
  fi
done

if [ "${mode}" = "check" ] && [ "${status}" -eq 0 ]; then
  echo "helm golden files are up to date"
fi
exit "${status}"
