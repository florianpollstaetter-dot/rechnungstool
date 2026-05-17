// ORA-2291 — Public Treasury marketing content.
// Quellen: deliverables/02_marktlandschaft.md, deliverables/07_top_features_katalog.md,
// deliverables/08_orange_octo_treasury_architecture.md.

export type FeatureStatus = "live" | "building" | "v1" | "v2";

export type PillarFeature = {
  title: string;
  description: string;
  why: string;
  status: FeatureStatus;
};

export type Pillar = {
  key: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I";
  icon: string;
  title: string;
  features: PillarFeature[];
};

export const TREASURY_TAGLINE = "alles im Stack, den du schon nutzt.";

export const PILLARS: Pillar[] = [
  {
    key: "A",
    icon: "🏦",
    title: "Bank-Konnektivität & Saldo-Tracking",
    features: [
      {
        title: "Multi-Bank-Aggregation via EBICS 3.0",
        description:
          "Holt CAMT.053 (EOD) und CAMT.052 (intraday) automatisch alle 15 Minuten von allen Hausbanken — jede Bewegung erscheint sofort im Cash-Dashboard.",
        why:
          "Florian-MUST-HAVE Nr. 1 — „permanent Kontostände tracken”. EBICS ist in DACH der Standard mit 11.000+ erreichbaren Banken; ohne diese Schicht ist das Tool kein Treasury-Tool.",
        status: "building",
      },
      {
        title: "Bank Account Management mit Lifecycle",
        description:
          "Master-Datenbank aller Konten pro Entity: IBAN, Währung, Status, Bevollmächtigte mit Signatur-Klassen, EBICS-Konfig. Workflows für Eröffnung, Vollmacht-Update und Schließung.",
        why:
          "Bei 50–200 Konten pro Konzern ist Excel-basiertes Vollmachten-Tracking die Quelle von 90 % aller Audit-Findings. Wir machen es dynamisch und koppeln BAM direkt an die Approval-Matrix.",
        status: "v1",
      },
      {
        title: "Echtzeit-Cash-Dashboard, Multi-Entity",
        description:
          "Konsolidierte Cash-Position pro Konto / Bank / Entity / Währung. Filter nach Datum, Konzern-Hierarchie und Währung; Auto-Refresh alle 15 Sekunden.",
        why:
          "Cash-Visibility ist die #1-Aufgabe jedes Treasurers. Trovata-UX-Tiefe gepaart mit Kyriba-Hierarchie-Tiefe, ohne deren Bloat.",
        status: "building",
      },
      {
        title: "FinTS / HBCI für Sparkassen + Volksbanken",
        description:
          "Anbindung an Sparkassen, Volksbanken, DKB, ING, comdirect via FinTS 3.0 (PIN/TAN). Read-only Salden + Statement-Import.",
        why:
          "Viele Mittelständler haben Nebenkonten bei Banken, die kein EBICS anbieten. Niemand außerhalb von Agicap/Subsembly deckt FinTS gut ab; Tier-1 ignoriert es.",
        status: "v1",
      },
      {
        title: "Direct-Bank-APIs (Top 5 DACH)",
        description:
          "Echtzeit-Anbindung an Deutsche Bank Autobahn, Commerzbank, UniCredit, HSBC und Erste Bank Wien. Sub-sekundige Salden und Push-Notifications bei Eingängen über Schwellen.",
        why:
          "EBICS hat einen 15-Minuten-Polling-Floor; echte Echtzeit braucht API-direct. Diese 5 Banken decken ~80 % des DACH-Konzern-Banking-Volumens.",
        status: "v2",
      },
    ],
  },
  {
    key: "B",
    icon: "💸",
    title: "Zahlungsverkehr & Massen-Approvals",
    features: [
      {
        title: "SEPA Credit Transfer (Einzel + Sammler)",
        description:
          "Erzeugt pain.001-XML für SEPA-Überweisungen. Einzeltransfers ad-hoc, Sammelzahlungen per CSV/Excel-Import oder aus ERP-Open-Items. Validierung pro Zeile: IBAN, BIC, Sanctions.",
        why:
          "Florian-MUST-HAVE Nr. 2 — „Überweisungen und Massenüberweisungen einspielen und freigeben”. TIS hat das, aber volume-basiertes Pricing; wir bleiben Flat-Fee.",
        status: "building",
      },
      {
        title: "SEPA Direct Debit + Mandats-Management",
        description:
          "pain.008 Direct-Debit (CORE + B2B), Mandats-Lifecycle (issued → active → first-used → cancelled), R-Message-Handling, automatische Pre-Notification.",
        why:
          "Treasurer-Tagesgeschäft. Bellins Mandats-UI ist 2014-vintage — wir bauen State-Machine-basierte Workflows.",
        status: "v1",
      },
      {
        title: "4-Augen + konfigurierbare Approval-Matrix",
        description:
          "Pay-Runs bündeln Einzelpayments oder Sammler. Approval-Matrix pro Konto × Schema × Betrag × Empfänger-Klasse; multidimensional, mit CFO-Sign-off ab Schwelle.",
        why:
          "Treasury-MUSS-Funktion und Anti-Fraud-Werkzeug Nr. 1. Bellins Matrix ist linear (Betrag → N Freigeber); wir machen sie multidimensional inklusive Tageszeit und Risikoscore.",
        status: "v1",
      },
      {
        title: "EBICS-TS Signing via HSM",
        description:
          "Pain.001-Payload wird mit persönlichem A005/A006-Key signiert. Key in AWS CloudHSM Frankfurt oder lokalem Smartcard-Reader. Bank validiert und führt aus — wir bewegen kein Geld.",
        why:
          "Nur mit EBICS-TS und Customer-Key-Signing bleiben wir Technical Service Provider und lizenzfrei. Robust gegen €10M-Wrong-Bene-Haftung.",
        status: "v1",
      },
      {
        title: "SCT Inst + Verification of Payee (VoP)",
        description:
          "SEPA-Instant-Zahlungen (10-Sekunden-Settlement) mit VoP-Check vor Submission: Name+IBAN-Match gegen die Empfänger-Bank-API, Match / Mismatch / Unknown.",
        why:
          "Regulatorische Pflicht seit 9. Okt 2025 (SEPA IPR). Nomentia + Bellin haben angekündigt aber bisher nicht geliefert.",
        status: "v1",
      },
      {
        title: "Auslandszahlungen (DTAZV / SWIFT MX / pacs.008)",
        description:
          "Fremdwährungs-Zahlungen außerhalb SEPA. DTAZV für Bundesbank-Meldepflicht, SWIFT MX (pacs.008) für ISO 20022 CBPR+ Cutover.",
        why:
          "Jeder Konzern hat USD/GBP/CHF-Zahlungen. CBPR+ Cutover ist hart — wer auf MT103 hängt, blockt.",
        status: "v1",
      },
      {
        title: "Payment-Status-Reports (pain.002) Auto-Reconcile",
        description:
          "Bank sendet pain.002 mit Status pro Payment zurück. System matcht gegen den Pay-Run: „85 OK, 2 rejected, 1 pending settlement” — Push-Notification bei Rejects.",
        why:
          "Ohne Status-Tracking ist der Pay-Run nicht abgeschlossen. Wettbewerb liefert nur Excel-Export; wir machen Live-Status.",
        status: "v1",
      },
    ],
  },
  {
    key: "C",
    icon: "📊",
    title: "Forecasting & Liquidity Planning",
    features: [
      {
        title: "ML-basierter 13-Wochen Direct-Method Forecast",
        description:
          "Pro Entity ein rollierender 13-Wochen-Forecast nach Cash-Flow-Kategorie (Receivables, Payables, Payroll, Taxes, CapEx, Financing). LightGBM auf 24 Monaten Bank-Historie + ERP-Open-Items.",
        why:
          "BCG 2024: USD 1,2 M Kapitaleffizienz pro Mrd. Umsatz, wenn der Forecast 30 %+ besser ist als Excel. Konkretester ROI-Anker für die CFO-Demo. Nomentias „AI Forecast” ist ARIMA-Wrapper.",
        status: "v1",
      },
      {
        title: "Driver-based Forecast + Scenario-Branching",
        description:
          "Treasurer baut Cash-Flow-Drivers grafisch („Umsatz × DSO / 30”) und branched Szenarien (Best / Base / Worst). ERP-Änderungen propagieren automatisch.",
        why:
          "Für M&A-Pipeline, Working-Capital-Aktionen, FX-Volatilität braucht der Treasurer Wenn-dann-Hebel. ML alleine reicht nicht.",
        status: "v1",
      },
      {
        title: "Variance-Auto-Commentary in Deutsch",
        description:
          "Claude generiert auf Knopfdruck eine deutsche Texterklärung: „Cash-Position 4,2 Mio. niedriger als Forecast — getrieben von 2,8 Mio. verspätetem Eingang Kunde XYZ und 1,1 Mio. Steuer-Vorauszahlung Q3.”",
        why:
          "Treasurer verbringen 4–6 Std./Woche damit, solche Texte für den CFO-Boardpack zu schreiben. KI macht das in 30 Sekunden mit Wirtschaftsprüfer-fähigem Provenance-Block.",
        status: "v1",
      },
      {
        title: "Self-learning Forecast mit Wochen-Retrain + Drift-Alert",
        description:
          "Modell retrainiert sich jeden Sonntag aus den neuen Bewegungen. Drift-Detection (Evidently/WhyLabs) flaggt strukturelle Änderungen wie verschlechterte DSO bei Schlüsselkunden.",
        why:
          "Frontier-Differenzierer: weder Kyriba TAI noch Trovata noch GTreasury haben Wochen-Retrain als Default-Pipeline.",
        status: "v2",
      },
    ],
  },
  {
    key: "D",
    icon: "🤖",
    title: "KI & Conversational Layer",
    features: [
      {
        title: "Treasury-Skill (Conversational Q&A in DE+EN)",
        description:
          "Chat-Sidebar im Treasury-Modul. „Wieviel EUR habe ich bei der Erste Bank Wien per letzten Donnerstag?” Claude via AWS Bedrock EU-Central-1 ruft die richtigen Read-Tools auf, liefert Antwort mit Provenance.",
        why:
          "KI ist nicht mehr Modul, sondern Default-Interaktion. Trovata-AI ist englisch, Kyriba TAI eingegrenzt auf 11 Konzern-Kunden — wir liefern Deutsch und für den Mittelstand.",
        status: "live",
      },
      {
        title: "Auto-generiertes CFO-Boardpack (signed PDF, DE)",
        description:
          "Per `generate_boardpack(period, language='de')`: vollständiges Treasury-Boardpack mit Cash-Übersicht, FX-Exposure, Hedge-Stand, Variance-Commentary, IKS-Hinweisen. Signiertes PDF mit Hash-Verification.",
        why:
          "Wirtschaftsprüfer akzeptieren das signierte Boardpack als IKS-Beleg. Spart 8 Std./Quartal. Niemand baut das in deutscher Sprache mit Audit-Provenance.",
        status: "v1",
      },
      {
        title: "Anomaly + Fraud Detection",
        description:
          "ML markiert anomale Zahlungen: Empfänger-IBAN-Wechsel, Betrag außerhalb des historischen Bands, Cadence-Bruch, IBAN-Country-Mismatch. Rote Flags routen automatisch zu CFO + Treasurer.",
        why:
          "BEC ist die #1-Angriffsmethode (AFP 2025). Arup-Case: USD 25,6 M Deepfake-CFO-Verlust. VoP allein reicht nicht — wir ergänzen mit Autoencoder + Isolation Forest auf Transaktions-Pattern.",
        status: "v1",
      },
      {
        title: "Autonomous Treasury Agent (Vorschlag-only)",
        description:
          "Schlägt Hedge-Ratios vor, MMF-Allocation und Pool-Rebalances. **Nie Auto-Execute** — alle Vorschläge gehen als Drafts in die Approval-Matrix.",
        why:
          "Frontier-Feature. Kyriba TAI ist Konzern-eingeschränkt; wir bringen es zum Mittelstand und bleiben regulatorisch sicher durch Approval-Gate.",
        status: "v2",
      },
    ],
  },
  {
    key: "E",
    icon: "🛡️",
    title: "Audit, Compliance, Risk",
    features: [
      {
        title: "Cryptographic Append-Only Audit-Log",
        description:
          "Jeder State-Change (Konto-Anlage, Vollmacht, Pay-Run-Approval, Forecast-Update, Sanctions-Resolution) erzeugt einen unveränderlichen Log-Eintrag, hash-chained (SHA-256), optional Customer-Key-signiert.",
        why:
          "Premium-Pricing-Eskalator und USP von Tag 1. Nomentia liefert Excel-Export; Kyriba SOC-2-typisch ohne Hash-Chain. Wirtschaftsprüfer öffnen Türen für uns.",
        status: "live",
      },
      {
        title: "Sanctions-Screening (EU + OFAC + UK OFSI)",
        description:
          "Vor jeder Payment-Generierung wird Empfänger gegen Sanctions-Listen geprüft: Substring (rapidfuzz) + Embedding-Match + Listen-Lookup. Hit-Workflow erzwingt dokumentierte Begründung.",
        why:
          "Compliance-Voraussetzung in jeder Procurement. Serrala nutzt strikte Listen-Lookups (False-Positive-Hölle); wir hybrid mit Embeddings — 95 %+ Genauigkeit, 10× weniger False Positives.",
        status: "v1",
      },
      {
        title: "RLS-basierte Multi-Tenant-Trennung",
        description:
          "Jede Treasury-Tabelle in Supabase hat Row-Level-Security-Policies, die SELECT/INSERT/UPDATE/DELETE auf die `company_id` des Anrufers gaten. Cross-Tenant-Reads architektonisch unmöglich.",
        why:
          "Nicht-verhandelbar für Multi-Mandant-SaaS. DSGVO + DORA + ISO 27001 setzen DB-Layer-Trennung voraus. Viele SaaS-Anbieter trennen nur im App-Layer — post-Snowflake-Era unzeitgemäß.",
        status: "live",
      },
      {
        title: "IKS-Reports & Wirtschaftsprüfer-Export",
        description:
          "Standard-Berichte für interne Kontrollsysteme: Segregation of Duties, Approval-Matrix-Snapshot, Sanctions-Hit-Resolution, Hash-Chain-Integrity. Export als CSV + signed-PDF + JSON für SIEM.",
        why:
          "Premium-Layer, der den Wirtschaftsprüfer in die Pricing-Eskalation einbindet. SAP-TRM-Reports sind aus 2008; wir machen es modern, signed und hash-validated.",
        status: "v1",
      },
    ],
  },
  {
    key: "F",
    icon: "💱",
    title: "FX, Hedging, Investment, Debt",
    features: [
      {
        title: "FX-Exposure-Reporting (Gross + Net)",
        description:
          "Pro Entity / Währung die offene FX-Position (Gross + Net) gegen Bilanz-Währung. ECB-Referenzkurs kostenlos; Refinitiv/Bloomberg-Feed optional für Real-time im Enterprise-Tier.",
        why:
          "Jeder Mittelständler mit FX-Exposure braucht das. ION Reval ist Enterprise-only — wir machen es Mittelstand-bezahlbar.",
        status: "v1",
      },
      {
        title: "Investment-Tracking (Tagesgeld / Festgeld / MMF)",
        description:
          "Trackt Bestände pro Provider, Zinssatz, Laufzeit, Counterparty-Limit. KI-Vorschlag: „2 M EUR liegen bei BNP auf Tagesgeld 2,1 %; BlackRock Liquid Plus liefert 2,8 % — Switch-Vorschlag?”",
        why:
          "Post-Hochzins-Welt: Idle-Cash-Optimierung ist wieder Top-Thema und Treasurer-Wunschliste #1. GTreasury hat es als Konzern-Modul; Bellin/Nomentia gar nicht.",
        status: "v1",
      },
      {
        title: "Hedge-Tracking (Forwards / Swaps / Options)",
        description:
          "Hedge-Inventar mit Mark-to-Market via ECB/Provider-Feed. Reporting: realisierte vs. unrealisierte Hedge-Ergebnisse, Effectiveness-Tests light (IFRS 9 prospective qualitativ).",
        why:
          "Mittelständler hedgen FX zu 60–80 % und brauchen Tracking. Excel ist Compliance-Risiko. Reval ist Overkill für den Mittelstand — wir liefern den 80 %-Use-Case sauber.",
        status: "v2",
      },
      {
        title: "Counterparty-Risk-Score je Hausbank",
        description:
          "Score (1–10) pro Hausbank auf Basis aktueller CDS-Spreads, Rating-Aggregat (Moody's/S&P/Fitch), News-Sentiment (Claude-Klassifizierung). Score-Drop unter 5 → Alert.",
        why:
          "Post-SVB-Welt. Nilus reitet diese Welle als USP, ist aber US-only ohne Konzern-Tiefe.",
        status: "v2",
      },
    ],
  },
  {
    key: "G",
    icon: "🧩",
    title: "Konzern, In-house-Banking, Netting",
    features: [
      {
        title: "Multi-Entity-Hierarchie + Cash-Pool",
        description:
          "Konzern-Strukturen als Baum (Holding → Töchter → Enkel). Cash-Pool-Visualisierung mit Master + Sub-Accounts. Konsolidierungs-Reports T+1 (V1), intraday (V2).",
        why:
          "Ohne Multi-Entity ist das Tool unbrauchbar für jeden Mittelstand-Konzern mit >3 Töchtern. Kyriba ist zu komplex für den Mittelstand — wir vereinfachen, ohne zu kastrieren.",
        status: "v1",
      },
      {
        title: "Intercompany-Konten + Manuelles Netting",
        description:
          "Pro Konzern-Paar ein Intercompany-Account. Treasurer kann Salden manuell netten — Drei-Wege-Netting per Drag-and-Drop. Auto-Generation der pain.001-Sammler.",
        why:
          "Ohne Intercompany-Netting verschenken Treasurer 0,5–1 % an Transaktions-Fees. Bellins Workflow ist clunky; wir machen Drag-and-Drop.",
        status: "v1",
      },
      {
        title: "In-House Bank Basics",
        description:
          "Eine Tochter (üblich: die Treasury-Holding) fungiert als interne Bank für Schwestern. Statements aus IHB-Sicht; jedes Tochter-Konto wird zum Sub-Account. Zinsen automatisch berechnet.",
        why:
          "Ab €500 M Konzern-Umsatz wird IHB Wirtschaftsprüfer-Standard. ION/SAP In-House Cash sind überdimensioniert für den Wedge — wir machen es einfach.",
        status: "v2",
      },
      {
        title: "POBO / ROBO (Payments / Receipts on behalf of)",
        description:
          "Holding zahlt oder empfängt im Namen der Tochter. Beim pain.001: Absender-Konto = Holding, ultimate-debtor = Tochter. Senkt Anzahl Bank-Konten signifikant.",
        why:
          "Konzern-Mehrwährungs-Konstrukt. Bei Kyriba/ION beratungs-heavy; wir machen es konfigurations-leicht.",
        status: "v2",
      },
    ],
  },
  {
    key: "H",
    icon: "📈",
    title: "Reporting & Analytics",
    features: [
      {
        title: "Standard-Reports (Cash / Forecast / Variance / Payments / Sanctions)",
        description:
          "Fünf vordefinierte Reports, jeden mit Excel-/CSV-/PDF-Export und zeitgesteuerter E-Mail-Verteilung an konfigurierbare Empfänger.",
        why:
          "Treasurer-Tagesgeschäft — jeder braucht das. Bei den Großen oft hinter Custom-Implementation-Stunden versteckt; bei uns out-of-the-box.",
        status: "v1",
      },
      {
        title: "Conversational Query über alle Cash-Daten",
        description:
          "„Zeige mir alle Outflows >€100k aus dem letzten Quartal, kategorisiert nach Empfänger-Typ.” Semantic Layer (dbt-View) + Claude mit Tool-Calling liefert tabellarische Antwort.",
        why:
          "Frontier-Differenzierer. Trovata bewiesen, dass das funktioniert — wir machen es deutsch + englisch und mit Audit-Provenance.",
        status: "v1",
      },
      {
        title: "Embeddable Dashboards (iframe / Power BI)",
        description:
          "Treasury-KPI-Widgets eingebettet in CFO-Boardpack-PowerPoint, internes Confluence oder Investor-Portal via signed-iframe-URLs.",
        why:
          "CFO-Boards leben in PowerPoint, nicht in unserer App. Embed senkt die Friktion. Kyriba hat Power-BI-Integration; wir machen es selbst-service.",
        status: "v2",
      },
    ],
  },
  {
    key: "I",
    icon: "🚀",
    title: "Plattform & Integrationen",
    features: [
      {
        title: "4-Wochen-Onboarding-Wizard",
        description:
          "Schritt-für-Schritt: Mandant anlegen → erstes Bank-Konto via EBICS verbinden → ML-Forecast-Daten importieren → erstes Pay-Run-Template. Live in 4 Wochen statt 4 Quartalen.",
        why:
          "Anti-Kyriba (9 Monate Implementation), Anti-ION. Wesentliches Sales-Argument; Embat hat 2–6-Wochen-Setup als SMB-Standard etabliert — wir machen das Konzern-tauglich.",
        status: "v1",
      },
      {
        title: "Modulares Pricing + Standalone-Mode",
        description:
          "`company_subscriptions.has_treasury` schaltet das Modul frei. Drei Tiers: Starter / Pro / Enterprise. Standalone-Mode: Kunde kauft nur Treasury, keine Octo-Routes sichtbar.",
        why:
          "Florians Vorgabe: Treasury ist optional buchbar, aber auch standalone verkaufbar. Coupa BSM hat es als Add-on, Stripe-Subscriptions als Pattern — wir kombinieren beides.",
        status: "live",
      },
      {
        title: "SSO/SAML, SCIM, MFA",
        description:
          "Single-Sign-On via SAML 2.0 / OIDC (Azure AD, Okta, Google Workspace, Auth0). SCIM für User-Sync. MFA per TOTP + WebAuthn.",
        why:
          "Konzern-Procurement-Voraussetzung. Ohne SSO/SCIM kommt man durch keinen Enterprise-RFP.",
        status: "v1",
      },
      {
        title: "Vollständige REST-API + Webhooks",
        description:
          "Jeder Treasury-Endpoint (Read + Write) ist als REST-API verfügbar. Webhooks für Events: payment.created, payment.signed, payment.executed, payment.rejected, sanctions.hit.opened, forecast.generated.",
        why:
          "API-first von Tag 1. Embedded-Finance-Use-Cases (Buchhaltung importiert Pay-Run-Belege automatisch). GTreasury und Trovata haben das vorgemacht.",
        status: "v1",
      },
      {
        title: "ERP-Konnektoren (SAP, DATEV, Sage, MS Dynamics)",
        description:
          "Open-Items-Import aus SAP S/4HANA, DATEV Unternehmen online, Sage und MS Dynamics — als Feed für den ML-Forecast und für Auto-Reconciliation bei pain.002.",
        why:
          "Ohne ERP-Anbindung bleibt der Forecast schlechter als möglich. DACH-Treasurer leben in DATEV/SAP — wir docken nativ an statt Custom-Import.",
        status: "v2",
      },
      {
        title: "Mobile App (iOS + Android) für Approvals",
        description:
          "Native Apps mit FaceID/TouchID-Login. Pay-Run-Approval-Inbox; Push-Notifications bei pending Approval; Approval mit Bio-ID; Position-Snapshot.",
        why:
          "CFOs sind unterwegs. Approval auf dem Smartphone halbiert den Pay-Run-Cycle. Kyriba und Bellin haben Mobile-Apps; wir liefern es zum Mittelstands-Preis.",
        status: "v2",
      },
    ],
  },
];

export type Competitor = {
  name: string;
  tier: string;
  bestFeatures: string[];
  ourAngle: string;
};

export const COMPETITORS: Competitor[] = [
  {
    name: "Nomentia (Tipco + Analyste)",
    tier: "Tier 2 · DACH-Liebling",
    bestFeatures: [
      "EBICS/SEPA-Tiefe mit 11.000+ Banken-Reichweite",
      "Bank Account Management — Gold-Standard für Konzerne",
      "Nordic + DACH-Footprint, Multi-Mandanten-Hierarchie",
    ],
    ourAngle:
      "Nomentias UI ist „SAP 2010”, Releases nur quartalsweise, „AI Forecast” ist ein ARIMA-Wrapper. Wir liefern moderne UX, Wochen-Ship-Velocity und echte ML — bei explizit unzufriedener Bestandskunden-Basis (Gartner / G2 / TrustRadius).",
  },
  {
    name: "Kyriba",
    tier: "Tier 1 · Marktführer Konzern",
    bestFeatures: [
      "Payments-Hub mit >$15 Bio./Jahr Volumen",
      "Multi-Mandanten-Hierarchie + konfigurable Approval-Matrix",
      "Kyriba TAI — produktive Agentic-AI (Oct 2025, 11 Co-Innovation-Konzerne)",
    ],
    ourAngle:
      "Kyriba ist Konzern-only, TCO €500k+, UX uneinheitlich, TAI auf 11 Konzern-Kunden eingegrenzt und englisch. Wir bringen Agentic-AI auf Deutsch zum Mittelstand — als Vorschlag-Engine in der Approval-Matrix statt Auto-Trader.",
  },
  {
    name: "Coupa Treasury (ex-Bellin)",
    tier: "Tier 1 · DACH-Veteran",
    bestFeatures: [
      "Native EBICS-Implementierung — DACH-Liebling seit Jahren",
      "Intercompany-Netting, In-house-Bank, POBO/ROBO sauber gelöst",
      "EBICS-TS Signing via Smartcard etabliert",
    ],
    ourAngle:
      "Post-Thoma-Bravo Investment-Druck, Founder-Exit, KI-Lücke. Mandats-UI ist 2014-vintage und Approval-Matrix linear. Wir bauen moderne State-Machine-Workflows, HSM-as-a-Service in der Cloud, multidimensionale Approvals.",
  },
  {
    name: "ION Treasury (Reval, IT2, WSS, Openlink)",
    tier: "Tier 1 · Konzern-Schwergewicht",
    bestFeatures: [
      "Reval — IFRS 9 / ASC 815 Hedge-Accounting Gold-Standard",
      "Commodities + Zentralbanken-Tauglichkeit",
      "Konzern-Skalierung mit Multi-Modul-Tiefe",
    ],
    ourAngle:
      "Acquired & stagnated: alte UI, schwache KI, höchster TCO am Markt. Reval ist Enterprise-only und Hedge-Overkill für den Mittelstand. Wir liefern Hedge-Tracking für den 80 %-Use-Case und überlassen die letzten 20 % einer Partner-Integration.",
  },
  {
    name: "Serrala (ex-Hanse Orga)",
    tier: "Tier 1 · SAP-DNA",
    bestFeatures: [
      "Tiefste SAP-Integration am Markt (O2C/P2P/Treasury aus einem Haus)",
      "Sanctions-Screening Alevate Compliance — DACH-Banken-Standard",
      "Hamburg-HQ, deutsche Compliance-Tiefe",
    ],
    ourAngle:
      "„AR-first” Image, Alevate-Migration zieht sich, KI dünn. Strikte Listen-Lookups beim Sanctions-Screening erzeugen False-Positive-Hölle. Wir bauen hybrid mit Embedding-Match — 95 %+ Genauigkeit, 10× weniger False Positives.",
  },
  {
    name: "TIS",
    tier: "Tier 2 · Payment-Hub-Spezialist",
    bestFeatures: [
      "Payment-Hub-Tiefe für europäische Komplexität",
      "VoP-Early-Adopter (Sibos 2025), CBPR+-Cutover ready",
      "Hedgebook-Akquisition für einfache FX-Workflows",
    ],
    ourAngle:
      "Walldorf-SAP-DNA mit „bolted-on” Treasury-Modulen, volume-basiertes Pricing — bei 50.000 Payments/Monat explodieren die Kosten. Wir bleiben Flat-Fee und bauen einen integrierten Stack statt Bolt-on.",
  },
  {
    name: "Trovata",
    tier: "Tier 2 · UX-Best-in-Class",
    bestFeatures: [
      "Beste UX am gesamten Markt — Snowflake-basierter Semantic Layer",
      "Trovata AI / Copilot — Conversational Q&A auf Cash-Positionen",
      "Native Bank-APIs (US: JPM, Wells, Capital One)",
    ],
    ourAngle:
      "Kein EBICS, keine deutschen Bank-APIs, kein Payment-Factory, nicht-Konzern-tauglich. Trovata-AI ist englisch und qualitativ uneinheitlich. Wir liefern dieselbe UX-Qualität, aber DACH-nativ mit EBICS, Audit-Chain und deutscher Konversation.",
  },
  {
    name: "HighRadius",
    tier: "Tier 2 · AR-Riese",
    bestFeatures: [
      "AR-Riese mit Freeda-Copilot",
      "IPO-Pipeline, große Funding-Basis (Tiger / D1 / Iconiq)",
      "Strong O2C-Stack mit AI-Layer",
    ],
    ourAngle:
      "Treasury ist Second-Class neben AR — der Fokus liegt strukturell auf der Forderungsseite. Wir bauen Treasury-First, nicht Treasury-als-Anhängsel, und docken AR/AP via API an statt sie zu replizieren.",
  },
];

export type Differentiator = {
  title: string;
  body: string;
};

export const DIFFERENTIATORS: Differentiator[] = [
  {
    title: "DACH-Fokus, kein US-Lift-and-Shift",
    body:
      "EBICS 3.0, FinTS/HBCI, DATEV, deutsche Banken-API-Spezifika, deutsche Sprache als Default. Trovata/Embat haben modernen Stack ohne DACH; Nomentia/Coupa haben DACH ohne modernen Stack. Wir kombinieren beides.",
  },
  {
    title: "AI-First via Treasury-Skill",
    body:
      "Der Treasury-Skill ist von Tag 1 dabei — nicht als Marketing-LLM-Wrapper, sondern als Tool-Layer mit klarer Provenance, EU-Bedrock-Hosting und Approval-Gate für jede Mutation. Conversational Q&A in DE+EN, autogenerierter CFO-Boardpack auf Knopfdruck.",
  },
  {
    title: "Modulares Pricing, kein Suite-Lock-in",
    body:
      "Hinzubuchbar zu deinem Orange-Octo-Mandanten oder als Standalone-Modul. Drei Tiers, transparent, public, anti-Nomentia: keine Per-Modul-Überraschungen. Wer nur Cash-Visibility + EBICS will, zahlt nicht für Hedging-Module, die er nie nutzt.",
  },
  {
    title: "Kopplung an deinen Rechnungs- & Buchhaltungs-Stack",
    body:
      "Orange-Octo-Bestandskunden bekommen den Treasury-Layer mit Single-Sign-on, gemeinsamer Mandanten-Hierarchie, gemeinsamem Audit-Trail und gemeinsamer DATEV-Konnektivität. Statt zwei parallel laufender Tools mit getrenntem User-Management ein Stack.",
  },
  {
    title: "Time-to-Value: 4 Wochen statt 4 Quartale",
    body:
      "Embat hat 2–6 Wochen als SMB-Standard etabliert; Kyriba/ION brauchen 9+ Monate. Wir nehmen Embats Setup-Tempo und machen es Konzern-tauglich — mit Onboarding-Wizard, Bank-Selbst-Provisionierung und voreingestellten Approval-Matrizen.",
  },
];
