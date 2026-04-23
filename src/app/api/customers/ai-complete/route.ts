// SCH-430 — AI-Vervollständigung für Kundenanlage.
//
// Nimmt einen Firmen-/Personennamen, recherchiert im Internet und gibt
// strukturierte Kundendaten zurück (Adresse, UID, E-Mail, Telefon etc.).
//
// Muster analog zu /api/company/setup-suggestions: Claude + web_search Tool.
//
// Kosten pro Aufruf (geschätzt):
//   Input: ~600-1000 Tokens
//   Output: ~400-800 Tokens
//   → ca. $0.002-0.006 pro Aufruf
//
// SCH-600 Phase-5 Security: gated behind an authenticated session so an
// anonymous caller can't drain the Claude budget.

import { createClient as createServerClient } from "@/lib/supabase/server";

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

  const prompt = `Du bist ein Recherche-Assistent für ein österreichisches Rechnungstool. Der Benutzer möchte einen neuen Kunden anlegen und hat folgenden Namen eingegeben:

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
    const response = await fetch("https://api.anthropic.com/v1/messages", {
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
    });

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

    return Response.json({
      success: true,
      customer: {
        name: parsed.name || "",
        company: parsed.company || "",
        address: parsed.address || "",
        zip: parsed.zip || "",
        city: parsed.city || "",
        country: parsed.country || "Oesterreich",
        uid_number: parsed.uid_number || "",
        leitweg_id: parsed.leitweg_id || "",
        email: parsed.email || "",
        phone: parsed.phone || "",
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
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
