#!/usr/bin/env bash
# Bench-Driver for the ORA-2298 EBICS-Java-Sidecar performance gate.
#
# Replaces the original ORA-2284 dual-sidecar harness (Java vs Python):
# ADR-001 ACCEPTED the Java path, so the JOONIS Python sidecar was
# decommissioned (see treasury-poc/docs/05-decision-memo.md). This driver
# benches the single Java sidecar against the in-house EBICS-3.0 mock with
# a fixture-sized CAMT.053 payload mounted into the mock.
#
# Pre-conditions (CI does this in treasury-poc-bench.yml):
#   - bench/statements/camt053_<size>.xml exists (from gen_fixtures.py)
#   - docker compose -f docker-compose.ebics-mock.yml is up, with the mock
#     env EBICSMOCK_CAMT053FIXTUREPATH=/var/lib/ebics-mock/fixtures/<file>
#   - sidecar is past INI/HIA/HPB so /ebics/sta has subscriber state
#
# Usage:
#   ./run_bench.sh <fixture-basename>
# Example:
#   IMG_SIDECAR_TAG=ebics-sidecar:bench \
#   IMG_MOCK_TAG=ebics-mock-server:0.1.0 \
#   ./run_bench.sh camt053_10k.xml
#
# Appends a bench block to bench/results.md.
set -euo pipefail

FIXTURE_NAME="${1:?usage: run_bench.sh <fixture-basename> (e.g. camt053_10k.xml)}"
SIDECAR_URL="${SIDECAR_URL:-http://127.0.0.1:8081}"
SIDECAR_CONTAINER="${SIDECAR_CONTAINER:-ebics-sidecar}"
MOCK_CONTAINER="${MOCK_CONTAINER:-ebics-mock}"
HYPERFINE_WARMUP="${HYPERFINE_WARMUP:-10}"
HYPERFINE_RUNS="${HYPERFINE_RUNS:-50}"
IMG_SIDECAR_TAG="${IMG_SIDECAR_TAG:-ebics-sidecar:bench}"
IMG_MOCK_TAG="${IMG_MOCK_TAG:-ebics-mock-server:0.1.0}"
SAMPLE_REPS="${SAMPLE_REPS:-10}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESULTS="${SCRIPT_DIR}/results.md"
FIXTURE_PATH="${SCRIPT_DIR}/statements/${FIXTURE_NAME}"

require() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1" >&2; exit 2; }; }
for t in curl docker hyperfine awk gzip; do require "$t"; done

[[ -f "${FIXTURE_PATH}" ]] || { echo "fixture missing: ${FIXTURE_PATH}" >&2; exit 3; }
FIXTURE_SIZE="$(wc -c < "${FIXTURE_PATH}")"

FROM_DATE="$(date -u +%Y-%m-%d)"

echo "==> ${FIXTURE_NAME} (${FIXTURE_SIZE} bytes)"

# 1. Subscriber bootstrap — STA needs INI/HIA/HPB to have happened in this
#    sidecar lifetime. Idempotent on a clean keystore volume.
echo "Bootstrapping subscriber (INI/HIA/HPB)..."
curl -sf "${SIDECAR_URL}/actuator/health/readiness" >/dev/null
curl -sf -X POST "${SIDECAR_URL}/ebics/init"    >/dev/null || true
curl -sf         "${SIDECAR_URL}/ebics/hpb"     >/dev/null || true

# 2. Smoke a single STA to make sure the bench target works at this size
#    before we burn 50 hyperfine runs on it.
echo "STA smoke..."
if ! curl -sf -o /dev/null "${SIDECAR_URL}/ebics/sta?from=${FROM_DATE}"; then
  echo "STA smoke FAILED for ${FIXTURE_NAME} — aborting bench for this size." >&2
  exit 4
fi

# 3. Hyperfine latency table.
TMP_MD="$(mktemp /tmp/bench-XXXXXX.md)"
hyperfine \
  --warmup "${HYPERFINE_WARMUP}" \
  --runs   "${HYPERFINE_RUNS}" \
  --export-markdown "${TMP_MD}" \
  "curl -sf -o /dev/null '${SIDECAR_URL}/ebics/sta?from=${FROM_DATE}'"

# 4. Memory-RSS sampling: peak across a few extra STA hits.
RSS_SAMPLES="$(mktemp /tmp/rss-XXXXXX.txt)"
{
  echo "ts container mem_usage cpu_pct"
  for _ in $(seq 1 "${SAMPLE_REPS}"); do
    curl -sf -o /dev/null "${SIDECAR_URL}/ebics/sta?from=${FROM_DATE}" || true
    for c in "${SIDECAR_CONTAINER}" "${MOCK_CONTAINER}"; do
      docker stats --no-stream --format "{{.Name}} {{.MemUsage}} {{.CPUPerc}}" "$c" 2>/dev/null \
        | awk -v ts="$(date -u +%H:%M:%S)" '{print ts" "$0}'
    done
  done
} > "${RSS_SAMPLES}"

# Parse the peak (in MiB) per container from the samples — `docker stats`
# emits "{used}MiB / {limit}MiB" or "{used}GiB / {limit}GiB".
peak_mib() {
  local container="$1"
  awk -v c="$container" '
    $2 == c {
      # column 3 looks like "234.5MiB" or "1.05GiB"
      v=$3
      sub(/MiB.*/,"",v); if (v != $3) { print v+0; next }
      sub(/GiB.*/,"",v); if (v != $3) { print (v+0)*1024; next }
    }' "${RSS_SAMPLES}" \
  | sort -g | tail -1
}
SIDECAR_PEAK_MIB="$(peak_mib "${SIDECAR_CONTAINER}")"
MOCK_PEAK_MIB="$(peak_mib "${MOCK_CONTAINER}")"

# 5. Container image sizes (uncompressed + gzipped).
img_size_uncompressed() {
  docker image inspect "$1" --format '{{.Size}}' 2>/dev/null || echo 0
}
img_size_gzipped() {
  docker save "$1" 2>/dev/null | gzip -c | wc -c
}
SIDECAR_IMG_RAW="$(img_size_uncompressed "${IMG_SIDECAR_TAG}")"
SIDECAR_IMG_GZ="$(img_size_gzipped       "${IMG_SIDECAR_TAG}")"
MOCK_IMG_RAW="$(img_size_uncompressed    "${IMG_MOCK_TAG}")"
MOCK_IMG_GZ="$(img_size_gzipped          "${IMG_MOCK_TAG}")"

# 6. Append a bench block.
{
  printf '\n## %s — bench/statements/%s (%s bytes)\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${FIXTURE_NAME}" "${FIXTURE_SIZE}"
  echo
  echo "### Latency — \`GET /ebics/sta\` (hyperfine warmup=${HYPERFINE_WARMUP}, runs=${HYPERFINE_RUNS})"
  cat "${TMP_MD}"
  echo
  echo "### Container RSS peak (sampled across ${SAMPLE_REPS} extra STA calls)"
  printf '| container | peak RSS (MiB) |\n| --- | --- |\n'
  printf '| %s | %s |\n' "${SIDECAR_CONTAINER}" "${SIDECAR_PEAK_MIB:-n/a}"
  printf '| %s | %s |\n' "${MOCK_CONTAINER}"    "${MOCK_PEAK_MIB:-n/a}"
  echo
  echo "### Container image size"
  printf '| image | uncompressed (bytes) | gzipped (bytes) |\n| --- | --- | --- |\n'
  printf '| %s | %s | %s |\n' "${IMG_SIDECAR_TAG}" "${SIDECAR_IMG_RAW}" "${SIDECAR_IMG_GZ}"
  printf '| %s | %s | %s |\n' "${IMG_MOCK_TAG}"    "${MOCK_IMG_RAW}"    "${MOCK_IMG_GZ}"
} >> "${RESULTS}"

echo "Appended bench block for ${FIXTURE_NAME} to ${RESULTS}"
echo "Peak RSS — sidecar: ${SIDECAR_PEAK_MIB:-n/a} MiB, mock: ${MOCK_PEAK_MIB:-n/a} MiB"
