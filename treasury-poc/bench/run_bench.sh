#!/usr/bin/env bash
# Benchmark driver for the EBICS-Library PoC.
#
# Hits the STA endpoint on both sidecars and measures throughput,
# memory RSS, and latency. Designed to be re-runnable; results are
# appended to bench/results.md.
#
# Usage:
#   ./run_bench.sh <java-url> <py-url> <fixture>
# Example:
#   ./run_bench.sh http://localhost:8081 http://localhost:8082 statements/camt053_10k.xml
set -euo pipefail

JAVA_URL="${1:-http://localhost:8081}"
PY_URL="${2:-http://localhost:8082}"
FIXTURE="${3:-statements/camt053_1k.xml}"

cmd_exists() { command -v "$1" >/dev/null 2>&1; }
require() { cmd_exists "$1" || { echo "missing: $1"; exit 2; }; }
require curl
require hyperfine

echo "Bench fixture: ${FIXTURE}"
ls -la "${FIXTURE}" 2>/dev/null || { echo "Fixture not generated yet — run gen_fixtures.py first."; exit 3; }

echo "## $(date -u +%Y-%m-%dT%H:%M:%SZ) — ${FIXTURE}" >> results.md
{
  echo
  echo "### Latency (hyperfine 10 warmup, 50 runs)"
  hyperfine --warmup 10 --runs 50 --export-markdown /dev/stdout \
    "curl -s -o /dev/null '${JAVA_URL}/ebics/sta?from=2026-05-01&to=2026-05-15'" \
    "curl -s -o /dev/null '${PY_URL}/ebics/sta?from=2026-05-01&to=2026-05-15'"
  echo
  echo "### Container RSS"
  for c in ebics-sidecar-java ebics-sidecar-py; do
    docker stats --no-stream --format "- {{.Name}}: {{.MemUsage}}" "${c}" 2>/dev/null || true
  done
} >> results.md

echo "Appended results to bench/results.md"
