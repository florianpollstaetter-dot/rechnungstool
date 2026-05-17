// ORA-2291 — Public Treasury Marketing-/Feature-Seite.
// Indexierbar, ohne Login zugänglich, Inhalte stammen aus deliverables/02,07,08.

import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import landing from "../landing.module.css";
import styles from "./treasury.module.css";
import {
  PILLARS,
  COMPETITORS,
  DIFFERENTIATORS,
  TREASURY_TAGLINE,
  type FeatureStatus,
} from "./content";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://orange-octo.com";
const PAGE_URL = `${SITE_URL}/treasury-info`;
const PILOT_CONTACT_MAIL = "treasury@orange-octo.com";

export const metadata: Metadata = {
  title: "Treasury-Add-on — Orange Octo | Bank-Konnektivität, Cash-Forecast, Massen-Zahlungen",
  description:
    "Das Treasury-Modul für Orange Octo: EBICS 3.0, ML-Cash-Forecast, SEPA-Massen-Zahlungen, signierter Audit-Trail. DACH-nativ, AI-first, modular hinzubuchbar. Early Access.",
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: "website",
    locale: "de_AT",
    url: PAGE_URL,
    siteName: "Orange Octo",
    title: "Treasury-Add-on für Orange Octo — Bank-Konnektivität, Cash-Forecast, Massen-Zahlungen",
    description:
      "EBICS 3.0, ML-Cash-Forecast, SEPA-Massen-Zahlungen, kryptografischer Audit-Trail. DACH-nativ, AI-first.",
    images: [{ url: "/brand/octo-logo-full-white.png", width: 1200, height: 630, alt: "Orange Octo Treasury" }],
  },
};

const STATUS_LABEL: Record<FeatureStatus, string> = {
  live: "Live",
  building: "In Bau",
  v1: "Geplant V1",
  v2: "Roadmap V2",
};

const STATUS_CLASS: Record<FeatureStatus, string> = {
  live: styles.statusLive,
  building: styles.statusBuilding,
  v1: styles.statusV1,
  v2: styles.statusV2,
};

const PRODUCT_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Orange Octo Treasury",
  brand: { "@type": "Brand", name: "Orange Octo" },
  description:
    "Treasury-Add-on für Orange Octo: EBICS-3.0-Multi-Bank-Aggregation, ML-Cash-Forecast, SEPA-Massen-Zahlungen mit 4-Augen-Approval-Matrix, kryptografischer Audit-Trail. DACH-nativ.",
  url: PAGE_URL,
  offers: {
    "@type": "Offer",
    availability: "https://schema.org/PreOrder",
    priceCurrency: "EUR",
    description: "Early-Access-Pilot, modular zu Orange Octo hinzubuchbar.",
  },
};

export default function TreasuryInfoPage() {
  return (
    <div className={landing.root}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(PRODUCT_JSON_LD) }}
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <nav className={landing.nav}>
        <div className={landing.navInner}>
          <Link href="/" className={landing.navLogo} aria-label="Orange Octo Startseite">
            <Image
              src="/brand/octo-logo-full-white.png"
              alt="Orange Octo"
              width={216}
              height={72}
              priority
              className={landing.navLogoFull}
            />
          </Link>
          <ul className={landing.navLinks}>
            <li>
              <Link href="/#features">Features</Link>
            </li>
            <li>
              <Link href="/#preise">Preise</Link>
            </li>
            <li>
              <Link href="/treasury-info" aria-current="page">
                Treasury
              </Link>
            </li>
          </ul>
          <div className={landing.navRight}>
            <Link href="/login" className={landing.navLogin}>
              Anmelden
            </Link>
            <Link href={`mailto:${PILOT_CONTACT_MAIL}?subject=Treasury-Pilot%20Anfrage`} className={landing.navCta}>
              Pilot anfragen
            </Link>
          </div>
        </div>
      </nav>

      <section className={landing.hero}>
        <div className={landing.heroInner}>
          <div className={landing.heroText}>
            <div className={styles.heroEyebrow}>
              <span className={styles.heroEyebrowDot} />
              Early Access · Pilotkunden gesucht
            </div>

            <h1>
              Treasury-Add-on
              <br />
              für Orange Octo —
              <br />
              <span className={landing.highlight}>{TREASURY_TAGLINE}</span>
            </h1>

            <p className={styles.heroLead}>
              <strong>Bank-Konnektivität, Cash-Forecast, Massen-Zahlungen</strong> — alles im
              Stack, den du schon nutzt. EBICS&nbsp;3.0 zu allen DACH-Hausbanken, ML-Forecast
              mit Wochen-Retrain, signierter Audit-Trail. Modular hinzubuchbar zu deinem
              Orange-Octo-Mandanten, in vier Wochen live statt in vier Quartalen.
            </p>

            <div className={styles.heroPills}>
              <span className={styles.heroPill}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
                </svg>
                EBICS 3.0 native
              </span>
              <span className={styles.heroPill}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3v18h18M7 14l4-4 4 4 5-5" />
                </svg>
                ML-Cash-Forecast
              </span>
              <span className={styles.heroPill}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z" />
                </svg>
                Audit-Chain (USP)
              </span>
              <span className={styles.heroPill}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z" />
                </svg>
                EU-Data-Plane (Bedrock fra)
              </span>
            </div>

            <div className={landing.heroActions}>
              <Link
                href={`mailto:${PILOT_CONTACT_MAIL}?subject=Treasury-Pilot%20Anfrage`}
                className={landing.btnPrimary}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                Pilot anfragen
              </Link>
              <a href="#features" className={landing.btnGhost}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polygon points="10 8 16 12 10 16 10 8" />
                </svg>
                Features ansehen
              </a>
            </div>

            <p className={landing.heroNote}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              &nbsp;Hinzubuchbar zu jedem Orange-Octo-Tarif · DACH-Sprache · DSGVO + DORA-konform
            </p>
          </div>
        </div>
      </section>

      <section className={styles.pillarSection} id="features">
        <div className={landing.container}>
          <div className={landing.sectionHeader}>
            <div className={landing.sectionLabel}>Features</div>
            <h2>
              Neun Säulen,
              <br />
              ein Treasury-Stack.
            </h2>
            <p className={landing.sectionSub}>
              Jedes Feature mit Begründung, warum wir es bauen. Status-Pills zeigen,
              was heute schon live ist, was im Bau ist und was als V1/V2 geplant ist.
            </p>
          </div>

          {PILLARS.map((pillar) => (
            <div key={pillar.key} className={styles.pillarGroup}>
              <div className={styles.pillarHeader}>
                <span className={styles.pillarIcon} aria-hidden="true">
                  {pillar.icon}
                </span>
                <h3 className={styles.pillarTitle}>{pillar.title}</h3>
                <span className={styles.pillarKey}>Säule {pillar.key}</span>
              </div>
              <div className={styles.pillarGrid}>
                {pillar.features.map((feature) => (
                  <article key={feature.title} className={styles.featureCard}>
                    <div className={styles.featureCardHead}>
                      <h4 className={styles.featureCardTitle}>{feature.title}</h4>
                      <span className={`${styles.statusPill} ${STATUS_CLASS[feature.status]}`}>
                        {STATUS_LABEL[feature.status]}
                      </span>
                    </div>
                    <p className={styles.featureCardDesc}>{feature.description}</p>
                    <p className={styles.featureCardWhy}>
                      <strong>Warum wir das bauen — </strong>
                      {feature.why}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.competitionSection} id="konkurrenz">
        <div className={landing.container}>
          <div className={landing.sectionHeader}>
            <div className={landing.sectionLabel}>Wettbewerb</div>
            <h2>
              Was die Großen
              <br />
              gut machen — und wo wir besser werden.
            </h2>
            <p className={landing.sectionSub}>
              Nüchterner Blick auf Nomentia, Kyriba, Coupa Treasury (Bellin), ION, Serrala, TIS, Trovata und
              HighRadius. Best-Features pro Anbieter und der konkrete Winkel, mit dem wir uns absetzen.
            </p>
          </div>

          <div className={styles.competitionGrid}>
            {COMPETITORS.map((c) => (
              <article key={c.name} className={styles.competitorCard}>
                <header className={styles.competitorHead}>
                  <h3 className={styles.competitorName}>{c.name}</h3>
                  <span className={styles.competitorMeta}>{c.tier}</span>
                </header>
                <ul className={styles.competitorBestFeatures}>
                  {c.bestFeatures.map((bf) => (
                    <li key={bf}>
                      <svg
                        className={styles.competitorBestCheck}
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        aria-hidden="true"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>{bf}</span>
                    </li>
                  ))}
                </ul>
                <div className={styles.competitorAngle}>
                  <span className={styles.competitorAngleLabel}>Unser Winkel</span>
                  {c.ourAngle}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.diffSection} id="warum">
        <div className={landing.container}>
          <div className={landing.sectionHeader}>
            <div className={landing.sectionLabel}>Warum Orange Octo Treasury</div>
            <h2>
              Statt der Großen —
              <br />
              fünf Gründe.
            </h2>
            <p className={landing.sectionSub}>
              Wir sind nicht das nächste &bdquo;Me-too-TMS&ldquo;. Wir bauen für den DACH-Mittelstand
              den Stack, den die Tier-1-Anbieter strukturell nicht liefern.
            </p>
          </div>

          <div className={styles.diffGrid}>
            {DIFFERENTIATORS.map((d, idx) => (
              <article key={d.title} className={styles.diffCard}>
                <span className={styles.diffNum}>{String(idx + 1).padStart(2, "0")}</span>
                <h3 className={styles.diffTitle}>{d.title}</h3>
                <p className={styles.diffBody}>{d.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.ctaSection} id="pilot">
        <div className={landing.container}>
          <div className={styles.ctaCard}>
            <h2 className={styles.ctaTitle}>
              Pilot anfragen oder Modul freischalten
            </h2>
            <p className={styles.ctaBody}>
              Du bist Treasurer im DACH-Mittelstand und brauchst Echtzeit-Cash-Sicht,
              ML-Forecast und SEPA-Massen-Pay-Runs? Wir suchen 5–8 Pilotkunden für den
              Early-Access-Roll-out. Schreib uns kurz, in welcher Phase du bist — wir
              melden uns innerhalb von 24 Stunden mit Demo-Termin.
            </p>
            <div className={styles.ctaActions}>
              <Link
                href={`mailto:${PILOT_CONTACT_MAIL}?subject=Treasury-Pilot%20Anfrage&body=Hallo%20Orange%20Octo%20Team%2C%0A%0Aich%20interessiere%20mich%20f%C3%BCr%20den%20Treasury-Pilot.%20Unsere%20Eckdaten%3A%0A-%20Umsatz%2FEntit%C3%A4ten%2FHausbanken%3A%20...%0A-%20Aktuelles%20Tool%3A%20...%0A-%20Wichtigster%20Schmerz%3A%20...%0A%0AGr%C3%BC%C3%9Fe`}
                className={landing.btnPrimary}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 6 12 13 2 6" />
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                </svg>
                {PILOT_CONTACT_MAIL}
              </Link>
              <Link href="/register?addon=treasury" className={landing.btnGhost}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Orange-Octo-Account anlegen
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.disclaimerSection}>
        <div className={landing.container}>
          <div className={styles.disclaimerCard}>
            <strong>Hinweis zur Pilotphase und regulatorischer Rahmen.</strong>{" "}
            Orange Octo Treasury befindet sich in der Early-Access-Pilotphase. Das Modul
            ist <strong>kein Banking-Lizenz-Produkt</strong> und kein Zahlungsdienstleister
            im Sinne von ZAG / PSD2. Wir treten als Technical Service Provider auf:
            Zahlungsläufe werden bei dir geprüft, mit deinem persönlichen EBICS-TS-Schlüssel
            signiert und anschließend von <strong>deiner Bank über EBICS / Bank-API ausgeführt</strong>.
            Wir bewegen kein Geld unter eigenen Credentials und führen keine Verwahrung
            von Kundengeldern durch.
          </div>
        </div>
      </section>

      <footer className={landing.footer}>
        <div className={landing.footerInner}>
          <Link href="/" className={landing.footerLogo} aria-label="Orange Octo Startseite">
            <Image src="/brand/octo-logo-full-white.png" alt="Orange Octo" width={144} height={48} />
          </Link>

          <div className={landing.footerLinks}>
            <Link href="/">Orange Octo</Link>
            <Link href="/treasury-info">Treasury</Link>
            <Link href="/impressum">Impressum</Link>
            <Link href="/datenschutz">Datenschutz</Link>
            <Link href="/agb">AGB</Link>
          </div>

          <span className={landing.footerCopy}>© 2026 Orange Octo. Alle Rechte vorbehalten.</span>
        </div>
      </footer>
    </div>
  );
}
