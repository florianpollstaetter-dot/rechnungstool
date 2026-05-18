# ebics-mock-server

In-house EBICS-3.0 mock-bank for the Treasury PoC smoke. Replaces the dead
`registry.taler.net/libeufin-sandbox` upstream that powered ORA-2297 until
ORA-2302 confirmed the registry was NXDOMAIN and the source build was no
longer fit for our pipeline.

## Purpose

The Java sidecar (`treasury-poc/services/ebics-sidecar-java/`) needs a peer
that speaks just enough EBICS-3.0 to drive
[`treasury-poc/scripts/smoke.sh`](../../scripts/smoke.sh) through its full
sequence:

1. **HEV**    — protocol version negotiation
2. **INI / HIA** — subscriber key-management upload (mock accepts any keys)
3. **HPB**    — bank public-key download (X002 auth + E002 encryption)
4. **HKD**    — subscriber/account permission metadata
5. **STA**    — CAMT.053 download (non-empty fixture, ≥1 statement)
6. **CCT**    — pain.001 upload (returns synthetic `OrderID`)

Everything else is explicitly out of scope. The mock is **not** a substitute
for a real bank sandbox — that connection happens in ORA-2285 (Erste Bank
Wien EBICS-Sandbox) and Phase 3 (ORA-2288).

## Architecture

| | |
|---|---|
| Stack            | Spring Boot 3.3, Temurin 17 |
| Endpoint         | `POST /ebicsweb` (single dispatcher) |
| State            | in-memory `ConcurrentHashMap`, no DB, no FS |
| Crypto           | bank RSA keypair generated at startup (X002 + E002); incoming subscriber keys accepted without verification |
| Container        | non-root Alpine JRE, healthcheck via Spring Actuator `/actuator/health/liveness` |
| Port             | `5016` |

### Request dispatch

`EbicsWebController` sniffs the root XML element (`ebicsHEVRequest`,
`ebicsUnsecuredRequest`, `ebicsNoPubKeyDigestsRequest`, `ebicsRequest`) and
the inner `<OrderType>` / `<AdminOrderType>` to pick a response.
`EbicsResponseBuilder` renders the EBICS envelope; payloads (HPB / HKD / STA)
are Base64-deflated to match what real banks emit.

### What is *not* implemented

- EBICS signatures (`A005`/`A006`) — the sidecar's smoke does not verify.
- TLS — the mock listens on plain HTTP; the docker-compose network is local-only.
- Multi-subscriber / multi-bank isolation — single static `HostID` (`OCTOPOC`).
- Persistence — state resets on every restart.
- Pagination / segmentation for large STA — fixture is < 2 KB.

## Configuration

`src/main/resources/application.yml` carries seed data for the mocked bank:

| key                       | default                  |
|---------------------------|--------------------------|
| `ebicsmock.hostId`        | `OCTOPOC`                |
| `ebicsmock.partnerId`     | `OCTO001`                |
| `ebicsmock.userId`        | `OCTOUSR1`               |
| `ebicsmock.iban`          | `AT483200000012345864`   |
| `ebicsmock.bic`           | `OPSKATWW`               |
| `ebicsmock.currency`      | `EUR`                    |

These match the seed values the sidecar's `application.yml` already uses for
its keystore label and the CAMT.053 fixture in `treasury-poc/fixtures/`.

## Running

### Compose (recommended)

```bash
cd treasury-poc
docker compose -f docker-compose.ebics-mock.yml up -d
```

This brings up the mock on `:5016` and the sidecar on `:8081`. Then:

```bash
ARTIFACTS_DIR=./smoke-artifacts scripts/smoke.sh
```

### Standalone

```bash
cd treasury-poc/services/ebics-mock-server
mvn spring-boot:run
```

`curl http://127.0.0.1:5016/config` should return
`{"hostId":"OCTOPOC","ebicsVersion":"3.0"}`.

## Tests

```bash
mvn test
```

Covers root-element detection and `<OrderType>` sniffing (namespace-prefixed
and plain). The container build runs `package` with tests skipped; CI runs
the full end-to-end smoke instead — see `.github/workflows/treasury-poc-e2e.yml`.

## License

This sub-project is Apache-2.0 in-house code. See [`LICENSE`](./LICENSE) for
the full notice — in particular it states that the mock is *not* a fork of
Libeufin, ebics-java-client, JOONIS, or any other EBICS upstream.

## Issues

- Created under: [ORA-2303](/ORA/issues/ORA-2303) — Treasury Phase 2: EBICS-3.0-Mock-Server bauen
- Decision context: [ORA-2302](/ORA/issues/ORA-2302) comment 2026-05-18 — CEO Option A
- Consumer: [ORA-2297](/ORA/issues/ORA-2297) — sidecar W2-impl PR #11
- Architecture: [ORA-2278](/ORA/issues/ORA-2278) deliverable 08
