// SCH-600 Phase 5 Item #6 — cross-tenant isolation regression
//
// Provisions two independent tenants (Tenant A and Tenant B) on the shared
// QA Supabase, seeds an invoice into Tenant A, then verifies Tenant B's
// admin — authenticated via real signInWithPassword so the JWT carries the
// app_metadata.company_id claim the RLS layer actually reads — cannot
// SELECT, UPDATE, DELETE, or fraudulent-INSERT against Tenant A's invoice.
//
// Why this is a DB-layer test, not an HTTP 403 test: invoices have no REST
// API routes in this app — the dashboard reads/writes via the supabase-js
// client directly. The RLS policies in supabase/migrations/20260418093458_*
// are the actual security boundary, so that's what we exercise.
//
// Original CEO ask was "all 4 routes must return 403"; the correct
// equivalent for an RLS-protected, no-API-route resource is:
//   - SELECT cross-tenant → empty array (rows filtered by USING clause)
//   - UPDATE cross-tenant → zero rows affected (USING clause)
//   - DELETE cross-tenant → zero rows affected (USING clause)
//   - INSERT cross-tenant → RLS violation error OR zero-row result
//     (WITH CHECK clause); we accept either since the WITH CHECK
//     mechanism is what matters, not the error-vs-empty wire shape.

import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "../helpers/env";
import {
  provisionTenant,
  destroyTenant,
  seedInvoiceForTenant,
  clearSeededInvoices,
  type TestTenant,
  type SeededInvoice,
} from "../helpers/test-tenant";

let tenantA: TestTenant;
let tenantB: TestTenant;
let seededInvoice: SeededInvoice;

test.beforeAll(async () => {
  tenantA = await provisionTenant();
  tenantB = await provisionTenant();
  seededInvoice = await seedInvoiceForTenant(tenantA.primarySlug, tenantA.runId);
});

test.afterAll(async () => {
  // Defensive: if test 4 ever did slip a fraudulent row past RLS, this
  // also blows it away so the next run starts clean.
  const env = loadEnv();
  const svc = createClient(env.supabaseUrl, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await svc
    .from("invoices")
    .delete()
    .eq("company_id", tenantA.primarySlug)
    .eq("notes", "fraudulent-insert")
    .then(() => undefined, () => undefined);

  // Then standard teardown — order matters: seeded child rows → tenant cascades.
  await clearSeededInvoices(tenantA.primarySlug).catch(() => undefined);
  await destroyTenant(tenantA).catch(() => undefined);
  await destroyTenant(tenantB).catch(() => undefined);
});

function serviceClient(): SupabaseClient {
  const env = loadEnv();
  return createClient(env.supabaseUrl, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signInAs(creds: { email: string; password: string }): Promise<SupabaseClient> {
  const env = loadEnv();
  const client = createClient(env.supabaseUrl, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword(creds);
  if (error) throw new Error(`signIn(${creds.email}) failed: ${error.message}`);
  // Returning the same client preserves its internal session so subsequent
  // .from() calls send the user's access_token via the global header injector
  // supabase-js wires up after a successful sign-in.
  return client;
}

test.describe("SCH-600 Phase 5 #6 — cross-tenant invoice isolation", () => {
  test("sanity — tenant A's admin CAN read their own invoice (proves test setup is real)", async () => {
    const client = await signInAs(tenantA.admin);
    const { data, error } = await client
      .from("invoices")
      .select("id, company_id")
      .eq("id", seededInvoice.invoiceId)
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBe(seededInvoice.invoiceId);
    expect(data?.company_id).toBe(tenantA.primarySlug);
  });

  test("tenant B SELECT against tenant A's invoice returns zero rows (RLS USING filter)", async () => {
    const client = await signInAs(tenantB.admin);
    const { data, error } = await client
      .from("invoices")
      .select("*")
      .eq("id", seededInvoice.invoiceId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("tenant B UPDATE against tenant A's invoice mutates zero rows (RLS USING filter)", async () => {
    const client = await signInAs(tenantB.admin);
    const { data, error } = await client
      .from("invoices")
      .update({ notes: "hacked-by-tenant-b" })
      .eq("id", seededInvoice.invoiceId)
      .select();
    // RLS may surface as either "no rows affected" or an explicit
    // policy-violation error; either proves isolation held.
    const effective = error === null ? data : [];
    expect(effective).toEqual([]);

    // Authoritative check via service-role: the row must be untouched.
    const svc = serviceClient();
    const { data: actual } = await svc
      .from("invoices")
      .select("notes")
      .eq("id", seededInvoice.invoiceId)
      .single();
    expect(actual?.notes).not.toBe("hacked-by-tenant-b");
  });

  test("tenant B DELETE against tenant A's invoice removes zero rows (RLS USING filter)", async () => {
    const client = await signInAs(tenantB.admin);
    const { data, error } = await client
      .from("invoices")
      .delete()
      .eq("id", seededInvoice.invoiceId)
      .select();
    const effective = error === null ? data : [];
    expect(effective).toEqual([]);

    // Authoritative check: the row still exists.
    const svc = serviceClient();
    const { data: stillThere } = await svc
      .from("invoices")
      .select("id")
      .eq("id", seededInvoice.invoiceId)
      .single();
    expect(stillThere?.id).toBe(seededInvoice.invoiceId);
  });

  test("tenant B cannot INSERT an invoice claiming tenant A's company_id (RLS WITH CHECK)", async () => {
    const client = await signInAs(tenantB.admin);
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await client.from("invoices").insert({
      company_id: tenantA.primarySlug, // ← cross-tenant claim, must be blocked
      customer_id: seededInvoice.customerId,
      invoice_number: `QA-FRAUD-${tenantB.runId}-${Date.now()}`,
      project_description: "cross-tenant fraud attempt",
      invoice_date: today,
      delivery_date: today,
      due_date: today,
      subtotal: 1,
      tax_rate: 0,
      tax_amount: 0,
      total: 1,
      overall_discount_percent: 0,
      overall_discount_amount: 0,
      status: "entwurf",
      paid_amount: 0,
      notes: "fraudulent-insert",
      language: "de",
      accompanying_text: null,
      e_invoice_format: "none",
      source_quote_id: null,
      percent_of_quote: null,
    });

    // Either error (preferred — RLS WITH CHECK violated) or empty data;
    // both prove the WITH CHECK clause blocked the write.
    if (error === null) {
      expect(data ?? []).toEqual([]);
    } else {
      expect(error.message).toMatch(/row-level security|policy|violates/i);
    }

    // Authoritative check via service-role: no fraudulent row exists in
    // tenant A's space. `notes` is enough to identify the would-be row.
    const svc = serviceClient();
    const { data: fraudCheck } = await svc
      .from("invoices")
      .select("id")
      .eq("company_id", tenantA.primarySlug)
      .eq("notes", "fraudulent-insert");
    expect(fraudCheck ?? []).toEqual([]);
  });
});
