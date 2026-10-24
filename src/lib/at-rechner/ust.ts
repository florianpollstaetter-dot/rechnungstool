// KIN-6650 — USt-Rechner (/at/ust-rechner): netto ↔ brutto nach österreichischen Sätzen.
//
// Steuersätze § 10 UStG 1994 (RIS: https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10004873&Paragraf=10):
//   20 %  Normalsteuersatz (§ 10 Abs. 1)
//   13 %  ermäßigt, z. B. Kunst, Tiere, Pflanzen, bestimmte Beherbergung (§ 10 Abs. 3)
//   10 %  ermäßigt, z. B. Lebensmittel, Bücher, Personenbeförderung, Wohnungsvermietung (§ 10 Abs. 2)
//   4,9 % ermäßigt für ausgewählte Grundnahrungsmittel seit 1. Juli 2026 (§ 10 Abs. 1a + Anhang 3,
//         BGBl. vom 10.06.2026; USP „Neuer Umsatzsteuersatz von 4,9 Prozent“,
//         https://www.usp.gv.at/aktuelles/newsliste/neuer_ustsatz.html, abgerufen 24.10.2026)
//   0 %   steuerfreie Umsätze bzw. Kleinunternehmer (§ 6 Abs. 1 Z 27) — keine USt auf der Rechnung
// Stand: 24.10.2026.
//
// Rundung: USt wird je Betrag auf Cent gerundet; bei brutto → netto wird zuerst
// der Nettobetrag gerundet und die USt als Differenz gebildet, damit
// netto + USt immer genau den eingegebenen Bruttobetrag ergibt.

import { aufCent } from "./runden";

export const UST_SAETZE = [20, 13, 10, 4.9, 0] as const;
export type UstSatz = (typeof UST_SAETZE)[number];

export const UST_SATZ_HINWEIS: Record<UstSatz, string> = {
  20: "Normalsteuersatz (die meisten Waren und Dienstleistungen)",
  13: "z. B. Kunst, Pflanzen, Tiere, bestimmte Beherbergung",
  10: "z. B. Lebensmittel, Bücher, Personenbeförderung, Miete für Wohnungen",
  4.9: "ausgewählte Grundnahrungsmittel seit 1. Juli 2026",
  0: "steuerfrei oder Kleinunternehmer – keine USt ausweisen",
};

export type Richtung = "netto" | "brutto";

export interface UstErgebnis {
  netto: number;
  ust: number;
  brutto: number;
}

export class UstFehler extends Error {}

/**
 * @param betrag eingegebener Betrag in Euro
 * @param richtung „netto“ = Betrag ist netto, „brutto“ = Betrag ist brutto
 */
export function berechneUst(betrag: number, satz: number, richtung: Richtung): UstErgebnis {
  if (!Number.isFinite(betrag) || betrag < 0) throw new UstFehler("Bitte einen Betrag ab 0 eingeben.");
  if (!(UST_SAETZE as readonly number[]).includes(satz)) throw new UstFehler("Unbekannter Steuersatz.");
  if (richtung === "netto") {
    const netto = aufCent(betrag);
    const ust = aufCent((netto * satz) / 100);
    return { netto, ust, brutto: aufCent(netto + ust) };
  }
  const brutto = aufCent(betrag);
  const netto = aufCent(brutto / (1 + satz / 100));
  return { netto, ust: aufCent(brutto - netto), brutto };
}
