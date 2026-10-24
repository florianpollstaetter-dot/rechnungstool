// KIN-6650 — Word-Datei (.docx) aus einer Vorlage (src/lib/at-vorlagen/vorlagen.ts).
// Platzhalter stehen grau in eckigen Klammern und werden beim Ausfüllen überschrieben.

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
} from "docx";
import { FUSSZEILE, GRAU, ORANGE, type Block, type Eingabefeld, type Vorlage } from "./vorlagen";

const SCHRIFT = "Arial";
const OHNE_RAND = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};
const LINIE = { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" };
const ZELLRAND = { top: LINIE, bottom: LINIE, left: LINIE, right: LINIE };

function lauf(text: string, opt: { fett?: boolean; farbe?: string; groesse?: number; kursiv?: boolean } = {}) {
  return new TextRun({
    text,
    font: SCHRIFT,
    bold: opt.fett,
    italics: opt.kursiv,
    color: opt.farbe,
    size: (opt.groesse ?? 10) * 2,
  });
}

function absatz(kinder: TextRun[], opt: Partial<IParagraphOptions> = {}) {
  return new Paragraph({ children: kinder, spacing: { after: 60 }, ...opt });
}

function platzhalter(f: Eingabefeld) {
  return lauf(`[${f.platzhalter}]`, { farbe: GRAU });
}

/** Feld als „Label: [Platzhalter]“ in einer Zeile. */
function feldZeile(f: Eingabefeld, rechts = false) {
  return absatz([lauf(`${f.label}: `, { farbe: GRAU, groesse: 8 }), platzhalter(f)], {
    alignment: rechts ? AlignmentType.RIGHT : AlignmentType.LEFT,
  });
}

function zelle(kinder: Paragraph[], breite: number, opt: { kopf?: boolean; rand?: boolean } = {}) {
  return new TableCell({
    children: kinder,
    width: { size: breite, type: WidthType.PERCENTAGE },
    borders: opt.rand === false ? OHNE_RAND : ZELLRAND,
    shading: opt.kopf ? { type: ShadingType.CLEAR, color: "auto", fill: ORANGE } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  });
}

function zweiSpalten(links: Paragraph[], rechts: Paragraph[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...OHNE_RAND, insideHorizontal: OHNE_RAND.top, insideVertical: OHNE_RAND.top },
    rows: [new TableRow({ children: [zelle(links, 55, { rand: false }), zelle(rechts, 45, { rand: false })] })],
  });
}

function blockZuDocx(b: Block): (Paragraph | Table)[] {
  switch (b.art) {
    case "kopf":
      return [
        zweiSpalten(
          [absatz([lauf(b.titel, { fett: true, farbe: ORANGE, groesse: 20 })])],
          b.absender.map((f) => absatz([platzhalter(f)], { alignment: AlignmentType.RIGHT, spacing: { after: 0 } })),
        ),
        absatz([], { spacing: { after: 200 } }),
      ];
    case "empfaenger":
      return [
        zweiSpalten(
          [
            absatz([lauf(b.ueberschrift, { farbe: GRAU, groesse: 8 })]),
            ...b.felder.map((f) => absatz([platzhalter(f)], { spacing: { after: 0 } })),
            ...b.felder.filter((f) => f.pflicht?.includes("j")).map((f) =>
              absatz([lauf(f.label, { farbe: GRAU, groesse: 7, kursiv: true })]),
            ),
          ],
          b.daneben.map((f) => feldZeile(f, true)),
        ),
        absatz([], { spacing: { after: 200 } }),
      ];
    case "felder":
      return [...b.felder.map((f) => feldZeile(f)), absatz([], { spacing: { after: 120 } })];
    case "text":
      return [
        absatz([lauf(b.text, { fett: b.fett, groesse: b.klein ? 8 : 10, farbe: b.klein ? GRAU : undefined })], {
          spacing: { after: 160 },
        }),
      ];
    case "ankreuzen":
      return b.optionen.map((o) => absatz([lauf("☐  ", { groesse: 12 }), lauf(o)], { spacing: { after: 100 } }));
    case "unterschrift":
      return [
        absatz([], { spacing: { after: 400 } }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: b.felder.map((t) =>
                new TableCell({
                  children: [absatz([lauf(t, { farbe: GRAU, groesse: 8 })])],
                  borders: { ...OHNE_RAND, top: { style: BorderStyle.SINGLE, size: 6, color: "6B7280" } },
                  margins: { right: 400 },
                }),
              ),
            }),
          ],
        }),
        absatz([], { spacing: { after: 200 } }),
      ];
    case "tabelle": {
      const summe = b.spalten.reduce((s, x) => s + x.anteil, 0);
      const breite = (a: number) => Math.round((a / summe) * 100);
      const kopf = new TableRow({
        tableHeader: true,
        children: b.spalten.map((s) =>
          zelle(
            [absatz([lauf(s.titel, { fett: true, farbe: "FFFFFF", groesse: 8 })], { alignment: s.rechts ? AlignmentType.RIGHT : AlignmentType.LEFT, spacing: { after: 0 } })],
            breite(s.anteil),
            { kopf: true },
          ),
        ),
      });
      const leer = Array.from({ length: b.zeilen }, (_, i) =>
        new TableRow({
          children: b.spalten.map((s, j) =>
            zelle(
              [absatz(j === 0 && b.spalten[0].titel === "Pos." ? [lauf(String(i + 1), { farbe: GRAU })] : [lauf("")], { spacing: { after: 0 } })],
              breite(s.anteil),
            ),
          ),
        }),
      );
      const out: (Paragraph | Table)[] =
        b.zeilen > 0 ? [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [kopf, ...leer] })] : [];
      if (b.summen?.length) {
        out.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: b.summen.map((f, i) =>
              new TableRow({
                children: [
                  zelle([absatz([lauf(f.label, { fett: i === b.summen!.length - 1 })], { alignment: AlignmentType.RIGHT, spacing: { after: 0 } })], 70, { rand: false }),
                  zelle([absatz([platzhalter(f)], { alignment: AlignmentType.RIGHT, spacing: { after: 0 } })], 30),
                ],
              }),
            ),
          }),
        );
      }
      out.push(absatz([], { spacing: { after: 200 } }));
      return out;
    }
  }
}

export async function vorlageAlsDocx(v: Vorlage): Promise<Buffer> {
  const fuss = new Footer({
    children: [
      absatz([lauf(v.produktHinweis, { farbe: ORANGE, groesse: 8 })], { alignment: AlignmentType.CENTER, spacing: { after: 0 } }),
      absatz([lauf(FUSSZEILE, { farbe: GRAU, groesse: 7 })], { alignment: AlignmentType.CENTER }),
    ],
  });
  const doc = new Document({
    creator: "Orange Octo",
    title: v.titel,
    description: `${v.beschreibung} — Vorlage von orange-octo.com`,
    styles: { default: { document: { run: { font: SCHRIFT, size: 20 } } } },
    sections: v.seiten.map((seite) => ({
      properties: {
        page: {
          size: v.querformat ? { orientation: PageOrientation.LANDSCAPE, width: 11906, height: 16838 } : undefined,
          margin: { top: 900, bottom: 900, left: 1000, right: 1000 },
        },
      },
      footers: { default: fuss },
      children: seite.flatMap(blockZuDocx),
    })),
  });
  return Packer.toBuffer(doc);
}
