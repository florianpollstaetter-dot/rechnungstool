// KIN-6649 — Magazin: Freischaltung nach Wiener Kalendertag, Rubriken,
// „Mehr aus dem Magazin“, UTM-Link, Strukturdaten, IndexNow, Cron-Konfiguration.
//
// Run:
//   npx tsx tests/unit/kin6649-magazin.test.ts

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  atArticleJsonLd,
  atBreadcrumbJsonLd,
  getHeuteErscheinendeAtSeiten,
  getVeroeffentlichteAtSeiten,
  heuteInWien,
  istVeroeffentlicht,
  mehrAusDemMagazin,
  registrierungsLink,
  rubrikAus,
  RUBRIKEN,
  type AtSeite,
} from "../../src/lib/at-ratgeber";
import { INDEXNOW_KEY, indexNowPayload, meldeIndexNow } from "../../src/lib/magazin/indexnow";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

function seite(slug: string, rubrik: string, publishedAt: string | null = "2026-10-01"): AtSeite {
  return {
    slug, title: slug, h1: slug.toUpperCase(), metaDescription: "", publishedAt, updatedAt: null,
    category: null, rubrik: rubrikAus(rubrik, null), excerpt: "", faqSchema: false, body: "",
  };
}

async function main() {
  await check("heuteInWien: Wiener Kalendertag, nicht UTC", () => {
    // 23:30 UTC am 24.10. (Sommerzeit, UTC+2) ist in Wien schon der 25.10.
    assert.equal(heuteInWien(new Date("2026-10-24T23:30:00Z")), "2026-10-25");
    // 22:30 UTC am 30.10. (Winterzeit, UTC+1) ist in Wien 23:30 am 30.10.
    assert.equal(heuteInWien(new Date("2026-10-30T22:30:00Z")), "2026-10-30");
  });

  await check("Artikel mit publishedAt = morgen ist heute unsichtbar und morgen live", () => {
    const morgen = seite("test", "Rechnungen schreiben", "2026-10-25");
    assert.equal(istVeroeffentlicht(morgen, "2026-10-24"), false);
    assert.equal(istVeroeffentlicht(morgen, "2026-10-25"), true);
    assert.equal(istVeroeffentlicht(morgen, "2026-10-26"), true);
    assert.equal(istVeroeffentlicht(seite("entwurf", "x", null), "2099-01-01"), false);
  });

  await check("echte Inhalte: keine Zukunfts-Seite in Sitemap/Vorrendern, Cron findet Tagesseiten", async () => {
    const heute = heuteInWien();
    const live = await getVeroeffentlichteAtSeiten();
    assert.ok(live.every((s) => s.publishedAt != null && s.publishedAt.slice(0, 10) <= heute));
    const uid = await getHeuteErscheinendeAtSeiten("2026-10-23");
    assert.ok(uid.some((s) => s.slug === "uid-nummer-pruefen"));
  });

  await check("Rubrik aus Front-Matter, sonst aus category abgeleitet", () => {
    assert.equal(rubrikAus("Vorlagen und Rechner", "Steuern").slug, "vorlagen-und-rechner");
    assert.equal(rubrikAus("rechnungsprogramme-im-vergleich", null).name, "Rechnungsprogramme im Vergleich");
    assert.equal(rubrikAus(null, "Steuern").slug, "steuern-und-abgaben");
    assert.equal(rubrikAus(null, "Umsatzsteuer").slug, "steuern-und-abgaben");
    assert.equal(rubrikAus(null, "Registrierkasse").slug, "steuern-und-abgaben");
    assert.equal(rubrikAus(null, "E-Rechnung").slug, "rechnungen-schreiben");
    assert.equal(rubrikAus("Unbekannt", null).slug, "rechnungen-schreiben");
    assert.equal(RUBRIKEN.length, 4);
  });

  await check("Mehr aus dem Magazin: 3 Artikel, dieselbe Rubrik zuerst, ohne den aktuellen", () => {
    const a = seite("a", "Rechnungen schreiben");
    const alle = [a, seite("s1", "Steuern und Abgaben"), seite("r1", "Rechnungen schreiben"), seite("s2", "Steuern und Abgaben"), seite("r2", "Rechnungen schreiben")];
    assert.deepEqual(mehrAusDemMagazin(a, alle).map((s) => s.slug), ["r1", "r2", "s1"]);
    assert.deepEqual(mehrAusDemMagazin(a, [a]), []);
  });

  await check("Orange-Octo-Kasten: Registrierung mit UTM je Artikel", () => {
    assert.equal(registrierungsLink("uid-nummer-pruefen"), "/register?utm_source=magazin&utm_campaign=uid-nummer-pruefen");
  });

  await check("BreadcrumbList Magazin › Rubrik › Artikel und Article-Schema", () => {
    const s = { ...seite("honorarnote", "Rechnungen schreiben"), updatedAt: "2026-10-23" };
    const b = atBreadcrumbJsonLd(s) as { itemListElement: { name: string; item: string }[] };
    assert.deepEqual(b.itemListElement.map((x) => x.name), ["Magazin", "Rechnungen schreiben", "HONORARNOTE"]);
    assert.match(b.itemListElement[2].item, /\/at\/honorarnote$/);
    const art = atArticleJsonLd(s) as Record<string, unknown>;
    assert.equal(art["@type"], "Article");
    assert.equal(art.datePublished, "2026-10-01");
    assert.equal(art.dateModified, "2026-10-23");
  });

  await check("IndexNow: Schlüsseldatei vorhanden, Payload korrekt, leere Liste meldet nichts", async () => {
    assert.equal(readFileSync(`public/${INDEXNOW_KEY}.txt`, "utf8").trim(), INDEXNOW_KEY);
    const p = indexNowPayload("https://orange-octo.com", ["https://orange-octo.com/at/x"]);
    assert.equal(p.host, "orange-octo.com");
    assert.equal(p.keyLocation, `https://orange-octo.com/${INDEXNOW_KEY}.txt`);
    let aufgerufen = 0;
    const fake = (async () => { aufgerufen += 1; return new Response("", { status: 202 }); }) as typeof fetch;
    assert.deepEqual(await meldeIndexNow("https://orange-octo.com", [], fake), { gemeldet: [], status: null });
    assert.equal(aufgerufen, 0);
    const r = await meldeIndexNow("https://orange-octo.com", ["https://orange-octo.com/at/x"], fake);
    assert.equal(r.status, 202);
    assert.equal(aufgerufen, 1);
  });

  await check("Cron täglich in vercel.json, Route öffentlich (CRON_SECRET prüft selbst)", async () => {
    const v = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
    const c = v.crons.find((x) => x.path === "/api/cron/magazin-freischaltung");
    assert.ok(c);
    assert.equal(c!.schedule, "0 5 * * *");
    const { isPublicApiPath } = await import("../../src/lib/auth/api-access-policy");
    assert.equal(isPublicApiPath("/api/cron/magazin-freischaltung"), true);
  });

  console.log(`\n${passed} passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
