// SCH-578 — AI-Vervollständigung für die eigenen Unternehmensdaten (Verkäufer).
// SCH-960 — Multi-Pass-Strategy + Liste der weiterhin fehlenden Felder.
//
// Spiegelbild zu /api/customers/ai-complete, aber für `company_settings`.
// Wird aus dem E-Rechnung-Validierungs-Popup aufgerufen, wenn EN-16931
// Pflichtfelder (Adresse BT-35, Ort BT-37, UID BT-31, IBAN BT-84 …) fehlen.
//
// Pipeline: pass 1 mit dem allgemeinen Prompt unten. Wenn nach Pass 1 noch
// Pflichtfelder leer sind → bis zu zwei weitere Pässe mit gezieltem Re-Prompt.
//
// Kosten ca. $0.002-0.006 für Pass 1, +$0.002-0.004 pro zusätzlichem Pass.
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

const COMPANY_FIELDS: AiCompleteFieldSpec[] = [
  { key: "company_name", label: "Firmenname", description: "Vollständiger Firmenname inkl. Rechtsform", required: true },
  { key: "address", label: "Adresse", description: "Straße und Hausnummer", required: true },
  { key: "zip", label: "PLZ", description: "Postleitzahl", required: true },
  { key: "city", label: "Stadt", description: "Ort/Stadt", required: true },
  { key: "country", label: "Land (ISO-2)", description: "ISO-3166-1 Alpha-2 Code (z.B. AT, DE, CH)", required: true },
  { key: "uid", label: "UID-Nummer", description: "EU-UID-Nummer (z.B. ATU12345678)", required: true },
  { key: "iban", label: "IBAN", description: "IBAN ohne Leerzeichen, sofern öffentlich (z.B. Vereinsstatut)", required: false },
  { key: "bic", label: "BIC", description: "BIC zur IBAN", required: false },
  { key: "email", label: "E-Mail", description: "Geschäftliche E-Mail aus dem Impressum", required: true },
  { key: "phone", label: "Telefon", description: "Telefonnummer", required: true },
  { key: "website", label: "Website", description: "Hauptdomain inkl. https://", required: true },
  { key: "industry", label: "Branche", description: "Kurzbezeichnung (z.B. IT-Dienstleister)", required: false },
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
      { error: "Firmenname ist erforderlich" },
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

  const initialPrompt = `Du bist ein Recherche-Assistent für ein österreichisches Rechnungstool. Der Benutzer möchte seine EIGENEN Unternehmensdaten (Verkäufer) vervollständigen — diese werden für E-Rechnungen (EN 16931) benötigt.

Firmenname: "${name}"

AUFGABE: Recherchiere im Internet nach dieser Firma. Suche nach:
- Vollständiger Firmenname inkl. Rechtsform (GmbH, OG, KG, AG, Einzelunternehmen …)
- Adresse (Straße + Hausnummer)
- PLZ und Stadt
- Land als ISO-3166-1-Alpha-2-Code ("AT", "DE", "CH" — nicht "Österreich"!)
- UID-Nummer im EU-Format (österreichisch: "ATU" + 8 Ziffern, deutsch: "DE" + 9 Ziffern, …)
- IBAN (sofern öffentlich bekannt, z.B. Vereins-Statut oder Bankverbindung auf Website)
- BIC (sofern IBAN gefunden)
- E-Mail-Adresse aus dem Impressum
- Telefonnummer
- Website-URL
- Branche (ein-zwei Wörter, z.B. "IT-Dienstleister", "Gastronomie")

WICHTIG:
- Gib NUR verifizierte Daten zurück, die du aus öffentlichen Quellen bestätigen kannst
- Setze Felder auf leeren String "" wenn du sie nicht sicher ermitteln kannst
- Rate NICHT — lieber leeres Feld als falsche Daten
- Das Land MUSS als 2-Buchstaben-ISO-Code sein (AT, DE, CH, IT …) — nicht ausgeschrieben
- Bei der UID NIEMALS raten — nur aus Firmenbuch/WKO/Impressum übernehmen
- Suche in: Firmenbuch, WKO Firmen A-Z, Impressum, Herold.at, UID-Info.eu, Google

Antworte NUR mit folgendem JSON, kein anderer Text:

{
  "company_name": "Vollständiger Firmenname mit Rechtsform",
  "address": "Straße und Hausnummer",
  "zip": "PLZ",
  "city": "Stadt",
  "country": "ISO-Code, z.B. AT",
  "uid": "UID-Nummer (z.B. ATU12345678)",
  "iban": "IBAN ohne Leerzeichen, sofern gefunden",
  "bic": "BIC, sofern IBAN gefunden",
  "email": "E-Mail-Adresse",
  "phone": "Telefonnummer",
  "website": "https-URL",
  "industry": "Branchenkurzbezeichnung",
  "confidence": "high | medium | low",
  "source": "Kurze Angabe woher die Daten stammen (z.B. Website-Impressum, WKO, Firmenbuch)"
}`;

  try {
    const result = await aiCompleteWithRetry({
      anthropicKey,
      initialPrompt,
      entityName: name,
      fields: COMPANY_FIELDS,
      maxPasses: 3,
      refinePromptSuffix:
        'Falls "country" zurückgegeben wird, IMMER als ISO-3166-1 Alpha-2 (z.B. AT, DE, CH). UID-Nummern niemals raten — nur aus Firmenbuch / VIES / Impressum.',
      parseResponse: (rawText) => {
        const parsed = extractJsonObject(rawText);
        const values: Record<string, string> = {};
        for (const f of COMPANY_FIELDS) {
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

    const country = (result.values.country || "").trim().toUpperCase().slice(0, 2);

    return Response.json({
      success: true,
      company: {
        company_name: result.values.company_name || "",
        address: result.values.address || "",
        zip: result.values.zip || "",
        city: result.values.city || "",
        country,
        uid: (result.values.uid || "").replace(/\s/g, "").toUpperCase(),
        iban: (result.values.iban || "").replace(/\s/g, "").toUpperCase(),
        bic: result.values.bic || "",
        email: result.values.email || "",
        phone: result.values.phone || "",
        website: result.values.website || "",
        industry: result.values.industry || "",
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
      { error: logAndSanitize("company/ai-complete", err, "AI-Recherche fehlgeschlagen.") },
      { status: 500 },
    );
  }
}
