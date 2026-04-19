"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./landing.module.css";

type Billing = "monthly" | "annual";

type Tier = {
  key: "starter" | "business" | "pro";
  name: string;
  tagline: string;
  monthly: number;
  annual: number;
  features: string[];
  featured?: boolean;
  footnote?: string;
};

const TIERS: Tier[] = [
  {
    key: "starter",
    name: "Starter",
    tagline: "Einzelunternehmer & Freelancer",
    monthly: 12,
    annual: 9,
    features: [
      "1 Nutzer",
      "Unbegrenzte Rechnungen & Angebote",
      "XRechnung & ZUGFeRD (E-Rechnung)",
      "Custom Briefpapier & Design",
      "Mahnwesen & Zahlungserinnerungen",
      "DATEV- & Steuerberater-Export",
    ],
  },
  {
    key: "business",
    name: "Business",
    tagline: "Kleine GmbHs & Agenturen",
    monthly: 26,
    annual: 21,
    featured: true,
    features: [
      "2 Nutzer",
      "Alles aus Starter",
      "KI-Belegerfassung",
      "Online-Banking (4.000+ Banken)",
      "EÜR / GuV / P&L",
      "USt-Voranmeldung (UStVA)",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    tagline: "Wachsende Teams & Multi-Firma",
    monthly: 44,
    annual: 36,
    features: [
      "5 Nutzer (+ €7 pro zusätzlichem Nutzer)",
      "Alles aus Business",
      "BWA-Reports",
      "REST-API-Zugriff",
      "Priority-Support",
    ],
    footnote: "Mehr als 5 Nutzer? +€7 / Nutzer / Monat.",
  },
];

export default function LandingPricingSection() {
  const [billing, setBilling] = useState<Billing>("annual");

  return (
    <section className={styles.pricing} id="preise">
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionLabel}>Preise</div>
          <h2>
            Einfache Preise,
            <br />
            keine versteckten Kosten.
          </h2>
          <p className={styles.sectionSub}>
            14 Tage kostenlos testen — keine Kreditkarte nötig. Danach einer dieser Tarife. Monatlich kündbar.
          </p>

          <div className={styles.billingToggle} role="radiogroup" aria-label="Abrechnungszeitraum">
            <button
              type="button"
              role="radio"
              aria-checked={billing === "monthly"}
              className={`${styles.billingOption} ${billing === "monthly" ? styles.billingOptionActive : ""}`}
              onClick={() => setBilling("monthly")}
            >
              Monatlich
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={billing === "annual"}
              className={`${styles.billingOption} ${billing === "annual" ? styles.billingOptionActive : ""}`}
              onClick={() => setBilling("annual")}
            >
              Jährlich
              <span className={styles.billingBadge}>−20%</span>
            </button>
          </div>
        </div>

        <div className={styles.pricingGrid}>
          {TIERS.map((tier) => {
            const price = billing === "annual" ? tier.annual : tier.monthly;
            const yearlyTotal = tier.annual * 12;
            return (
              <div
                key={tier.key}
                className={`${styles.tierCard} ${tier.featured ? styles.tierCardFeatured : ""}`}
              >
                {tier.featured && <div className={styles.tierBadge}>Beliebteste Wahl</div>}
                <div className={styles.tierName}>{tier.name}</div>
                <div className={styles.tierTagline}>{tier.tagline}</div>
                <div className={styles.tierPriceRow}>
                  <span className={styles.tierCurrency}>€</span>
                  <span className={styles.tierPrice}>{price}</span>
                  <span className={styles.tierPer}>/ Monat</span>
                </div>
                <div className={styles.tierBillingNote}>
                  {billing === "annual" ? (
                    <>
                      jährliche Abrechnung · € {yearlyTotal} / Jahr
                    </>
                  ) : (
                    <>
                      monatliche Abrechnung · <span className={styles.tierSavingsHint}>jährlich € {tier.annual}/mo</span>
                    </>
                  )}
                </div>
                <ul className={styles.tierFeatures}>
                  {tier.features.map((f) => (
                    <li key={f}>
                      <span className={styles.tierCheck}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/register?plan=${tier.key}&billing=${billing}`}
                  className={tier.featured ? styles.tierCtaFeatured : styles.tierCta}
                >
                  14 Tage gratis starten
                </Link>
                {tier.footnote && <div className={styles.tierFootnote}>{tier.footnote}</div>}
              </div>
            );
          })}
        </div>

        <p className={styles.pricingFooterNote}>
          Alle Preise netto pro Monat. Jährliche Zahlung spart 20 %. Keine Kreditkarte für den Trial, keine
          Einrichtungsgebühr.
        </p>
      </div>
    </section>
  );
}
