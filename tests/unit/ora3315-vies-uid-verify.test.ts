// ORA-3315 — Unit tests for the VIES UID verification client.
//
// Run:
//   npx tsx tests/unit/ora3315-vies-uid-verify.test.ts
//
// Self-contained — no test framework, just assert.strict. Exits non-zero on any
// failure. The VIES HTTP call is mocked (no network), covering a known valid
// UID, a known invalid UID, member-state-unavailable, a non-2xx response, a
// network error, a timeout, and local format rejection.

import assert from "node:assert/strict";

import { verifyUid, parseUid, type ViesResult } from "../../src/lib/einvoice/vies";

interface Case {
  name: string;
  run: () => Promise<void> | void;
}

// A fake fetch returning a canned VIES JSON body with status 200.
function mockOk(body: Record<string, unknown>) {
  return async () => ({ ok: true, status: 200, json: async () => body });
}

const cases: Case[] = [
  {
    name: "parseUid splits country + number and normalizes",
    run: () => {
      const p = parseUid(" atu 123 456 78 ");
      assert.deepEqual(p, { countryCode: "AT", vatNumber: "U12345678", normalized: "ATU12345678" });
    },
  },
  {
    name: "parseUid rejects malformed input",
    run: () => {
      assert.equal(parseUid("12345"), null); // keine 2 Buchstaben vorn
      assert.equal(parseUid("A"), null);
      assert.equal(parseUid(""), null);
    },
  },
  {
    name: "known valid UID → status valid, name/address passed through",
    run: async () => {
      const res = await verifyUid("ATU12345678", {
        fetchImpl: mockOk({
          valid: true,
          countryCode: "AT",
          vatNumber: "U12345678",
          name: "VR the Fans GmbH",
          address: "Teststraße 1, 1010 Wien",
        }),
      });
      assert.equal(res.status, "valid");
      assert.equal(res.uid, "ATU12345678");
      assert.equal(res.countryCode, "AT");
      assert.equal(res.vatNumber, "U12345678");
      assert.equal(res.name, "VR the Fans GmbH");
      assert.equal(res.address, "Teststraße 1, 1010 Wien");
      assert.ok(res.checkedAt);
    },
  },
  {
    name: 'valid UID with "---" placeholders drops name/address',
    run: async () => {
      const res = await verifyUid("ATU12345678", {
        fetchImpl: mockOk({ valid: true, name: "---", address: "---" }),
      });
      assert.equal(res.status, "valid");
      assert.equal(res.name, undefined);
      assert.equal(res.address, undefined);
    },
  },
  {
    name: "known invalid UID → status invalid",
    run: async () => {
      const res = await verifyUid("ATU99999999", {
        fetchImpl: mockOk({ valid: false, userError: "INVALID" }),
      });
      assert.equal(res.status, "invalid");
      assert.equal(res.detail, "INVALID");
    },
  },
  {
    name: "member state unavailable (valid:false + MS_UNAVAILABLE) → unavailable, not invalid",
    run: async () => {
      const res = await verifyUid("ATU12345678", {
        fetchImpl: mockOk({ valid: false, userError: "MS_UNAVAILABLE" }),
      });
      assert.equal(res.status, "unavailable");
      assert.equal(res.detail, "MS_UNAVAILABLE");
    },
  },
  {
    name: "non-2xx HTTP response → unavailable",
    run: async () => {
      const res = await verifyUid("ATU12345678", {
        fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
      });
      assert.equal(res.status, "unavailable");
      assert.equal(res.detail, "HTTP 503");
    },
  },
  {
    name: "network error → unavailable (never throws)",
    run: async () => {
      const res = await verifyUid("ATU12345678", {
        fetchImpl: async () => {
          throw new Error("ECONNREFUSED");
        },
      });
      assert.equal(res.status, "unavailable");
    },
  },
  {
    name: "timeout (AbortError) → unavailable",
    run: async () => {
      const res = await verifyUid("ATU12345678", {
        fetchImpl: async () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          throw e;
        },
      });
      assert.equal(res.status, "unavailable");
      assert.equal(res.detail, "AbortError");
    },
  },
  {
    name: "format error short-circuits before any network call",
    run: async () => {
      let called = false;
      const res = await verifyUid("not-a-uid", {
        fetchImpl: async () => {
          called = true;
          return { ok: true, status: 200, json: async () => ({}) };
        },
      });
      assert.equal(res.status, "format_error");
      assert.equal(called, false, "VIES darf bei Formatfehler nicht angefragt werden");
    },
  },
  {
    name: "unexpected body (no valid field) → unavailable, not a crash",
    run: async () => {
      const res: ViesResult = await verifyUid("ATU12345678", {
        fetchImpl: mockOk({ something: "else" }),
      });
      assert.equal(res.status, "unavailable");
      assert.equal(res.detail, "unexpected_response");
    },
  },
];

async function main() {
  let failed = 0;
  for (const c of cases) {
    try {
      await c.run();
      console.log(`  ✓ ${c.name}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${c.name}`);
      console.error(err instanceof Error ? err.message : err);
    }
  }
  console.log(`\n${cases.length - failed}/${cases.length} passed`);
  if (failed > 0) process.exit(1);
}

main();
