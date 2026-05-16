# 04 — TCO 12 / 24 / 36 Monate (inkl. Engineering-Aufwand)

Annahmen:

- **2 EBICS-User-IDs** in V1 (CEO-Vorgabe).
- Sidecar läuft auf AWS Fargate `eu-central-1`: 0.5 vCPU / 1 GB / 1 Replica → ~16 EUR/Monat (gilt für **beide** Kandidaten, daher in der Diff nicht enthalten).
- Senior-Engineer-Stundensatz intern: 120 EUR/h (interner Verrechnungspreis; nicht externer Stundensatz).
- KMS-CMK + EBS-Verschlüsselung in der PoC-Phase: ~5 EUR/Monat (gilt für beide).
- CloudHSM ist **nicht** im V1-TCO — kommt in einem späteren Folge-Issue, wenn Produktiv-Volumen das rechtfertigt.

## Engineering-Aufwand (einmalig, beim Onboarding der Library)

| Posten | Kandidat A (ebics-java) | Kandidat B (JOONIS) |
|---|---|---|
| Spring-Boot-Wrapper / FastAPI-Wrapper | 1 Sprint (~5 PT) | 0.5 Sprint (~2.5 PT) |
| Cert-Management & Bootstrap-Flow (INI/HIA) | 0.5 Sprint | 0.25 Sprint |
| CCI-Support nachrüsten (BTF-Routing) | 0.5 Sprint | 0 (native) |
| HSM-Integration (PKCS#11) später | 1 Sprint (Plugin selbst schreiben) | 0.5 Sprint (vom Hersteller vorgesehen) |
| Patch-Workflow / Upstream-Beiträge | 0.5 Sprint | 0 (kein Source-Zugriff) |
| **Einmal-Engineering-Stunden** | **~3.5 PT × 8h × 120 EUR ≈ 3.360 EUR** | **~3.25 PT × 8h × 120 EUR ≈ 3.120 EUR** |

> 1 PT = 1 Personentag = 8h. Differenz <10% — nicht entscheidungs-relevant.

## Wartung (laufend, pro Jahr)

| Posten | Kandidat A | Kandidat B |
|---|---|---|
| Library-Updates beobachten / einspielen | 0.25 PT / Quartal × 4 = 1 PT/Jahr | 0.1 PT / Quartal × 4 = 0.4 PT/Jahr |
| Eigene Patches mit Upstream synchronisieren | 0.5 PT/Jahr | 0 |
| Bank-Cert-Rotation handhaben | 0.5 PT/Jahr | 0.5 PT/Jahr (beide identisch) |
| Incident-Response / On-Call EBICS | 1 PT/Jahr (gemeinsame Baseline) | 1 PT/Jahr |
| **Eng-Stunden pro Jahr** | **3 PT ≈ 2.880 EUR/Jahr** | **1.9 PT ≈ 1.824 EUR/Jahr** |

## Lizenz-Kosten (Cash an Dritte)

| Posten | Kandidat A | Kandidat B |
|---|---|---|
| Einmal-Setup | 0 | 100 EUR |
| Pro Jahr (2 User-IDs) | 0 | 12 × 35 = 420 EUR |

## TCO-Tabelle

> EUR, gerundet. Engineering = einmalig im ersten Jahr + laufende Wartung.

| Horizont | Kandidat A (ebics-java) | Kandidat B (JOONIS) | Differenz (A − B) |
|---|---|---|---|
| **Jahr 1** | 3.360 (eng) + 0 (lic) + 2.880 (maint) = **6.240** | 3.120 (eng) + 520 (lic) + 1.824 (maint) = **5.464** | **+776 EUR** (A teurer) |
| **Jahr 1 + 2 (24 Mt)** | 6.240 + 2.880 = **9.120** | 5.464 + 420 + 1.824 = **7.708** | **+1.412 EUR** (A teurer) |
| **Jahr 1 + 2 + 3 (36 Mt)** | 9.120 + 2.880 = **12.000** | 7.708 + 420 + 1.824 = **9.952** | **+2.048 EUR** (A teurer) |

### Lesart der Zahlen

- **A ist im 3-Jahres-Horizont nur ~2 kEUR teurer als B.** Beide Optionen liegen unter 13 kEUR über 3 Jahre. Die Lizenz-Differenz ist **nicht entscheidungs-relevant** — der TCO-Sieg von B beruht auf ~1 PT weniger Engineering pro Jahr.
- **Wenn JOONIS die DSGVO-AVV nicht ohne Aufpreis liefert** oder ein Preis-Upgrade verlangt, kippt die TCO-Bilanz schnell.
- **Skalierungs-Sensitivität:** Jede zusätzliche EBICS-User-ID kostet bei B **+120 EUR / Jahr / User-ID** Cash. Bei A: 0. Ab ~10 User-IDs (Konzern-Konsolidierung Phase 6) wendet sich das Blatt zugunsten A.

## Versteckte Risiken

| Risiko | Kandidat A | Kandidat B |
|---|---|---|
| Library-Hersteller-Insolvenz | irrelevant (LGPL, Sources im Repo) | **hoch** ohne Escrow-Klausel |
| Preis-Erhöhung beim Vertragspartner | nicht möglich | möglich (monatlich) |
| Compliance-Audit "open source mit AML-Funktion" | leichter (Auditor sieht Code) | schwieriger (Bytecode) |
| Vendor Lock-in | niedrig (BTF-Standard via abstraktes Sidecar-API) | niedrig (gleiches Pattern) |

## Fazit der reinen TCO-Achse

**Beide Optionen liegen in einem Korridor von ~2 kEUR über 3 Jahre.** Die Entscheidung kippt nicht an der Cash-Frage — sie kippt an **Quell-Code-Zugang, DSGVO-AVV-Klarheit und Patchbarkeit**.

Empfehlung in [`05-decision-memo.md`](05-decision-memo.md).
