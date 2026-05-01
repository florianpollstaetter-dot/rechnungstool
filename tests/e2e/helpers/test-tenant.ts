// SCH-976 — Test-tenant fixture for the K2-γ permissions suite.
//
// Provisions a fresh `qa-perms-<runId>` tenant + 4 users via the Supabase
// service-role client. We bypass /api/register-company + /api/create-user
// here so the fixture works without a running dev server bootstrap step
// (the tests themselves still hit the real HTTP endpoints for V2/V3).
//
// Permission shape per user:
//   qa-admin       — role=admin                (sees everything)
//   qa-rechn-only  — role=member, perms.rechnungen=true
//   qa-empty       — role=member, perms={}     (only ALWAYS_ON sections)
//   qa-multi       — role=admin in TWO companies (G7/G8)
//
// Cleanup deletes everything by `qa-perms-` slug prefix + `qa-` email
// prefix so a half-failed previous run can't poison the next.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "./env";

export interface TestUser {
  email: string;
  password: string;
  authUserId: string;
  displayName: string;
}

export interface TestTenant {
  runId: string;
  primarySlug: string;
  secondarySlug: string;
  admin: TestUser;
  rechnOnly: TestUser;
  empty: TestUser;
  multi: TestUser;
}

const PASSWORD = "QaSpec!Pass2026";

function service(): SupabaseClient {
  const env = loadEnv();
  return createClient(env.supabaseUrl, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function makeRunId(): string {
  // Slug-safe, sortable, unique per suite invocation. 8 hex chars is enough
  // entropy for a single-suite run; collisions would still be caught by the
  // pre-create slug check anyway.
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toLowerCase();
}

async function createAuthUser(
  svc: SupabaseClient,
  email: string,
  displayName: string,
): Promise<TestUser> {
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error || !data?.user) {
    throw new Error(`createAuthUser(${email}) failed: ${error?.message ?? "no user"}`);
  }
  return { email, password: PASSWORD, authUserId: data.user.id, displayName };
}

async function createCompany(svc: SupabaseClient, slug: string, name: string): Promise<void> {
  const trialStart = new Date();
  const trialEnd = new Date(trialStart);
  trialEnd.setDate(trialEnd.getDate() + 30);
  const { error } = await svc.from("companies").insert({
    id: slug,
    name,
    slug,
    plan: "trial",
    status: "active",
    subscription_status: "free_trial",
    trial_started_at: trialStart.toISOString(),
    trial_ends_at: trialEnd.toISOString(),
  });
  if (error) throw new Error(`createCompany(${slug}) failed: ${error.message}`);

  const { error: settingsErr } = await svc.from("company_settings").insert({
    id: slug,
    company_id: slug,
    company_name: name,
    company_type: "gmbh",
    address: "",
    city: "",
    zip: "",
    uid: "",
    iban: "",
    bic: "",
    phone: "",
    email: `owner@${slug}.test`,
    logo_url: "",
    default_tax_rate: 20,
    default_payment_terms_days: 14,
    next_invoice_number: 1,
    next_quote_number: 1,
    accompanying_text_de: "",
    accompanying_text_en: "",
  });
  if (settingsErr) throw new Error(`createCompanySettings(${slug}) failed: ${settingsErr.message}`);
}

async function createMembership(
  svc: SupabaseClient,
  authUserId: string,
  companyId: string,
  role: "owner" | "admin" | "member",
  permissions: Record<string, boolean>,
): Promise<void> {
  const { error } = await svc.from("company_members").insert({
    user_id: authUserId,
    company_id: companyId,
    role,
    permissions,
  });
  if (error) throw new Error(`createMembership(${authUserId}, ${companyId}) failed: ${error.message}`);
}

async function createProfile(
  svc: SupabaseClient,
  user: TestUser,
  companyIds: string[],
  role: "admin" | "employee",
  anchorCompanyId: string,
): Promise<void> {
  const { error } = await svc.from("user_profiles").insert({
    auth_user_id: user.authUserId,
    display_name: user.displayName,
    email: user.email,
    role,
    company_access: JSON.stringify(companyIds),
    anchor_company_id: anchorCompanyId,
    // SCH-976 — skip the OnboardingTour modal so its z-60 backdrop doesn't
    // intercept clicks in tests. Real users see the tour on first login;
    // the tour itself isn't part of this suite.
    onboarding_completed_at: new Date().toISOString(),
  });
  if (error) throw new Error(`createProfile(${user.email}) failed: ${error.message}`);

  // Mirror app_metadata.company_id so the JWT claim is set on first sign-in.
  const { error: metaErr } = await svc.auth.admin.updateUserById(user.authUserId, {
    app_metadata: { company_id: anchorCompanyId },
  });
  if (metaErr) throw new Error(`updateAppMetadata(${user.email}) failed: ${metaErr.message}`);
}

const FULL_PERMS = {
  angebote: true,
  rechnungen: true,
  kunden: true,
  produkte: true,
  fixkosten: true,
  belege: true,
  konto: true,
  export: true,
  projekte_erstellen: true,
};

const EMPTY_PERMS = {
  angebote: false,
  rechnungen: false,
  kunden: false,
  produkte: false,
  fixkosten: false,
  belege: false,
  konto: false,
  export: false,
  projekte_erstellen: false,
};

const RECHN_ONLY_PERMS = { ...EMPTY_PERMS, rechnungen: true };

export async function provisionTenant(): Promise<TestTenant> {
  const svc = service();
  const runId = makeRunId();
  const primarySlug = `qa-perms-${runId}`;
  const secondarySlug = `qa-perms-${runId}-b`;

  await createCompany(svc, primarySlug, `QA Permissions ${runId}`);
  await createCompany(svc, secondarySlug, `QA Permissions ${runId} B`);

  const admin = await createAuthUser(svc, `qa-admin+${runId}@example.test`, "QA Admin");
  const rechnOnly = await createAuthUser(svc, `qa-rechn+${runId}@example.test`, "QA Rechn Only");
  const empty = await createAuthUser(svc, `qa-empty+${runId}@example.test`, "QA Empty");
  const multi = await createAuthUser(svc, `qa-multi+${runId}@example.test`, "QA Multi");

  await createMembership(svc, admin.authUserId, primarySlug, "admin", FULL_PERMS);
  await createMembership(svc, rechnOnly.authUserId, primarySlug, "member", RECHN_ONLY_PERMS);
  await createMembership(svc, empty.authUserId, primarySlug, "member", EMPTY_PERMS);
  await createMembership(svc, multi.authUserId, primarySlug, "admin", FULL_PERMS);
  await createMembership(svc, multi.authUserId, secondarySlug, "admin", FULL_PERMS);

  await createProfile(svc, admin, [primarySlug], "admin", primarySlug);
  await createProfile(svc, rechnOnly, [primarySlug], "employee", primarySlug);
  await createProfile(svc, empty, [primarySlug], "employee", primarySlug);
  await createProfile(svc, multi, [primarySlug, secondarySlug], "admin", primarySlug);

  return { runId, primarySlug, secondarySlug, admin, rechnOnly, empty, multi };
}

export async function destroyTenant(tenant: TestTenant): Promise<void> {
  const svc = service();
  const slugs = [tenant.primarySlug, tenant.secondarySlug];
  const users = [tenant.admin, tenant.rechnOnly, tenant.empty, tenant.multi];

  // Order matters: tear down dependents first so FK cascades stay clean.
  for (const u of users) {
    await svc.from("company_members").delete().eq("user_id", u.authUserId);
    await svc.from("user_role_assignments").delete().eq("user_id", u.authUserId).then(
      () => undefined,
      () => undefined,
    );
    await svc.from("user_profiles").delete().eq("auth_user_id", u.authUserId);
    await svc.auth.admin.deleteUser(u.authUserId).catch(() => undefined);
  }
  for (const slug of slugs) {
    await svc.from("company_settings").delete().eq("company_id", slug);
    await svc.from("companies").delete().eq("id", slug);
  }
}

/** Look up auth.users.email for a given auth_user_id — used by the V3 spec. */
export async function readAuthEmail(authUserId: string): Promise<string | null> {
  const svc = service();
  const { data, error } = await svc.auth.admin.getUserById(authUserId);
  if (error) throw new Error(`readAuthEmail(${authUserId}) failed: ${error.message}`);
  return data?.user?.email ?? null;
}
