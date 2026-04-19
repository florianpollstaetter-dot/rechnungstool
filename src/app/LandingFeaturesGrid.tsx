"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./landing.module.css";

export type LandingFeature = {
  reverse: boolean;
  label: string;
  title: string;
  body: string;
  detailed: string;
  bullets: string[];
  mock: React.ReactNode;
};

export default function LandingFeaturesGrid({ features }: { features: LandingFeature[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (openIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenIdx(null);
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    closeBtnRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [openIdx]);

  const active = openIdx === null ? null : features[openIdx];

  return (
    <>
      {features.map((f, idx) => (
        <div
          key={f.label}
          className={`${styles.featureRow} ${f.reverse ? styles.featureRowReverse : ""} ${styles.featureRowClickable}`}
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          aria-label={`${f.label}: ${f.title} — Details öffnen`}
          onClick={() => setOpenIdx(idx)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpenIdx(idx);
            }
          }}
        >
          <div className={styles.featureRowText}>
            <div className={styles.featureRowLabel}>{f.label}</div>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
            <ul className={styles.featureBullets}>
              {f.bullets.map((b) => (
                <li key={b}>
                  <span className={styles.featureBulletCheck}>✓</span>
                  {b}
                </li>
              ))}
            </ul>
            <span className={styles.featureRowMore} aria-hidden="true">
              Details ansehen →
            </span>
          </div>
          <div className={styles.featureRowMock}>{f.mock}</div>
        </div>
      ))}

      {active && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setOpenIdx(null)}
          role="presentation"
        >
          <div
            className={styles.modalPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feature-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              ref={closeBtnRef}
              type="button"
              className={styles.modalClose}
              onClick={() => setOpenIdx(null)}
              aria-label="Schließen"
            >
              ×
            </button>
            <div className={styles.modalGrid}>
              <div className={styles.modalMockWrap}>{active.mock}</div>
              <div className={styles.modalText}>
                <div className={styles.featureRowLabel}>{active.label}</div>
                <h3 id="feature-modal-title" className={styles.modalTitle}>
                  {active.title}
                </h3>
                <p className={styles.modalDetailed}>{active.detailed}</p>
                <ul className={styles.featureBullets}>
                  {active.bullets.map((b) => (
                    <li key={b}>
                      <span className={styles.featureBulletCheck}>✓</span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
