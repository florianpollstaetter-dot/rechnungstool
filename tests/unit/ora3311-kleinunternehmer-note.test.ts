// ORA-3311 — Unit tests for the country-dependent Kleinunternehmer note.
//
// Run:
//   npx tsx tests/unit/ora3311-kleinunternehmer-note.test.ts
//
// Self-contained — no test framework, just plain assert.strict. Exits non-zero
// on any failure. Covers the country→paragraph mapping that decides which legal
// exemption text prints on Kleinunternehmer invoices and quotes (Point 1).

import assert from "node:assert/strict";

import { kleinunternehmerNote } from "../../src/lib/i18n";

interface Case {
  name: string;
  run: () => void;
}

const cases: Case[] = [
  {
    name: "AT (default region) → § 6 Abs. 1 Z 27 UStG",
    run: () => {
      const note = kleinunternehmerNote("AT", "de");
      assert.ok(note.includes("§ 6 Abs. 1 Z 27 UStG"), note);
      assert.ok(!note.includes("§ 19"), note);
    },
  },
  {
    name: "DE → § 19 UStG (German small-business paragraph)",
    run: () => {
      const note = kleinunternehmerNote("DE", "de");
      assert.ok(note.includes("§ 19 UStG"), note);
      assert.ok(!note.includes("§ 6 Abs. 1"), note);
    },
  },
  {
    name: "Lowercase / padded country code still maps to DE",
    run: () => {
      assert.ok(kleinunternehmerNote(" de ", "de").includes("§ 19 UStG"));
    },
  },
  {
    name: "Unknown / empty country falls back to Austrian note",
    run: () => {
      assert.ok(kleinunternehmerNote("", "de").includes("§ 6 Abs. 1 Z 27 UStG"));
      assert.ok(kleinunternehmerNote(undefined, "de").includes("§ 6 Abs. 1 Z 27 UStG"));
      assert.ok(kleinunternehmerNote("CH", "de").includes("§ 6 Abs. 1 Z 27 UStG"));
    },
  },
  {
    name: "English locale returns English wording for both countries",
    run: () => {
      assert.ok(kleinunternehmerNote("AT", "en").includes("VAT-exempt"));
      assert.ok(kleinunternehmerNote("DE", "en").toLowerCase().includes("no vat"));
    },
  },
];

let failed = 0;
for (const c of cases) {
  try {
    c.run();
    process.stdout.write(`ok  ${c.name}\n`);
  } catch (err) {
    failed += 1;
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`FAIL  ${c.name}\n  ${msg}\n`);
  }
}
process.stdout.write(`\n${cases.length - failed}/${cases.length} passed\n`);
if (failed > 0) process.exit(1);
