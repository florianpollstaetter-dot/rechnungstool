# 02 — EBICS-3.0-Flow-Coverage-Matrix

Coverage beider Kandidaten gemessen am MVP-Bedarf (Phase 3 / Säule A.1 — Read-Statements + Phase 4 / Säule A.2 — Pay-Out).

| BTF / Order | Zweck | Kandidat A (ebics-java) | Kandidat B (JOONIS) | MVP-Bedarf |
|---|---|---|---|---|
| **INI** | Initial Subscriber Identification — A005-Bankschlüssel registrieren | ✅ Native (`EbicsClient.sendINI`) | ✅ Native (`fintech.ebics.EbicsClient.ini`) | **Pflicht** |
| **HIA** | HMAC / Encryption-Key Identification — X002 + E002 senden | ✅ Native | ✅ Native | **Pflicht** |
| **HPB** | Bank-PubKey-Letter abholen (für INI/HIA-Akzept-Check) | ✅ Native | ✅ Native | **Pflicht** |
| **HKD** | Subscriber-Status + erlaubte Order Types | ✅ Native | ✅ Native | **Pflicht** (Sanity-Check) |
| **HEV** | Version-Probe — welche EBICS-Versionen / BTFs spricht die Bank? | ✅ Native | ✅ Native | **Pflicht** (Connect-Check) |
| **HTD** | Subscriber-Details (Dump) | ✅ Native | ✅ Native | optional |
| **STA / C53** | Buchungs-Statement im CAMT.053-Format | ✅ Native (FileTransfer) | ✅ Native | **Pflicht** (Säule A.1) |
| **C52** | Intra-Day-Statement CAMT.052 | ✅ Native | ✅ Native | Phase 5 |
| **CCT** | SEPA Credit Transfer pain.001 Upload | ✅ Native (FileTransfer) | ✅ Native | **Pflicht** (Säule A.2) |
| **CCI** | SEPA Instant Credit Transfer (SCT-Inst) | ⚠ unklar — generischer BTF-Pfad nutzbar | ✅ Native | Phase 5 |
| **CDD** | SEPA Direct Debit pain.008 (Lastschriften) | ✅ via FileTransfer | ✅ Native | optional V1 |
| **PTK / Z01** | Tagesprotokoll | ⚠ generisch | ✅ Native | optional V1 |

**Lesart:** ✅ = direkt von der Library bereitgestellt; ⚠ = umsetzbar, aber wir müssten die Order-ID selbst routen.

**Coverage-Lücke Kandidat A — CCI (SCT-Inst):** ebics-java-client kennt CCI nicht als first-class Order-ID. Workaround ist ein generischer BTF-Aufruf mit eigenem Order-Body. Risk Score: niedrig (CCI ist Phase-5-Feature, nicht V1), aber Engineering-Aufwand ~0.5–1 Heartbeat.

**Beide Kandidaten:** decken den **MVP-Pflicht-Pfad (INI/HIA/HPB/HKD/HEV/STA/CCT)** zu 100% ab.

## Test-Plan im PoC (Child-Issues W2, W3, W5)

1. **Bootstrap** — `POST /ebics/init` → `INI` + `HIA` gegen Libeufin. Erwartung: 200, Subscriber-Status `ReadyForUse` nach Banker-Approval-Simulation.
2. **Sanity** — `GET /ebics/hev` + `GET /ebics/hkd`. Erwartung: Bank-Versions-Liste + Subscriber-Berechtigungen.
3. **Statement-Pull** — `GET /ebics/sta?from=YYYY-MM-DD`. Erwartung: gültiges CAMT.053-XML, persistierbar via `POST /api/treasury/statements/upload` (Phase 0+1 Endpoint).
4. **Payment-Upload** — `POST /ebics/cct` mit Fixture-pain.001. Erwartung: 200 + Bank-Order-ID; Idempotenz bei Re-Upload.
5. **Edge-Cases (W5)** — Mismatch-Bank-Key (HPB-Replay), abgelaufene Zertifikate, falsche Order-Bytes (Reject-Pfad).
