// SCH-430 — AI-Vervollständigung für Kundenanlage.
// SCH-960 — Multi-Pass-Strategy + Liste der weiterhin fehlenden Felder, damit
// das Frontend ein Fallback-Popup anzeigen kann.
//
// Nimmt einen Firmen-/Personennamen, recherchiert im Internet und gibt
// strukturierte Kundendaten zurück (Adresse, UID, E-Mail, Telefon etc.).
//
// Pipeline: pass 1 mit dem allgemeinen Prompt unten. Wenn nach Pass 1 noch
// Pflichtfelder leer sind → bis zu zwei weitere Pässe mit gezieltem Re-Prompt.
//
// Kosten pro Aufruf (geschätzt):
//   Pass 1: ~600-1000 Input + 400-800 Output → $0.002-0.006
//   Pass 2-3: ~+$0.002-0.004 wenn nötig
//
// SCH-600 Phase-5 Security: gated behind an authenticated session so an
// anonymous caller can't drain the Claude budget.

import { createClient as createServerClient } from "@/lib/supabase/server";
import { isFetchTimeout } from "@/lib/fetch-with-timeout";
import { logAndSanitize } from "@/lib/api-errors";
import {
  aiCompleteWithRetry,
  extractJsonObject,
  type AiCompleteFieldSpec,
} from "@/lib/ai-complete-with-retry";

const CUSTOMER_FIELDS: AiCompleteFieldSpec[] = [
  { key: "name", label: "Kontaktperson", description: "Ansprechpartner oder leerer String", required: false },
  { key: "company", label: "Firmenname", description: "Vollständiger Firmenname mit Rechtsform", required: true },
  { key: "address", label: "Adresse", description: "Straße und Hausnummer", required: true },
  { key: "zip", label: "PLZ", description: "Postleitzahl", required: true },
  { key: "city", label: "Stadt", description: "Ort/Stadt", required: true },
  { key: "country", label: "Land", description: "Land ausgeschrieben (z.B. Oesterreich, Deutschland)", required: true },
  { key: "uid_number", label: "UID-Nummer", description: "EU-UID-Nummer (z.B. ATU12345678)", required: true },
  { key: "leitweg_id", label: "Leitweg-ID", description: "Leitweg-ID nur bei Behörden, sonst leer", required: false },
  { key: "email", label: "E-Mail-Adresse", description: "Geschäftliche E-Mail-Adresse", required: true },
  { key: "phone", label: "Telefonnummer", description: "Telefonnummer im internationalen Format", required: true },
];

export async function POST(request: Request) {
  const ssr = await createServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) {
    return Response.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
  } | null;

  const name = body?.name?.trim();
  if (!name) {
    return Response.json(
      { error: "Name ist erforderlich" },
      { status: 400 }
    );
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return Response.json(
      { error: "AI-Analyse nicht konfiguriert. ANTHROPIC_API_KEY fehlt." },
      { status: 503 }
    );
  }

  const initialPrompt = `Du bist ein Recherche-Assistent für ein österreichisches Rechnungstool. Der Benutzer möchte einen neuen Kunden anlegen und hat folgenden Namen eingegeben:

"${name}"

AUFGABE: Recherchiere im Internet nach dieser Firma/Person. Suche nach:
- Vollständiger Firmenname / Rechtsform
- Adresse (Straße + Hausnummer)
- PLZ und Stadt
- Land (Standard: Österreich)
- UID-Nummer (z.B. ATU12345678) — suche im Firmenbuch, WKO, oder Impressum
- Leitweg-ID (nur bei öffentlichen Auftraggebern / Behörden, sonst leer)
- E-Mail-Adresse
- Telefonnummer

WICHTIG:
- Gib NUR verifizierte Daten zurück, die du aus öffentlichen Quellen bestätigen kannst
- Setze Felder auf leeren String "" wenn du sie nicht sicher ermitteln kannst
- Rate NICHT — lieber ein leeres Feld als falsche Daten
- Suche in: Firmenbuch, WKO Firmen A-Z, Impressum der Website, Herold.at, Google

Antworte NUR mit folgendem JSON, kein anderer Text:

{
  "name": "Kontaktperson/Ansprechpartner oder leer",
  "company": "Vollständiger Firmenname mit Rechtsform",
  "address": "Straße und Hausnummer",
  "zip": "PLZ",
  "city": "Stadt",
  "country": "Land (z.B. Oesterreich, Deutschland)",
  "uid_number": "UID-Nummer (z.B. ATU12345678)",
  "leitweg_id": "Leitweg-ID (nur bei Behörden, sonst leer)",
  "email": "E-Mail-Adresse",
  "phone": "Telefonnummer",
  "confidence": "high | medium | low",
  "source": "Kurze Angabe woher die Daten stammen (z.B. Website-Impressum, WKO, Firmenbuch)"
}`;

  try {
    const result = await aiCompleteWithRetry({
      anthropicKey,
      initialPrompt,
      entityName: name,
      fields: CUSTOMER_FIELDS,
      maxPasses: 3,
      parseResponse: (rawText) => {
        const parsed = extractJsonObject(rawText);
        const values: Record<string, string> = {};
        for (const f of CUSTOMER_FIELDS) {
          const v = parsed[f.key];
          values[f.key] = typeof v === "string" ? v : "";
        }
        return {
          values,
          confidence: typeof parsed.confidence === "string" ? parsed.confidence : undefined,
          source: typeof parsed.source === "string" ? parsed.source : undefined,
        };
      },
    });

    return Response.json({
      success: true,
      customer: {
        name: result.values.name || "",
        company: result.values.company || "",
        address: result.values.address || "",
        zip: result.values.zip || "",
        city: result.values.city || "",
        country: result.values.country || "Oesterreich",
        uid_number: result.values.uid_number || "",
        leitweg_id: result.values.leitweg_id || "",
        email: result.values.email || "",
        phone: result.values.phone || "",
      },
      confidence: result.confidence,
      source: result.source,
      cost: result.cost,
      passes: result.passes,
      missingFields: result.missingFields,
    });
  } catch (err) {
    if (isFetchTimeout(err)) {
      return Response.json(
        { error: "AI-Anfrage Zeitüberschreitung — bitte erneut versuchen." },
        { status: 504 },
      );
    }
    return Response.json(
      { error: logAndSanitize("customers/ai-complete", err, "AI-Recherche fehlgeschlagen.") },
      { status: 500 },
    );
  }
}
