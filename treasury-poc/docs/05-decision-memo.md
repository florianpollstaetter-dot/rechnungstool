# ADR-001 — EBICS-Client-Library für Orange Octo Treasury

- **Status:** **ACCEPTED**
- **Datum proposed:** 2026-05-16
- **Datum accepted:** 2026-05-18 (CEO Sign-off via [Comment ef5d0c37](/ORA/issues/ORA-2284#comment-ef5d0c37-c9e6-44a5-a19c-d8f560644cf6); Architektur-Delegation per [ORA-2278](/ORA/issues/ORA-2278))
- **Autor:** Treasury Engineer (Paperclip Agent `ddba9f2d`)
- **Reviewer:** CEO (Paperclip Agent `e81311dc`) — signoff erteilt
- **Verwandte Issues:** [ORA-2284](/ORA/issues/ORA-2284) Parent · [ORA-2278](/ORA/issues/ORA-2278) Architektur-Quelle · [ORA-2288](/ORA/issues/ORA-2288) Phase 3 (Folge)
- **Format:** ADR (Context / Decision / Consequences)

---

## Context

Treasury-MVP V0 ([ORA-2280](/ORA/issues/ORA-2280)) braucht in Phase 3 einen produktiven EBICS-3.0-Client für **STA/C53-Statement-Polling** (Säule A.1) und in Phase 4 für **CCT/CCI-Payment-Upload** (Säule A.2). Da kein produktionsreifer EBICS-3.0-Client in Node/TypeScript existiert, betreiben wir den Client als **Sidecar-Service neben Next.js** (siehe [`01-architecture.md`](01-architecture.md)).

Zwei Kandidaten sind nach Vor-Sondierung übrig:

| Kandidat | Stack | Lizenz | EBICS-3.0 |
|---|---|---|---|
| **A — `ebics-java/ebics-java-client` v2.0.0** | Java 17 + Spring Boot 3 | LGPL-2.1 | ✅ |
| **B — JOONIS Python Fintech (`fintech>=7.2.7`)** | Python 3.12 + FastAPI | Kommerziell, 35 EUR/Mt | ✅ |

Bewertungs-Achsen (CEO-Direktive Rev 2):

1. **DSGVO/AVV-Klarheit** (harter Minuspunkt für B falls AVV/EU-Lokation Aufpreis kosten)
2. **EBICS-Flow-Coverage** für MVP-Pfad
3. **Quell-Code-Zugang / Patchbarkeit**
4. **TCO 12/24/36 Monate inkl. internem Engineering**
5. **Long-Term-Maintenance / Bus-Faktor**
6. **HSM-Integration über AWS CloudHSM PKCS#11** (zukünftig)

## Decision

**Empfehlung: Kandidat A — `ebics-java/ebics-java-client` als Spring-Boot-Sidecar.**

### Begründung

| Achse | Bewertung | Score |
|---|---|---|
| DSGVO / AVV | A trivial konform (keine Vertragsbeziehung, kein Datenfluss zum Hersteller). B abhängig von schriftlicher AVV — Stand jetzt **nicht beantwortet**. | **A +2** |
| MVP-Flow-Coverage | Beide voll für STA/CCT/HKD/HEV/INI/HIA/HPB. B leicht voraus bei CCI (Phase 5). | **B +1** |
| Quell-Code / Patchbarkeit | A vollständig einsehbar und patchbar. B nur Bytecode, kein Source-Escrow garantiert. | **A +2** |
| TCO 36 Monate (siehe [`04`](04-cost-tco.md)) | A ≈ 12.000 EUR, B ≈ 9.950 EUR. Differenz <2,1 kEUR — unter der Entscheidungs-Schwelle. | **B +0.5** |
| Long-Term-Maintenance | A: aktiv (v2.0.0 vom 2025-11-19), kleine Community (43 ★). B: deutsche Firma, etabliert. Mit Sidecar-Pattern und 0–1 Patches/Jahr ist A wartbar. | **gleichauf** |
| HSM-Integration | A: PKCS#11-Plugin Eigen-Implementation erforderlich. B: JOONIS hat HSM-Workflow vorgesehen, Detail offen. | **B +1** |
| Skalierungs-Sensitivität | A skaliert linear ohne Cash-Aufwand. B kostet **+10 EUR/Mt pro zusätzlicher User-ID** — relevant ab ≥10 IDs (Konzern-Konsolidierung Phase 6). | **A +1** |
| Compliance-Auditor-Lesbarkeit | Auditor kann Bytecode bei B nur über DSGVO-AVV abdecken. A: Code ist da. | **A +1** |

**Summenscore:** A **+6** / B **+2,5** → A gewinnt klar an den Achsen "Compliance-Risiko", "Patchbarkeit" und "Skalierung". B's Vorsprung an "CCI Native" und "HSM-vorgesehen" wiegt das nicht auf, weil:

- CCI ist Phase-5-Feature; ebics-java kann es via generischen BTF — Aufwand ~0.5 PT, einmalig.
- HSM-Integration ist beidseitig nicht trivial; ohne explizite JOONIS-PKCS#11-Doku ist ihr Vorsprung Annahme, nicht Beleg.

### Was Decision **nicht** sagt

- Decision sagt **nicht**, JOONIS sei unsicher. Sagt: solange JOONIS' schriftliche AVV nach Art. 28 DSGVO und EU-Daten-Lokation **nicht** belegt sind, ist der Compliance-Pfad unklar — und das ist V1 nicht akzeptabel.
- Decision sagt **nicht**, das Cash-Argument sei für JOONIS. Über 36 Monate sind die TCO-Korridore innerhalb von ~17%. Kein Cash-Gewinn rechtfertigt strategische Nachteile.

## Consequences

### Positive

- Volle Kontrolle über Crypto-Pfad — kein Black-Box-Bytecode in einem regulierten Modul.
- 0 EUR Lizenz-Cash. Treasury bleibt eine **Cost-Cap**-Komponente bis HSM-Migration.
- Konzern-Konsolidierung Phase 6 (10+ EBICS-Subscribers) skaliert ohne neue Verhandlungen.
- Standalone-Treasury-SKU bleibt portierbar — keine kommerzielle Lizenz im Critical Path.

### Negative

- ~3 PT mehr Engineering in den ersten 36 Monaten gegenüber B (siehe TCO).
- CCI (SCT-Inst) braucht Engineering-Workaround, ~0.5 PT, in Phase 5.
- PKCS#11/CloudHSM-Plugin müssen wir selber schreiben (Folge-Issue nach Decision).

### Mitigations

- **Patch-Strategie**: alle Fixes/Features als Upstream-PRs an `ebics-java/ebics-java-client` einreichen. Keine privaten Forks. Senkt Wartungs-Aufwand.
- **CI-Pinning**: `pom.xml` pinned `ebics-java-client` Version → keine Drift bei Hersteller-Releases.
- **Vendor-Backup-Klausel**: ebics-java-client läuft als Sidecar mit stabilem REST-API → bei Library-Tod-Szenario tauschen wir Library, nicht Architektur. JOONIS bleibt als **Notfall-Fallback** im Vendor-Pool (kein Vertrag).
- **HSM-Roadmap**: PoC startet mit File-Keystore + KMS-CMK (encryption-at-rest). PKCS#11-Migration wird in separatem Issue nach erfolgreichem PoC und produktiven Volumen bewertet (CEO-bestätigt).

## Offene Punkte vor Final-Sign-off

1. **DSGVO-AVV-Anfrage an JOONIS** (Child-Issue W3 Decision Trail) — Ergebnis wandert in [`03-license-comparison.md`](03-license-comparison.md) §"JOONIS DSGVO-Antwort". Wenn AVV ohne Aufpreis bestätigt + EU-Lokation belegt → Decision wird nicht geändert, aber dokumentiert.
2. **CCI-Workaround-PoC** (Child-Issue W5) — beweisen, dass ebics-java-client einen generischen BTF mit Order-Type CCI senden kann. Risk Score derzeit "niedrig", muss aber im PoC validiert sein bevor Phase 5 startet.
3. **Performance-Bench** (Child-Issue W4) — bestätigt, dass Spring-Boot-Sidecar 100k CAMT.053-Entries in akzeptabler Zeit/RSS verarbeitet. Falls Java-Sidecar im Bench grob unterlegen ist (>5× Speicher gegenüber Python), eskaliert das die Entscheidung — derzeit kein Hinweis darauf.

## Performance

Bench-Driver: [`treasury-poc/bench/run_bench.sh`](../bench/run_bench.sh) +
CI-Workflow [`.github/workflows/treasury-poc-bench.yml`](../../.github/workflows/treasury-poc-bench.yml).
Misst `GET /ebics/sta` über den ebics-java-Sidecar + In-House-EBICS-3.0-Mock
mit 1k / 10k / 100k CAMT.053-Einträgen (hyperfine warmup=10, runs=50). Peak
RSS via `docker stats`, Image-Größe via `docker save | gzip | wc -c`.

**Acceptance-Gate ([ORA-2298](/ORA/issues/ORA-2298)):** bei 100k Statements
darf der Sidecar Peak-RSS ≤ 1 GiB und mittlere STA-Latenz ≤ 5 s nicht
überschreiten. Andernfalls Tuning-PR (`MaxRAMPercentage`, GC, streaming
parser) oder ein Folge-Issue.

**Ergebnisse (CI-Run 2026-05-21, commit `93cf540`, 50 Runs, warmup=10):**

| Statements | Mean-Latenz | Max-Latenz | Sidecar-RSS |
|---|---|---|---|
| 1 k | 51 ms | 68 ms | 367 MiB |
| 10 k | 103 ms | 125 ms | 438 MiB |
| 100 k | 619 ms | 665 ms | **884 MiB** |

**Acceptance-Gate: ✅ PASS.** 100k Peak-RSS 884 MiB < 1 GiB-Limit; 100k
Mean-Latenz 619 ms < 5 s-Limit. Kein Tuning-PR erforderlich. Image-Größe:
ebics-sidecar 102 MB gzipped. Vollständige Tabellen in
[`../bench/results.md`](../bench/results.md).

## Sign-off

| Rolle | Agent | Status |
|---|---|---|
| Engineer (Autor) | Treasury Engineer (`ddba9f2d`) | ✅ proposed |
| CEO | (`e81311dc`) | ✅ accepted 2026-05-18 |

ADR ist **ACCEPTED**. Follow-up Child-Issues für W2-impl (Production-Sidecar), W4-bench (Performance) und HSM-Roadmap werden direkt unter [ORA-2284](/ORA/issues/ORA-2284) angelegt; W2-impl wird als Blocker auf [ORA-2288](/ORA/issues/ORA-2288) verdrahtet. JOONIS-Backup-Pfad wird per CEO-Direktive **nicht weiter gepflegt**.
