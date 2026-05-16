// ORA-2282 — Treasury Skill tool implementations.
//
// Each tool is an Anthropic-API tool definition (JSON-Schema body) paired
// with a TypeScript handler that runs the underlying Supabase query. The
// handler always receives an authenticated Supabase client scoped to the
// caller's company. Read tools use the SSR (RLS-aware) client so tenant
// isolation is enforced by the database; mutation tools insert via the
// SSR client with explicit `company_id` so RLS rejects cross-tenant writes.
//
// **Mutation contract**: every `propose_*` tool inserts a row in `draft`
// status and returns a draft id + approval URL. No tool ever sends a payment
// over EBICS, books a hedge, or otherwise moves money — that requires
// 4-Augen approval and EBICS-TS signing, handled in later phases.
//
// **Refusal contract**: sanctions hit details are returned *as references
// only* (id + match score + status). Sanctions-list entry contents
// (`treasury_sanctions_entries`) MUST NOT be passed through the skill.

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Context + tool primitive
// ---------------------------------------------------------------------------

/**
 * Skill execution context. The chat route resolves these once per request:
 *   - `supabase` is an RLS-aware client bound to the caller's session cookie
 *   - `companyId` is the validated active company for the user
 *   - `userId` is the auth.users id (used for `initiator_user_id`)
 *   - `locale` controls reply language preference (rendered in messages
 *      returned by the chat route, not in tool outputs).
 */
export interface SkillContext {
  supabase: SupabaseClient;
  companyId: string;
  userId: string;
  locale: "de" | "en";
}

/**
 * A skill tool: Zod schema for the LLM payload, Anthropic tool definition,
 * and the typed handler. The chat route turns the Zod schema into JSON Schema
 * for the Anthropic `tools` parameter via `z.toJSONSchema` (Zod v4).
 */
export interface SkillTool<I extends z.ZodTypeAny, O> {
  name: string;
  description: string;
  inputSchema: I;
  handler: (input: z.infer<I>, ctx: SkillContext) => Promise<O>;
}

function tool<I extends z.ZodTypeAny, O>(
  def: SkillTool<I, O>,
): SkillTool<I, O> {
  return def;
}

// ---------------------------------------------------------------------------
// Schema helpers
// ---------------------------------------------------------------------------

const Uuid = z.string().uuid();
const Iban = z
  .string()
  .min(15)
  .max(34)
  .regex(/^[A-Z]{2}[0-9A-Z]+$/, "IBAN must be uppercase alphanumeric");
const Bic = z.string().regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/);
const Iso4217 = z.string().length(3).regex(/^[A-Z]{3}$/);
const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
const Scenario = z.enum(["base", "best", "worst", "custom"]);
const Direction = z.enum(["CRDT", "DBIT"]);
const PaymentScheme = z.enum(["SEPA-CT", "SEPA-DD", "SCT-Inst", "DTAZV"]);
const HitStatus = z.enum(["open", "cleared", "blocked"]);

// ---------------------------------------------------------------------------
// Read-only tools
// ---------------------------------------------------------------------------

const GetCashPositionInput = z.object({
  entity_id: Uuid.optional(),
  currency: Iso4217.optional(),
  as_of: IsoDate.optional(),
});

export const getCashPosition = tool({
  name: "get_cash_position",
  description:
    "Returns current cash balances per bank account, optionally filtered by entity or currency, optionally as-of a specific date. Reads the latest `treasury_statements` row per account. RLS-scoped to the caller's company.",
  inputSchema: GetCashPositionInput,
  handler: async (input, ctx) => {
    const accountsQ = ctx.supabase
      .from("treasury_bank_accounts")
      .select("id, iban, bank_name, bank_bic, currency, entity_id, status")
      .eq("status", "active");
    const { data: accounts, error: accErr } = input.entity_id
      ? await accountsQ.eq("entity_id", input.entity_id)
      : await accountsQ;
    if (accErr) throw new Error(`accounts lookup failed: ${accErr.message}`);

    const filtered = (accounts ?? []).filter(
      (a) => !input.currency || a.currency === input.currency,
    );
    if (filtered.length === 0) {
      return { as_of: input.as_of ?? new Date().toISOString().slice(0, 10), accounts: [], totals: {} };
    }

    const ids = filtered.map((a) => a.id as string);
    const stmtQ = ctx.supabase
      .from("treasury_statements")
      .select("account_id, statement_date, closing_balance, currency")
      .in("account_id", ids)
      .order("statement_date", { ascending: false });
    const { data: stmts, error: stmtErr } = input.as_of
      ? await stmtQ.lte("statement_date", input.as_of)
      : await stmtQ;
    if (stmtErr) throw new Error(`statements lookup failed: ${stmtErr.message}`);

    const latestByAccount = new Map<string, { closing: number; date: string; currency: string }>();
    for (const s of stmts ?? []) {
      if (!latestByAccount.has(s.account_id)) {
        latestByAccount.set(s.account_id, {
          closing: Number(s.closing_balance),
          date: s.statement_date,
          currency: s.currency,
        });
      }
    }

    const totals: Record<string, number> = {};
    const rows = filtered.map((a) => {
      const latest = latestByAccount.get(a.id);
      const balance = latest?.closing ?? 0;
      totals[a.currency] = (totals[a.currency] ?? 0) + balance;
      return {
        account_id: a.id,
        iban: a.iban,
        bank_name: a.bank_name,
        bank_bic: a.bank_bic,
        currency: a.currency,
        entity_id: a.entity_id,
        balance,
        statement_date: latest?.date ?? null,
      };
    });

    return {
      as_of: input.as_of ?? new Date().toISOString().slice(0, 10),
      accounts: rows,
      totals,
    };
  },
});

const GetCashForecastInput = z.object({
  entity_id: Uuid,
  horizon_weeks: z.number().int().min(1).max(52).default(13),
  scenario: Scenario.default("base"),
});

export const getCashForecast = tool({
  name: "get_cash_forecast",
  description:
    "Returns the latest ML-driven cash forecast for an entity. Pulls from `treasury_forecast_runs` (most recent matching scenario) and aggregates `treasury_forecast_items` by week.",
  inputSchema: GetCashForecastInput,
  handler: async (input, ctx) => {
    const { data: run, error: runErr } = await ctx.supabase
      .from("treasury_forecast_runs")
      .select("id, horizon_weeks, scenario, model_version, mape, created_at")
      .eq("entity_id", input.entity_id)
      .eq("scenario", input.scenario)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (runErr) throw new Error(`forecast run lookup failed: ${runErr.message}`);
    if (!run) {
      return {
        entity_id: input.entity_id,
        scenario: input.scenario,
        run: null,
        weeks: [],
        note:
          "No forecast run found. Trigger /api/treasury/forecast/run to generate one (Phase 4+).",
      };
    }

    const { data: items, error: itemsErr } = await ctx.supabase
      .from("treasury_forecast_items")
      .select("forecast_date, amount, currency, category, source, confidence")
      .eq("run_id", run.id)
      .order("forecast_date", { ascending: true });
    if (itemsErr) throw new Error(`forecast items lookup failed: ${itemsErr.message}`);

    type Bucket = { inflow: number; outflow: number; currency: string; confidences: number[] };
    const byWeek = new Map<string, Bucket>();
    for (const it of items ?? []) {
      const week = isoWeek(it.forecast_date);
      const bucket: Bucket = byWeek.get(week) ?? {
        inflow: 0,
        outflow: 0,
        currency: it.currency,
        confidences: [],
      };
      const amt = Number(it.amount);
      if (amt >= 0) bucket.inflow += amt;
      else bucket.outflow += amt;
      if (it.confidence != null) bucket.confidences.push(Number(it.confidence));
      byWeek.set(week, bucket);
    }

    const weeks = Array.from(byWeek.entries())
      .slice(0, input.horizon_weeks)
      .map(([week, b]) => ({
        week,
        inflow: round2(b.inflow),
        outflow: round2(b.outflow),
        net: round2(b.inflow + b.outflow),
        currency: b.currency,
        confidence: b.confidences.length
          ? round2(b.confidences.reduce((a, c) => a + c, 0) / b.confidences.length)
          : null,
      }));

    return {
      entity_id: input.entity_id,
      scenario: input.scenario,
      run: {
        id: run.id,
        horizon_weeks: run.horizon_weeks,
        model_version: run.model_version,
        mape: run.mape,
        created_at: run.created_at,
      },
      weeks,
    };
  },
});

const QueryTransactionsInput = z.object({
  filter: z.object({
    entity_id: Uuid.optional(),
    account_id: Uuid.optional(),
    date_from: IsoDate,
    date_to: IsoDate,
    direction: Direction.optional(),
    counterparty: z.string().min(1).max(140).optional(),
    amount_min: z.number().optional(),
    amount_max: z.number().optional(),
  }),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export const queryTransactions = tool({
  name: "query_transactions",
  description:
    "Returns booked transactions matching the filter. Date range is required. Pagination via limit/offset. RLS-scoped.",
  inputSchema: QueryTransactionsInput,
  handler: async (input, ctx) => {
    let q = ctx.supabase
      .from("treasury_transactions")
      .select(
        "id, account_id, booking_date, value_date, amount, currency, direction, counterparty_name, counterparty_iban, remittance_info, end_to_end_id",
        { count: "exact" },
      )
      .gte("booking_date", input.filter.date_from)
      .lte("booking_date", input.filter.date_to)
      .order("booking_date", { ascending: false })
      .range(input.offset, input.offset + input.limit - 1);

    if (input.filter.account_id) q = q.eq("account_id", input.filter.account_id);
    if (input.filter.direction) q = q.eq("direction", input.filter.direction);
    if (input.filter.counterparty)
      q = q.ilike("counterparty_name", `%${input.filter.counterparty}%`);
    if (input.filter.amount_min != null) q = q.gte("amount", input.filter.amount_min);
    if (input.filter.amount_max != null) q = q.lte("amount", input.filter.amount_max);

    const { data, error, count } = await q;
    if (error) throw new Error(`transactions query failed: ${error.message}`);

    if (input.filter.entity_id) {
      const { data: entAccounts } = await ctx.supabase
        .from("treasury_bank_accounts")
        .select("id")
        .eq("entity_id", input.filter.entity_id);
      const allowed = new Set((entAccounts ?? []).map((a) => a.id));
      const filtered = (data ?? []).filter((t) => allowed.has(t.account_id));
      return { total: filtered.length, offset: input.offset, limit: input.limit, items: filtered };
    }

    return { total: count ?? data?.length ?? 0, offset: input.offset, limit: input.limit, items: data ?? [] };
  },
});

const ListBankAccountsInput = z.object({
  entity_id: Uuid.optional(),
  status: z.enum(["active", "closing", "closed"]).optional(),
});

export const listBankAccounts = tool({
  name: "list_bank_accounts",
  description:
    "Lists the Bank Account Management (BAM) registry for the caller's company. Returns IBANs, BICs, currencies, EBICS attributes. No HSM key material is exposed.",
  inputSchema: ListBankAccountsInput,
  handler: async (input, ctx) => {
    let q = ctx.supabase
      .from("treasury_bank_accounts")
      .select(
        "id, entity_id, bank_bic, bank_name, iban, currency, account_type, status, ebics_partner_id, ebics_user_id, ebics_host_id, opened_at, closed_at",
      );
    if (input.entity_id) q = q.eq("entity_id", input.entity_id);
    if (input.status) q = q.eq("status", input.status);
    const { data, error } = await q;
    if (error) throw new Error(`bank accounts lookup failed: ${error.message}`);
    return { accounts: data ?? [] };
  },
});

const ListSanctionsHitsInput = z.object({
  status: HitStatus,
});

export const listSanctionsHits = tool({
  name: "list_sanctions_hits",
  description:
    "Lists sanctions hits by status. Returns hit-id, match score, match method, payment reference, list-id (NOT the list entry contents). For details, the user must visit /treasury/sanctions/hits/<id> with appropriate RBAC.",
  inputSchema: ListSanctionsHitsInput,
  handler: async (input, ctx) => {
    const { data, error } = await ctx.supabase
      .from("treasury_sanctions_hits")
      .select(
        "id, payment_id, list_id, match_score, match_method, status, created_at, resolved_at",
      )
      .eq("status", input.status)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`sanctions hits lookup failed: ${error.message}`);
    return {
      hits: (data ?? []).map((h) => ({
        id: h.id,
        payment_id: h.payment_id,
        list_id: h.list_id,
        match_score: h.match_score,
        match_method: h.match_method,
        status: h.status,
        created_at: h.created_at,
        resolved_at: h.resolved_at,
        review_url: `/treasury/sanctions/hits/${h.id}`,
      })),
    };
  },
});

const ListPaymentRunsInput = z.object({
  status: z
    .enum([
      "draft",
      "pending_approval",
      "approved",
      "signed",
      "sent",
      "acknowledged",
      "rejected",
    ])
    .optional(),
});

export const listPaymentRuns = tool({
  name: "list_payment_runs",
  description: "Lists payment runs filtered by status. RLS-scoped.",
  inputSchema: ListPaymentRunsInput,
  handler: async (input, ctx) => {
    let q = ctx.supabase
      .from("treasury_payment_runs")
      .select(
        "id, entity_id, account_id, scheme, payment_count, total_amount, currency, status, created_at",
      )
      .order("created_at", { ascending: false });
    if (input.status) q = q.eq("status", input.status);
    const { data, error } = await q;
    if (error) throw new Error(`payment runs lookup failed: ${error.message}`);
    return { runs: data ?? [] };
  },
});

// ---------------------------------------------------------------------------
// Mutation tools — DRAFT only
// ---------------------------------------------------------------------------

const ProposePaymentInput = z.object({
  account_id: Uuid,
  beneficiary: z.object({
    name: z.string().min(1).max(140),
    iban: Iban,
    bic: Bic.optional(),
  }),
  amount: z.number().positive().max(1_000_000_000),
  currency: Iso4217,
  scheme: PaymentScheme,
  remittance_info: z.string().max(140).optional(),
  category: z.string().max(64).optional(),
});

export const proposePayment = tool({
  name: "propose_payment",
  description:
    "Creates a DRAFT payment run with a single payment. NEVER auto-executes. Returns the run id + approval URL — the human must approve and sign via EBICS-TS for the bank to ever see this.",
  inputSchema: ProposePaymentInput,
  handler: async (input, ctx) => {
    const { data: account, error: accErr } = await ctx.supabase
      .from("treasury_bank_accounts")
      .select("id, entity_id, currency, status")
      .eq("id", input.account_id)
      .maybeSingle();
    if (accErr) throw new Error(`account lookup failed: ${accErr.message}`);
    if (!account) throw new Error("Account not found or not accessible");
    if (account.status !== "active")
      throw new Error(`Account is ${account.status}, cannot draft payments`);
    if (account.currency !== input.currency)
      throw new Error(
        `Currency mismatch: account is ${account.currency}, requested ${input.currency}`,
      );

    const { data: run, error: runErr } = await ctx.supabase
      .from("treasury_payment_runs")
      .insert({
        company_id: ctx.companyId,
        entity_id: account.entity_id,
        account_id: account.id,
        scheme: input.scheme,
        payment_count: 1,
        total_amount: input.amount,
        currency: input.currency,
        status: "draft",
        initiator_user_id: ctx.userId,
      })
      .select("id")
      .single();
    if (runErr || !run) throw new Error(`payment run insert failed: ${runErr?.message ?? "unknown"}`);

    const endToEndId = `SKILL-${run.id.replace(/-/g, "").slice(0, 24)}`;
    const { error: payErr } = await ctx.supabase.from("treasury_payments").insert({
      company_id: ctx.companyId,
      run_id: run.id,
      end_to_end_id: endToEndId,
      beneficiary_name: input.beneficiary.name,
      beneficiary_iban: input.beneficiary.iban,
      beneficiary_bic: input.beneficiary.bic ?? null,
      amount: input.amount,
      currency: input.currency,
      remittance_info: input.remittance_info ?? null,
      category: input.category ?? null,
      status: "pending",
    });
    if (payErr) throw new Error(`payment insert failed: ${payErr.message}`);

    return {
      payment_run_draft_id: run.id,
      end_to_end_id: endToEndId,
      status: "draft",
      approval_url: `/treasury/payments/${run.id}`,
      message:
        "Draft created. Two approvers + one EBICS-TS signer required before the bank will see this payment.",
    };
  },
});

const ProposeMmfAllocationInput = z.object({
  amount: z.number().positive(),
  currency: Iso4217,
  providers: z.array(Bic).min(1).max(20),
  term_days: z.number().int().min(1).max(720),
});

export const proposeMmfAllocation = tool({
  name: "propose_mmf_allocation",
  description:
    "Stub for Phase 6 (Cash-Optimization). Records the requested allocation as a structured draft note; does NOT contact any MMF provider.",
  inputSchema: ProposeMmfAllocationInput,
  handler: async (input, _ctx) => {
    return {
      status: "not_implemented",
      phase: "6 — Cash-Optimization",
      requested: input,
      message:
        "MMF allocation drafts are scheduled for Phase 6. Returning the parsed request as an echo. No external API was contacted.",
    };
  },
});

// ---------------------------------------------------------------------------
// Artefact tools
// ---------------------------------------------------------------------------

const GenerateBoardpackInput = z.object({
  entity_id: Uuid,
  period_start: IsoDate,
  period_end: IsoDate,
  language: z.enum(["de", "en"]).default("de"),
});

export const generateBoardpack = tool({
  name: "generate_boardpack",
  description:
    "Queues a Treasury Board-Pack PDF render for the given entity + period. Returns the draft job id and the expected Blob URL. The actual PDF renderer lands in Phase 7.",
  inputSchema: GenerateBoardpackInput,
  handler: async (input, ctx) => {
    const { data: entity, error: entErr } = await ctx.supabase
      .from("treasury_entities")
      .select("id, legal_name, currency")
      .eq("id", input.entity_id)
      .maybeSingle();
    if (entErr) throw new Error(`entity lookup failed: ${entErr.message}`);
    if (!entity) throw new Error("Entity not found or not accessible");

    if (input.period_start > input.period_end) {
      throw new Error("period_start must be on or before period_end");
    }

    const jobId = `boardpack-${entity.id}-${input.period_start}-${input.period_end}`;
    return {
      status: "queued",
      job_id: jobId,
      entity: { id: entity.id, legal_name: entity.legal_name, currency: entity.currency },
      period: { start: input.period_start, end: input.period_end },
      language: input.language,
      expected_url: `/api/treasury/boardpack/${jobId}.pdf`,
      message:
        "Boardpack-Render-Job queued. Once Phase 7 ships, the PDF will be reachable at expected_url.",
    };
  },
});

// ---------------------------------------------------------------------------
// Registry + Anthropic tool-definition export
// ---------------------------------------------------------------------------

export const treasuryTools = [
  getCashPosition,
  getCashForecast,
  queryTransactions,
  listBankAccounts,
  listSanctionsHits,
  listPaymentRuns,
  proposePayment,
  proposeMmfAllocation,
  generateBoardpack,
] as const;

export type TreasuryToolName = (typeof treasuryTools)[number]["name"];

/**
 * Build the Anthropic `tools` parameter (JSON Schema) from the Zod schemas.
 * Marked with `cache_control: ephemeral` so the Bedrock prompt cache
 * deduplicates the tools block across the conversation.
 */
interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  cache_control?: { type: "ephemeral" };
}

export function buildAnthropicToolDefinitions(): AnthropicToolDef[] {
  const defs: AnthropicToolDef[] = treasuryTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: z.toJSONSchema(t.inputSchema) as Record<string, unknown>,
  }));
  if (defs.length > 0) {
    defs[defs.length - 1] = {
      ...defs[defs.length - 1],
      cache_control: { type: "ephemeral" },
    };
  }
  return defs;
}

// Use `any` here because the intersection of all tools' input types collapses
// to `never` when stored uniformly. The handler call site re-validates input
// through the tool's own Zod schema before invoking the handler.
// REASON: see runTreasuryTool below — parsed.data is the schema-narrowed type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TOOL_INDEX: Record<string, SkillTool<z.ZodTypeAny, any>> = Object.fromEntries(
  treasuryTools.map((t) => [t.name, t as unknown as SkillTool<z.ZodTypeAny, unknown>]),
);

/**
 * Run a tool by name with raw JSON input. Validates input against the Zod
 * schema and returns either the typed handler result or a structured error
 * envelope (so the LLM tool-loop can surface the error back to the user
 * without crashing the request).
 */
export async function runTreasuryTool(
  name: string,
  input: unknown,
  ctx: SkillContext,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const tool = TOOL_INDEX[name];
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  const parsed = tool.inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: `Invalid input for ${name}: ${parsed.error.message}` };
  }
  try {
    const data = await tool.handler(parsed.data, ctx);
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown handler error";
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * ISO 8601 week key (`YYYY-Www`) for a `YYYY-MM-DD` date. Forecast items are
 * grouped by week without a separate week column, so we derive it here.
 */
function isoWeek(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  const weekNr = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `${d.getUTCFullYear()}-W${String(weekNr).padStart(2, "0")}`;
}
