// ORA-3315 — UID-Prüfung gegen den EU-VIES-Dienst.
//
// VIES (VAT Information Exchange System) ist der offizielle EU-Dienst, der eine
// Umsatzsteuer-Identifikationsnummer (UID) gegen das Register des jeweiligen
// Mitgliedstaats prüft. Wir nutzen die REST-API (das SOAP-Checkmodul ist nur
// noch Legacy):
//
//   POST https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number
//   Body:  { "countryCode": "AT", "vatNumber": "U12345678" }
//   Antwort (gültig):   { "valid": true,  "name": "...", "address": "...", ... }
//   Antwort (ungültig): { "valid": false, "userError": "INVALID", ... }
//
// WICHTIG: VIES ist regelmäßig offline (nächtliche Wartung, überlastete
// Mitgliedstaaten). Ein Ausfall darf NIE ein harter Fehler sein — er wird als
// `status: "unavailable"` zurückgegeben, damit das Anlegen eines Kunden nicht
// blockiert wird (siehe customers/page.tsx + verify-uid/route.ts).

export const VIES_ENDPOINT =
  "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";

// Format-Vorprüfung (BT-48). Deckungsgleich mit UID_RE in customer-ready.ts:
// zwei Buchstaben Länderkennung + 2–12 alphanumerische Zeichen.
export const UID_FORMAT_RE = /^[A-Z]{2}[A-Z0-9]{2,12}$/;

// VIES-userError-Codes, die bedeuten "Mitgliedstaat gerade nicht erreichbar"
// (Validität unbekannt), NICHT "Nummer ungültig".
const UNAVAILABLE_ERRORS = new Set([
  "MS_UNAVAILABLE",
  "MS_MAX_CONCURRENT_REQ",
  "GLOBAL_MAX_CONCURRENT_REQ",
  "SERVICE_UNAVAILABLE",
  "TIMEOUT",
]);

export type ViesStatus =
  | "valid" // VIES bestätigt die Nummer
  | "invalid" // VIES kennt die Nummer nicht / sie ist ungültig
  | "format_error" // Eingabe passt nicht aufs UID-Format — gar nicht erst angefragt
  | "unavailable"; // Dienst nicht erreichbar / Antwort unklar

export interface ViesResult {
  status: ViesStatus;
  /** Normalisierte UID (ohne Leerzeichen, Großschrift), echo des Inputs. */
  uid: string;
  countryCode?: string;
  vatNumber?: string;
  /** Von VIES gemeldeter Firmenname (nur bei status==="valid", oft "---"). */
  name?: string;
  /** Von VIES gemeldete Adresse (nur bei status==="valid", oft "---"). */
  address?: string;
  /** ISO-Zeitstempel der Prüfung. */
  checkedAt: string;
  /** Technischer Hinweis für Logs/Details (z.B. VIES-userError-Code). */
  detail?: string;
}

/** Zerlegt eine UID in VIES-Länderkennung + Nummer. `null` bei Formatfehler. */
export function parseUid(
  raw: string,
): { countryCode: string; vatNumber: string; normalized: string } | null {
  const normalized = (raw || "").replace(/\s/g, "").toUpperCase();
  if (!UID_FORMAT_RE.test(normalized)) return null;
  return {
    countryCode: normalized.slice(0, 2),
    vatNumber: normalized.slice(2),
    normalized,
  };
}

type FetchLike = (
  url: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface VerifyUidOptions {
  /** Injizierbar für Tests; Default ist der globale `fetch`. */
  fetchImpl?: FetchLike;
  /** Abbruch nach diesem Timeout (ms). Default 8000. */
  timeoutMs?: number;
}

/**
 * Prüft eine UID gegen VIES. Wirft NIE wegen Netz-/Dienstproblemen — ein
 * Ausfall landet als `status: "unavailable"`. Format-Fehler werden lokal
 * erkannt, ohne VIES anzufragen.
 */
export async function verifyUid(
  rawUid: string,
  opts: VerifyUidOptions = {},
): Promise<ViesResult> {
  const checkedAt = new Date().toISOString();
  const parsed = parseUid(rawUid);
  if (!parsed) {
    return {
      status: "format_error",
      uid: (rawUid || "").replace(/\s/g, "").toUpperCase(),
      checkedAt,
    };
  }

  const { countryCode, vatNumber, normalized } = parsed;
  const base: ViesResult = { status: "unavailable", uid: normalized, countryCode, vatNumber, checkedAt };

  const fetchImpl = (opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  const timeoutMs = opts.timeoutMs ?? 8000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let json: Record<string, unknown>;
  try {
    const res = await fetchImpl(VIES_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ countryCode, vatNumber }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ...base, detail: `HTTP ${res.status}` };
    }
    json = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    // AbortError (Timeout) oder Netzwerkfehler → Dienst nicht erreichbar.
    return { ...base, detail: err instanceof Error ? err.name : "fetch_error" };
  } finally {
    clearTimeout(timer);
  }

  const userError = typeof json.userError === "string" ? json.userError : undefined;

  if (json.valid === true) {
    const name = typeof json.name === "string" && json.name !== "---" ? json.name : undefined;
    const address =
      typeof json.address === "string" && json.address !== "---" ? json.address : undefined;
    return { ...base, status: "valid", name, address, detail: userError };
  }

  if (json.valid === false) {
    // valid:false + kein (oder "INVALID") userError => Nummer ungültig.
    // valid:false + Unavailable-Code => Mitgliedstaat gerade offline.
    if (userError && UNAVAILABLE_ERRORS.has(userError)) {
      return { ...base, detail: userError };
    }
    return { ...base, status: "invalid", detail: userError };
  }

  // Unklare Antwort (kein `valid`-Feld) → lieber "nicht erreichbar" als falsch.
  return { ...base, detail: userError ?? "unexpected_response" };
}
