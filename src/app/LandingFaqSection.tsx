"use client";

import { useState } from "react";
import styles from "./landing.module.css";

type FaqItem = {
  q: string;
  a: string;
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: "Kann ich den Tarif später wechseln?",
    a: "Ja, jederzeit. Upgrade wird sofort wirksam und anteilig verrechnet, Downgrade greift zum nächsten Abrechnungszeitraum. Kein Anruf, kein Formular — direkt in den Einstellungen.",
  },
  {
    q: "Was passiert nach den 14 Tagen Trial?",
    a: "Nichts automatisch. Der Trial endet einfach — du hast keine Kreditkarte hinterlegt, also wird auch nichts abgebucht. Wenn du weitermachen willst, wählst du einen Tarif. Wenn nicht, bleibt dein Konto noch 30 Tage lesbar damit du deine Daten exportieren kannst.",
  },
  {
    q: "Erfüllt Orange Octo die E-Rechnungs-Pflicht ab 2025?",
    a: "Ja. Jede Rechnung wird zusätzlich als EN-16931-konforme XRechnung 3.0 (XML) und ZUGFeRD 2.3 (Hybrid-PDF) erzeugt. Der eingebaute Validator prüft Leitweg-ID, Käuferreferenz und Pflichtfelder vor dem Versand. Empfangs-Pflicht ab 1.1.2025, Erstellungs-Pflicht gestaffelt ab 1.1.2027 — wir sind heute schon ready.",
  },
  {
    q: "Wo werden meine Daten gespeichert?",
    a: "Auf europäischen Servern (Frankfurt). DSGVO-konform mit Auftragsverarbeitungs-Vertrag (Art. 28 DSGVO) zum Download. Belege werden GoBD-konform 10 Jahre unveränderbar archiviert. Kein Datentransfer in Drittländer.",
  },
  {
    q: "Kann mein Steuerberater die Daten direkt importieren?",
    a: "Ja. DATEV-Export im EXTF-Format (Buchungsstapel-CSV) für DATEV Unternehmen online — ein Klick lädt einen ZIP mit Buchungen und allen zugehörigen Beleg-PDFs herunter. Funktioniert mit SKR03 und SKR04. Falls dein Steuerberater ein anderes System nutzt, gibt es CSV- und PDF-Export für jede Auswertung.",
  },
  {
    q: "Muss ich meine bisherige Buchhaltung migrieren?",
    a: "Nein, du kannst sauber zum nächsten Monatsanfang starten und mit dem laufenden Geschäft beginnen. Alte Belege kannst du optional nachträglich hochladen — die KI verarbeitet auch PDFs aus 2024 oder 2023 problemlos. Stammdaten (Kunden, Lieferanten) importierst du per CSV.",
  },
  {
    q: "Wie kündige ich?",
    a: "Monatlich zum jeweiligen Monatsende, direkt im Konto unter Einstellungen → Abonnement. Kein Anruf, kein Brief. Vor der Kündigung lädst du dir mit einem Klick alle deine Daten als Paket herunter (Buchungen-CSV, Belege-ZIP, DATEV-Export).",
  },
  {
    q: "Brauche ich Buchhaltungs-Vorkenntnisse?",
    a: "Nein. Die KI schlägt für jeden Beleg automatisch das richtige Konto (SKR03/04) vor — du bestätigst mit einem Klick. Für Rechnungen wählst du den Steuersatz aus einer Liste, USt-Voranmeldung (ab Business-Tarif) wird mit den Werten direkt aus deinen Buchungen vorbefüllt. Wenn du im Zweifel bist, hast du immer einen Steuerberater im Hintergrund — wir ersetzen ihn nicht, wir entlasten ihn.",
  },
];

export default function LandingFaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className={styles.faq} id="faq">
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionLabel}>Häufige Fragen</div>
          <h2>
            Antworten auf das,
            <br />
            was du wahrscheinlich fragst.
          </h2>
          <p className={styles.sectionSub}>
            Wenn etwas fehlt, schreib uns über das Kontaktformular — wir antworten meist am selben Tag.
          </p>
        </div>

        <div className={styles.faqList}>
          {FAQ_ITEMS.map((item, idx) => {
            const isOpen = openIndex === idx;
            const panelId = `faq-panel-${idx}`;
            const buttonId = `faq-button-${idx}`;
            return (
              <div
                key={item.q}
                className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ""}`}
              >
                <h3 className={styles.faqQuestionHeading}>
                  <button
                    type="button"
                    id={buttonId}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenIndex(isOpen ? null : idx)}
                    className={styles.faqQuestion}
                  >
                    <span>{item.q}</span>
                    <span className={styles.faqChevron} aria-hidden="true">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className={styles.faqAnswer}
                  hidden={!isOpen}
                >
                  <p>{item.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
