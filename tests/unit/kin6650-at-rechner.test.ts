// KIN-6650 — Rechner für die Ratgeberseiten /at/…: je drei Beispielrechnungen.
//
// Run:
//   npx tsx tests/unit/kin6650-at-rechner.test.ts

import assert from "node:assert/strict";
import { berechneSkonto } from "../../src/lib/at-rechner/skonto";
import { berechneUst } from "../../src/lib/at-rechner/ust";
import { berechneGewinnfreibetrag } from "../../src/lib/at-rechner/gewinnfreibetrag";
import { berechneVerzugszinsen } from "../../src/lib/at-rechner/verzugszinsen";
import { parseBetrag } from "../../src/lib/at-rechner/runden";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

// ── Skonto ───────────────────────────────────────────────────────────────────
check("Skonto 1: 1.000 €, 2 % / 10 Tage, netto 30 → 20 € Abzug, 36,73 % p. a.", () => {
  const r = berechneSkonto({ betrag: 1000, skontoProzent: 2, skontoTage: 10, zielTage: 30 });
  assert.equal(r.skontoBetrag, 20);
  assert.equal(r.zahlbetrag, 980);
  assert.equal(r.ustImSkonto, 3.33); // 20 × 20/120
  assert.equal(r.nettoImSkonto, 16.67);
  assert.equal(r.effektiverJahreszins, 36.73); // 2/98 × 360/20 (Artikel: rund 36,7 %)
});

check("Skonto 2: 2.500 €, 3 % / 14 Tage, netto 30 → 75 € Abzug, 69,59 % p. a.", () => {
  const r = berechneSkonto({ betrag: 2500, skontoProzent: 3, skontoTage: 14, zielTage: 30 });
  assert.equal(r.skontoBetrag, 75);
  assert.equal(r.zahlbetrag, 2425);
  assert.equal(r.effektiverJahreszins, 69.59); // 3/97 × 360/16
});

check("Skonto 3: Kleinunternehmer 119,99 €, 2 % / 7 Tage, netto 14 → keine USt im Skonto", () => {
  const r = berechneSkonto({ betrag: 119.99, skontoProzent: 2, skontoTage: 7, zielTage: 14, ustSatz: 0 });
  assert.equal(r.skontoBetrag, 2.4);
  assert.equal(r.zahlbetrag, 117.59);
  assert.equal(r.ustImSkonto, 0);
  assert.equal(r.effektiverJahreszins, 104.96); // 2/98 × 360/7
});

check("Skonto: Zahlungsziel = Skontofrist → kein Jahreszins", () => {
  assert.equal(berechneSkonto({ betrag: 100, skontoProzent: 2, skontoTage: 30, zielTage: 30 }).effektiverJahreszins, null);
});

// ── USt ──────────────────────────────────────────────────────────────────────
check("USt 1: 100 € netto, 20 % → 20 € USt, 120 € brutto", () => {
  assert.deepEqual(berechneUst(100, 20, "netto"), { netto: 100, ust: 20, brutto: 120 });
});

check("USt 2: 113 € brutto, 13 % → 100 € netto, 13 € USt", () => {
  assert.deepEqual(berechneUst(113, 13, "brutto"), { netto: 100, ust: 13, brutto: 113 });
});

check("USt 3: 49,90 € brutto, 4,9 % → 47,57 € netto, 2,33 € USt (Summe stimmt exakt)", () => {
  const r = berechneUst(49.9, 4.9, "brutto");
  assert.deepEqual(r, { netto: 47.57, ust: 2.33, brutto: 49.9 });
});

check("USt: 0 % → netto = brutto; 10 % von 59,99 netto", () => {
  assert.deepEqual(berechneUst(250, 0, "brutto"), { netto: 250, ust: 0, brutto: 250 });
  assert.deepEqual(berechneUst(59.99, 10, "netto"), { netto: 59.99, ust: 6, brutto: 65.99 });
});

check("USt: unbekannter Satz wirft", () => {
  assert.throws(() => berechneUst(100, 19, "netto"));
});

// ── Gewinnfreibetrag (Beispiele 1 und 2 = WKO-Beispiele 2026 aus dem Artikel) ─
check("GFB 1: Gewinn 20.000 €, Investition 1.000 € → 3.000 €, versteuert 17.000 €", () => {
  const r = berechneGewinnfreibetrag({ gewinn: 20_000, investitionen: 1_000 });
  assert.equal(r.grundfreibetrag, 3_000);
  assert.equal(r.investitionsbedingt, 0);
  assert.equal(r.gesamt, 3_000);
  assert.equal(r.steuerpflichtigerGewinn, 17_000);
});

check("GFB 2: Gewinn 53.000 €, Investition 2.000 € → 4.950 + 2.000 = 6.950 €, möglich wären 2.600 €", () => {
  const r = berechneGewinnfreibetrag({ gewinn: 53_000, investitionen: 2_000 });
  assert.equal(r.grundfreibetrag, 4_950);
  assert.equal(r.investitionsbedingtMoeglich, 2_600);
  assert.equal(r.investitionsbedingt, 2_000);
  assert.equal(r.gesamt, 6_950);
  assert.equal(r.steuerpflichtigerGewinn, 46_050);
  assert.equal(r.fehlendeInvestition, 600);
});

check("GFB 3: Gewinn 700.000 €, Investition 100.000 € → Höchstbetrag 46.400 €", () => {
  const r = berechneGewinnfreibetrag({ gewinn: 700_000, investitionen: 100_000 });
  assert.equal(r.investitionsbedingtMoeglich, 41_450); // 18.850 + 12.250 + 10.350
  assert.equal(r.gesamt, 46_400);
});

check("GFB: pauschaliert → nur Grundfreibetrag; Verlust → 0", () => {
  const p = berechneGewinnfreibetrag({ gewinn: 80_000, investitionen: 10_000, pauschaliert: true });
  assert.equal(p.gesamt, 4_950);
  assert.equal(p.investitionsbedingt, 0);
  assert.equal(berechneGewinnfreibetrag({ gewinn: -5_000, investitionen: 3_000 }).gesamt, 0);
});

check("GFB: Stufengrenze 178.000 € → 4.950 + 18.850", () => {
  assert.equal(berechneGewinnfreibetrag({ gewinn: 178_000, investitionen: 1e9 }).gesamt, 23_800);
});

// ── Verzugszinsen ────────────────────────────────────────────────────────────
check("Verzug 1: Unternehmer, 10.000 €, fällig 31.1.2026, bezahlt 2.3.2026 → 30 Tage × 10,73 % = 88,19 € + 40 €", () => {
  const r = berechneVerzugszinsen({ betrag: 10_000, faelligAm: "2026-01-31", bezahltAm: "2026-03-02", art: "unternehmer", mahnpauschale: true });
  assert.equal(r.tage, 30);
  assert.equal(r.abschnitte.length, 1);
  assert.equal(r.abschnitte[0].zinssatz, 10.73); // 1,53 + 9,2
  assert.equal(r.zinsen, 88.19);
  assert.equal(r.pauschale, 40);
  assert.equal(r.gesamt, 128.19);
});

check("Verzug 2: Privatperson, 5.000 €, fällig 15.3.2026, bezahlt 14.4.2026 → 30 Tage × 4 % = 16,44 €, keine Pauschale", () => {
  const r = berechneVerzugszinsen({ betrag: 5_000, faelligAm: "2026-03-15", bezahltAm: "2026-04-14", art: "privat", mahnpauschale: true });
  assert.equal(r.tage, 30);
  assert.equal(r.zinsen, 16.44);
  assert.equal(r.pauschale, 0);
  assert.equal(r.gesamt, 16.44);
});

check("Verzug 3: Unternehmer über den Halbjahreswechsel 2025 → 15 Tage 11,73 % + 15 Tage 10,73 %", () => {
  const r = berechneVerzugszinsen({ betrag: 2_000, faelligAm: "2025-06-15", bezahltAm: "2025-07-15", art: "unternehmer" });
  assert.equal(r.abschnitte.length, 2);
  assert.deepEqual(
    r.abschnitte.map((a) => [a.von, a.bis, a.tage, a.zinssatz]),
    [["2025-06-16", "2025-06-30", 15, 11.73], ["2025-07-01", "2025-07-15", 15, 10.73]],
  );
  assert.equal(r.zinsen, 18.46); // 9,6411 + 8,8192
  assert.equal(r.pauschale, 0);
});

check("Verzug: 2027 → vorläufiger Basiszinssatz 2,03 % (seit 16.09.2026)", () => {
  const r = berechneVerzugszinsen({ betrag: 1_000, faelligAm: "2026-12-31", bezahltAm: "2027-01-10", art: "unternehmer" });
  assert.equal(r.abschnitte[0].zinssatz, 11.23);
  assert.equal(r.abschnitte[0].vorlaeufig, true);
});

check("Verzug: Fehler bei Zahlung vor Fälligkeit und bei Daten vor 2022", () => {
  assert.throws(() => berechneVerzugszinsen({ betrag: 100, faelligAm: "2026-02-01", bezahltAm: "2026-01-01", art: "privat" }));
  assert.throws(() => berechneVerzugszinsen({ betrag: 100, faelligAm: "2021-02-01", bezahltAm: "2021-03-01", art: "unternehmer" }));
});

// ── Eingabe ──────────────────────────────────────────────────────────────────
check("parseBetrag: österreichische Schreibweisen", () => {
  assert.equal(parseBetrag("1.234,56"), 1234.56);
  assert.equal(parseBetrag("1234.56"), 1234.56);
  assert.equal(parseBetrag("12.500"), 12500);
  assert.equal(parseBetrag("€ 99,9"), 99.9);
  assert.equal(parseBetrag("abc"), null);
  assert.equal(parseBetrag(""), null);
});

console.log(`\n${passed} Tests bestanden.`);
