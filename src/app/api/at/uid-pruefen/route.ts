// KIN-6527 — Öffentliche Server-Route: UID-Nummer gegen den EU-Dienst VIES prüfen.
//
// Wird vom Prüf-Formular auf den Ratgeberseiten /at/… aufgerufen (ohne Login).
// Deshalb steht der Pfad auf der Allowlist in src/lib/auth/api-access-policy.ts
// und wird durch eine Abfragebremse pro IP geschützt (src/lib/uid-pruefung/rate-limit.ts).
//
// Antworten (immer JSON):
//   200 { status: "gueltig" | "ungueltig" | "nicht_erreichbar", uid, land, name?, adresse?, geprueftAm }
//   400 { fehler }                   — Formatfehler, VIES wurde nicht gefragt
//   429 { fehler, wartenSekunden }   — zu viele Abfragen von dieser Adresse
//
// Ein VIES-Ausfall ist KEIN Fehler, sondern status "nicht_erreichbar" mit 200.
// Die Eingabe wird nicht gespeichert und nicht geloggt (Cache-Control: no-store).

import { verifyUid } from "@/lib/einvoice/vies";
import { handleUidPruefung } from "@/lib/uid-pruefung/handler";
import { RateLimiter, absenderAusHeadern } from "@/lib/uid-pruefung/rate-limit";

// Modulweit: lebt so lange wie die Server-Instanz.
const limiter = new RateLimiter({
  maxProAbsender: 20, // 20 Abfragen je IP …
  maxGesamt: 300, // … und 300 insgesamt je Instanz …
  fensterMs: 10 * 60 * 1000, // … pro 10 Minuten
});

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { land?: unknown; nummer?: unknown }
    | null;
  if (!body || typeof body !== "object") {
    return Response.json(
      { fehler: "Bitte Land und UID-Nummer eingeben." },
      { status: 400, headers: HEADERS },
    );
  }

  const ergebnis = await handleUidPruefung(body, absenderAusHeadern(request.headers), {
    verify: (uid) => verifyUid(uid, { timeoutMs: 10_000 }),
    limiter,
  });

  const headers: Record<string, string> = { ...HEADERS };
  if (ergebnis.status === 429 && ergebnis.body.wartenSekunden) {
    headers["Retry-After"] = String(ergebnis.body.wartenSekunden);
  }
  return Response.json(ergebnis.body, { status: ergebnis.status, headers });
}

export async function GET() {
  return Response.json(
    { fehler: "Bitte per POST mit { land, nummer } abfragen." },
    { status: 405, headers: { ...HEADERS, Allow: "POST" } },
  );
}
