// KIN-6650 — Skonto-Rechner (/at/skonto-rechner).
//
// Skonto ist in Österreich kein gesetzlicher Satz, sondern Vereinbarungssache
// zwischen Lieferant und Kunde (Zahlungsbedingung auf der Rechnung, z. B.
// „2 % Skonto bei Zahlung binnen 10 Tagen, netto 30 Tage“).
//
// Formeln (kaufmännische Standardformeln):
//   Skontobetrag            = Rechnungsbetrag × Skontosatz / 100
//   Zahlbetrag              = Rechnungsbetrag − Skontobetrag
//   effektiver Jahreszins   = Skontosatz / (100 − Skontosatz) × 360 / (Zahlungsziel − Skontofrist) × 100
// Die Jahreszins-Formel setzt den Skontoabzug ins Verhältnis zum tatsächlich
// gezahlten Betrag und rechnet die gewonnenen Tage auf ein Jahr hoch. Wir nehmen
// das kaufmännische Jahr mit 360 Tagen (übliche Näherung, so auch im Artikel
// content/at/skonto-rechner.md: 2/98 × 360/20 ≈ 36,7 %).
//
// Umsatzsteuer: Ein Skontoabzug mindert das Entgelt und damit die
// Bemessungsgrundlage der Umsatzsteuer (§ 16 Abs. 1 UStG 1994, Änderung der
// Bemessungsgrundlage; RIS: https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10004873&Paragraf=16).
// Deshalb zeigt der Rechner den im Skonto enthaltenen USt-Anteil getrennt an.

import { aufCent } from "./runden";

export interface SkontoEingabe {
  /** Rechnungsbetrag brutto in Euro. */
  betrag: number;
  /** Skontosatz in Prozent, z. B. 2. */
  skontoProzent: number;
  /** Tage, innerhalb derer Skonto abgezogen werden darf. */
  skontoTage: number;
  /** Zahlungsziel in Tagen (ohne Skonto). */
  zielTage: number;
  /** Im Betrag enthaltener USt-Satz in Prozent (0 bei Kleinunternehmern). Standard 20. */
  ustSatz?: number;
}

export interface SkontoErgebnis {
  skontoBetrag: number;
  zahlbetrag: number;
  /** USt-Anteil im Skontobetrag (vermindert die geschuldete bzw. abziehbare USt). */
  ustImSkonto: number;
  nettoImSkonto: number;
  /** Effektiver Jahreszins in Prozent, gerundet auf 2 Stellen; null wenn Zahlungsziel ≤ Skontofrist. */
  effektiverJahreszins: number | null;
}

export class SkontoFehler extends Error {}

export function berechneSkonto(e: SkontoEingabe): SkontoErgebnis {
  const ust = e.ustSatz ?? 20;
  if (!(e.betrag > 0)) throw new SkontoFehler("Bitte einen Rechnungsbetrag über 0 eingeben.");
  if (!(e.skontoProzent > 0 && e.skontoProzent < 100))
    throw new SkontoFehler("Der Skontosatz muss zwischen 0 und 100 Prozent liegen.");
  if (e.skontoTage < 0 || e.zielTage < 0) throw new SkontoFehler("Tage dürfen nicht negativ sein.");

  const skontoBetrag = aufCent((e.betrag * e.skontoProzent) / 100);
  const zahlbetrag = aufCent(e.betrag - skontoBetrag);
  const ustImSkonto = aufCent((skontoBetrag * ust) / (100 + ust));
  const nettoImSkonto = aufCent(skontoBetrag - ustImSkonto);
  const gewonneneTage = e.zielTage - e.skontoTage;
  const effektiverJahreszins =
    gewonneneTage > 0
      ? aufCent((e.skontoProzent / (100 - e.skontoProzent)) * (360 / gewonneneTage) * 100)
      : null;

  return { skontoBetrag, zahlbetrag, ustImSkonto, nettoImSkonto, effektiverJahreszins };
}
