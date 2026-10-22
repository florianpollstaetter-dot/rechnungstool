// KIN-6527 — Format-Vorprüfung für UID-Nummern (Umsatzsteuer-Identifikationsnummern)
// aller Länder, die VIES abdeckt. Reine Funktionen ohne Abhängigkeiten, damit
// Client-Formular (src/components/at/UidPruefFormular.tsx) und Server-Route
// (src/app/api/at/uid-pruefen/route.ts) dieselbe Prüfung nutzen und die Regeln
// mit `npx tsx tests/unit/kin6527-uid-format.test.ts` getestet werden können.
//
// Die Muster folgen der VIES-Hilfeseite "VAT number structure" (Europäische
// Kommission). Sie prüfen nur den Aufbau, nicht die Prüfziffer — ob die Nummer
// vergeben ist, sagt erst VIES.

export interface UidLand {
  /** VIES-Länderkennung (bei Griechenland "EL", nicht "GR"; Nordirland "XI"). */
  code: string;
  name: string;
  /** Muster für den Teil NACH der Länderkennung. */
  muster: RegExp;
  /** Beispiel für den Platzhalter im Formular (ohne Länderkennung). */
  beispiel: string;
  /** Kurze Beschreibung des Aufbaus in Alltagssprache. */
  aufbau: string;
}

export const UID_LAENDER: readonly UidLand[] = [
  { code: "AT", name: "Österreich", muster: /^U\d{8}$/, beispiel: "U12345678", aufbau: "„U“ und 8 Ziffern" },
  { code: "BE", name: "Belgien", muster: /^[01]\d{9}$/, beispiel: "0123456789", aufbau: "10 Ziffern, beginnt mit 0 oder 1" },
  { code: "BG", name: "Bulgarien", muster: /^\d{9,10}$/, beispiel: "123456789", aufbau: "9 oder 10 Ziffern" },
  { code: "CY", name: "Zypern", muster: /^\d{8}[A-Z]$/, beispiel: "12345678X", aufbau: "8 Ziffern und ein Buchstabe" },
  { code: "CZ", name: "Tschechien", muster: /^\d{8,10}$/, beispiel: "12345678", aufbau: "8, 9 oder 10 Ziffern" },
  { code: "DE", name: "Deutschland", muster: /^\d{9}$/, beispiel: "123456789", aufbau: "9 Ziffern" },
  { code: "DK", name: "Dänemark", muster: /^\d{8}$/, beispiel: "12345678", aufbau: "8 Ziffern" },
  { code: "EE", name: "Estland", muster: /^\d{9}$/, beispiel: "123456789", aufbau: "9 Ziffern" },
  { code: "EL", name: "Griechenland", muster: /^\d{9}$/, beispiel: "123456789", aufbau: "9 Ziffern (Kennung „EL“, nicht „GR“)" },
  { code: "ES", name: "Spanien", muster: /^[A-Z0-9]\d{7}[A-Z0-9]$/, beispiel: "X1234567X", aufbau: "9 Zeichen, erstes und letztes können Buchstaben sein" },
  { code: "FI", name: "Finnland", muster: /^\d{8}$/, beispiel: "12345678", aufbau: "8 Ziffern" },
  { code: "FR", name: "Frankreich", muster: /^[A-Z0-9]{2}\d{9}$/, beispiel: "12345678901", aufbau: "2 Zeichen und 9 Ziffern" },
  { code: "HR", name: "Kroatien", muster: /^\d{11}$/, beispiel: "12345678901", aufbau: "11 Ziffern" },
  { code: "HU", name: "Ungarn", muster: /^\d{8}$/, beispiel: "12345678", aufbau: "8 Ziffern" },
  { code: "IE", name: "Irland", muster: /^(\d{7}[A-W][A-I]?|\d[A-Z+*]\d{5}[A-W])$/, beispiel: "1234567FA", aufbau: "7 Ziffern und 1 bis 2 Buchstaben" },
  { code: "IT", name: "Italien", muster: /^\d{11}$/, beispiel: "12345678901", aufbau: "11 Ziffern" },
  { code: "LT", name: "Litauen", muster: /^(\d{9}|\d{12})$/, beispiel: "123456789", aufbau: "9 oder 12 Ziffern" },
  { code: "LU", name: "Luxemburg", muster: /^\d{8}$/, beispiel: "12345678", aufbau: "8 Ziffern" },
  { code: "LV", name: "Lettland", muster: /^\d{11}$/, beispiel: "12345678901", aufbau: "11 Ziffern" },
  { code: "MT", name: "Malta", muster: /^\d{8}$/, beispiel: "12345678", aufbau: "8 Ziffern" },
  { code: "NL", name: "Niederlande", muster: /^\d{9}B\d{2}$/, beispiel: "123456789B01", aufbau: "9 Ziffern, „B“ und 2 Ziffern" },
  { code: "PL", name: "Polen", muster: /^\d{10}$/, beispiel: "1234567890", aufbau: "10 Ziffern" },
  { code: "PT", name: "Portugal", muster: /^\d{9}$/, beispiel: "123456789", aufbau: "9 Ziffern" },
  { code: "RO", name: "Rumänien", muster: /^[1-9]\d{1,9}$/, beispiel: "12345678", aufbau: "2 bis 10 Ziffern" },
  { code: "SE", name: "Schweden", muster: /^\d{10}01$/, beispiel: "123456789001", aufbau: "12 Ziffern, endet auf 01" },
  { code: "SI", name: "Slowenien", muster: /^\d{8}$/, beispiel: "12345678", aufbau: "8 Ziffern" },
  { code: "SK", name: "Slowakei", muster: /^\d{10}$/, beispiel: "1234567890", aufbau: "10 Ziffern" },
  { code: "XI", name: "Nordirland", muster: /^(\d{9}|\d{12}|(GD|HA)\d{3})$/, beispiel: "123456789", aufbau: "9 oder 12 Ziffern (Kennung „XI“)" },
];

export const UID_LAENDER_CODES: readonly string[] = UID_LAENDER.map((l) => l.code);

export function findeUidLand(code: string): UidLand | undefined {
  const c = (code || "").trim().toUpperCase();
  return UID_LAENDER.find((l) => l.code === c);
}

export type UidFormatErgebnis =
  | { ok: true; land: string; nummer: string; uid: string }
  | { ok: false; fehler: string };

/**
 * Normalisiert und prüft Länderkennung + Nummer.
 * - Leerzeichen, Punkte und Bindestriche in der Nummer werden entfernt.
 * - Beginnt die Nummer selbst mit der gewählten Länderkennung ("ATU…" bei
 *   Land AT), wird die Kennung abgeschnitten — so darf man die UID auch
 *   komplett eintippen.
 * Gibt eine deutsche Fehlermeldung zurück, die direkt im Formular stehen kann.
 */
export function pruefeUidFormat(landCode: string, nummerRoh: string): UidFormatErgebnis {
  const land = findeUidLand(landCode);
  if (!land) {
    return { ok: false, fehler: "Bitte ein Land aus der Liste wählen." };
  }
  let nummer = (nummerRoh || "").replace(/[\s.\-/]/g, "").toUpperCase();
  if (!nummer) {
    return { ok: false, fehler: "Bitte die UID-Nummer eingeben." };
  }
  // Komplett eingegebene UID ("ATU12345678") → Länderkennung abschneiden,
  // aber nur, wenn sie zum gewählten Land passt.
  if (nummer.startsWith(land.code) && nummer.length > land.code.length) {
    nummer = nummer.slice(land.code.length);
  } else if (/^[A-Z]{2}/.test(nummer) && !land.muster.test(nummer)) {
    const anderes = findeUidLand(nummer.slice(0, 2));
    if (anderes && anderes.code !== land.code) {
      return {
        ok: false,
        fehler: `Die Nummer beginnt mit „${anderes.code}“ (${anderes.name}), gewählt ist aber ${land.name}. Bitte das Land anpassen.`,
      };
    }
  }
  if (!land.muster.test(nummer)) {
    return {
      ok: false,
      fehler: `Das passt nicht zum Aufbau einer UID aus ${land.name}: ${land.aufbau}, zum Beispiel ${land.code}${land.beispiel}.`,
    };
  }
  return { ok: true, land: land.code, nummer, uid: `${land.code}${nummer}` };
}

/**
 * Erkennt die Länderkennung am Anfang einer komplett eingetippten UID
 * ("ATU…" → "AT"). Für die automatische Umstellung der Länderauswahl im
 * Formular. `null`, wenn kein bekanntes Land vorne steht.
 */
export function erkenneLandAusEingabe(nummerRoh: string): string | null {
  const n = (nummerRoh || "").trim().toUpperCase();
  if (n.length < 2) return null;
  const land = findeUidLand(n.slice(0, 2));
  return land ? land.code : null;
}
