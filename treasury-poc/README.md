# Treasury EBICS-Library PoC (ORA-2284)

Side-by-Side-PoC zweier EBICS-3.0-Client-Bibliotheken für das Orange-Octo-Treasury-Modul.
Output dieses PoC ist ein **ADR-Decision-Memo** ([`docs/05-decision-memo.md`](docs/05-decision-memo.md)) mit Empfehlung, das CEO + Engineer gemeinsam unterzeichnen.

> **Status**: ADR-001 **ACCEPTED** → Kandidat A. Java-Sidecar wird in [ORA-2297](/ORA/issues/ORA-2297) produktiv verdrahtet (W2-impl: echte ebics-java-client-Calls + Libeufin-Round-Trip + CI-Smoke). Python-Sidecar (Kandidat B) bleibt nur als Notfall-Fallback im Repo.

## Kandidaten

| Kandidat | Lizenz | Sprache | Pflege | Repo |
|---|---|---|---|---|
| **A: ebics-java-client** | LGPL-2.1 | Java 17 + Spring Boot 3.x | aktiv, EBICS-Team Frankreich | https://github.com/ebics-java/ebics-java-client |
| **B: JOONIS Python Fintech** | Kommerziell (Per-Bank-Lizenz) | Python 3.12 + FastAPI | aktiv, deutsche Firma | https://www.joonis.de/de/fintech.html |

## Architektur — Sidecar-Pattern

Beide Kandidaten werden als **separate HTTP-Microservice (Sidecar)** neben dem Next.js-Hauptserver betrieben. Next.js spricht den Sidecar via Service-internem REST-Call an (`http://ebics-sidecar:8081`), niemals direkt.

```
┌─────────────────────────┐         ┌────────────────────────┐
│ rechnungstool (Next.js) │  REST   │ ebics-sidecar (A / B)  │
│ /api/treasury/ebics/*   │ ──────► │ /init /hkd /sta /cct   │
│ + Audit-Chain-Logging   │         │ + Keystore + Bank-Conn │
└─────────────────────────┘         └────────────────────────┘
                                              │
                                              │ EBICS 3.0 HTTPS
                                              ▼
                                    ┌────────────────────────┐
                                    │ Libeufin Mock-Sandbox  │  ← lokal (PoC)
                                    │ oder Erste Bank Wien   │  ← real (Phase 3)
                                    └────────────────────────┘
```

Begründung Sidecar (statt In-Process):
1. **Sprachgrenze**: ebics-java läuft auf JVM, JOONIS auf CPython — keiner integriert sauber in Node.js.
2. **Sicherheits-Boundary**: Privatschlüssel-Zugriff (später PKCS#11/HSM) bleibt im Sidecar-Container, Next.js bekommt nie Material.
3. **Wechselbar**: Spring-Boot-Container A ↔ FastAPI-Container B sind drop-in-replaceable, der Next.js-Aufrufer ändert sich nicht.
4. **Skalierbar**: EBICS-Polling läuft als eigener Worker mit eigenen Replicas/Cron; Next.js bleibt request/response.

## Quickstart (PoC, lokal)

Die ganze Kette (in-house EBICS-3.0 Mock + ebics-sidecar) läuft als ein Compose-Bundle:

```bash
cd treasury-poc

# 1. Komplettes Stack hochfahren: EBICS-Mock + Java-Sidecar
docker compose -f docker-compose.ebics-mock.yml up -d --build

# 2. Readiness des Sidecars abwarten (curl returnt UP wenn Spring Actuator bereit)
curl -sf http://127.0.0.1:8081/actuator/health/readiness

# 3. End-to-End-Smoke (HEV → INI/HIA → HPB → HKD → STA → CCT)
chmod +x scripts/smoke.sh
ARTIFACTS_DIR=./smoke-artifacts scripts/smoke.sh
```

Der Smoke schreibt die rohen Bank-Responses (`rawBase64`) und Request-IDs in `./smoke-artifacts/*.json` — diese Felder verbraucht die Next.js-Seite später für den Audit-Chain-Hash.

## Bench-Plan

`bench/run_bench.sh` parsed CAMT.053-Fixtures (1k/10k/100k Transaktionen). Misst:

- **Parse-Throughput** (statements/s)
- **Memory-RSS-Peak** (per Worker)
- **p50/p95-Latenz** für `GET /sta`
- **Container-Image-Size** (gzipped)

Resultate: [`bench/results.md`](bench/results.md).

## Dokumente

| Doc | Zweck |
|---|---|
| [`docs/01-architecture.md`](docs/01-architecture.md) | Sidecar-Pattern, Datenfluss, Crypto-Boundary |
| [`docs/02-flow-coverage.md`](docs/02-flow-coverage.md) | EBICS-Flow-Matrix INI/HIA, HKD, STA/C53, CCT/CCI, HEV |
| [`docs/03-license-comparison.md`](docs/03-license-comparison.md) | LGPL-2.1 vs. JOONIS-Kommerziell, DSGVO-AVV-Klauseln |
| [`docs/04-cost-tco.md`](docs/04-cost-tco.md) | 12/24/36-Monats-TCO inkl. internem Eng-Aufwand |
| [`docs/05-decision-memo.md`](docs/05-decision-memo.md) | **ADR — Empfehlung an CEO** |

## CVE-Hardening (ORA-2526)

Der PoC-Build läuft unter der **Hybrid A+C CVE-Hardening-Policy** (board-approved 2026-06-11 via [ORA-2324](/ORA/issues/ORA-2324)).

- **CRITICAL** CVEs in der Sidecar-Image-Layer brechen den `treasury-poc-e2e`-Workflow hart (`exit-code: 1`). Eskalation: CEO.
- **HIGH/MEDIUM** CVEs werden als SARIF an den GitHub Security tab gemeldet (advisory, kein Build-Break). Cadence: Dependabot Maven weekly via [`.github/dependabot.yml`](../.github/dependabot.yml).
- Allowlist (`.trivyignore`): nur mit CEO-Sign-off, max. 30 Tage Expiry pro Eintrag.

Full policy + Eskalations-Pfade: [`docs/security/cve-policy.md`](../docs/security/cve-policy.md).

## Scope-Grenzen

- **Kein** Eingriff in `src/lib/treasury/` oder andere Module — PoC bleibt isoliert bis Decision.
- **Kein** PKCS#11/HSM in dieser Phase — File-Keystore reicht für PoC; AWS CloudHSM kommt nach Decision in eigenem Issue.
- **Keine** echten Bank-Credentials in Git — Libeufin nutzt Self-Signed-Certs; reale Sandbox-Keys liegen in `.env.local` (gitignored).

## Verwandte Issues

- Parent: [ORA-2284](/ORA/issues/ORA-2284) — Treasury Phase 2: EBICS-Library-PoC + Decision
- W2-impl: [ORA-2297](/ORA/issues/ORA-2297) — Productionizes the Java-Sidecar gegen Libeufin
- Epic: [ORA-2280](/ORA/issues/ORA-2280) — Treasury MVP V0
- Architektur-Quelle: [ORA-2278](/ORA/issues/ORA-2278) Deliverable 08
- Sandbox-Beschaffung: [ORA-2285](/ORA/issues/ORA-2285) — Erste Bank Wien EBICS-Sandbox One-Pager
- Folge-Phase: [ORA-2288](/ORA/issues/ORA-2288) — Treasury Phase 3: EBICS-Polling-Implementation
