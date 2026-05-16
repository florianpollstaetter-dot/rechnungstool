#!/bin/sh
set -eu

SANDBOX="http://libeufin-sandbox:5016"
ADMIN_AUTH="admin:admin-poc"

apk add --no-cache curl jq >/dev/null

echo "Waiting for Libeufin Sandbox at ${SANDBOX} ..."
until curl -sf "${SANDBOX}/" >/dev/null; do sleep 2; done

# Idempotent: create the demo EBICS host if missing.
curl -sS -u "${ADMIN_AUTH}" -X POST "${SANDBOX}/admin/ebics/hosts" \
  -H 'content-type: application/json' \
  -d '{"hostID":"OCTOPOC","ebicsVersion":"3.0"}' || true

# Create a demo bank account "orange-octo-test" with IBAN AT483200000012345864.
curl -sS -u "${ADMIN_AUTH}" -X POST "${SANDBOX}/admin/bank-accounts" \
  -H 'content-type: application/json' \
  -d '{
    "label":"orange-octo-test",
    "iban":"AT483200000012345864",
    "bic":"OPSKATWW",
    "name":"Orange Octo PoC GmbH",
    "currency":"EUR"
  }' || true

# Register an EBICS subscriber bound to the bank account.
curl -sS -u "${ADMIN_AUTH}" -X POST "${SANDBOX}/admin/ebics/subscribers" \
  -H 'content-type: application/json' \
  -d '{
    "hostID":"OCTOPOC",
    "partnerID":"OCTO001",
    "userID":"OCTOUSR1",
    "systemID":"sidecar-poc",
    "bankAccount":"orange-octo-test"
  }' || true

echo "Libeufin bootstrap complete."
