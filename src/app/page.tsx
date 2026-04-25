import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import styles from "./landing.module.css";
import LandingHeaderLogin from "./LandingHeaderLogin";
import LandingInlineLogin from "./LandingInlineLogin";
import LandingFeaturesGrid, { type LandingFeature } from "./LandingFeaturesGrid";
import LandingPricingSection from "./LandingPricingSection";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://orange-octo.com";

export const metadata = {
  title: "Orange Octo — Buchhaltung, die sich selbst erledigt",
  description:
    "KI-Belegerfassung, EU-konforme E-Rechnung und Zeiterfassung in einer Plattform. 14 Tage kostenlos testen.",
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    locale: "de_AT",
    url: SITE_URL,
    siteName: "Orange Octo",
    title: "Orange Octo — Buchhaltung, die sich selbst erledigt",
    description:
      "KI-Belegerfassung, EU-konforme E-Rechnung und Zeiterfassung in einer Plattform. 14 Tage kostenlos testen.",
    images: [{ url: "/brand/octo-logo-full-white.png", width: 1200, height: 630, alt: "Orange Octo" }],
  },
};

const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Orange Octo",
  url: SITE_URL,
  logo: `${SITE_URL}/brand/octo-logo-full-white.png`,
  sameAs: [SITE_URL],
};

const SOFTWARE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Orange Octo",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: SITE_URL,
  description:
    "KI-gestützte Buchhaltungs-SaaS für Selbstständige und kleine Unternehmen: Rechnungen, Angebote, Belege, Zeiterfassung, E-Rechnung (EN-16931).",
  offers: {
    "@type": "Offer",
    priceCurrency: "EUR",
    availability: "https://schema.org/InStock",
  },
  inLanguage: ["de", "en"],
};

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  const features: LandingFeature[] = [
    {
      reverse: false,
      label: "KI-Belegerfassung",
      title: "Foto hochladen — fertig.",
      body:
        "Unsere KI liest Betrag, Datum, Lieferant und Kategorie automatisch aus. Kein Abtippen, keine Fehler. Direkt verbucht und archiviert.",
      detailed:
        "Fotografiere den Beleg mit dem Handy, ziehe PDF-Rechnungen per Drag & Drop rein oder leite E-Mail-Belege an deine Orange-Octo-Adresse weiter. Die KI erkennt innerhalb von Sekunden Lieferant, Datum, Betrag, Steuersatz und Kategorie — und schlägt die passende SKR03- oder SKR04-Buchung vor. Du bestätigst mit einem Klick, der Beleg landet GoBD-konform im 10-Jahres-Archiv und ist später per Volltextsuche auffindbar.",
      bullets: ["OCR + KI in einem Schritt", "Auto-Verbuchung auf SKR03/SKR04", "10-jähriges GoBD-Archiv"],
      mock: <ReceiptMock />,
    },
    {
      reverse: true,
      label: "Rechnungen",
      title: "Professionelle Rechnungen in Sekunden.",
      body:
        "Rechnung aus Vorlage, mit CI, automatischer Nummernkreis und direkt per E-Mail versandt. Zahlungseingang automatisch zugeordnet.",
      detailed:
        "Aus Stammdaten, Produkten und erfassten Zeiten erzeugst du in Sekunden eine Rechnung mit deinem Logo und deiner CI. Nummernkreise laufen automatisch weiter, Steuersätze (0/7/19/20%) werden je Position gesetzt, Fremdwährungen umgerechnet. Ein Klick erzeugt PDF + E-Rechnung, versendet sie per Mail und gleicht den Zahlungseingang aus dem Bank-Import automatisch ab.",
      bullets: ["Mehrere Steuersätze (0/7/19/20%)", "Versand per E-Mail mit PDF-Anhang", "Auto-Reminder bei Überfälligkeit"],
      mock: <InvoiceMock />,
    },
    {
      reverse: false,
      label: "E-Rechnung",
      title: "XRechnung & ZUGFeRD — automatisch.",
      body:
        "Pflichtformat ab 2025 für B2B in Deutschland. Orange Octo erzeugt EN 16931-konforme XML im Hintergrund — kein Setup nötig.",
      detailed:
        "Seit 2025 müssen B2B-Rechnungen in Deutschland elektronisch sein. Orange Octo erzeugt zu jeder Rechnung im Hintergrund EN-16931-konforme XML in XRechnung 3.0 oder als ZUGFeRD 2.3 Hybrid-PDF — inklusive Leitweg-ID, Käuferreferenz und eingebautem Validator, der Fehler vor dem Versand meldet. Kein separates Tool, kein Setup: du erstellst eine normale Rechnung, das E-Rechnungs-XML liegt automatisch dabei.",
      bullets: ["XRechnung 3.0 validiert", "ZUGFeRD 2.3 Hybrid-PDF", "Leitweg-ID-Verwaltung"],
      mock: <ERechnungMock />,
    },
    {
      reverse: true,
      label: "Angebote",
      title: "Designte Angebote, die gewinnen.",
      body:
        "Mehrstufige Angebote mit Positionen, Rabatten, Gültigkeit und Online-Annahme. Ein Klick macht daraus eine Rechnung.",
      detailed:
        "Gestalte mehrstufige Angebote mit Positionen, Rabatten, optionalen Bausteinen und individueller Gültigkeit. Deine Kunden erhalten einen Link zur Online-Ansicht und unterschreiben direkt per digitaler Signatur — kein Ausdrucken, kein Einscannen. Nach der Annahme erzeugt ein einziger Klick daraus eine Rechnung inklusive Referenz auf das Angebot und der ursprünglichen Konditionen.",
      bullets: ["Live-Vorschau beim Bearbeiten", "Online-Annahme mit Signatur", "1-Klick-Konvertierung zur Rechnung"],
      mock: <QuoteMock />,
    },
    {
      reverse: false,
      label: "Zeiterfassung",
      title: "Stunden erfassen, direkt abrechnen.",
      body:
        "Zeiten pro Projekt und Kunde erfassen — Stundensatz automatisch angewandt. Mit einem Klick in eine Rechnung übernehmen.",
      detailed:
        "Erfasse Zeiten per Start/Stop-Timer im Browser oder trage sie manuell pro Tag nach. Jeder Eintrag ist an Projekt und Kunde gebunden, Stundensätze und Abrechnungsarten werden automatisch angewandt. Am Monatsende wählst du Zeitraum und Kunde — Orange Octo erzeugt daraus saubere Excel-Reports oder direkt eine abrechenbare Rechnung mit aufgeschlüsselten Positionen.",
      bullets: ["Start/Stop-Timer oder manuell", "Projekt- und Kundenbezug", "Abrechnung per Export oder Rechnung"],
      mock: <TimeMock />,
    },
    {
      reverse: true,
      label: "DATEV-Export",
      title: "Übergabe an den Steuerberater — ein Klick.",
      body:
        "DATEV-kompatibler CSV-Export inkl. Belege und Buchungen. Zeitraum wählen, Datei herunterladen, fertig.",
      detailed:
        "Wähle einen Zeitraum, klicke „Export\" — heraus kommt ein Paket aus DATEV-Buchungsstapel-CSV im EXTF-Format (für DATEV Unternehmen online) und allen zugehörigen Beleg-PDFs, sauber verknüpft über die Belegnummer. Dein Steuerberater importiert es in DATEV mit einem einzigen Klick. Funktioniert für SKR03 und SKR04 und respektiert deine Kontenzuordnung aus der Belegerfassung.",
      bullets: ["DATEV Unternehmen online ready", "Beleg-PDFs im selben Paket", "SKR03 und SKR04 unterstützt"],
      mock: <DatevMock />,
    },
  ];

  return (
    <div className={styles.root}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_JSON_LD) }}
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.navLogo} aria-label="Orange Octo Startseite">
            <Image
              src="/brand/octo-icon-orange.png"
              alt="Orange Octo"
              width={72}
              height={72}
              priority
              className={styles.navLogoIcon}
            />
            <span className={styles.navLogoWord}>
              Orange<span>Octo</span>
            </span>
          </Link>
          <ul className={styles.navLinks}>
            <li>
              <a href="#features">Features</a>
            </li>
            <li>
              <a href="#preise">Preise</a>
            </li>
          </ul>
          <div className={styles.navRight}>
            <LandingHeaderLogin />
            <Link href="/login" className={styles.navLogin}>
              Anmelden
            </Link>
            <Link href="/register" className={styles.navCta}>
              Kostenlos starten
            </Link>
          </div>
        </div>
      </nav>

      <section className={styles.hero} id="home">
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <div className={styles.heroBadge}>
              <span className={styles.heroBadgeDot} />
              KI-gestützte Buchhaltung · Made in Austria
            </div>

            <h1>
              Buchhaltung,
              <br />
              die sich selbst
              <br />
              <span className={styles.highlight}>erledigt.</span>
            </h1>

            <p className={styles.heroSub}>
              Belege scannen, Rechnungen erstellen, Angebote gestalten —{" "}
              <strong>alles automatisch.</strong> Orange Octo verbindet KI-Belegerfassung, EU-konforme E-Rechnung und
              Zeiterfassung in einer übersichtlichen Plattform.
            </p>

            <div className={styles.heroActions}>
              <Link href="/register" className={styles.btnPrimary}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                Kostenlos starten
              </Link>
              <a href="#features" className={styles.btnGhost}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polygon points="10 8 16 12 10 16 10 8" />
                </svg>
                Demo ansehen
              </a>
            </div>

            <p className={styles.heroNote}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              &nbsp;14 Tage kostenlos · Keine Kreditkarte · Kündigung jederzeit
            </p>
          </div>

          <div className={styles.dashboardMock}>
            <div className={styles.dashCard}>
              <div className={styles.dashTopbar}>
                <span className={`${styles.dot} ${styles.dotR}`} />
                <span className={`${styles.dot} ${styles.dotY}`} />
                <span className={`${styles.dot} ${styles.dotG}`} />
                <div className={styles.dashUrl}>app.orangeocto.de/dashboard</div>
              </div>
              <div className={styles.dashBody}>
                <div className={styles.dashHeaderRow}>
                  <span className={styles.dashTitle}>Dashboard</span>
                  <span className={styles.dashBadgeOrange}>April 2026</span>
                </div>

                <div className={styles.dashKpis}>
                  <div className={styles.kpiTile}>
                    <div className={styles.kpiLabel}>Umsatz</div>
                    <div className={`${styles.kpiValue} ${styles.kpiValueOrange}`}>€ 12.840</div>
                    <div className={styles.kpiChange}>▲ +18% ggü. Vormonat</div>
                  </div>
                  <div className={styles.kpiTile}>
                    <div className={styles.kpiLabel}>Offene Rechnungen</div>
                    <div className={styles.kpiValue}>3</div>
                    <div className={`${styles.kpiChange} ${styles.kpiChangeWarn}`}>▲ Fällig: 1</div>
                  </div>
                  <div className={styles.kpiTile}>
                    <div className={styles.kpiLabel}>Erfasste Belege</div>
                    <div className={styles.kpiValue}>47</div>
                    <div className={styles.kpiChange}>KI: 100% ✓</div>
                  </div>
                </div>

                <div className={styles.dashChartArea}>
                  <div className={styles.chartCaption}>Umsatz (letzte 8 Monate)</div>
                  <div className={styles.chartBars}>
                    <div className={styles.bar} style={{ height: "35%" }} />
                    <div className={styles.bar} style={{ height: "55%" }} />
                    <div className={styles.bar} style={{ height: "42%" }} />
                    <div className={`${styles.bar} ${styles.barSemi}`} style={{ height: "68%" }} />
                    <div className={styles.bar} style={{ height: "50%" }} />
                    <div className={styles.bar} style={{ height: "72%" }} />
                    <div className={`${styles.bar} ${styles.barSemi}`} style={{ height: "80%" }} />
                    <div className={`${styles.bar} ${styles.barActive}`} style={{ height: "100%" }} />
                  </div>
                </div>

                <div className={styles.dashRows}>
                  <div className={styles.dashRow}>
                    <div className={styles.rowIcon}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F7901E" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </div>
                    <div className={styles.rowText}>
                      <div className={styles.rowName}>Rechnung #R-2026-041</div>
                      <div className={styles.rowSub}>Mustermann GmbH</div>
                    </div>
                    <div>
                      <div className={styles.rowAmount}>€ 4.200</div>
                      <div className={`${styles.rowStatus} ${styles.statusPaid}`}>Bezahlt</div>
                    </div>
                  </div>
                  <div className={styles.dashRow}>
                    <div className={styles.rowIcon}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F7901E" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    <div className={styles.rowText}>
                      <div className={styles.rowName}>Angebot #A-2026-012</div>
                      <div className={styles.rowSub}>Beispiel & Partner</div>
                    </div>
                    <div>
                      <div className={styles.rowAmount}>€ 8.500</div>
                      <div className={`${styles.rowStatus} ${styles.statusPending}`}>Ausstehend</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.floatBadge}>
              <div className={styles.floatBadgeIcon}>✓</div>
              <div className={styles.floatBadgeText}>
                <strong>Beleg automatisch erkannt</strong>
                KI hat 3 Felder befüllt
              </div>
            </div>
          </div>
        </div>
      </section>

      <LandingInlineLogin />

      <section className={styles.features} id="features">
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionLabel}>Funktionen</div>
            <h2>
              Alles was du brauchst,
              <br />
              nichts was du nicht brauchst.
            </h2>
            <p className={styles.sectionSub}>
              Von der Belegerfassung bis zur DATEV-Übergabe — Orange Octo deckt den gesamten Buchhaltungsablauf ab.
            </p>
          </div>

          <LandingFeaturesGrid features={features} />
        </div>
      </section>

      <LandingPricingSection />

      <section className={styles.bigLogo} aria-hidden="true">
        <Image
          src="/brand/octo-icon-orange.png"
          alt=""
          width={360}
          height={360}
          className={styles.bigLogoIcon}
        />
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <Link href="/" className={styles.footerLogo} aria-label="Orange Octo Startseite">
            <Image src="/brand/octo-icon-orange.png" alt="Orange Octo" width={40} height={40} />
            <span className={styles.footerLogoWord}>
              Orange<span>Octo</span>
            </span>
          </Link>

          <div className={styles.footerLinks}>
            <Link href="/impressum">Impressum</Link>
            <Link href="/datenschutz">Datenschutz</Link>
            <Link href="/agb">AGB</Link>
            <Link href="/login" className="accent">
              Login
            </Link>
            <Link href="/register" className="accent">
              Registrieren
            </Link>
          </div>

          <span className={styles.footerCopy}>© 2026 Orange Octo. Alle Rechte vorbehalten.</span>
        </div>
      </footer>
    </div>
  );
}

function MockFrame({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className={styles.dashCard}>
      <div className={styles.dashTopbar}>
        <span className={`${styles.dot} ${styles.dotR}`} />
        <span className={`${styles.dot} ${styles.dotY}`} />
        <span className={`${styles.dot} ${styles.dotG}`} />
        <div className={styles.dashUrl}>{url}</div>
      </div>
      <div className={styles.dashBody}>{children}</div>
    </div>
  );
}

function ReceiptMock() {
  return (
    <MockFrame url="app.orangeocto.de/belege/neu">
      <div className={styles.dashHeaderRow}>
        <span className={styles.dashTitle}>Beleg-Erfassung</span>
        <span className={styles.dashBadgeOrange}>KI aktiv</span>
      </div>
      <div className={styles.mockReceiptLayout}>
        <div className={styles.mockReceiptImage}>
          <div className={styles.mockReceiptLine} style={{ width: "60%" }} />
          <div className={styles.mockReceiptLine} style={{ width: "90%" }} />
          <div className={styles.mockReceiptLine} style={{ width: "40%" }} />
          <div className={styles.mockReceiptLine} style={{ width: "80%" }} />
          <div className={styles.mockReceiptLine} style={{ width: "50%" }} />
          <div className={styles.mockScanLine} />
        </div>
        <div className={styles.mockFields}>
          <div className={styles.mockField}>
            <span className={styles.mockFieldLabel}>Lieferant</span>
            <span className={styles.mockFieldValue}>Musterhandel KG</span>
            <span className={styles.mockFieldTag}>KI</span>
          </div>
          <div className={styles.mockField}>
            <span className={styles.mockFieldLabel}>Datum</span>
            <span className={styles.mockFieldValue}>12.04.2026</span>
            <span className={styles.mockFieldTag}>KI</span>
          </div>
          <div className={styles.mockField}>
            <span className={styles.mockFieldLabel}>Betrag</span>
            <span className={`${styles.mockFieldValue} ${styles.mockFieldValueOrange}`}>€ 124,80</span>
            <span className={styles.mockFieldTag}>KI</span>
          </div>
          <div className={styles.mockField}>
            <span className={styles.mockFieldLabel}>Kategorie</span>
            <span className={styles.mockFieldValue}>Bürobedarf</span>
            <span className={styles.mockFieldTag}>KI</span>
          </div>
        </div>
      </div>
    </MockFrame>
  );
}

function InvoiceMock() {
  return (
    <MockFrame url="app.orangeocto.de/rechnungen/R-2026-041">
      <div className={styles.dashHeaderRow}>
        <span className={styles.dashTitle}>Rechnung R-2026-041</span>
        <span className={`${styles.rowStatus} ${styles.statusPaid}`}>Versendet</span>
      </div>
      <div className={styles.mockInvoice}>
        <div className={styles.mockInvoiceHead}>
          <div>
            <div className={styles.mockFieldLabel}>An</div>
            <div className={styles.mockFieldValue}>Mustermann GmbH</div>
            <div className={styles.mockFieldSmall}>Beethovenstr. 12 · 10115 Berlin</div>
          </div>
          <div className={styles.mockInvoiceMeta}>
            <div>
              <span className={styles.mockFieldLabel}>Rechnungsdatum</span>
              <span className={styles.mockFieldValue}>15.04.2026</span>
            </div>
            <div>
              <span className={styles.mockFieldLabel}>Fällig</span>
              <span className={styles.mockFieldValue}>29.04.2026</span>
            </div>
          </div>
        </div>
        <div className={styles.mockLineItems}>
          <div className={styles.mockLineItem}>
            <span>Konzeption &amp; Design</span>
            <span>1 × € 2.400</span>
            <span>€ 2.400</span>
          </div>
          <div className={styles.mockLineItem}>
            <span>Umsetzung Landingpage</span>
            <span>12h × € 120</span>
            <span>€ 1.440</span>
          </div>
          <div className={styles.mockLineItem}>
            <span>Support &amp; Revisionen</span>
            <span>3h × € 120</span>
            <span>€ 360</span>
          </div>
        </div>
        <div className={styles.mockTotals}>
          <div>
            <span>Netto</span>
            <span>€ 4.200,00</span>
          </div>
          <div>
            <span>USt 19%</span>
            <span>€ 798,00</span>
          </div>
          <div className={styles.mockTotalsGrand}>
            <span>Gesamt</span>
            <span>€ 4.998,00</span>
          </div>
        </div>
      </div>
    </MockFrame>
  );
}

function ERechnungMock() {
  return (
    <MockFrame url="app.orangeocto.de/rechnungen/R-2026-041/e-rechnung">
      <div className={styles.dashHeaderRow}>
        <span className={styles.dashTitle}>E-Rechnung</span>
        <span className={styles.dashBadgeOrange}>EN 16931 ✓</span>
      </div>
      <div className={styles.mockERList}>
        <div className={styles.mockERRow}>
          <span className={styles.mockERCheck}>✓</span>
          <span>XRechnung 3.0 XML</span>
          <span className={styles.mockFieldSmall}>12 KB</span>
        </div>
        <div className={styles.mockERRow}>
          <span className={styles.mockERCheck}>✓</span>
          <span>ZUGFeRD 2.3 (Hybrid-PDF)</span>
          <span className={styles.mockFieldSmall}>243 KB</span>
        </div>
        <div className={styles.mockERRow}>
          <span className={styles.mockERCheck}>✓</span>
          <span>Leitweg-ID 991-01234-44</span>
          <span className={styles.mockFieldSmall}>verifiziert</span>
        </div>
        <div className={styles.mockERRow}>
          <span className={styles.mockERCheck}>✓</span>
          <span>Mehrwertsteuer 19% + 7% geprüft</span>
          <span className={styles.mockFieldSmall}>BR-DE-14</span>
        </div>
      </div>
      <div className={styles.mockERValidator}>
        <span className={styles.mockERValidatorTitle}>Validator</span>
        <span className={styles.mockERValidatorResult}>0 Fehler · 0 Warnungen</span>
      </div>
    </MockFrame>
  );
}

function QuoteMock() {
  return (
    <MockFrame url="app.orangeocto.de/angebote/A-2026-012">
      <div className={styles.dashHeaderRow}>
        <span className={styles.dashTitle}>Angebot A-2026-012</span>
        <span className={`${styles.rowStatus} ${styles.statusPending}`}>Entwurf</span>
      </div>
      <div className={styles.mockQuoteLayout}>
        <div className={styles.mockQuoteRow}>
          <span>Kunde</span>
          <span className={styles.mockFieldValue}>Beispiel & Partner</span>
        </div>
        <div className={styles.mockQuoteRow}>
          <span>Gültig bis</span>
          <span className={styles.mockFieldValue}>15.05.2026</span>
        </div>
        <div className={styles.mockQuoteItems}>
          <div className={styles.mockQuoteItem}>
            <div className={styles.mockQuoteItemName}>Branding Workshop</div>
            <div className={styles.mockQuoteItemMeta}>2 Tage · € 3.200</div>
          </div>
          <div className={styles.mockQuoteItem}>
            <div className={styles.mockQuoteItemName}>Logo-Design · 3 Varianten</div>
            <div className={styles.mockQuoteItemMeta}>Pauschal · € 2.400</div>
          </div>
          <div className={styles.mockQuoteItem}>
            <div className={styles.mockQuoteItemName}>Styleguide PDF + Figma</div>
            <div className={styles.mockQuoteItemMeta}>Pauschal · € 2.900</div>
          </div>
        </div>
        <div className={styles.mockQuoteTotal}>
          <span>Gesamt</span>
          <span className={styles.mockFieldValueOrange}>€ 8.500</span>
        </div>
      </div>
    </MockFrame>
  );
}

function TimeMock() {
  return (
    <MockFrame url="app.orangeocto.de/zeiten">
      <div className={styles.dashHeaderRow}>
        <span className={styles.dashTitle}>Zeiterfassung · KW 16</span>
        <span className={styles.dashBadgeOrange}>24,5 h</span>
      </div>
      <div className={styles.mockTimeGrid}>
        {["Mo", "Di", "Mi", "Do", "Fr"].map((d, i) => (
          <div key={d} className={styles.mockTimeDay}>
            <div className={styles.mockTimeDayLabel}>{d}</div>
            <div className={styles.mockTimeBar} style={{ height: `${[65, 90, 40, 75, 55][i]}%` }} />
            <div className={styles.mockTimeDayHours}>{[5.2, 7.0, 3.2, 6.1, 4.0][i]}h</div>
          </div>
        ))}
      </div>
      <div className={styles.mockTimeRows}>
        <div className={styles.mockTimeRow}>
          <span className={styles.mockTimeDot} style={{ background: "#F7901E" }} />
          <span>Mustermann GmbH · Redesign</span>
          <span className={styles.mockFieldValue}>14,5h</span>
        </div>
        <div className={styles.mockTimeRow}>
          <span className={styles.mockTimeDot} style={{ background: "#00d4ff" }} />
          <span>Beispiel & Partner · Branding</span>
          <span className={styles.mockFieldValue}>7,0h</span>
        </div>
        <div className={styles.mockTimeRow}>
          <span className={styles.mockTimeDot} style={{ background: "#22c55e" }} />
          <span>Acme Consulting · Beratung</span>
          <span className={styles.mockFieldValue}>3,0h</span>
        </div>
      </div>
    </MockFrame>
  );
}

function DatevMock() {
  return (
    <MockFrame url="app.orangeocto.de/export/datev">
      <div className={styles.dashHeaderRow}>
        <span className={styles.dashTitle}>DATEV-Export</span>
        <span className={styles.dashBadgeOrange}>Q1 2026</span>
      </div>
      <div className={styles.mockExportSummary}>
        <div className={styles.kpiTile}>
          <div className={styles.kpiLabel}>Buchungen</div>
          <div className={styles.kpiValue}>312</div>
        </div>
        <div className={styles.kpiTile}>
          <div className={styles.kpiLabel}>Belege</div>
          <div className={styles.kpiValue}>287</div>
        </div>
        <div className={styles.kpiTile}>
          <div className={styles.kpiLabel}>Zeitraum</div>
          <div className={styles.kpiValue}>Q1 &apos;26</div>
        </div>
      </div>
      <div className={styles.mockExportFiles}>
        <div className={styles.mockExportFile}>
          <span className={styles.mockERCheck}>✓</span>
          <span>EXTF_Buchungsstapel.csv</span>
          <span className={styles.mockFieldSmall}>48 KB</span>
        </div>
        <div className={styles.mockExportFile}>
          <span className={styles.mockERCheck}>✓</span>
          <span>Belege_Q1_2026.zip</span>
          <span className={styles.mockFieldSmall}>12,4 MB</span>
        </div>
      </div>
      <div className={styles.mockExportCta}>
        <span>DATEV Unternehmen online</span>
        <span className={styles.mockExportCtaArrow}>→</span>
      </div>
    </MockFrame>
  );
}
