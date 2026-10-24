// KIN-6650 — Vorlagen zum Download: Pflichtangaben nach § 11 UStG, Dateien
// werden erzeugt, Bausteine im Ratgeber-Renderer.
//
// Run:
//   npx tsx tests/unit/kin6650-at-vorlagen.test.ts

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { PDFDocument } from "pdf-lib";
import {
  VORLAGEN,
  abgedecktePflichtAngaben,
  findeVorlageNachBaustein,
  type Pflichtangabe,
} from "../../src/lib/at-vorlagen/vorlagen";
import { vorlageAlsDocx } from "../../src/lib/at-vorlagen/docx";
import { vorlageAlsPdf } from "../../src/lib/at-vorlagen/pdf";
import { renderAbschnitte } from "../../src/lib/at-ratgeber";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

const ALLE: Pflichtangabe[] = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
// Kleinunternehmer: keine Steuer (f) — stattdessen Befreiungshinweis; UID des Empfängers (j)
// nur relevant bei Rechnungen mit Vorsteuerabzug über 10.000 €.
const KU: Pflichtangabe[] = ["a", "b", "c", "d", "e", "g", "h", "i"];

function texte(v: (typeof VORLAGEN)[number]): string {
  return JSON.stringify(v.seiten);
}

(async () => {
  await check("8 geforderte Vorlagen + 3 Zusatzvarianten vorhanden, Dateinamen eindeutig", () => {
    for (const b of [
      "RECHNUNG", "HONORARNOTE_MIT_UST", "HONORARNOTE_KLEINUNTERNEHMER", "STUNDENZETTEL",
      "FAHRTENBUCH", "LIEFERSCHEIN", "ZAHLUNGSERINNERUNG", "KOSTENVORANSCHLAG",
    ]) assert.ok(findeVorlageNachBaustein(`DOWNLOAD_${b}`), b);
    assert.equal(new Set(VORLAGEN.map((v) => v.datei)).size, VORLAGEN.length);
  });

  for (const b of ["RECHNUNG", "HONORARNOTE_MIT_UST"]) {
    await check(`${b}: alle Pflichtangaben § 11 Abs. 1 Z 3 lit. a–j`, () => {
      const v = findeVorlageNachBaustein(`DOWNLOAD_${b}`)!;
      const da = abgedecktePflichtAngaben(v);
      for (const p of ALLE) assert.ok(da.has(p), `fehlt lit. ${p}`);
      assert.match(texte(v), /20 % USt/);
    });
  }

  await check("RECHNUNG_KLEINBETRAG: Angaben nach § 11 Abs. 6 UStG (a, c, d, e mit Steuer in einer Summe, f Steuersatz, g)", () => {
    const v = findeVorlageNachBaustein("DOWNLOAD_RECHNUNG_KLEINBETRAG")!;
    const da = abgedecktePflichtAngaben(v);
    for (const p of ["a", "c", "d", "e", "f", "g"] as Pflichtangabe[]) assert.ok(da.has(p), `fehlt lit. ${p}`);
    assert.match(texte(v), /§ 11 Abs\. 6 UStG/);
  });

  await check("Jeder {{DOWNLOAD_…}}-Platzhalter in content/at/*.md hat eine Vorlage", () => {
    const dir = path.join(process.cwd(), "content", "at");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".md") && x !== "README.md")) {
      const { content } = matter(readFileSync(path.join(dir, f), "utf8"));
      for (const m of content.matchAll(/\{\{\s*(DOWNLOAD_[A-Z_]+)\s*\}\}/g)) {
        assert.ok(findeVorlageNachBaustein(m[1]), `${f}: ${m[1]} hat keine Vorlage`);
      }
    }
  });

  for (const b of ["RECHNUNG_KLEINUNTERNEHMER", "HONORARNOTE_KLEINUNTERNEHMER"]) {
    await check(`${b}: Pflichtangaben + Befreiungshinweis § 6 Abs. 1 Z 27, keine USt-Zeile`, () => {
      const v = findeVorlageNachBaustein(`DOWNLOAD_${b}`)!;
      const da = abgedecktePflichtAngaben(v);
      for (const p of KU) assert.ok(da.has(p), `fehlt lit. ${p}`);
      assert.match(texte(v), /§ 6 Abs\. 1 Z 27 UStG/);
      assert.doesNotMatch(texte(v), /zzgl\. 20 % USt/);
    });
  }

  for (const v of VORLAGEN) {
    await check(`${v.datei}: Word und PDF werden erzeugt, PDF hat ausfüllbare Felder und Produkthinweis`, async () => {
      const docx = await vorlageAlsDocx(v);
      assert.equal(docx.subarray(0, 2).toString(), "PK"); // ZIP/OOXML
      assert.ok(docx.length > 5_000);
      const pdf = await vorlageAlsPdf(v);
      const geladen = await PDFDocument.load(pdf);
      assert.equal(geladen.getPageCount(), v.seiten.length);
      assert.ok(geladen.getForm().getFields().length >= 5);
      assert.match(v.produktHinweis, /Orange Octo/);
    });
  }

  await check("Renderer: Rechner- und Download-Platzhalter werden Bausteine, unbekannte entfallen", () => {
    const a = renderAbschnitte(
      "Text\n\n{{SKONTO_RECHNER}}\n\n{{GFB_RECHNER}}\n\n{{DOWNLOAD_HONORARNOTE_MIT_UST}}\n\n{{DOWNLOAD_GIBTSNICHT}}\n\nEnde",
    );
    const bausteine = a.filter((x) => x.art === "baustein").map((x) => (x as { name: string }).name);
    assert.deepEqual(bausteine, ["SKONTO_RECHNER", "GFB_RECHNER", "DOWNLOAD_HONORARNOTE_MIT_UST"]);
    assert.doesNotMatch(a.map((x) => ("html" in x ? x.html : "")).join(""), /\{\{/);
  });

  console.log(`\n${passed} Tests bestanden.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
