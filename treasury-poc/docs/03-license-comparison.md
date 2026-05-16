# 03 — Lizenz-Vergleich (LGPL-2.1 vs. JOONIS-Kommerziell)

## Kandidat A — `ebics-java/ebics-java-client` (LGPL-2.1)

- **Repo:** https://github.com/ebics-java/ebics-java-client
- **Release:** v2.0.0 (2025-11-19)
- **Lizenz:** **LGPL-2.1-or-later**

### Was LGPL-2.1 für uns bedeutet

LGPL ist **weak copyleft**. Wir dürfen die Library frei in einem kommerziellen Closed-Source-Produkt nutzen, **sofern**:

- Wir die Library **dynamisch linken** (bei JVM: separates JAR im Classpath, kein Shading/Fat-Jar). Im Sidecar-Pattern ohnehin der Fall — der Sidecar **ist** die Library plus dünnem REST-Wrapper.
- Wir **Modifikationen an der Library selbst** zurückgeben (`ebics-java-client` selbst, nicht unseren Wrapper).
- Wir bei Distribution ein **License-Notice** mitliefern.
- Endkunden müssen die Möglichkeit haben, die LGPL-Library auszutauschen.

**Erfüllt durch unser Setup:**
- Sidecar = separater Container = dynamisches Linking.
- Wir forken nicht; wir wrappen.
- License-Notice landet in `treasury-poc/services/ebics-sidecar-java/LICENSE-NOTICE.md` und in der Docker-Image-Metadata (`org.opencontainers.image.licenses`).

**Kein Copyleft-Risiko** für unser proprietäres Treasury-Modul oder den späteren Standalone-SKU.

### Auflagen-Restrisiko

- Falls wir die Library **patchen müssen** (z.B. CCI-Support, PKCS#11-Plugin), müssen die Patches gegen LGPL stehen → kommt aufs Upstream-Repo zurück, nicht in unser proprietäres Backend. Aufwand: Engineering, kein Cash.

## Kandidat B — JOONIS Python Fintech (Kommerziell)

- **Hersteller:** joonis.de — deutscher Anbieter, DE-Standort.
- **Lizenzmodell:** Per-EBICS-User-ID, monatlich.

### Preise (Stand 2026-05-16, WebSearch)

| Komponente | Kosten |
|---|---|
| Setup-Fee | **100 EUR einmalig** |
| EBICS-User-ID #1 | **25 EUR / Monat** |
| Jede weitere User-ID | **10 EUR / Monat** |
| Kündigung | monatlich, zum Monatsende |

V1-Setup (CEO-Vorgabe: 2 User-IDs): **100 EUR setup + 35 EUR / Monat**.

### Liefer-Posten zu klären

| Anforderung | Status |
|---|---|
| EBICS-3.0-Support | ✅ ab `fintech>=7.2.7` |
| Per-Order signierender Code (CCT/CCI) | ✅ first-class |
| Quell-Code-Einsicht | ⚠ nur Bytecode/.pyc, JOONIS gibt keine Sources |
| AVV nach Art. 28 DSGVO | **❌ nicht in den AGB sichtbar — Anfrage nötig** |
| Daten-Lokation EU ohne Aufpreis | **❌ nicht spezifiziert — Anfrage nötig** |
| Support-SLA | ⚠ nicht öffentlich publiziert |
| Source-Escrow (für Insolvenz-Fall) | ❌ unbekannt |

### DSGVO-Pflichtprüfung (CEO-Direktive)

CEO hat vorgegeben: **Wenn JOONIS schriftliche AVV (Art. 28 DSGVO) und Daten-Lokation EU nicht ohne Aufpreis zusichern, ist das ein _harter Minuspunkt_ im Decision Memo.**

Action-Item (W3, Child-Issue): JOONIS schriftlich anfragen:

1. AVV-Mustervertrag nach Art. 28 DSGVO.
2. Datenflüsse: Wo werden Bank-Credentials, EBICS-Signaturen, Telemetrie verarbeitet/gespeichert?
3. Sub-Auftragsverarbeiter-Liste (Hoster, Cloud-Provider, Support).
4. Audit-Recht und Insolvenz-Escrow.

Antwort gehört in **diese Datei** als Sektion "JOONIS DSGVO-Antwort" bevor das Decision Memo finalisiert wird.

## Vergleich (Lizenz-Achse)

| Kriterium | Kandidat A (LGPL-2.1) | Kandidat B (JOONIS) |
|---|---|---|
| Cash-Kosten Jahr 1 (2 User-IDs) | **0 EUR** | **520 EUR** (100 + 12×35) |
| Cash-Kosten Jahr 3 kumuliert | **0 EUR** | **1.360 EUR** (100 + 36×35) |
| Copyleft-Risiko bei Sidecar-Pattern | **kein** | n/a |
| Quell-Code-Einsicht | **vollständig** | nein |
| Bus-Faktor Library-Maintainer | klein (43 ★, 3 PRs) | DE-Firma, größerer Pool |
| Insolvenz-Szenario | irrelevant (Sources im Repo) | Escrow-Klausel **muss** ausgehandelt werden |
| DSGVO-AVV ohne Aufpreis | trivial (kein Vertrag nötig) | **offene Frage** |
| Patchbarkeit | wir patchen direkt | wir können nicht patchen |

Detail-TCO (inkl. Engineering-Aufwand) in [`04-cost-tco.md`](04-cost-tco.md).
