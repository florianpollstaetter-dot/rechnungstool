// KIN-6650 — PDF aus einer Vorlage (src/lib/at-vorlagen/vorlagen.ts).
// Alle Platzhalter sind ausfüllbare Formularfelder: am Handy (iOS Dateien,
// Android-PDF-Viewer) und am Computer direkt ausfüllen, speichern, senden —
// oder leer ausdrucken und per Hand ausfüllen.

import { PDFDocument, PDFFont, PDFPage, PDFForm, StandardFonts, rgb, type RGB } from "pdf-lib";
import { FUSSZEILE, type Block, type Eingabefeld, type Vorlage } from "./vorlagen";

const A4: [number, number] = [595.28, 841.89];
const RAND = 42;
const ORANGE_RGB = rgb(0xe0 / 255, 0x78 / 255, 0x10 / 255);
const GRAU_RGB = rgb(0x6b / 255, 0x72 / 255, 0x80 / 255);
const LINIE_RGB = rgb(0xd1 / 255, 0xd5 / 255, 0xdb / 255);
const FELD_HG = rgb(0.98, 0.96, 0.93);
const SCHWARZ = rgb(0.1, 0.1, 0.12);

interface Ctx {
  doc: PDFDocument;
  form: PDFForm;
  page: PDFPage;
  font: PDFFont;
  fett: PDFFont;
  y: number;
  breite: number;
  hoehe: number;
  feldNr: number;
  vorlage: Vorlage;
}

function umbrechen(text: string, font: PDFFont, groesse: number, maxBreite: number): string[] {
  const zeilen: string[] = [];
  for (const absatz of text.split("\n")) {
    let zeile = "";
    for (const wort of absatz.split(" ")) {
      const probe = zeile ? `${zeile} ${wort}` : wort;
      if (font.widthOfTextAtSize(probe, groesse) > maxBreite && zeile) {
        zeilen.push(zeile);
        zeile = wort;
      } else zeile = probe;
    }
    zeilen.push(zeile);
  }
  return zeilen;
}

function text(c: Ctx, t: string, x: number, y: number, opt: { groesse?: number; farbe?: RGB; fett?: boolean; rechtsBis?: number } = {}) {
  const groesse = opt.groesse ?? 9.5;
  const font = opt.fett ? c.fett : c.font;
  const xx = opt.rechtsBis != null ? opt.rechtsBis - font.widthOfTextAtSize(t, groesse) : x;
  c.page.drawText(t, { x: xx, y, size: groesse, font, color: opt.farbe ?? SCHWARZ });
}

function feld(c: Ctx, name: string, x: number, y: number, w: number, h: number, opt: { rechts?: boolean; mehrzeilig?: boolean } = {}) {
  c.feldNr += 1;
  const f = c.form.createTextField(`${c.feldNr.toString().padStart(3, "0")}_${name}`.replace(/[^\w\-äöüÄÖÜß]/g, "_").slice(0, 60));
  if (opt.mehrzeilig) f.enableMultiline();
  f.addToPage(c.page, { x, y, width: w, height: h, font: c.font, backgroundColor: FELD_HG, borderWidth: 0 });
  f.setFontSize(opt.mehrzeilig ? 9 : 0); // 0 = automatisch
  if (opt.rechts) f.setAlignment(2);
}

/** Beschriftung klein über einem Eingabefeld. */
function feldMitLabel(c: Ctx, f: Eingabefeld, x: number, w: number) {
  text(c, f.label, x, c.y - 8, { groesse: 7, farbe: GRAU_RGB });
  feld(c, f.label, x, c.y - 24, w, 14);
  c.y -= 28;
}

function neueSeite(c: Ctx) {
  const [w, h] = c.vorlage.querformat ? [A4[1], A4[0]] : A4;
  c.page = c.doc.addPage([w, h]);
  c.breite = w;
  c.hoehe = h;
  c.y = h - RAND;
  // Fußzeile mit Produkthinweis
  text(c, c.vorlage.produktHinweis, RAND, RAND - 14, { groesse: 7.5, farbe: ORANGE_RGB });
  text(c, FUSSZEILE, RAND, RAND - 24, { groesse: 6.5, farbe: GRAU_RGB });
  c.page.drawLine({ start: { x: RAND, y: RAND - 4 }, end: { x: w - RAND, y: RAND - 4 }, thickness: 0.5, color: LINIE_RGB });
}

function zeichneBlock(c: Ctx, b: Block) {
  const innen = c.breite - 2 * RAND;
  switch (b.art) {
    case "kopf": {
      const start = c.y;
      text(c, b.titel, RAND, c.y - 20, { groesse: 20, fett: true, farbe: ORANGE_RGB });
      c.page.drawRectangle({ x: RAND, y: c.y - 30, width: 60, height: 3, color: ORANGE_RGB });
      let y = start;
      const xr = RAND + innen * 0.55;
      const wr = innen * 0.45;
      for (const f of b.absender) {
        text(c, f.label, xr, y - 7, { groesse: 6.5, farbe: GRAU_RGB });
        feld(c, f.label, xr, y - 21, wr, 13);
        y -= 25;
      }
      c.y = Math.min(c.y - 44, y - 12);
      return;
    }
    case "empfaenger": {
      const start = c.y;
      text(c, b.ueberschrift, RAND, c.y - 8, { groesse: 8, fett: true, farbe: GRAU_RGB });
      c.y -= 10;
      const wl = innen * 0.5;
      for (const f of b.felder) feldMitLabel(c, f, RAND, wl);
      const linksEnde = c.y;
      c.y = start;
      const xr = RAND + innen * 0.58;
      for (const f of b.daneben) feldMitLabel(c, f, xr, innen * 0.42);
      c.y = Math.min(linksEnde, c.y) - 12;
      return;
    }
    case "felder": {
      const n = b.felder.length;
      const spalten = n >= 3 ? 3 : n;
      const w = (innen - (spalten - 1) * 12) / spalten;
      const start = c.y;
      let tiefste = c.y;
      b.felder.forEach((f, i) => {
        if (i % spalten === 0 && i > 0) c.y = tiefste;
        const yZeile = c.y;
        feldMitLabel(c, f, RAND + (i % spalten) * (w + 12), w);
        tiefste = Math.min(tiefste, c.y);
        if (i % spalten !== spalten - 1) c.y = yZeile;
      });
      c.y = Math.min(tiefste, start - 28) - 8;
      return;
    }
    case "text": {
      const groesse = b.klein ? 7.5 : 9.5;
      for (const z of umbrechen(b.text, b.fett ? c.fett : c.font, groesse, innen)) {
        text(c, z, RAND, c.y - groesse, { groesse, fett: b.fett, farbe: b.klein ? GRAU_RGB : SCHWARZ });
        c.y -= groesse + 3.5;
      }
      c.y -= 8;
      return;
    }
    case "ankreuzen": {
      for (const o of b.optionen) {
        c.feldNr += 1;
        const cb = c.form.createCheckBox(`${c.feldNr.toString().padStart(3, "0")}_ankreuzen`);
        cb.addToPage(c.page, { x: RAND, y: c.y - 11, width: 10, height: 10, borderColor: SCHWARZ, borderWidth: 0.8 });
        const zeilen = umbrechen(o, c.font, 9, innen - 18);
        zeilen.forEach((z, i) => text(c, z, RAND + 16, c.y - 9 - i * 12, { groesse: 9 }));
        c.y -= 12 * zeilen.length + 6;
      }
      c.y -= 4;
      return;
    }
    case "unterschrift": {
      c.y -= 34;
      const n = b.felder.length;
      const w = (innen - (n - 1) * 30) / n;
      b.felder.forEach((t, i) => {
        const x = RAND + i * (w + 30);
        feld(c, t, x, c.y + 2, w, 18);
        c.page.drawLine({ start: { x, y: c.y }, end: { x: x + w, y: c.y }, thickness: 0.7, color: GRAU_RGB });
        text(c, t, x, c.y - 10, { groesse: 7, farbe: GRAU_RGB });
      });
      c.y -= 22;
      return;
    }
    case "tabelle": {
      const summe = b.spalten.reduce((s, x) => s + x.anteil, 0);
      const breiten = b.spalten.map((s) => (s.anteil / summe) * innen);
      const kopfH = 18;
      if (b.zeilen === 0) {
        // Nur Summenzeilen (z. B. Mahnung) — ohne Kopfzeile.
        c.y -= 4;
      } else {
        // Kopfzeile: Titel ggf. zweizeilig
        const kopfZeilen = b.spalten.map((s, i) => umbrechen(s.titel, c.fett, 7.5, breiten[i] - 6));
        const kh = Math.max(kopfH, 6 + 9 * Math.max(...kopfZeilen.map((z) => z.length)));
        c.page.drawRectangle({ x: RAND, y: c.y - kh, width: innen, height: kh, color: ORANGE_RGB });
        let x = RAND;
        b.spalten.forEach((s, i) => {
          kopfZeilen[i].forEach((z, j) =>
            text(c, z, x + 3, c.y - 11 - j * 9, { groesse: 7.5, fett: true, farbe: rgb(1, 1, 1), rechtsBis: s.rechts ? x + breiten[i] - 3 : undefined }),
          );
          x += breiten[i];
        });
        c.y -= kh;
        const zh = 17;
        for (let r = 0; r < b.zeilen; r++) {
          x = RAND;
          b.spalten.forEach((s, i) => {
            if (i === 0 && s.titel === "Pos.") text(c, String(r + 1), x + 3, c.y - 12, { groesse: 8, farbe: GRAU_RGB });
            else feld(c, `${s.titel}_${r + 1}`, x + 1.5, c.y - zh + 1.5, breiten[i] - 3, zh - 3, { rechts: s.rechts });
            x += breiten[i];
          });
          c.page.drawLine({ start: { x: RAND, y: c.y - zh }, end: { x: RAND + innen, y: c.y - zh }, thickness: 0.5, color: LINIE_RGB });
          c.y -= zh;
        }
      }
      c.y -= 6;
      if (b.summen?.length) {
        const wWert = innen * 0.25;
        b.summen.forEach((f, i) => {
          const letzte = i === b.summen!.length - 1;
          text(c, f.label, 0, c.y - 12, { groesse: 9, fett: letzte, rechtsBis: RAND + innen - wWert - 8 });
          feld(c, f.label, RAND + innen - wWert, c.y - 15, wWert, 15, { rechts: true });
          if (letzte) c.page.drawLine({ start: { x: RAND + innen - wWert, y: c.y - 17 }, end: { x: RAND + innen, y: c.y - 17 }, thickness: 1, color: ORANGE_RGB });
          c.y -= 19;
        });
      }
      c.y -= 10;
      return;
    }
  }
}

export async function vorlageAlsPdf(v: Vorlage): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(v.titel);
  doc.setSubject(v.beschreibung);
  doc.setAuthor("Orange Octo");
  doc.setCreator("orange-octo.com");
  doc.setLanguage("de-AT");
  const ctx: Ctx = {
    doc,
    form: doc.getForm(),
    page: undefined as unknown as PDFPage,
    font: await doc.embedFont(StandardFonts.Helvetica),
    fett: await doc.embedFont(StandardFonts.HelveticaBold),
    y: 0,
    breite: 0,
    hoehe: 0,
    feldNr: 0,
    vorlage: v,
  };
  for (const seite of v.seiten) {
    neueSeite(ctx);
    for (const b of seite) zeichneBlock(ctx, b);
  }
  ctx.form.updateFieldAppearances(ctx.font);
  return doc.save();
}
