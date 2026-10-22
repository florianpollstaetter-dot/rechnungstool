// KIN-6527 — Zerlegung des Ratgeber-Markdowns am Platzhalter {{UID_PRUEFFORMULAR}}.
//
// Run:
//   npx tsx tests/unit/kin6527-at-ratgeber.test.ts

import assert from "node:assert/strict";
import { renderAbschnitte } from "../../src/lib/at-ratgeber";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

check("Platzhalter wird zum Baustein, Text davor/danach zu HTML, H1 entfällt", () => {
  const a = renderAbschnitte("# Titel\n\nIntro.\n\n{{UID_PRUEFFORMULAR}}\n\n## Danach\n\nText.");
  assert.equal(a.length, 3);
  assert.equal(a[0].art, "html");
  assert.match((a[0] as { html: string }).html, /<p>Intro\.<\/p>/);
  assert.doesNotMatch((a[0] as { html: string }).html, /<h1>/);
  assert.deepEqual(a[1], { art: "baustein", name: "UID_PRUEFFORMULAR" });
  assert.match((a[2] as { html: string }).html, /<h2>Danach<\/h2>/);
});

check("ohne Platzhalter: ein HTML-Abschnitt", () => {
  const a = renderAbschnitte("Nur Text.");
  assert.equal(a.length, 1);
  assert.equal(a[0].art, "html");
});

check("unbekannter Platzhalter bleibt Text, Script wird entfernt", () => {
  const a = renderAbschnitte("{{IRGENDWAS}} <script>alert(1)</script> ok");
  assert.equal(a.length, 1);
  const html = (a[0] as { html: string }).html;
  assert.match(html, /\{\{IRGENDWAS\}\}/);
  assert.doesNotMatch(html, /<script/);
});

check("externe Links öffnen in neuem Tab, interne nicht", () => {
  const a = renderAbschnitte("[extern](https://ec.europa.eu/x) und [intern](/at/honorarnote)");
  const html = (a[0] as { html: string }).html;
  assert.match(html, /href="https:\/\/ec\.europa\.eu\/x"[^>]*target="_blank"/);
  assert.doesNotMatch(html, /href="\/at\/honorarnote"[^>]*target/);
});

console.log(`\n${passed} checks passed`);
