"use client";

import { useState } from "react";
import styles from "./landing.module.css";
import { FAQ_ITEMS } from "./LandingFaqData";

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
