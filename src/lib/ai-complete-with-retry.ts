// SCH-960 — Multi-pass AI completion helper.
//
// First pass uses the caller-supplied prompt. If required fields come back
// empty, additional passes ask Claude to focus on the still-missing fields
// (with extra source hints). Earlier values are never overwritten by later
// passes — Claude only fills blanks. Returns the merged record plus the list
// of fields that remained empty after all passes; callers use that to drive
// the fallback popup.
//
// Used by /api/customers/ai-complete, /api/company/ai-complete, and
// /api/company/setup-suggestions.
//
// Cost note: each extra pass adds ~$0.002-0.005 (web_search + Sonnet 4).

import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

export interface AiCompleteFieldSpec {
  /** JSON key in the parsed response, also used as the missing-field id. */
  key: string;
  /** Human-readable German label for the popup / re-prompt. */
  label: string;
  /** Hint explaining the expected shape (used in re-prompts). */
  description: string;
  /** If true, missing values trigger another pass. */
  required?: boolean;
}

export interface AiCompleteParsed {
  values: Record<string, string>;
  confidence?: "high" | "medium" | "low" | string;
  source?: string;
}

export interface AiCompleteRetryOptions {
  anthropicKey: string;
  /** First-pass prompt (already built by the caller for entity-specific tone). */
  initialPrompt: string;
  /** Parses the JSON Claude returned into a flat string-record + meta. */
  parseResponse: (rawText: string) => AiCompleteParsed;
  /** Fields the caller cares about. */
  fields: AiCompleteFieldSpec[];
  /** Name shown to Claude in re-prompt ("Firma X"). */
  entityName: string;
  /** Optional caller-specific suffix appended to the re-prompt. */
  refinePromptSuffix?: string;

  model?: string;
  maxTokens?: number;
  webSearchUses?: number;
  timeoutMs?: number;
  /** Total passes including the first one. Default 3. */
  maxPasses?: number;
}

export interface AiCompleteRetryResult {
  values: Record<string, string>;
  /** Field keys whose required values are still empty. */
  missingFields: string[];
  confidence: "high" | "medium" | "low";
  source: string;
  cost: { input_tokens: number; output_tokens: number; cost_eur: number };
  passes: number;
}

/** Anthropic Claude content block (text or tool_use/tool_result). */
type ClaudeBlock = { type: string; text?: string };

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_WEB_SEARCH_USES = 3;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_PASSES = 3;

function isFieldEmpty(val: unknown): boolean {
  return val == null || (typeof val === "string" && val.trim() === "");
}

function normalizeConfidence(c: unknown): "high" | "medium" | "low" {
  const s = String(c || "").toLowerCase();
  if (s === "high" || s === "medium" || s === "low") return s;
  return "low";
}

/** Lower confidence ranking: low=0, medium=1, high=2. */
function confidenceRank(c: "high" | "medium" | "low"): number {
  return c === "high" ? 2 : c === "medium" ? 1 : 0;
}

async function callClaude(
  anthropicKey: string,
  prompt: string,
  opts: { model: string; maxTokens: number; webSearchUses: number; timeoutMs: number },
): Promise<{ rawText: string; inputTokens: number; outputTokens: number }> {
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
        model: opts.model,
        max_tokens: opts.maxTokens,
        tools: [
          { type: "web_search_20250305", name: "web_search", max_uses: opts.webSearchUses },
        ],
        messages: [{ role: "user", content: prompt }],
      }),
    },
    opts.timeoutMs,
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} ${err}`);
  }

  const result = await response.json();
  const blocks: ClaudeBlock[] = Array.isArray(result.content) ? result.content : [];
  const textBlock = [...blocks].reverse().find((b) => b.type === "text");
  const rawText = textBlock?.text || "{}";
  return {
    rawText,
    inputTokens: result.usage?.input_tokens || 0,
    outputTokens: result.usage?.output_tokens || 0,
  };
}

function buildRefinePrompt(
  entityName: string,
  missing: AiCompleteFieldSpec[],
  alreadyFound: Record<string, string>,
  suffix: string | undefined,
): string {
  const missingList = missing
    .map((f) => `- ${f.label} (Schlüssel: "${f.key}"): ${f.description}`)
    .join("\n");

  const foundList = Object.entries(alreadyFound)
    .filter(([, v]) => !isFieldEmpty(v))
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const focusedSources = `Mögliche zusätzliche Quellen, die im ersten Durchlauf vielleicht nicht geprüft wurden:
- Firmenbuch / Handelsregister-Eintrag (firmenbuch.at, handelsregister.at)
- WKO Firmen A-Z (firmen.wko.at)
- Impressum auf der Firmen-Website (oft verlinkt im Footer)
- Branchen-Verzeichnisse: herold.at, gelbe-seiten.at, north-data.de
- LinkedIn-Unternehmensprofil
- UID-Validierung über finanzonline.bmf.gv.at oder ec.europa.eu/taxation_customs/vies
- Soziale Medien (Facebook-Impressum, Instagram-Bio)
- Pressemitteilungen, Jahresberichte, GmbH-Eintrag im RIS
- Domain-WHOIS für Inhaberdaten`;

  return `Du recherchierst weiter zu der Firma "${entityName}". In einem ersten Durchlauf hast du folgende Daten gefunden:

${foundList || "(noch keine bestätigten Felder)"}

Diese Pflichtfelder fehlen aber noch:

${missingList}

AUFGABE: Suche gezielt nach genau diesen fehlenden Feldern. ${focusedSources}

Wichtige Regeln:
- Verifiziere jeden Wert aus mindestens einer öffentlichen Quelle
- Gib NUR den fehlenden Wert zurück, wenn du ihn sicher bestätigen kannst
- Setze ein Feld auf leeren String "", wenn du es weiterhin nicht ermitteln kannst
- Erfinde NICHTS — lieber leer lassen
- Behalte die bereits gefundenen Werte unverändert${suffix ? `\n\n${suffix}` : ""}

Antworte NUR mit JSON. Schema (alle Schlüssel müssen vorkommen):

{
${missing.map((f) => `  "${f.key}": "${f.description.replace(/"/g, '\\"')} oder leerer String"`).join(",\n")},
  "confidence": "high | medium | low",
  "source": "Kurze Quellenangabe für die zusätzlich gefundenen Felder"
}`;
}

export async function aiCompleteWithRetry(
  options: AiCompleteRetryOptions,
): Promise<AiCompleteRetryResult> {
  const {
    anthropicKey,
    initialPrompt,
    parseResponse,
    fields,
    entityName,
    refinePromptSuffix,
    model = DEFAULT_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
    webSearchUses = DEFAULT_WEB_SEARCH_USES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxPasses = DEFAULT_MAX_PASSES,
  } = options;

  const callOpts = { model, maxTokens, webSearchUses, timeoutMs };

  // Pass 1.
  const first = await callClaude(anthropicKey, initialPrompt, callOpts);
  const firstParsed = parseResponse(first.rawText);

  const merged: Record<string, string> = {};
  for (const f of fields) {
    const v = firstParsed.values[f.key];
    merged[f.key] = typeof v === "string" ? v : "";
  }
  let confidence = normalizeConfidence(firstParsed.confidence);
  let source = firstParsed.source || "";
  let totalInputTokens = first.inputTokens;
  let totalOutputTokens = first.outputTokens;
  let passesUsed = 1;

  // Required fields that are still empty after pass 1.
  const requiredFields = fields.filter((f) => f.required);

  for (let pass = 2; pass <= maxPasses; pass++) {
    const stillMissing = requiredFields.filter((f) => isFieldEmpty(merged[f.key]));
    if (stillMissing.length === 0) break;

    let refineParsed: AiCompleteParsed | null = null;
    try {
      const refinePrompt = buildRefinePrompt(entityName, stillMissing, merged, refinePromptSuffix);
      const refine = await callClaude(anthropicKey, refinePrompt, callOpts);
      totalInputTokens += refine.inputTokens;
      totalOutputTokens += refine.outputTokens;
      refineParsed = parseResponse(refine.rawText);
    } catch (err) {
      // Don't fail the whole call if a refine pass times out — return what
      // we have, popup will collect the rest.
      console.warn(`[ai-complete-with-retry] pass ${pass} failed, continuing with partial`, err);
      passesUsed = pass;
      break;
    }
    passesUsed = pass;

    // Only fill blanks; never overwrite an earlier confirmed value.
    for (const f of stillMissing) {
      const v = refineParsed.values[f.key];
      if (typeof v === "string" && v.trim() !== "" && isFieldEmpty(merged[f.key])) {
        merged[f.key] = v;
      }
    }

    // Update confidence to the lower of any pass that contributed.
    const passConfidence = normalizeConfidence(refineParsed.confidence);
    if (confidenceRank(passConfidence) < confidenceRank(confidence)) {
      confidence = passConfidence;
    }
    if (refineParsed.source && !source.includes(refineParsed.source)) {
      source = source ? `${source}; ${refineParsed.source}` : refineParsed.source;
    }
  }

  const missingFields = requiredFields
    .filter((f) => isFieldEmpty(merged[f.key]))
    .map((f) => f.key);

  // Cost: Sonnet 4 — $3/M input, $15/M output. Convert USD → EUR (~0.92).
  const costUSD = (totalInputTokens * 3 + totalOutputTokens * 15) / 1_000_000;
  const costEUR = Math.round(costUSD * 0.92 * 10000) / 10000;

  return {
    values: merged,
    missingFields,
    confidence,
    source,
    cost: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens, cost_eur: costEUR },
    passes: passesUsed,
  };
}

/** Convenience: pull the first JSON object out of a Claude text block. */
export function extractJsonObject(rawText: string): Record<string, unknown> {
  const match = rawText.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    return JSON.parse(match[0]);
  } catch {
    return {};
  }
}

export interface RefineMissingFieldsOptions {
  anthropicKey: string;
  entityName: string;
  fields: AiCompleteFieldSpec[];
  /** Values already found by an earlier pass (caller-managed). */
  alreadyFound: Record<string, string>;
  refinePromptSuffix?: string;

  model?: string;
  maxTokens?: number;
  webSearchUses?: number;
  timeoutMs?: number;
  /** Number of *extra* passes beyond what the caller already did. Default 2. */
  maxAdditionalPasses?: number;
}

export interface RefineMissingFieldsResult {
  values: Record<string, string>;
  missingFields: string[];
  passesUsed: number;
  additionalSource: string;
  additionalCost: { input_tokens: number; output_tokens: number; cost_eur: number };
}

/**
 * Run additional focused passes for fields the caller's first pass left empty.
 * Used by /api/company/setup-suggestions where pass 1 returns a rich payload
 * (roles, products, …) we don't want to repeat on retry — only the company-
 * data sub-object needs extra digging.
 */
export async function refineMissingFields(
  options: RefineMissingFieldsOptions,
): Promise<RefineMissingFieldsResult> {
  const {
    anthropicKey,
    entityName,
    fields,
    alreadyFound,
    refinePromptSuffix,
    model = DEFAULT_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
    webSearchUses = DEFAULT_WEB_SEARCH_USES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxAdditionalPasses = 2,
  } = options;

  const callOpts = { model, maxTokens, webSearchUses, timeoutMs };
  const merged: Record<string, string> = { ...alreadyFound };
  const requiredFields = fields.filter((f) => f.required);

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let passesUsed = 0;
  let additionalSource = "";

  for (let pass = 1; pass <= maxAdditionalPasses; pass++) {
    const stillMissing = requiredFields.filter((f) => isFieldEmpty(merged[f.key]));
    if (stillMissing.length === 0) break;

    let parsed: Record<string, unknown>;
    try {
      const refinePrompt = buildRefinePrompt(entityName, stillMissing, merged, refinePromptSuffix);
      const refine = await callClaude(anthropicKey, refinePrompt, callOpts);
      totalInputTokens += refine.inputTokens;
      totalOutputTokens += refine.outputTokens;
      parsed = extractJsonObject(refine.rawText);
    } catch (err) {
      console.warn(`[refineMissingFields] pass ${pass} failed`, err);
      passesUsed = pass;
      break;
    }
    passesUsed = pass;

    for (const f of stillMissing) {
      const v = parsed[f.key];
      if (typeof v === "string" && v.trim() !== "" && isFieldEmpty(merged[f.key])) {
        merged[f.key] = v;
      }
    }
    if (typeof parsed.source === "string" && parsed.source.trim()) {
      additionalSource = additionalSource
        ? `${additionalSource}; ${parsed.source}`
        : parsed.source;
    }
  }

  const missingFields = requiredFields
    .filter((f) => isFieldEmpty(merged[f.key]))
    .map((f) => f.key);

  const costUSD = (totalInputTokens * 3 + totalOutputTokens * 15) / 1_000_000;
  const costEUR = Math.round(costUSD * 0.92 * 10000) / 10000;

  return {
    values: merged,
    missingFields,
    passesUsed,
    additionalSource,
    additionalCost: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens, cost_eur: costEUR },
  };
}
