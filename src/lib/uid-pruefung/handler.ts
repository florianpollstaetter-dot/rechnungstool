// KIN-6527 — Kernlogik der öffentlichen UID-Prüfung, getrennt von Next.js,
// damit sie ohne Server testbar ist (Abhängigkeiten werden injiziert).
//
// Datenschutz: Die UID wird nur an VIES weitergereicht und in der Antwort
// zurückgespiegelt. Sie wird weder geloggt noch gespeichert; der Rate-Limiter
// kennt nur Zeitstempel je Absender.

import type { ViesResult } from "@/lib/einvoice/vies";
import { pruefeUidFormat } from "./format";
import type { RateLimiter } from "./rate-limit";

export type UidPruefStatus = "gueltig" | "ungueltig" | "nicht_erreichbar";

export interface UidPruefAntwort {
  status: UidPruefStatus;
  /** Normalisierte UID inkl. Länderkennung, z. B. "ATU12345678". */
  uid: string;
  land: string;
  /** Firmenname laut VIES — nur bei "gueltig" und nur, wenn das Land ihn liefert. */
  name?: string;
  /** Anschrift laut VIES — nur bei "gueltig" und nur, wenn das Land sie liefert. */
  adresse?: string;
  /** ISO-Zeitstempel der Abfrage. */
  geprueftAm: string;
}

export interface UidPruefFehler {
  /** Deutsche Fehlermeldung für das Formular. */
  fehler: string;
  /** Nur bei 429: Sekunden bis zum nächsten Versuch. */
  wartenSekunden?: number;
}

export type HandlerErgebnis =
  | { status: 200; body: UidPruefAntwort }
  | { status: 400 | 429; body: UidPruefFehler };

export interface HandlerDeps {
  verify: (uid: string) => Promise<ViesResult>;
  limiter: RateLimiter;
}

export async function handleUidPruefung(
  eingabe: { land?: unknown; nummer?: unknown },
  absender: string,
  deps: HandlerDeps,
): Promise<HandlerErgebnis> {
  const land = typeof eingabe.land === "string" ? eingabe.land : "";
  const nummer = typeof eingabe.nummer === "string" ? eingabe.nummer : "";

  // Format zuerst — fehlerhafte Eingaben kosten kein Kontingent und keinen VIES-Aufruf.
  const format = pruefeUidFormat(land, nummer);
  if (!format.ok) {
    return { status: 400, body: { fehler: format.fehler } };
  }

  const limit = deps.limiter.pruefe(absender);
  if (!limit.erlaubt) {
    return {
      status: 429,
      body: {
        fehler:
          "Zu viele Abfragen von deiner Verbindung. Bitte in ein paar Minuten noch einmal versuchen.",
        wartenSekunden: limit.wartenSekunden,
      },
    };
  }

  const ergebnis = await deps.verify(format.uid);
  const geprueftAm = ergebnis.checkedAt || new Date().toISOString();

  if (ergebnis.status === "valid") {
    return {
      status: 200,
      body: {
        status: "gueltig",
        uid: format.uid,
        land: format.land,
        ...(ergebnis.name ? { name: ergebnis.name } : {}),
        ...(ergebnis.address ? { adresse: ergebnis.address } : {}),
        geprueftAm,
      },
    };
  }
  if (ergebnis.status === "invalid") {
    return { status: 200, body: { status: "ungueltig", uid: format.uid, land: format.land, geprueftAm } };
  }
  // "unavailable" oder — theoretisch — "format_error" aus VIES-Sicht: lieber
  // "nicht erreichbar" melden als ein falsches "ungültig".
  return {
    status: 200,
    body: { status: "nicht_erreichbar", uid: format.uid, land: format.land, geprueftAm },
  };
}
