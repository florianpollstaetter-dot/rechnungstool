// ORA-3310 — unit tests for the pure API auth policy.
//
// Run:
//   npx tsx tests/unit/ora3310-api-access-policy.test.ts
//
// Self-contained — no test framework, plain node:assert. These assert the two
// security rules that fix the DATEV-export leak directly, without a server:
//   1. The four dangerous service-role routes are NOT on the public allowlist.
//   2. decideCompanyMembership: no session → 401, wrong company → 403,
//      member → ok.

import assert from "node:assert/strict";

import {
  isPublicApiPath,
  PUBLIC_API_PATHS,
  decideCompanyMembership,
} from "../../src/lib/auth/api-access-policy";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

// --- 1. public allowlist --------------------------------------------------
check("the intended webhooks/cron/signup/VIES paths are public", () => {
  assert.equal(isPublicApiPath("/api/register-company"), true);
  assert.equal(isPublicApiPath("/api/stripe/webhook"), true);
  assert.equal(isPublicApiPath("/api/treasury/ebics/poll"), true);
  // KIN-6527 — public UID check (reads no tenant data, rate-limited per IP)
  assert.equal(isPublicApiPath("/api/at/uid-pruefen"), true);
});

check("the four leaky service-role routes are NOT public", () => {
  assert.equal(isPublicApiPath("/api/einvoice/datev"), false);
  assert.equal(isPublicApiPath("/api/dashboard/layout"), false);
  assert.equal(isPublicApiPath("/api/company/setup-suggestions"), false);
  assert.equal(isPublicApiPath("/api/projects/create-from-quote"), false);
});

check("allowlist stays minimal (guard against accidental additions)", () => {
  assert.equal(PUBLIC_API_PATHS.length, 4);
});

check("a path that merely starts with a public name is not public", () => {
  // /api/stripe/webhook-malicious must NOT match /api/stripe/webhook.
  assert.equal(isPublicApiPath("/api/stripe/webhook-malicious"), false);
  // but a sub-path of a public route is allowed through.
  assert.equal(isPublicApiPath("/api/stripe/webhook/retry"), true);
});

// --- 2. membership decision ----------------------------------------------
check("no session → 401", () => {
  const d = decideCompanyMembership(false, [], "comp-a");
  assert.deepEqual(d, { ok: false, status: 401, error: "Nicht authentifiziert" });
});

check("authenticated, not a member of the requested company → 403", () => {
  const d = decideCompanyMembership(true, ["comp-b"], "comp-a");
  assert.equal(d.ok, false);
  assert.equal((d as { status: number }).status, 403);
});

check("authenticated but no companyId supplied → 403", () => {
  const d = decideCompanyMembership(true, ["comp-a"], null);
  assert.equal(d.ok, false);
  assert.equal((d as { status: number }).status, 403);
});

check("authenticated member of the requested company → ok", () => {
  const d = decideCompanyMembership(true, ["comp-a", "comp-b"], "comp-a");
  assert.deepEqual(d, { ok: true });
});

console.log(`\nORA-3310 api-access-policy: ${passed} checks passed`);
