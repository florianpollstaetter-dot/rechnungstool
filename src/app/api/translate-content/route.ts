// SCH-447 — Translate user-generated content (product name/description, company
// accompanying_text, etc.) into one or many of the 8 supported UI languages.
//
// Input:  { source: string, sourceLocale: "de"|"en"|...|"ar", targetLocales: [...] , kind?: "short"|"long" }
// Output: { translations: { [locale]: string }, cost: { input_tokens, output_tokens, cost_eur } }
//
// Uses Claude (Bedrock if AWS creds, else direct Anthropic) via lib/ai-client.

import { callClaude, calculateCostEUR } from "@/lib/ai-client";

const SUPPORTED = ["de", "en", "fr", "es", "it", "tr", "pl", "ar"] as const;
type Locale = (typeof SUPPORTED)[number];

const LANGUAGE_NAMES: Record<Locale, string> = {
  de: "German",
  en: "English",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  tr: "Turkish",
  pl: "Polish",
  ar: "Arabic",
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    source?: string;
    sourceLocale?: string;
    targetLocales?: string[];
    kind?: "short" | "long";
  } | null;

  const source = body?.source?.trim();
  const sourceLocale = body?.sourceLocale as Locale | undefined;
  const targetLocales = (body?.targetLocales || []).filter((l): l is Locale =>
    (SUPPORTED as readonly string[]).includes(l),
  );
  const kind = body?.kind === "long" ? "long" : "short";

  if (!source) {
    return Response.json({ error: "source is required" }, { status: 400 });
  }
  if (!sourceLocale || !(SUPPORTED as readonly string[]).includes(sourceLocale)) {
    return Response.json({ error: "invalid sourceLocale" }, { status: 400 });
  }
  if (targetLocales.length === 0) {
    return Response.json({ error: "targetLocales must be non-empty" }, { status: 400 });
  }

  const targetsBlock = targetLocales
    .map((l) => `- "${l}" → ${LANGUAGE_NAMES[l]}`)
    .join("\n");

  const guidance =
    kind === "short"
      ? "This is a short label (product name, heading). Keep it concise, preserve brand-specific terms, avoid marketing fluff."
      : "This is body text (product description, accompanying note on an invoice). Preserve tone and formatting. Keep sentences natural for the target language.";

  const prompt = `You translate user-generated content for a business invoicing tool.

Source language: ${LANGUAGE_NAMES[sourceLocale]} (${sourceLocale})
Source text:
"""
${source}
"""

Translate the source into each of these target languages:
${targetsBlock}

Guidance: ${guidance}

Rules:
- Do not translate proper nouns, product SKUs, brand names, or VAT/UID identifiers.
- Keep line breaks and markdown/punctuation layout intact.
- For Arabic, use natural right-to-left phrasing (do not reverse characters manually).
- Do NOT translate the source locale back to itself.

Respond with ONLY valid JSON, no prose, matching this shape:
{
${targetLocales.map((l) => `  "${l}": "<translation in ${LANGUAGE_NAMES[l]}>"`).join(",\n")}
}`;

  try {
    const { text, inputTokens, outputTokens } = await callClaude(
      [{ type: "text", text: prompt }],
      1024,
    );

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? (JSON.parse(jsonMatch[0]) as Record<string, unknown>) : {};

    const translations: Record<string, string> = {};
    for (const locale of targetLocales) {
      const value = parsed[locale];
      if (typeof value === "string" && value.trim() !== "") {
        translations[locale] = value.trim();
      }
    }

    return Response.json({
      success: true,
      translations,
      cost: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_eur: calculateCostEUR(inputTokens, outputTokens),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
