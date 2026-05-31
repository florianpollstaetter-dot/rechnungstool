// ORA-2307 — Unit tests for the DSGVO IBAN mask.

import assert from "node:assert/strict";

import { maskIban } from "../../src/lib/treasury/iban-mask";

function test_masks_six_middle_chars_of_at_iban(): void {
  // AT IBAN is 20 chars → 14 visible, 6 starred.
  const out = maskIban("AT611904300234573201");
  assert.equal(out.length, 20);
  assert.equal((out.match(/\*/g) ?? []).length, 6);
  assert.ok(out.startsWith("AT61"), `head leaks: ${out}`);
  assert.ok(out.endsWith("3201"), `tail leaks: ${out}`);
}

function test_masks_six_middle_chars_of_de_iban(): void {
  const out = maskIban("DE89370400440532013000");
  assert.equal(out.length, 22);
  assert.equal((out.match(/\*/g) ?? []).length, 6);
  assert.ok(out.startsWith("DE89"));
  assert.ok(out.endsWith("3000"));
}

function test_normalizes_whitespace_and_case(): void {
  const out = maskIban("at61 1904 3002 3457 3201");
  assert.ok(/^AT/.test(out));
  assert.ok(out.endsWith("3201"));
  assert.equal((out.match(/\*/g) ?? []).length, 6);
}

function test_empty_returns_empty(): void {
  assert.equal(maskIban(""), "");
  assert.equal(maskIban(null), "");
  assert.equal(maskIban(undefined), "");
}

function test_pathological_short_input_fully_redacted(): void {
  // 8 chars is below the (mask + 4 visible) threshold → redact wholly.
  assert.equal(maskIban("AT123456"), "********");
  assert.equal(maskIban("X"), "*");
}

const tests: Array<[string, () => void]> = [
  ["masks_six_middle_chars_of_at_iban", test_masks_six_middle_chars_of_at_iban],
  ["masks_six_middle_chars_of_de_iban", test_masks_six_middle_chars_of_de_iban],
  ["normalizes_whitespace_and_case", test_normalizes_whitespace_and_case],
  ["empty_returns_empty", test_empty_returns_empty],
  ["pathological_short_input_fully_redacted", test_pathological_short_input_fully_redacted],
];

let passed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`  ok  ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  FAIL ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} iban-mask tests passed`);
