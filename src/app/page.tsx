import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import styles from "./landing.module.css";

export const metadata = {
  title: "Orange Octo — Buchhaltung, die sich selbst erledigt",
  description:
    "KI-Belegerfassung, EU-konforme E-Rechnung und Zeiterfassung in einer Plattform. 30 Tage kostenlos testen.",
};

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className={styles.root}>
      <link
        href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.navLogo}>
            <Image src="/brand/octo-logo-full-white.png" alt="Orange Octo" width={140} height={32} priority />
          </Link>
          <ul className={styles.navLinks}>
            <li>
              <a href="#features">Features</a>
            </li>
            <li>
              <a href="#preise">Preise</a>
            </li>
            <li>
              <Link href="/login">Login</Link>
            </li>
          </ul>
          <Link href="/register" className={styles.navCta}>
            Kostenlos starten
          </Link>
        </div>
      </nav>

      <section className={styles.hero} id="home">
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <div className={styles.heroBadge}>
              <span className={styles.heroBadgeDot} />
              KI-gestützte Buchhaltung · Made in Germany
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
              &nbsp;30 Tage kostenlos · Keine Kreditkarte · Kündigung jederzeit
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
                      <div className={styles.rowSub}>VR The Fans GmbH</div>
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
                      <div className={styles.rowSub}>Lola Agency</div>
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

      <div className={styles.trustBar}>
        <div className={styles.trustInner}>
          <span className={styles.trustLabel}>Bereits vertraut von</span>
          <div className={styles.trustLogos}>
            <span className={styles.trustLogoPill}>VR The Fans</span>
            <span className={styles.trustLogoPill}>Lola Agency</span>
            <span className={styles.trustLogoPill}>55 Films</span>
            <span className={styles.trustLogoPill}>Mustermann GmbH</span>
            <span className={styles.trustLogoPill}>+196 weitere</span>
          </div>
        </div>
      </div>

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

          <div className={styles.featuresGrid}>
            <FeatureCard
              title="KI-gestützte Belegerfassung"
              body="Foto hochladen — fertig. Unsere KI liest Betrag, Datum, Lieferant und Kategorie automatisch aus."
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  <path d="M9 9h6M9 13h4" strokeLinecap="round" />
                </svg>
              }
            />
            <FeatureCard
              title="Automatische Rechnungsverarbeitung"
              body="Eingehende Rechnungen werden automatisch verbucht, auf Pflichtangaben geprüft und archiviert."
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              }
            />
            <FeatureCard
              title="Designte Angebote in Sekunden"
              body="Professionelle Angebote mit deinem CI — automatisch als PDF, direkt per E-Mail versendbar."
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" />
                </svg>
              }
            />
            <FeatureCard
              title="EU-konforme E-Rechnung"
              body="XRechnung und ZUGFeRD ready. Pflichtformat ab 2025 für B2B in Deutschland — automatisch erfüllt."
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
              }
            />
            <FeatureCard
              title="Übersichtliche Zeiterfassung"
              body="Zeiten erfassen, Projekte zuordnen, direkt in Rechnungen umwandeln. Alles in einem Workflow."
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              }
            />
            <FeatureCard
              title="DATEV-Export"
              body="Übergabe an den Steuerberater mit einem Klick. DATEV-kompatibles Format, vollständig und geprüft."
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                </svg>
              }
            />
          </div>
        </div>
      </section>

      <section className={styles.social} id="kunden">
        <div className={styles.container}>
          <div className={styles.socialHeader}>
            <span className={styles.headlineNumber}>200+</span>
            <span className={styles.headlineText}>Unternehmen nutzen Orange Octo täglich</span>
          </div>

          <div className={styles.testimonialsGrid}>
            <div className={styles.testimonialCard}>
              <div className={styles.stars}>★★★★★</div>
              <p className={styles.testimonialText}>
                Endlich eine Buchhaltungssoftware, die wirklich einfach ist. Die KI-Belegerfassung spart uns locker 3
                Stunden pro Woche. Unsere Steuerberaterin ist begeistert.
              </p>
              <div className={styles.testimonialAuthor}>
                <div className={styles.authorAvatar}>MK</div>
                <div>
                  <div className={styles.authorName}>Maria K.</div>
                  <div className={styles.authorRole}>
                    Geschäftsführerin · Agentur für digitale Kommunikation
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.testimonialCard}>
              <div className={styles.stars}>★★★★★</div>
              <p className={styles.testimonialText}>
                Die E-Rechnungs-Funktion hat uns genau dann gerettet, als wir sie brauchten. Setup in 10 Minuten,
                seitdem läuft alles automatisch. Absolut empfehlenswert.
              </p>
              <div className={styles.testimonialAuthor}>
                <div className={styles.authorAvatar}>TF</div>
                <div>
                  <div className={styles.authorName}>Thomas F.</div>
                  <div className={styles.authorRole}>Freelance Developer · IT-Consulting</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.pricing} id="preise">
        <div className={styles.container}>
          <div className={styles.pricingCard}>
            <div className={styles.pricingBadge}>Kostenlos starten</div>
            <div className={styles.pricingHeadline}>
              30 Tage kostenlos testen.
              <br />
              Keine Kreditkarte.
            </div>
            <p className={styles.pricingSub}>
              Voller Zugriff auf alle Features. Keine Einschränkungen. Nach 30 Tagen einfach weitermachen oder kündigen.
            </p>

            <div className={styles.pricingPerks}>
              <div className={styles.perk}>
                <span className={styles.perkCheck}>✓</span>
                Alle Features freigeschaltet
              </div>
              <div className={styles.perk}>
                <span className={styles.perkCheck}>✓</span>
                Unbegrenzte Belege & Rechnungen im Trial
              </div>
              <div className={styles.perk}>
                <span className={styles.perkCheck}>✓</span>
                DATEV-Export & E-Rechnung inklusive
              </div>
              <div className={styles.perk}>
                <span className={styles.perkCheck}>✓</span>
                Keine Kreditkarte, keine Fangfrage
              </div>
            </div>

            <Link href="/register" className={styles.pricingCta}>
              Jetzt kostenlos starten →
            </Link>
            <p className={styles.pricingNote}>Danach ab € 29/Monat · Monatlich kündbar</p>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <Link href="/" className={styles.footerLogo}>
            <Image src="/brand/octo-logo-full-white.png" alt="Orange Octo" width={120} height={26} />
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

function FeatureCard({ title, body, icon }: { title: string; body: string; icon: React.ReactNode }) {
  return (
    <div className={styles.featureCard}>
      <div className={styles.featureIcon}>{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
