// KIN-6650 — Verzugszinsen-Rechner (/at/verzugszinsen-rechner).
//
// Rechtsgrundlagen (RIS):
//   § 456 UGB — Geschäfte zwischen Unternehmern: 9,2 Prozentpunkte über dem
//     Basiszinssatz. „Dabei ist der Basiszinssatz, der am ersten Kalendertag
//     eines Halbjahres gilt, für das jeweilige Halbjahr maßgebend.“ Ist der
//     Schuldner für die Verzögerung nicht verantwortlich, nur 4 % (§ 1000 ABGB).
//     https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001702&Paragraf=456
//   § 1000 Abs. 1 ABGB — gesetzliche Zinsen sonst (z. B. gegenüber Privatpersonen): 4 % pro Jahr.
//     https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001622&Paragraf=1000
//   § 458 UGB — zwischen Unternehmern zusätzlich 40 € Pauschale für Betreibungskosten
//     (Mahnspesen), unabhängig von weiteren Betreibungskosten.
//     https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001702&Paragraf=458
//
// Basiszinssatz: OeNB, „Basis- und Referenzzinssätze der Oesterreichischen
// Nationalbank“, Tabelle 2.1, letzte Änderung 05.10.2026, abgerufen 24.10.2026
// (https://www.oenb.at/isawebstat/stabfrage/createReport?lang=DE&report=2.1).
// Änderungen seit 2022: 27.07.22 −0,12 · 14.09.22 0,63 · 02.11.22 1,38 ·
// 21.12.22 1,88 · 08.02.23 2,38 · 22.03.23 2,88 · 21.06.23 3,38 · 20.09.23 3,88 ·
// 18.09.24 3,03 · 18.12.24 2,53 · 12.03.25 2,03 · 11.06.25 1,53 · 16.09.26 2,03.
// Davor seit 16.03.16: −0,62.
// Daraus der je Halbjahr maßgebliche Wert (Stand am 1. Jänner bzw. 1. Juli),
// siehe BASISZINSSATZ_HALBJAHR unten.
//
// Zinstage: vom Tag nach der Fälligkeit bis einschließlich Zahlungstag,
// Kalendertage / 365 (taggenaue Zinsen, wie in der Praxis üblich).

import { aufCent } from "./runden";

export const VERZUGSZINSEN_STAND = "24.10.2026";
export const UGB_AUFSCHLAG = 9.2; // Prozentpunkte, § 456 UGB
export const ABGB_ZINSSATZ = 4; // Prozent p. a., § 1000 Abs. 1 ABGB
export const MAHNPAUSCHALE_UGB = 40; // Euro, § 458 UGB

/** Basiszinssatz am ersten Tag des Halbjahres; Schlüssel "JJJJ-1" (1.1.) bzw. "JJJJ-2" (1.7.). */
export const BASISZINSSATZ_HALBJAHR: Readonly<Record<string, number>> = {
  "2022-1": -0.62,
  "2022-2": -0.62,
  "2023-1": 1.88,
  "2023-2": 3.38,
  "2024-1": 3.88,
  "2024-2": 3.88,
  "2025-1": 2.53,
  "2025-2": 1.53,
  "2026-1": 1.53,
  "2026-2": 1.53,
};

/** Seit 16.09.2026 geltender Basiszinssatz — wird für spätere Halbjahre als Annahme genommen. */
export const AKTUELLER_BASISZINSSATZ = 2.03;
export const ERSTES_HALBJAHR = "2022-1";

export type Art = "unternehmer" | "privat";

export interface VerzugEingabe {
  betrag: number;
  /** Fälligkeitstag, ISO "JJJJ-MM-TT". Zinsen laufen ab dem Folgetag. */
  faelligAm: string;
  /** Zahlungstag (oder Stichtag der Berechnung), ISO "JJJJ-MM-TT". */
  bezahltAm: string;
  art: Art;
  /** 40-€-Pauschale nach § 458 UGB dazurechnen (nur zwischen Unternehmern). */
  mahnpauschale?: boolean;
}

export interface VerzugAbschnitt {
  von: string;
  bis: string;
  tage: number;
  /** Zinssatz p. a. in Prozent. */
  zinssatz: number;
  zinsen: number;
  /** true, wenn der Basiszinssatz für dieses Halbjahr noch nicht feststeht (Annahme). */
  vorlaeufig: boolean;
}

export interface VerzugErgebnis {
  tage: number;
  abschnitte: VerzugAbschnitt[];
  zinsen: number;
  pauschale: number;
  gesamt: number;
}

export class VerzugFehler extends Error {}

const TAG_MS = 86_400_000;

function parseIso(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new VerzugFehler("Bitte ein gültiges Datum eingeben.");
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(t);
  if (d.getUTCDate() !== Number(m[3])) throw new VerzugFehler("Bitte ein gültiges Datum eingeben.");
  return t;
}

function iso(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

function halbjahrSchluessel(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() < 6 ? 1 : 2}`;
}

/** Letzter Tag des Halbjahres, in dem t liegt. */
function halbjahrEnde(t: number): number {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  return d.getUTCMonth() < 6 ? Date.UTC(y, 5, 30) : Date.UTC(y, 11, 31);
}

export function basiszinssatzFuer(schluessel: string): { satz: number; vorlaeufig: boolean } {
  const s = BASISZINSSATZ_HALBJAHR[schluessel];
  if (s != null) return { satz: s, vorlaeufig: false };
  if (schluessel < ERSTES_HALBJAHR) {
    throw new VerzugFehler("Der Rechner kennt Basiszinssätze ab 1. Jänner 2022. Bitte ein späteres Fälligkeitsdatum wählen.");
  }
  return { satz: AKTUELLER_BASISZINSSATZ, vorlaeufig: true };
}

export function berechneVerzugszinsen(e: VerzugEingabe): VerzugErgebnis {
  if (!(e.betrag > 0)) throw new VerzugFehler("Bitte einen offenen Betrag über 0 eingeben.");
  const faellig = parseIso(e.faelligAm);
  const bezahlt = parseIso(e.bezahltAm);
  if (bezahlt <= faellig) throw new VerzugFehler("Der Zahlungstag muss nach der Fälligkeit liegen.");

  const abschnitte: VerzugAbschnitt[] = [];
  let start = faellig + TAG_MS; // Verzug ab dem Tag nach der Fälligkeit
  let zinsenRoh = 0;
  while (start <= bezahlt) {
    const ende = Math.min(halbjahrEnde(start), bezahlt);
    const tage = Math.round((ende - start) / TAG_MS) + 1;
    let zinssatz = ABGB_ZINSSATZ;
    let vorlaeufig = false;
    if (e.art === "unternehmer") {
      const b = basiszinssatzFuer(halbjahrSchluessel(start));
      zinssatz = aufCent(b.satz + UGB_AUFSCHLAG);
      vorlaeufig = b.vorlaeufig;
    }
    const roh = (e.betrag * zinssatz * tage) / 100 / 365;
    zinsenRoh += roh;
    abschnitte.push({ von: iso(start), bis: iso(ende), tage, zinssatz, zinsen: aufCent(roh), vorlaeufig });
    start = ende + TAG_MS;
  }

  // Bei Privatpersonen gibt es nur einen Satz — Abschnitte zusammenfassen.
  const anzeige =
    e.art === "privat"
      ? [{
          von: abschnitte[0].von,
          bis: abschnitte[abschnitte.length - 1].bis,
          tage: abschnitte.reduce((s, a) => s + a.tage, 0),
          zinssatz: ABGB_ZINSSATZ,
          zinsen: aufCent(zinsenRoh),
          vorlaeufig: false,
        }]
      : abschnitte;

  const zinsen = aufCent(zinsenRoh);
  const pauschale = e.art === "unternehmer" && e.mahnpauschale ? MAHNPAUSCHALE_UGB : 0;
  return {
    tage: anzeige.reduce((s, a) => s + a.tage, 0),
    abschnitte: anzeige,
    zinsen,
    pauschale,
    gesamt: aufCent(zinsen + pauschale),
  };
}
