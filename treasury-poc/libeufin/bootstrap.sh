#!/bin/sh
# libeufin-bank v1.x bootstrap.
# Admin API prefix changed from /admin/ → /management/ in libeufin 1.0.
# Idempotent: all POST calls use || true so re-runs are safe.
set -eu

SANDBOX="http://libeufin-sandbox:5016"
ADMIN_AUTH="admin:admin-poc"

apk add --no-cache curl jq >/dev/null

echo "Waiting for Libeufin Bank at ${SANDBOX} ..."
until curl -sf "${SANDBOX}/config" >/dev/null; do sleep 2; done

# Create the demo EBICS host.
curl -sS -u "${ADMIN_AUTH}" -X POST "${SANDBOX}/management/ebics/hosts" \
  -H 'content-type: application/json' \
  -d '{"hostID":"OCTOPOC","ebicsVersion":"3.0"}' || true

# Create a demo bank account "orange-octo-test" with IBAN AT483200000012345864.
curl -sS -u "${ADMIN_AUTH}" -X POST "${SANDBOX}/management/bank-accounts" \
  -H 'content-type: application/json' \
  -d '{
    "label":"orange-octo-test",
    "iban":"AT483200000012345864",
    "bic":"OPSKATWW",
    "name":"Orange Octo PoC GmbH",
    "currency":"EUR"
  }' || true

# Register an EBICS subscriber bound to the bank account.
curl -sS -u "${ADMIN_AUTH}" -X POST "${SANDBOX}/management/ebics/subscribers" \
  -H 'content-type: application/json' \
  -d '{
    "hostID":"OCTOPOC",
    "partnerID":"OCTO001",
    "userID":"OCTOUSR1",
    "systemID":"sidecar-poc",
    "bankAccount":"orange-octo-test"
  }' || true

echo "Libeufin bootstrap complete."
