// KIN-6650 — Gewinnfreibetrag-Rechner (Baustein {{GFB_RECHNER}} in /at/gewinnfreibetrag).
//
// Rechtsgrundlage § 10 EStG 1988 (RIS: https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10004570&Paragraf=10).
// Zahlen: WKO „Der Gewinnfreibetrag“, Stand 01.01.2026, abgerufen 22.10.2026
// (https://www.wko.at/steuern/der-gewinnfreibetrag); deckungsgleich mit dem
// Artikel content/at/gewinnfreibetrag.md.
//   Grundfreibetrag:            15 % des Gewinns bis 33.000 € → höchstens 4.950 €
//                               (bis Veranlagung 2023: 30.000 € / 4.500 €)
//   investitionsbedingter Teil: 13 % für Gewinn 33.000–178.000 € (145.000 €)
//                                7 % für die nächsten 175.000 € (bis 353.000 €)
//                              4,5 % für die weiteren 230.000 € (bis 583.000 €)
//                                0 % darüber
//                              höchstens in Höhe der begünstigten Investitionen des Jahres
//   Höchstbetrag gesamt:        4.950 + 18.850 + 12.250 + 10.350 = 46.400 €
//   Pauschalierte Gewinnermittlung: nur Grundfreibetrag, kein investitionsbedingter Teil
//   (WKO; USP Basispauschalierung).
// Gilt nur für natürliche Personen mit betrieblichen Einkünften; Verlust → kein Freibetrag.

import { aufCent } from "./runden";

export const GFB_STAND = "01.01.2026";
export const GRUNDFREIBETRAG_GRENZE = 33_000;
export const GRUNDFREIBETRAG_SATZ = 0.15;
export const GFB_HOECHSTBETRAG = 46_400;

/** Stufen des investitionsbedingten Teils: Breite der Gewinnstufe in Euro und Satz. */
export const GFB_STUFEN: ReadonlyArray<{ breite: number; satz: number }> = [
  { breite: 145_000, satz: 0.13 },
  { breite: 175_000, satz: 0.07 },
  { breite: 230_000, satz: 0.045 },
];

export interface GfbEingabe {
  /** Jahresgewinn vor Gewinnfreibetrag in Euro. */
  gewinn: number;
  /** Begünstigte Investitionen im selben Kalenderjahr in Euro. */
  investitionen: number;
  /** Gewinn wird pauschal ermittelt (z. B. Basispauschalierung). */
  pauschaliert?: boolean;
}

export interface GfbErgebnis {
  grundfreibetrag: number;
  /** Höchstmöglicher investitionsbedingter Teil laut Staffel (ohne Deckel durch Investitionen). */
  investitionsbedingtMoeglich: number;
  /** Tatsächlich zustehender investitionsbedingter Teil. */
  investitionsbedingt: number;
  gesamt: number;
  /** Gewinn nach Abzug des Gewinnfreibetrags. */
  steuerpflichtigerGewinn: number;
  /** Wie viel zusätzliche Investition den investitionsbedingten Teil ausschöpfen würde. */
  fehlendeInvestition: number;
}

export function berechneGewinnfreibetrag(e: GfbEingabe): GfbErgebnis {
  const gewinn = Math.max(0, e.gewinn);
  const investitionen = Math.max(0, e.investitionen);

  const grundfreibetrag = aufCent(Math.min(gewinn, GRUNDFREIBETRAG_GRENZE) * GRUNDFREIBETRAG_SATZ);

  let rest = Math.max(0, gewinn - GRUNDFREIBETRAG_GRENZE);
  let moeglich = 0;
  for (const stufe of GFB_STUFEN) {
    const teil = Math.min(rest, stufe.breite);
    moeglich += teil * stufe.satz;
    rest -= teil;
    if (rest <= 0) break;
  }
  const investitionsbedingtMoeglich = e.pauschaliert ? 0 : aufCent(moeglich);
  const investitionsbedingt = aufCent(Math.min(investitionsbedingtMoeglich, investitionen));
  const gesamt = aufCent(Math.min(GFB_HOECHSTBETRAG, grundfreibetrag + investitionsbedingt));

  return {
    grundfreibetrag,
    investitionsbedingtMoeglich,
    investitionsbedingt,
    gesamt,
    steuerpflichtigerGewinn: aufCent(Math.max(0, e.gewinn) - gesamt),
    fehlendeInvestition: aufCent(investitionsbedingtMoeglich - investitionsbedingt),
  };
}
