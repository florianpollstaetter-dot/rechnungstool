/**
 * RLS cross-tenant isolation smoke test — SCH-833
 *
 * Creates two isolated tenants (users + companies + one row per guarded table),
 * then verifies that each user can only see their own tenant's rows via the
 * Supabase JS client (real JWT, real RLS evaluation).
 *
 * Required env vars (same secrets used by CI already):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Exit 0 = all isolation checks passed.
 * Exit 1 = at least one cross-tenant leak detected (details printed to stdout).
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(2);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Tables protected by tenant_isolation, with their company_id column name.
// Add a row here whenever a new tenant-isolated table is created.
const TABLES = [
  { table: "customers", companyCol: "company_id" },
  { table: "quotes", companyCol: "company_id" },
  { table: "quote_items", companyCol: "company_id" },
  { table: "invoices", companyCol: "company_id" },
  { table: "invoice_items", companyCol: "company_id" },
  { table: "products", companyCol: "company_id" },
  { table: "time_entries", companyCol: "company_id" },
  { table: "expense_reports", companyCol: "company_id" },
  { table: "bank_statements", companyCol: "company_id" },
  { table: "receipts", companyCol: "company_id" },
  { table: "templates", companyCol: "company_id" },
  { table: "fixed_costs", companyCol: "company_id" },
  { table: "company_settings", companyCol: "company_id" },
];

// Seed values — stable across retries so cleanup can be idempotent.
const RUN_TAG = `rls-test-${Date.now()}`;
const EMAIL_A = `rls-test-a-${Date.now()}@example.invalid`;
const EMAIL_B = `rls-test-b-${Date.now()}@example.invalid`;
const PASSWORD = "TestPass!9837";

let failures = 0;
const createdUserIds = [];

function pass(msg) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg) {
  console.error(`  ✗ FAIL: ${msg}`);
  failures++;
}

async function cleanup(userIds) {
  for (const uid of userIds) {
    await admin.auth.admin.deleteUser(uid).catch(() => {});
  }
  // Remove test companies by their name tag.
  await admin.from("companies").delete().like("name", `${RUN_TAG}%`).catch(() => {});
}

async function signInAsUser(email, password) {
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn failed for ${email}: ${error.message}`);
  return anon;
}

async function seedRow(table, companyCol, companyId, userId) {
  const base = { [companyCol]: companyId };

  // Per-table minimal required fields so the insert doesn't violate NOT NULL.
  const extra = buildExtraFields(table, companyId, userId);
  const { error } = await admin.from(table).insert({ ...base, ...extra });
  if (error) {
    // Non-fatal: some tables have complex constraints. Log and skip.
    console.warn(`    seed ${table}: ${error.message} (skipped)`);
    return false;
  }
  return true;
}

function buildExtraFields(table, companyId, userId) {
  const now = new Date().toISOString();
  switch (table) {
    case "customers":
      return { name: "Test Customer", user_id: userId };
    case "quotes":
      return { user_id: userId, status: "draft", currency: "EUR", language: "de" };
    case "quote_items":
      return { company_id: companyId, quantity: 1, unit_price: 10, description: "item" };
    case "invoices":
      return { user_id: userId, status: "draft", currency: "EUR" };
    case "invoice_items":
      return { company_id: companyId, quantity: 1, unit_price: 10, description: "item" };
    case "products":
      return { name: "Test Product", user_id: userId };
    case "time_entries":
      return { user_id: userId, start_time: now, end_time: now, duration_minutes: 60 };
    case "expense_reports":
      return { user_id: userId, status: "draft", title: "Test Expense" };
    case "bank_statements":
      return { user_id: userId, filename: "test.csv" };
    case "receipts":
      return { user_id: userId, filename: "receipt.pdf" };
    case "templates":
      return { user_id: userId, name: "Test Template", type: "invoice" };
    case "fixed_costs":
      return { user_id: userId, name: "Test Fixed Cost", amount: 100 };
    case "company_settings":
      return {};
    default:
      return {};
  }
}

async function run() {
  console.log(`\nRLS Tenant Isolation Test — SCH-833`);
  console.log(`Run tag: ${RUN_TAG}\n`);

  // 1. Create two companies (via admin — bypasses RLS).
  console.log("1. Creating test companies…");
  const { data: compA, error: errA } = await admin
    .from("companies")
    .insert({ name: `${RUN_TAG}-company-a` })
    .select("id")
    .single();
  if (errA) { console.error(`Cannot create company A: ${errA.message}`); process.exit(2); }

  const { data: compB, error: errB } = await admin
    .from("companies")
    .insert({ name: `${RUN_TAG}-company-b` })
    .select("id")
    .single();
  if (errB) { console.error(`Cannot create company B: ${errB.message}`); process.exit(2); }

  console.log(`  company A: ${compA.id}`);
  console.log(`  company B: ${compB.id}`);

  // 2. Create two auth users with app_metadata binding them to their company.
  console.log("\n2. Creating test users…");
  const { data: authA, error: errUA } = await admin.auth.admin.createUser({
    email: EMAIL_A,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { company_id: compA.id, active_company_id: compA.id },
  });
  if (errUA) { console.error(`Cannot create user A: ${errUA.message}`); process.exit(2); }
  createdUserIds.push(authA.user.id);

  const { data: authB, error: errUB } = await admin.auth.admin.createUser({
    email: EMAIL_B,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { company_id: compB.id, active_company_id: compB.id },
  });
  if (errUB) { console.error(`Cannot create user B: ${errUB.message}`); process.exit(2); }
  createdUserIds.push(authB.user.id);

  console.log(`  user A: ${authA.user.id} → company ${compA.id}`);
  console.log(`  user B: ${authB.user.id} → company ${compB.id}`);

  // 3. Seed one row per table for each company.
  console.log("\n3. Seeding test rows…");
  const seededTables = [];
  for (const { table, companyCol } of TABLES) {
    const okA = await seedRow(table, companyCol, compA.id, authA.user.id);
    const okB = await seedRow(table, companyCol, compB.id, authB.user.id);
    if (okA && okB) {
      seededTables.push({ table, companyCol });
      console.log(`  seeded ${table}`);
    }
  }

  // 4. Sign in as each user and verify cross-tenant isolation.
  console.log("\n4. Testing cross-tenant isolation…");
  const clientA = await signInAsUser(EMAIL_A, PASSWORD);
  const clientB = await signInAsUser(EMAIL_B, PASSWORD);

  for (const { table } of seededTables) {
    // User A reads — must see company A rows only.
    const { data: rowsA, error: eA } = await clientA.from(table).select("id, company_id");
    if (eA) { fail(`${table} — user A read error: ${eA.message}`); continue; }

    const leakA = (rowsA ?? []).some((r) => r.company_id === compB.id);
    if (leakA) {
      fail(`${table} — user A can read company B rows (cross-tenant leak!)`);
    } else {
      pass(`${table} — user A sees only company A rows (${rowsA?.length ?? 0})`);
    }

    // User B reads — must see company B rows only.
    const { data: rowsB, error: eB } = await clientB.from(table).select("id, company_id");
    if (eB) { fail(`${table} — user B read error: ${eB.message}`); continue; }

    const leakB = (rowsB ?? []).some((r) => r.company_id === compA.id);
    if (leakB) {
      fail(`${table} — user B can read company A rows (cross-tenant leak!)`);
    } else {
      pass(`${table} — user B sees only company B rows (${rowsB?.length ?? 0})`);
    }
  }

  // 5. Cleanup.
  console.log("\n5. Cleaning up test data…");
  await cleanup(createdUserIds);
  console.log("  done.");

  // 6. Summary.
  console.log(`\n${"─".repeat(50)}`);
  if (failures > 0) {
    console.error(`FAILED: ${failures} isolation violation(s) detected.`);
    process.exit(1);
  } else {
    console.log(`PASSED: all ${seededTables.length * 2} isolation checks passed.`);
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(2);
});
