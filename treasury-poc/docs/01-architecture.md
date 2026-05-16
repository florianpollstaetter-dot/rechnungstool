# 01 — Architektur & Sicherheits-Boundary

## Sidecar-Pattern (verbindlich)

Beide Kandidaten werden als **eigenständiger Container-Service neben dem Next.js-Hauptprozess** betrieben. Next.js spricht den Sidecar nur über REST an:

```
┌────────────────────────────┐       ┌─────────────────────────┐
│ rechnungstool (Next.js)    │ HTTPS │ ebics-sidecar           │
│ src/app/api/treasury/ebics │──────►│ /init /hkd /sta /cct    │
│  ↳ Audit-Chain-Logging     │       │ /hev /health            │
└────────────────────────────┘       └──────────┬──────────────┘
                                                │ EBICS 3.0
                                                ▼
                                     ┌────────────────────────┐
                                     │ Libeufin (PoC)         │
                                     │ Erste Bank Wien (P3+)  │
                                     └────────────────────────┘
```

Begründung:

1. **Sprachgrenze.** ebics-java läuft auf der JVM; JOONIS auf CPython. Keiner integriert sauber in Node.js. Ein Sidecar ist die einzige nicht-hacky Lösung.
2. **Sicherheits-Boundary.** Schlüsselmaterial (A005/X002/E002 + später PKCS#11-Slot) bleibt im Sidecar-Container. Next.js sieht nie Privatschlüssel — `treasury_payment_runs.evidence_blob` speichert nur signierte Resultate.
3. **Wechselbar.** Java-Container A und Python-Container B sind drop-in austauschbar. Next.js kann ohne Code-Änderung umkonfiguriert werden (`EBICS_SIDECAR_URL`).
4. **Skalierbar.** EBICS-Polling läuft als Worker mit eigenem Cron/Replica-Count; Next.js bleibt request/response.

## Datenfluss STA/C53 (Lese-Pfad)

1. Treasury-Skill-Tool `query_transactions` → `/api/treasury/ebics/sta` (Next.js).
2. Next.js prüft `has_treasury` (Middleware-Gate, Phase 0+1) und ruft `GET ${EBICS_SIDECAR_URL}/ebics/sta?from=…&to=…` auf.
3. Sidecar holt CAMT.053 von der Bank, gibt Roh-XML zurück.
4. Next.js hashed das XML (`sha256`), schreibt einen `treasury_audit_chain`-Eintrag, parsed via `lib/treasury/iso20022/camt053.ts`, persistiert in `treasury_statements` + `treasury_transactions` (RLS-gated).

## Datenfluss CCT/CCI (Schreibe-Pfad, Draft-Only)

1. Skill-Tool `propose_payment` produziert pain.001-Entwurf → `treasury_payment_runs` mit `status='draft'`.
2. Approval-Matrix (Phase 5, ORA-29xx) signiert den Draft.
3. Genehmigter Run wird via `POST /api/treasury/ebics/cct` an den Sidecar geschickt.
4. Sidecar signiert (EBICS-3.0 Order-Signature) und uploaded an die Bank. Audit-Chain-Eintrag mit `cct_uploaded_at`.

**Wichtig:** Der Sidecar führt keine Geld-Transaktion aus. Er formatiert und signiert; die Bank entscheidet. Wir bleiben **Technical Service Provider**, kein Custody.

## Sicherheits-Boundary

| Layer | Zugriff auf Schlüssel | Zugriff auf Bank-URL |
|---|---|---|
| Browser / `treasury` UI | nein | nein |
| Next.js `/api/treasury/ebics/*` | nein | nein |
| ebics-sidecar Container | **ja** (PKCS#12 / PKCS#11) | ja |
| Audit-Chain DB | nein (nur Hashes / Signaturen) | nein |

CloudHSM-Roadmap: PoC nutzt File-Keystore + KMS-CMK encryption-at-rest. PKCS#11-Migration erst nach Produktiv-Volumen (CEO-Entscheid).

## Deployment-Sicht (Phase 3)

- `rechnungstool` Next.js: Vercel `fra1`.
- `ebics-sidecar`: AWS Fargate `eu-central-1`, privates Subnet, Egress nur zur Bank.
- Audit-Chain: Supabase EU (gehört zu Phase 0+1).
- Schlüssel-Storage PoC: EBS-Volume verschlüsselt mit KMS-CMK. Produktion: CloudHSM-Cluster `eu-central-1`.
