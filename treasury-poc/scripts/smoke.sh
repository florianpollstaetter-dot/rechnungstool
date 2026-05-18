#!/usr/bin/env bash
# treasury-poc/scripts/smoke.sh
#
# End-to-end smoke for the EBICS sidecar against the Libeufin sandbox.
# Sequence: HEV → INI/HIA bootstrap → HPB → HKD sanity → STA round-trip → CCT upload.
#
# Pre-req: `docker compose -f treasury-poc/docker-compose.libeufin.yml up -d`
# Exit code is non-zero on any step failure so CI can fail fast.

set -euo pipefail

SIDECAR_URL="${SIDECAR_URL:-http://127.0.0.1:8081}"
FROM_DATE="${FROM_DATE:-$(date -u +%Y-%m-%d)}"
FIXTURE_DIR="$(cd "$(dirname "$0")/../fixtures" && pwd)"
PAIN001="${FIXTURE_DIR}/pain001-sample.xml"
ARTIFACTS_DIR="${ARTIFACTS_DIR:-./treasury-poc-smoke-artifacts}"

mkdir -p "${ARTIFACTS_DIR}"

step() { printf "\n\033[1;34m▶ %s\033[0m\n" "$*"; }
fail() { printf "\033[1;31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

# Compact jq filter to surface the request-id; we never log the rawBase64.
JQ_REQID='.requestId // "none"'

wait_ready() {
  step "Waiting for sidecar readiness at ${SIDECAR_URL}/actuator/health/readiness"
  for i in $(seq 1 60); do
    if curl -sf "${SIDECAR_URL}/actuator/health/readiness" >/dev/null; then
      echo "ready after ${i}s"
      return
    fi
    sleep 1
  done
  fail "sidecar did not reach readiness within 60s"
}

call_get() {
  local op="$1"; shift
  local path="$1"; shift
  local out="${ARTIFACTS_DIR}/${op}.json"
  step "GET ${path}"
  local http_code
  http_code=$(curl -sS -o "${out}" -w "%{http_code}" "${SIDECAR_URL}${path}")
  if [[ "${http_code}" != "200" ]]; then
    cat "${out}" >&2 || true
    fail "${op} returned HTTP ${http_code}"
  fi
  jq -r "${JQ_REQID}" "${out}" | sed "s/^/${op} requestId=/"
}

call_post() {
  local op="$1"; shift
  local path="$1"; shift
  local ctype="${1:-application/json}"; shift || true
  local body="${1:-}"
  local out="${ARTIFACTS_DIR}/${op}.json"
  step "POST ${path}"
  local http_code
  if [[ -n "${body}" ]]; then
    http_code=$(curl -sS -o "${out}" -w "%{http_code}" \
      -H "Content-Type: ${ctype}" \
      --data-binary "@${body}" \
      -X POST "${SIDECAR_URL}${path}")
  else
    http_code=$(curl -sS -o "${out}" -w "%{http_code}" \
      -X POST "${SIDECAR_URL}${path}")
  fi
  if [[ "${http_code}" != "200" ]]; then
    cat "${out}" >&2 || true
    fail "${op} returned HTTP ${http_code}"
  fi
  jq -r "${JQ_REQID}" "${out}" | sed "s/^/${op} requestId=/"
}

wait_ready

# 1. HEV: bank reports supported EBICS versions.
call_get "hev" "/ebics/hev"
if ! grep -q '"supportedVersion"' "${ARTIFACTS_DIR}/hev.json"; then
  fail "HEV response missing supportedVersion field"
fi

# 2. INI + HIA bootstrap.
call_post "init" "/ebics/init"

# 3. HPB fetch — bank public keys.
call_get "hpb" "/ebics/hpb"

# 4. HKD — subscriber state sanity.
call_get "hkd" "/ebics/hkd"

# 5. STA round-trip — CAMT.053 bytes must be non-empty.
call_get "sta" "/ebics/sta?from=${FROM_DATE}"
sta_bytes=$(jq -r '.rawBytes' "${ARTIFACTS_DIR}/sta.json")
if [[ "${sta_bytes:-0}" -lt 1 ]]; then
  fail "STA returned empty payload (rawBytes=${sta_bytes})"
fi

# 6. CCT upload — pain.001 fixture; bank returns an order-id.
call_post "cct" "/ebics/cct" "application/xml" "${PAIN001}"
if ! grep -q '"bankOrderId"' "${ARTIFACTS_DIR}/cct.json"; then
  fail "CCT response missing bankOrderId"
fi

step "Smoke passed."
ls -la "${ARTIFACTS_DIR}"
