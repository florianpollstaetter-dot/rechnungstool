// SCH-1766 — Public demo endpoint for domain-aware school advice (DACH).
// Accepts a situation + child/country context and returns AI guidance.
// No auth required; TEST_API_KEY header bypasses the per-IP rate limit.

import { callClaudeChat } from "@/lib/ai-client";
import { logAndSanitize } from "@/lib/api-errors";
import { NextRequest } from "next/server";

const TEST_API_KEY = process.env.TEST_API_KEY || "kin-qa-a51cae6795cfdd30bf463e4f78a34747";

// Simple in-memory rate limit: max 20 requests per IP per hour.
// Reset map entry after 1h. Not distributed — Vercel edge resets on cold start.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function buildDemoSystemPrompt(
  country: string,
  canton?: string,
  region?: string,
  parentRole?: string,
  childGender?: string,
  childName?: string,
  age?: number
): string {
  const countryCtx: Record<string, string> = {
    AT: "Austria (Österreich). Grading: 1 (sehr gut) to 5 (nicht genügend). Schools: Volksschule, Hauptschule, AHS (Allgemeinbildende Höhere Schule), NMS, BMS, BHS, HBLA, HTL. A grade of 6 does NOT exist — it is invalid.",
    DE: `Germany (Deutschland)${region ? `, ${region}` : ""}. Grading: 1 (sehr gut) to 6 (ungenügend). Schools vary by state: Bayern has Gymnasium/Realschule/Mittelschule/Wirtschaftsschule; other states differ. AHS is an Austrian term — not used in Germany.`,
    CH: `Switzerland (Schweiz)${canton && canton !== "default" ? `, Kanton ${canton}` : ""}. Grading: 6 (sehr gut/excellent) to 1 (ungenügend). School names vary strongly by canton: "Realschule" is a German term; Swiss equivalents include Sek B/C, Oberstufe, Bezirksschule, Sekundarschule. Always clarify if the user uses German school terminology without specifying their canton.`,
  };

  const countryInfo = countryCtx[country] ?? `Country: ${country}.`;

  const childCtx = [
    childName ? `Child's name: ${childName}.` : "",
    age ? `Age: ${age}.` : "",
    childGender === "F" ? "Child is a girl (sie/ihr)." : childGender === "M" ? "Child is a boy (er/ihm)." : "",
    parentRole === "mother" ? "Parent is the mother." : parentRole === "father" ? "Parent is the father." : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `You are Schulbegleiter, a compassionate AI school advisor for German-speaking parents in DACH (Germany, Austria, Switzerland).

# Country context
${countryInfo}

# Child context
${childCtx || "No child profile provided."}

# Your task
1. Analyse the parent's situation strictly against the country's school system rules.
2. If the situation contains terminology, grades, or school names that do NOT match the stated country's system (e.g. "AHS" in DE, a "6" in AT, "Realschule" in CH without clarification), ask ONE focused clarifying question in German before giving advice.
3. If the situation is clearly valid for the stated country, give direct, warm advice in German without asking clarifying questions.
4. Always address the child using the correct gender pronoun based on the profile.
5. Keep responses concise (2–4 paragraphs). No preamble.

# Language
Always reply in German (Deutsch).`;
}

export async function POST(request: NextRequest) {
  // TEST_API_KEY bypass: skip rate limiting for automated QA
  const authHeader = request.headers.get("Authorization") || "";
  const isTestKey = authHeader === `Bearer ${TEST_API_KEY}`;

  if (!isTestKey) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    if (!checkRateLimit(ip)) {
      return Response.json({ error: "rate_limited", message: "Too many requests. Try again later." }, { status: 429 });
    }
  }

  const body = await request.json().catch(() => null) as {
    situation?: string;
    age?: number;
    childName?: string;
    country?: string;
    canton?: string;
    region?: string;
    parentRole?: string;
    childGender?: string;
  } | null;

  if (!body) return Response.json({ error: "invalid_json", message: "Request body must be valid JSON." }, { status: 400 });

  const situation = body.situation?.trim();
  const country = body.country?.trim()?.toUpperCase();

  if (!situation) return Response.json({ error: "validation_error", message: "Field 'situation' is required." }, { status: 400 });
  if (!country) return Response.json({ error: "validation_error", message: "Field 'country' is required (AT, DE, or CH)." }, { status: 400 });
  if (!["AT", "DE", "CH"].includes(country)) {
    return Response.json({ error: "validation_error", message: "Field 'country' must be one of: AT, DE, CH." }, { status: 400 });
  }

  const systemPrompt = buildDemoSystemPrompt(
    country,
    body.canton,
    body.region,
    body.parentRole,
    body.childGender,
    body.childName,
    body.age
  );

  let reply = "";
  try {
    const result = await callClaudeChat(
      [{ role: "user", content: situation }],
      systemPrompt,
      512
    );
    reply = result.text.trim();
  } catch (err) {
    const safeMsg = logAndSanitize("api/demo", err, "AI-Dienst nicht erreichbar");
    return Response.json({ error: "ai_error", message: safeMsg }, { status: 502 });
  }

  return Response.json({ reply, country, situation });
}
