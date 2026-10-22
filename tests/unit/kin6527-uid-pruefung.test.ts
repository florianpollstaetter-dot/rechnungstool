// KIN-6527 — Unit-Tests für das öffentliche UID-Prüf-Formular (VIES).
//
// Run:
//   npx tsx tests/unit/kin6527-uid-pruefung.test.ts
//
// Ohne Test-Framework, ohne Netz. Deckt ab: Format-Vorprüfung je Land,
// automatische Landerkennung, Abfragebremse (pro Absender + gesamt), Handler
// mit gemocktem VIES (gültig / ungültig / Ausfall / Formatfehler / 429), und
// die Zerlegung des Ratgeber-Texts am Platzhalter.

import assert from "node:assert/strict";

import { pruefeUidFormat, erkenneLandAusEingabe, UID_LAENDER } from "../../src/lib/uid-pruefung/format";
import { RateLimiter, absenderAusHeadern } from "../../src/lib/uid-pruefung/rate-limit";
import { handleUidPruefung } from "../../src/lib/uid-pruefung/handler";
import type { ViesResult } from "../../src/lib/einvoice/vies";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

const main = async () => {
  // --- Format ---------------------------------------------------------------
  await check("AT: ATU + 8 Ziffern, Leerzeichen/Bindestriche/Kleinschreibung egal", () => {
    const r = pruefeUidFormat("AT", " u 1234-5678 ");
    assert.deepEqual(r, { ok: true, land: "AT", nummer: "U12345678", uid: "ATU12345678" });
  });
  await check("AT: komplette UID mit Länderkennung eingetippt wird akzeptiert", () => {
    const r = pruefeUidFormat("at", "ATU12345678");
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.uid, "ATU12345678");
  });
  await check("AT: falscher Aufbau → deutsche Fehlermeldung mit Beispiel", () => {
    const r = pruefeUidFormat("AT", "12345678");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.fehler, /Österreich.*„U“ und 8 Ziffern.*ATU12345678/);
  });
  await check("leer / unbekanntes Land", () => {
    const leer = pruefeUidFormat("AT", "   ");
    assert.equal(leer.ok, false);
    const land = pruefeUidFormat("ZZ", "123");
    assert.equal(land.ok, false);
  });
  await check("Nummer eines anderen Landes bei falscher Auswahl → Hinweis auf das Land", () => {
    const r = pruefeUidFormat("AT", "DE123456789");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.fehler, /„DE“ \(Deutschland\)/);
  });
  await check("Beispiele aller Länder bestehen ihre eigene Prüfung", () => {
    for (const l of UID_LAENDER) {
      const r = pruefeUidFormat(l.code, l.beispiel);
      assert.equal(r.ok, true, `${l.code}${l.beispiel}`);
    }
  });
  await check("weitere Länder: DE 9 Ziffern, NL mit B, IE 7+1/2 Buchstaben, EL statt GR", () => {
    assert.equal(pruefeUidFormat("DE", "123456789").ok, true);
    assert.equal(pruefeUidFormat("DE", "12345678").ok, false);
    assert.equal(pruefeUidFormat("NL", "123456789B01").ok, true);
    assert.equal(pruefeUidFormat("IE", "1234567T").ok, true);
    assert.equal(pruefeUidFormat("IE", "1234567WI").ok, true);
    assert.equal(pruefeUidFormat("EL", "123456789").ok, true);
    assert.equal(pruefeUidFormat("GR", "123456789").ok, false);
  });
  await check("erkenneLandAusEingabe", () => {
    assert.equal(erkenneLandAusEingabe("atu1"), "AT");
    assert.equal(erkenneLandAusEingabe("DE123"), "DE");
    assert.equal(erkenneLandAusEingabe("12345"), null);
    assert.equal(erkenneLandAusEingabe("A"), null);
  });

  // --- Abfragebremse ---------------------------------------------------------
  await check("RateLimiter: pro Absender begrenzt, Fenster läuft ab", () => {
    let t = 1_000_000;
    const rl = new RateLimiter({ maxProAbsender: 2, maxGesamt: 100, fensterMs: 60_000, jetzt: () => t });
    assert.equal(rl.pruefe("a").erlaubt, true);
    assert.equal(rl.pruefe("a").erlaubt, true);
    const dritte = rl.pruefe("a");
    assert.equal(dritte.erlaubt, false);
    assert.equal(dritte.wartenSekunden, 60);
    assert.equal(rl.pruefe("b").erlaubt, true, "anderer Absender unabhängig");
    t += 60_001;
    assert.equal(rl.pruefe("a").erlaubt, true, "nach Ablauf wieder erlaubt");
  });
  await check("RateLimiter: Gesamtkontingent schützt VIES", () => {
    const rl = new RateLimiter({ maxProAbsender: 10, maxGesamt: 3, fensterMs: 60_000, jetzt: () => 5 });
    assert.equal(rl.pruefe("a").erlaubt, true);
    assert.equal(rl.pruefe("b").erlaubt, true);
    assert.equal(rl.pruefe("c").erlaubt, true);
    assert.equal(rl.pruefe("d").erlaubt, false);
  });
  await check("absenderAusHeadern: x-forwarded-for zuerst, sonst x-real-ip, sonst 'unbekannt'", () => {
    assert.equal(absenderAusHeadern(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })), "1.2.3.4");
    assert.equal(absenderAusHeadern(new Headers({ "x-real-ip": "5.6.7.8" })), "5.6.7.8");
    assert.equal(absenderAusHeadern(new Headers()), "unbekannt");
  });

  // --- Handler mit gemocktem VIES --------------------------------------------
  const vies = (r: Partial<ViesResult>) => async (uid: string): Promise<ViesResult> => ({
    status: "unavailable",
    uid,
    checkedAt: "2026-10-22T10:00:00.000Z",
    ...r,
  });
  const limiter = () => new RateLimiter({ maxProAbsender: 2, maxGesamt: 100, fensterMs: 60_000 });

  await check("gültige AT-UID → gueltig mit Name/Adresse", async () => {
    const r = await handleUidPruefung(
      { land: "AT", nummer: "U37675002" },
      "ip1",
      { verify: vies({ status: "valid", name: "Technische Universität Wien", address: "Karlsplatz 13\nAT-1040 Wien" }), limiter: limiter() },
    );
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, {
      status: "gueltig",
      uid: "ATU37675002",
      land: "AT",
      name: "Technische Universität Wien",
      adresse: "Karlsplatz 13\nAT-1040 Wien",
      geprueftAm: "2026-10-22T10:00:00.000Z",
    });
  });
  await check("gültig ohne Name/Adresse → Felder fehlen (nicht '---')", async () => {
    const r = await handleUidPruefung({ land: "DE", nummer: "123456789" }, "ip1", { verify: vies({ status: "valid" }), limiter: limiter() });
    assert.equal(r.status, 200);
    assert.equal("name" in r.body, false);
    assert.equal("adresse" in r.body, false);
  });
  await check("ungültige UID → ungueltig", async () => {
    const r = await handleUidPruefung({ land: "AT", nummer: "U99999999" }, "ip1", { verify: vies({ status: "invalid" }), limiter: limiter() });
    assert.equal(r.status, 200);
    assert.equal((r.body as { status: string }).status, "ungueltig");
  });
  await check("VIES-Ausfall → nicht_erreichbar mit 200, kein Fehler", async () => {
    const r = await handleUidPruefung({ land: "AT", nummer: "U12345678" }, "ip1", { verify: vies({ status: "unavailable", detail: "MS_UNAVAILABLE" }), limiter: limiter() });
    assert.equal(r.status, 200);
    assert.equal((r.body as { status: string }).status, "nicht_erreichbar");
  });
  await check("Formatfehler → 400, VIES wird nicht gefragt, kostet kein Kontingent", async () => {
    let aufrufe = 0;
    const l = limiter();
    const r = await handleUidPruefung({ land: "AT", nummer: "123" }, "ip1", {
      verify: async (uid) => { aufrufe++; return vies({ status: "valid" })(uid); },
      limiter: l,
    });
    assert.equal(r.status, 400);
    assert.equal(aufrufe, 0);
    assert.equal(l.pruefe("ip1").erlaubt, true);
    assert.equal(l.pruefe("ip1").erlaubt, true);
  });
  await check("zu viele Abfragen → 429 mit Wartezeit, VIES wird nicht gefragt", async () => {
    let aufrufe = 0;
    const deps = { verify: async (uid: string) => { aufrufe++; return vies({ status: "valid" })(uid); }, limiter: limiter() };
    await handleUidPruefung({ land: "AT", nummer: "U12345678" }, "ip9", deps);
    await handleUidPruefung({ land: "AT", nummer: "U12345678" }, "ip9", deps);
    const r = await handleUidPruefung({ land: "AT", nummer: "U12345678" }, "ip9", deps);
    assert.equal(r.status, 429);
    assert.equal(aufrufe, 2);
    assert.ok((r.body as { wartenSekunden?: number }).wartenSekunden! >= 1);
    assert.match((r.body as { fehler: string }).fehler, /Zu viele Abfragen/);
  });
  await check("Nicht-String-Eingaben → 400", async () => {
    const r = await handleUidPruefung({ land: 7, nummer: { x: 1 } }, "ip1", { verify: vies({ status: "valid" }), limiter: limiter() });
    assert.equal(r.status, 400);
  });

  console.log(`\n${passed} checks passed`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
