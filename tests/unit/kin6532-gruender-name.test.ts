// KIN-6532 — Textbaustein {{GRUENDER_NAME}} auf den Ratgeberseiten /at/….
//
// Run:
//   npx tsx tests/unit/kin6532-gruender-name.test.ts

import assert from "node:assert/strict";
import { atFaqJsonLd, ersetzeTextbausteine, getVeroeffentlichteAtSeiten, renderAbschnitte, GRUENDER_NAME } from "../../src/lib/at-ratgeber";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

const SATZ = "Orange Octo ist eine österreichische GmbH, der Gründer ist Jurist ({{GRUENDER_NAME}}). Die Seite ersetzt keine Steuerberatung.";

check("Name unbekannt: Platzhalter und leere Klammer entfallen", () => {
  assert.equal(
    ersetzeTextbausteine(SATZ, { GRUENDER_NAME: null }),
    "Orange Octo ist eine österreichische GmbH, der Gründer ist Jurist. Die Seite ersetzt keine Steuerberatung.",
  );
});

check("Name bekannt: steht in der Klammer", () => {
  assert.equal(
    ersetzeTextbausteine(SATZ, { GRUENDER_NAME: "Max Muster" }),
    "Orange Octo ist eine österreichische GmbH, der Gründer ist Jurist (Max Muster). Die Seite ersetzt keine Steuerberatung.",
  );
});

check("Platzhalter ohne Klammer wird direkt ersetzt bzw. entfernt", () => {
  assert.equal(ersetzeTextbausteine("Von {{GRUENDER_NAME}} geprüft.", { GRUENDER_NAME: "Max Muster" }), "Von Max Muster geprüft.");
  assert.equal(ersetzeTextbausteine("Von {{GRUENDER_NAME}} geprüft.", { GRUENDER_NAME: null }), "Von  geprüft.");
});

check("renderAbschnitte: kein {{ und keine leere Klammer im HTML, Standardwert greift", () => {
  const a = renderAbschnitte(SATZ);
  const html = (a[0] as { html: string }).html;
  assert.doesNotMatch(html, /\{\{/);
  assert.doesNotMatch(html, /\(\s*\)/);
  if (GRUENDER_NAME) assert.match(html, new RegExp(`Jurist \\(${GRUENDER_NAME}\\)\\.`));
  else assert.match(html, /Jurist\. Die Seite/);
});

check("renderAbschnitte: Name per Option, Formular-Baustein bleibt erhalten", () => {
  const a = renderAbschnitte(`${SATZ}\n\n{{UID_PRUEFFORMULAR}}\n\nEnde.`, { textbausteine: { GRUENDER_NAME: "Max Muster" } });
  assert.equal(a.length, 3);
  assert.match((a[0] as { html: string }).html, /Jurist \(Max Muster\)\./);
  assert.deepEqual(a[1], { art: "baustein", name: "UID_PRUEFFORMULAR" });
});

void (async () => {
  const seiten = await getVeroeffentlichteAtSeiten();
  check("FAQ-Daten für Google (JSON-LD): kein {{ und keine leere Klammer auf veröffentlichten Seiten", () => {
    assert.ok(seiten.length > 0);
    for (const seite of seiten) {
      const json = JSON.stringify(atFaqJsonLd(seite) ?? {});
      assert.doesNotMatch(json, /\{\{/, seite.slug);
      assert.doesNotMatch(json, /\(\s*\)/, seite.slug);
    }
  });

  console.log(`\n${passed} checks passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
