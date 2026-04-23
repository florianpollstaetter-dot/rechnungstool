// SCH-578 — AI-Vervollständigung für die eigenen Unternehmensdaten (Verkäufer).
//
// Spiegelbild zu /api/customers/ai-complete, aber für `company_settings`.
// Wird aus dem E-Rechnung-Validierungs-Popup aufgerufen, wenn EN-16931
// Pflichtfelder (Adresse BT-35, Ort BT-37, UID BT-31, IBAN BT-84 …) fehlen.
//
// Gleiches Muster: Claude Sonnet 4 + web_search. Kosten ca. $0.002-0.006
// pro Aufruf.
//
// SCH-600 Phase-5 Security: gated behind an authenticated session so an
// anonymous caller can't drain the Claude budget.

import { createClient as createServerClient } from "@/lib/supabase/server";
import { fetchWithTimeout, isFetchTimeout } from "@/lib/fetch-with-timeout";
import { logAndSanitize } from "@/lib/api-errors";

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

  const prompt = `Du bist ein Recherche-Assistent für ein österreichisches Rechnungstool. Der Benutzer möchte seine EIGENEN Unternehmensdaten (Verkäufer) vervollständigen — diese werden für E-Rechnungen (EN 16931) benötigt.

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
    const response = await fetchWithTimeout(
      "https://api.anthropic.com/v1/messages",
      {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 3,
          },
        ],
        messages: [{ role: "user", content: prompt }],
      }),
      },
      60_000,
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error: ${response.status} ${err}`);
    }

    const result = await response.json();

    const textBlock = result.content?.findLast(
      (b: Record<string, string>) => b.type === "text"
    );
    const rawText = textBlock?.text || "{}";

    const inputTokens = result.usage?.input_tokens || 0;
    const outputTokens = result.usage?.output_tokens || 0;
    const costUSD = (inputTokens * 3 + outputTokens * 15) / 1_000_000;
    const costEUR = Math.round(costUSD * 0.92 * 10000) / 10000;

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // Normalize country to ISO-2 just in case the model slipped.
    const country = (parsed.country || "").toString().trim().toUpperCase().slice(0, 2);

    return Response.json({
      success: true,
      company: {
        company_name: parsed.company_name || "",
        address: parsed.address || "",
        zip: parsed.zip || "",
        city: parsed.city || "",
        country,
        uid: (parsed.uid || "").replace(/\s/g, "").toUpperCase(),
        iban: (parsed.iban || "").replace(/\s/g, "").toUpperCase(),
        bic: parsed.bic || "",
        email: parsed.email || "",
        phone: parsed.phone || "",
        website: parsed.website || "",
        industry: parsed.industry || "",
      },
      confidence: parsed.confidence || "low",
      source: parsed.source || "",
      cost: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_eur: costEUR,
      },
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
