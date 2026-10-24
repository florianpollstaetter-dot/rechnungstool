// KIN-6650 — gemeinsame Hilfen für die Rechner unter /at/… (reine Funktionen,
// laufen im Browser, keine Daten an den Server).

/** Kaufmännisch auf Cent runden (0,005 → 0,01), robust gegen Gleitkomma-Reste. */
export function aufCent(x: number): number {
  return Math.round((x + Math.sign(x) * Number.EPSILON) * 100) / 100;
}

/** Deutsche Eingabe („1.234,56“, „1234.56“, „1 234,5“) → Zahl; leer/ungültig → null. */
export function parseBetrag(eingabe: string): number | null {
  const t = eingabe.trim().replace(/\s|€/g, "");
  if (!t) return null;
  let norm = t;
  if (t.includes(",")) {
    // Komma ist Dezimaltrenner, Punkte sind Tausendertrenner.
    norm = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    // „1.234“ / „12.500.000“ ohne Komma = Tausendertrenner.
    norm = t.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(norm)) return null;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

const EUR = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" });
const PROZENT = new Intl.NumberFormat("de-AT", { maximumFractionDigits: 2 });

export function euro(x: number): string {
  return EUR.format(x);
}

export function prozent(x: number): string {
  return `${PROZENT.format(x)} %`;
}
