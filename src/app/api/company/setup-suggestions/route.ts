// SCH-366 / SCH-406 — AI-gestützte Firmen-Setup-Vorschläge mit Web-Recherche.
//
// Analoges Muster zu /api/analyze-receipt: ein API-Call an Anthropic Claude,
// Prompt auf Deutsch (österreichischer Kontext), JSON-only-Antwort.
//
// SCH-406: Nutzt Claude's web_search Tool um Infos über die Firma + Branche
// im Internet zu recherchieren und daraus passende Rollen vorzuschlagen.
//
// Kosten pro Aufruf (geschätzt):
//   Input: ~800-1200 Tokens (Prompt + Firmenname + Web-Recherche-Kontext)
//   Output: ~800-1200 Tokens (JSON-Antwort)
//   Sonnet: $3/M Input, $15/M Output
//   → ca. $0.003-0.008 pro Aufruf mit Web-Recherche

import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    companyId?: string;
    companyName?: string;
    industry?: string;
    website?: string;
    description?: string;
  } | null;

  const companyName = body?.companyName?.trim();
  const companyId = body?.companyId?.trim();
  if (!companyName || !companyId) {
    return Response.json(
      { error: "companyName und companyId sind erforderlich" },
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

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return Response.json(
      { error: "Server-Konfiguration fehlt (SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 }
    );
  }

  // Build context from optional fields.
  const contextParts: string[] = [`Firmenname: "${companyName}"`];
  if (body?.industry?.trim()) contextParts.push(`Branche: "${body.industry.trim()}"`);
  if (body?.website?.trim()) contextParts.push(`Website: ${body.website.trim()}`);
  if (body?.description?.trim()) contextParts.push(`Beschreibung: "${body.description.trim()}"`);
  const contextBlock = contextParts.join("\n");

  const prompt = `Du bist ein Experte für Unternehmensorganisation und österreichisches Wirtschaftsrecht. Eine neue Firma wird in unserem Zeiterfassungs- und Rechnungstool eingerichtet.

WICHTIG: Recherchiere zuerst im Internet nach der Firma "${companyName}"${body?.website?.trim() ? ` (Website: ${body.website.trim()})` : ""}. Suche nach:
- Was die Firma macht, welche Dienstleistungen/Produkte sie anbietet
- In welcher Branche sie tätig ist
- Welche Rollen typisch für diese Art von Unternehmen sind
- Die Firmendaten: Adresse, PLZ, Stadt, Telefon, E-Mail, UID-Nummer (falls öffentlich auffindbar)

Nutze die gefundenen Informationen um eine möglichst präzise und passende Konfiguration vorzuschlagen.

${contextBlock}

Antworte mit folgendem JSON-Schema. Passe alle Vorschläge an die erkannte Branche an. Wenn du die Branche nicht sicher erkennen kannst, gib deine beste Einschätzung ab und setze "confidence" auf "low".

{
  "detected_industry": "Erkannte Branche (z.B. Filmproduktion, Softwareentwicklung, Gastronomie, ...)",
  "confidence": "high" | "medium" | "low",
  "reasoning": "Kurze Begründung, warum du diese Branche vermutest (1-2 Sätze). Erwähne dabei auch, welche Informationen du aus der Web-Recherche gewonnen hast.",
  "suggested_company_data": {
    "address": "Straße und Hausnummer oder null wenn nicht gefunden",
    "zip": "PLZ oder null",
    "city": "Stadt oder null",
    "phone": "Telefonnummer oder null",
    "email": "E-Mail-Adresse oder null",
    "uid": "UID-Nummer (z.B. ATU12345678) oder null",
    "website": "Website-URL oder null",
    "industry": "Erkannte Branche oder null",
    "description": "Kurze Firmenbeschreibung basierend auf Recherche oder null"
  },
  "suggested_roles": [
    {
      "name": "Rollenname (z.B. Kameramann, Projektleiter, Koch)",
      "description": "Kurzbeschreibung der Rolle",
      "color": "#hex-Farbcode (passend, visuell unterscheidbar)",
      "typical_hourly_rate": Üblicher Stundensatz in EUR oder null
    }
  ],
  "suggested_departments": [
    {
      "name": "Abteilungsname (z.B. Produktion, Postproduction, Verwaltung)",
      "description": "Was macht diese Abteilung?"
    }
  ],
  "suggested_products": [
    {
      "name": "Produkt-/Leistungsname (z.B. Drehtag Kamera, Schnitt pro Stunde)",
      "unit": "Stunden" | "Tage" | "Pauschale" | "Stueck",
      "unit_price": Vorgeschlagener Preis in EUR,
      "tax_rate": 20,
      "role_name": "Zugehörige Rolle (muss aus suggested_roles stammen) oder null"
    }
  ],
  "suggested_expense_categories": [
    "Kategorie 1 (z.B. Equipment-Miete)",
    "Kategorie 2 (z.B. Reisekosten)",
    "..."
  ],
  "suggested_payment_terms_days": Empfohlene Zahlungsfrist in Tagen (z.B. 14, 30),
  "suggested_default_tax_rate": 20,
  "onboarding_tips": [
    "Tipp 1 für die Einrichtung (z.B. 'Legen Sie zuerst die Rollen an, dann die Produkte')",
    "Tipp 2",
    "..."
  ]
}

Wichtig:
- Recherchiere und fülle "suggested_company_data" so vollständig wie möglich aus — nutze Impressum, Firmenbuch, WKO und andere öffentliche Quellen
- Setze Felder auf null wenn du sie nicht sicher ermitteln kannst
- Schlage 3-8 Rollen vor, die für die erkannte Branche typisch sind
- Schlage 2-5 Abteilungen vor
- Schlage 5-10 typische Produkte/Leistungen vor mit realistischen Preisen
- Schlage 3-6 Ausgabenkategorien vor die branchenspezifisch sind
- Alle Preise in EUR, österreichischer Markt
- Verwende nur Einheiten aus: "Stunden", "Tage", "Pauschale", "Stueck"
- Farbcodes sollen visuell gut unterscheidbar sein
- Antworte NUR mit dem JSON, kein anderer Text`;

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
        max_tokens: 4096,
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

    // Extract the final text block (after web search tool use)
    const textBlock = result.content?.findLast(
      (b: Record<string, string>) => b.type === "text"
    );
    const rawText = textBlock?.text || "{}";

    // Cost calculation — includes web search tokens.
    const inputTokens = result.usage?.input_tokens || 0;
    const outputTokens = result.usage?.output_tokens || 0;
    // Sonnet: $3/M input, $15/M output
    const costUSD = (inputTokens * 3 + outputTokens * 15) / 1_000_000;
    const costEUR = Math.round(costUSD * 0.92 * 10000) / 10000;

    // Parse JSON from response.
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // Store the suggestions in company_settings.setup_suggestions (JSONB).
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
    await sb.from("company_settings").update({
      setup_suggestions: {
        ...parsed,
        _meta: {
          generated_at: new Date().toISOString(),
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_eur: costEUR,
          model: "claude-sonnet-4-20250514",
          web_search: true,
        },
      },
      updated_at: new Date().toISOString(),
    }).eq("company_id", companyId);

    return Response.json({
      success: true,
      suggestions: parsed,
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
