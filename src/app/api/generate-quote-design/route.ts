// SCH-562 — AI-generated dynamic quote design (Opus 4.7)
//
// Takes quote context (customer, industry, project description, brand tone)
// and asks Claude Opus 4.7 to design a cover page + opener paragraph tailored
// to that specific deal. Output is a structured JSON payload persisted under
// quote_design_selections.ai_generated_payload.
//
// Prompt caching: the static system prompt (brand/design guidelines and
// response schema) is marked with cache_control: ephemeral. Repeat calls
// within the cache TTL (~5 min) drop input cost ~90%.
//
// Per-generation budget target: < $0.10. Typical expected cost ~$0.03-0.07
// at Opus 4.7 pricing ($15/M input, $75/M output). Cached input is ~$1.50/M.

export const maxDuration = 60;

const MODEL = "claude-opus-4-7";

// Opus 4 family pricing per million tokens (USD).
const INPUT_PRICE_PER_M_USD = 15;
const CACHED_INPUT_PRICE_PER_M_USD = 1.5;
const OUTPUT_PRICE_PER_M_USD = 75;

const SYSTEM_PROMPT = `You are a senior brand designer at a boutique agency. You design single-use cover pages and opening paragraphs for B2B project quotes (Angebote). Each quote is for one customer and one deal, so the design must feel tailor-made — not like a template.

DELIVERABLE FORMAT

Return ONLY a single JSON object (no prose, no markdown fences). Schema:

{
  "coverTitle": string,          // 3-8 words. Hero line of the cover page. Must reference the project in plain language.
  "coverSubtitle": string,       // 4-10 words. Supporting line — a benefit or positioning statement.
  "coverTagline": string,        // 1-4 words, ALL CAPS. Short category label (e.g. "ANGEBOT", "PROJEKTVORSCHLAG", "PROPOSAL").
  "introText": string,           // 2-4 sentences, ~280-480 chars. First-person ("wir", "we") opener addressed to the customer, referencing their industry/context. No markdown. Plain paragraph.
  "accentColor": "#RRGGBB",      // primary brand accent. Must be a real hex. Must have WCAG AA contrast against white for 14px+ text.
  "recommendedPalette": {
    "accent":      "#RRGGBB",    // = accentColor
    "accentLight": "#RRGGBB",    // ~15% luminance tint of accent, suitable as card background on white
    "dark":        "#RRGGBB",    // near-black ink color (not pure #000)
    "bg":          "#RRGGBB"     // page background. Usually white or warm off-white.
  },
  "coverHtml": string            // optional HTML preview of the cover hero block, <= 600 chars, inline-styled, self-contained. Readers may ignore this; PDF rendering uses the structured fields above.
}

DESIGN RULES

1. Match tone to the stated brandTone (professional, warm, bold, minimal, playful, luxurious). Default = professional.
2. Pick an accent color that fits the customer's industry and brand tone. Avoid neon, avoid pure black. Prefer colors that print well.
3. Language: match the language hint in the user message (de or en). introText must be grammatically correct in that language.
4. Do NOT invent facts about the customer. Use only what the user message provides.
5. Do NOT use placeholder text ("Lorem ipsum", "TBD"). Every field must be finished copy.
6. Keep coverTitle specific. "Ihr Angebot" is too generic. "Flagship-Store Relaunch" is good.
7. introText must address the customer by company or contact name exactly as given. Do not add salutation fluff like "I hope this finds you well".
8. Return valid JSON. Escape quotes inside strings. No trailing commas.`;

interface RequestBody {
  quoteId?: string;
  customer?: {
    name?: string;
    company?: string;
    city?: string;
    country?: string;
  };
  industry?: string;
  projectDescription?: string;
  brandTone?: "professional" | "warm" | "bold" | "minimal" | "playful" | "luxurious";
  language?: "de" | "en";
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: AnthropicUsage;
  error?: { message?: string };
}

function calcCostUSD(usage: AnthropicUsage): number {
  const uncachedInput = usage.input_tokens || 0;
  const cachedInput = (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  const output = usage.output_tokens || 0;
  const usd =
    (uncachedInput * INPUT_PRICE_PER_M_USD +
      cachedInput * CACHED_INPUT_PRICE_PER_M_USD +
      output * OUTPUT_PRICE_PER_M_USD) /
    1_000_000;
  return Math.round(usd * 10000) / 10000;
}

function extractJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch { /* fall through */ }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
}

function sanitizePayload(raw: Record<string, unknown>): {
  coverTitle: string;
  coverSubtitle: string;
  coverTagline: string;
  introText: string;
  accentColor: string;
  recommendedPalette: { accent: string; accentLight: string; dark: string; bg: string };
  coverHtml: string;
} | null {
  const coverTitle = typeof raw.coverTitle === "string" ? raw.coverTitle.trim() : "";
  const coverSubtitle = typeof raw.coverSubtitle === "string" ? raw.coverSubtitle.trim() : "";
  const coverTagline = typeof raw.coverTagline === "string" ? raw.coverTagline.trim() : "";
  const introText = typeof raw.introText === "string" ? raw.introText.trim() : "";
  const accentColor = isHex(raw.accentColor) ? raw.accentColor : null;

  if (!coverTitle || !introText || !accentColor) return null;

  const paletteIn = (raw.recommendedPalette as Record<string, unknown> | undefined) || {};
  const palette = {
    accent: isHex(paletteIn.accent) ? paletteIn.accent : accentColor,
    accentLight: isHex(paletteIn.accentLight) ? paletteIn.accentLight : "#F3F4F6",
    dark: isHex(paletteIn.dark) ? paletteIn.dark : "#111827",
    bg: isHex(paletteIn.bg) ? paletteIn.bg : "#FFFFFF",
  };

  const coverHtml = typeof raw.coverHtml === "string" ? raw.coverHtml.slice(0, 1200) : "";

  return {
    coverTitle: coverTitle.slice(0, 120),
    coverSubtitle: coverSubtitle.slice(0, 140),
    coverTagline: (coverTagline || "ANGEBOT").slice(0, 40),
    introText: introText.slice(0, 900),
    accentColor,
    recommendedPalette: palette,
    coverHtml,
  };
}

export async function POST(request: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY not configured. Required for Opus 4.7 design generation." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as RequestBody | null;
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const language: "de" | "en" = body.language === "en" ? "en" : "de";
  const brandTone = body.brandTone || "professional";
  const customer = body.customer || {};
  const customerLabel = customer.company || customer.name || "(unbekannt)";

  const userMessage = [
    `Language: ${language}`,
    `BrandTone: ${brandTone}`,
    `Customer: ${customerLabel}`,
    customer.city ? `CustomerLocation: ${customer.city}${customer.country ? `, ${customer.country}` : ""}` : null,
    body.industry ? `Industry: ${body.industry}` : null,
    body.projectDescription ? `ProjectDescription: ${body.projectDescription}` : null,
    "",
    language === "de"
      ? "Entwirf für dieses Angebot eine einmalige Cover-Seite und den passenden Opener-Absatz. Gib NUR das JSON zurück."
      : "Design a one-off cover page and matching opener paragraph for this quote. Return JSON only.",
  ]
    .filter(Boolean)
    .join("\n");

  const started = Date.now();

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userMessage }],
      }),
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Anthropic request failed" },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const text = await response.text();
    return Response.json(
      { error: `Anthropic API error: ${response.status} ${text.slice(0, 500)}` },
      { status: 502 },
    );
  }

  const result = (await response.json()) as AnthropicResponse;
  const textBlock = result.content?.find((b) => b.type === "text");
  const rawText = textBlock?.text || "";
  const parsed = extractJson(rawText);
  if (!parsed) {
    return Response.json(
      { error: "Model did not return valid JSON", raw: rawText.slice(0, 400) },
      { status: 502 },
    );
  }

  const sanitized = sanitizePayload(parsed);
  if (!sanitized) {
    return Response.json(
      { error: "Model JSON missing required fields", parsed },
      { status: 502 },
    );
  }

  const usage = result.usage || {};
  const costUSD = calcCostUSD(usage);
  const elapsedMs = Date.now() - started;

  const payload = {
    ...sanitized,
    generatedAt: new Date().toISOString(),
    model: MODEL,
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
    cachedInputTokens: (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0),
    costUSD,
  };

  return Response.json({
    success: true,
    payload,
    meta: {
      elapsedMs,
      model: MODEL,
      cacheReadTokens: usage.cache_read_input_tokens || 0,
      cacheCreateTokens: usage.cache_creation_input_tokens || 0,
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      costUSD,
    },
  });
}
