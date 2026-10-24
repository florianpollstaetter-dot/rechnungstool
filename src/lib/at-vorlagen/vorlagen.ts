// KIN-6650 — Vorlagen zum Download für die Ratgeberseiten /at/… (Word + PDF).
//
// Jede Vorlage ist hier einmal als Datenmodell beschrieben; daraus erzeugen
// docx.ts (Word, Platzhalter in eckigen Klammern) und pdf.ts (PDF mit
// ausfüllbaren Feldern) die Dateien. Ausgeliefert über
// src/app/at/vorlagen/[datei]/route.ts — erst, wenn ein veröffentlichter
// Artikel den passenden Baustein {{DOWNLOAD_…}} enthält.
//
// Pflichtangaben einer Rechnung: § 11 Abs. 1 Z 3 UStG 1994
// (RIS: https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10004873&Paragraf=11):
//   a) Name und Anschrift des liefernden/leistenden Unternehmers
//   b) Name und Anschrift des Empfängers
//   c) Menge und handelsübliche Bezeichnung / Art und Umfang der Leistung
//   d) Tag oder Zeitraum der Lieferung/Leistung
//   e) Entgelt, nach Steuersätzen getrennt
//   f) anzuwendender Steuersatz und Steuerbetrag (bzw. Hinweis auf Steuerbefreiung)
//   g) Ausstellungsdatum
//   h) fortlaufende Nummer
//   i) UID-Nummer des leistenden Unternehmers
//   j) UID-Nummer des Empfängers bei Rechnungen über 10.000 € brutto
// Kleinunternehmer (§ 6 Abs. 1 Z 27 UStG): keine USt ausweisen, Hinweis auf die Befreiung.
// Die Feldnamen unten tragen die Kennung (§ 11 lit. a–j), damit der Unit-Test
// kin6650-at-vorlagen.test.ts die Vollständigkeit prüfen kann.

export type Pflichtangabe = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j";

export interface Eingabefeld {
  label: string;
  /** Platzhaltertext in Word, z. B. „Firmenname“ → „[Firmenname]“. */
  platzhalter: string;
  /** Welche Pflichtangabe nach § 11 UStG das Feld abdeckt. */
  pflicht?: Pflichtangabe[];
}

export interface Spalte {
  titel: string;
  /** relative Breite */
  anteil: number;
  rechts?: boolean;
}

export type Block =
  | { art: "kopf"; titel: string; absender: Eingabefeld[] }
  | { art: "empfaenger"; ueberschrift: string; felder: Eingabefeld[]; daneben: Eingabefeld[] }
  | { art: "felder"; felder: Eingabefeld[] }
  | { art: "text"; text: string; klein?: boolean; fett?: boolean }
  | { art: "tabelle"; spalten: Spalte[]; zeilen: number; pflicht?: Pflichtangabe[]; summen?: Eingabefeld[] }
  | { art: "ankreuzen"; optionen: string[] }
  | { art: "unterschrift"; felder: string[] };

export interface Vorlage {
  /** Name des Bausteins ohne „DOWNLOAD_“, z. B. „RECHNUNG“ → {{DOWNLOAD_RECHNUNG}}. */
  baustein: string;
  /** Dateiname ohne Endung, URL /at/vorlagen/<datei>.pdf|.docx */
  datei: string;
  titel: string;
  beschreibung: string;
  /** Artikel, in dem die Vorlage hauptsächlich steht (Info für Redaktion und Download-Kasten). */
  artikel: string;
  querformat?: boolean;
  seiten: Block[][];
  /** Text für den Hinweis „schneller direkt in Orange Octo“. */
  produktHinweis: string;
}

export const ORANGE = "E07810"; // --brand-orange (hell), src/app/globals.css
export const GRAU = "6B7280";
export const VORLAGEN_STAND = "24.10.2026";
export const FUSSZEILE = "Kostenlose Vorlage von Orange Octo · Schneller geht es direkt in Orange Octo: orange-octo.com/at";

const ABSENDER: Eingabefeld[] = [
  { label: "Firmenname / Vor- und Nachname", platzhalter: "Dein Firmenname", pflicht: ["a"] },
  { label: "Straße und Hausnummer", platzhalter: "Straße 1", pflicht: ["a"] },
  { label: "PLZ und Ort", platzhalter: "1010 Wien", pflicht: ["a"] },
  { label: "Telefon / E-Mail", platzhalter: "office@beispiel.at" },
];

const ABSENDER_MIT_UID: Eingabefeld[] = [
  ...ABSENDER,
  { label: "UID-Nummer", platzhalter: "ATU12345678", pflicht: ["i"] },
];

const ABSENDER_KU: Eingabefeld[] = [
  ...ABSENDER,
  { label: "UID-Nummer (falls vorhanden)", platzhalter: "ATU12345678 oder Zeile löschen", pflicht: ["i"] },
];

const EMPFAENGER: Eingabefeld[] = [
  { label: "Name / Firma des Kunden", platzhalter: "Kundenname", pflicht: ["b"] },
  { label: "Straße und Hausnummer", platzhalter: "Kundenstraße 2", pflicht: ["b"] },
  { label: "PLZ und Ort", platzhalter: "4020 Linz", pflicht: ["b"] },
];

const EMPFAENGER_MIT_UID: Eingabefeld[] = [
  ...EMPFAENGER,
  { label: "UID des Kunden (Pflicht über 10.000 € brutto)", platzhalter: "ATU87654321", pflicht: ["j"] },
];

const RECHNUNGSDATEN = (wort: string): Eingabefeld[] => [
  { label: `${wort}nummer (fortlaufend)`, platzhalter: "2026-001", pflicht: ["h"] },
  { label: `${wort}datum`, platzhalter: "TT.MM.JJJJ", pflicht: ["g"] },
  { label: "Leistungsdatum / -zeitraum", platzhalter: "TT.MM.JJJJ oder MM/JJJJ", pflicht: ["d"] },
];

const ZAHLUNG: Block = {
  art: "felder",
  felder: [
    { label: "Zahlbar bis", platzhalter: "TT.MM.JJJJ (z. B. 14 Tage netto)" },
    { label: "IBAN", platzhalter: "AT00 0000 0000 0000 0000" },
    { label: "BIC", platzhalter: "BANKATWW" },
  ],
};

const POSITIONEN: Spalte[] = [
  { titel: "Pos.", anteil: 6 },
  { titel: "Menge", anteil: 9, rechts: true },
  { titel: "Einheit", anteil: 10 },
  { titel: "Bezeichnung der Leistung", anteil: 41 },
  { titel: "Einzelpreis netto €", anteil: 17, rechts: true },
  { titel: "Gesamt netto €", anteil: 17, rechts: true },
];

const SUMMEN_UST: Eingabefeld[] = [
  { label: "Summe netto", platzhalter: "0,00 €", pflicht: ["e"] },
  { label: "zzgl. 20 % USt", platzhalter: "0,00 €", pflicht: ["f"] },
  { label: "Rechnungsbetrag brutto", platzhalter: "0,00 €" },
];

const KU_HINWEIS =
  "Umsatzsteuerbefreit – Kleinunternehmer gemäß § 6 Abs. 1 Z 27 UStG. Es wird keine Umsatzsteuer ausgewiesen.";

export const VORLAGEN: readonly Vorlage[] = [
  {
    baustein: "RECHNUNG",
    datei: "rechnungsvorlage",
    titel: "Rechnungsvorlage",
    beschreibung: "Rechnung mit 20 % USt und allen Pflichtangaben nach § 11 UStG",
    artikel: "rechnungsvorlage",
    produktHinweis: "Schneller direkt in Orange Octo: Rechnungsnummer, Summen und USt rechnet das Programm selbst.",
    seiten: [[
      { art: "kopf", titel: "RECHNUNG", absender: ABSENDER_MIT_UID },
      { art: "empfaenger", ueberschrift: "Rechnung an", felder: EMPFAENGER_MIT_UID, daneben: RECHNUNGSDATEN("Rechnungs") },
      { art: "tabelle", spalten: POSITIONEN, zeilen: 8, pflicht: ["c", "e"], summen: SUMMEN_UST },
      { art: "text", text: "Gelten mehrere Steuersätze (z. B. 10 % und 20 %), Nettobetrag und Steuer je Satz getrennt angeben.", klein: true },
      ZAHLUNG,
      { art: "text", text: "Vielen Dank für Ihren Auftrag." },
    ]],
  },
  {
    baustein: "RECHNUNG_KLEINUNTERNEHMER",
    datei: "rechnungsvorlage-kleinunternehmer",
    titel: "Rechnungsvorlage für Kleinunternehmer",
    beschreibung: "Rechnung ohne Umsatzsteuer mit Befreiungshinweis",
    artikel: "kleinunternehmer-rechnung",
    produktHinweis: "Schneller direkt in Orange Octo: Der Kleinunternehmer-Hinweis kommt automatisch auf jede Rechnung.",
    seiten: [[
      { art: "kopf", titel: "RECHNUNG", absender: ABSENDER_KU },
      { art: "empfaenger", ueberschrift: "Rechnung an", felder: EMPFAENGER, daneben: RECHNUNGSDATEN("Rechnungs") },
      {
        art: "tabelle",
        spalten: POSITIONEN.map((s) => ({ ...s, titel: s.titel.replace(" netto", "") })),
        zeilen: 8,
        pflicht: ["c", "e"],
        summen: [{ label: "Rechnungsbetrag", platzhalter: "0,00 €", pflicht: ["e"] }],
      },
      { art: "text", text: KU_HINWEIS, fett: true },
      ZAHLUNG,
      { art: "text", text: "Vielen Dank für Ihren Auftrag." },
    ]],
  },
  {
    baustein: "RECHNUNG_KLEINBETRAG",
    datei: "rechnungsvorlage-kleinbetrag",
    titel: "Kleinbetragsrechnung",
    beschreibung: "Kurze Rechnung bis 400 € brutto nach § 11 Abs. 6 UStG",
    artikel: "rechnungsvorlage",
    produktHinweis: "Schneller direkt in Orange Octo: Orange Octo erkennt Kleinbeträge und lässt nur die nötigen Angaben drauf.",
    seiten: [[
      { art: "kopf", titel: "RECHNUNG", absender: ABSENDER },
      {
        art: "felder",
        felder: [
          { label: "Rechnungsdatum", platzhalter: "TT.MM.JJJJ", pflicht: ["g"] },
          { label: "Tag der Leistung", platzhalter: "TT.MM.JJJJ", pflicht: ["d"] },
          { label: "Rechnungsnummer (empfohlen)", platzhalter: "2026-001" },
        ],
      },
      {
        art: "tabelle",
        spalten: [
          { titel: "Menge", anteil: 12, rechts: true },
          { titel: "Bezeichnung der Ware oder Leistung", anteil: 58 },
          { titel: "Betrag inkl. USt €", anteil: 30, rechts: true },
        ],
        zeilen: 6,
        pflicht: ["c"],
        summen: [
          { label: "Gesamtbetrag inkl. USt", platzhalter: "0,00 €", pflicht: ["e"] },
          { label: "Enthaltener Steuersatz", platzhalter: "20 %", pflicht: ["f"] },
        ],
      },
      {
        art: "text",
        klein: true,
        text: "Kleinbetragsrechnung bis 400 € brutto (§ 11 Abs. 6 UStG): Name und Anschrift des Kunden, UID-Nummer und gesonderter Steuerbetrag dürfen entfallen. Entgelt und Steuer stehen in einer Summe, der Steuersatz muss angegeben sein.",
      },
      { art: "text", text: "Betrag dankend erhalten / zahlbar bis: ______________" },
    ]],
  },
  {
    baustein: "HONORARNOTE_MIT_UST",
    datei: "honorarnote-mit-ust",
    titel: "Honorarnote mit Umsatzsteuer",
    beschreibung: "Honorarnote mit 20 % USt und allen Pflichtangaben nach § 11 UStG",
    artikel: "honorarnote",
    produktHinweis: "Schneller direkt in Orange Octo: Stunden erfassen, Honorarnote in 2 Minuten fertig.",
    seiten: [[
      { art: "kopf", titel: "HONORARNOTE", absender: ABSENDER_MIT_UID },
      { art: "empfaenger", ueberschrift: "Honorarnote an", felder: EMPFAENGER_MIT_UID, daneben: RECHNUNGSDATEN("Honorarnoten") },
      {
        art: "tabelle",
        spalten: [
          { titel: "Leistung (Art und Umfang)", anteil: 52 },
          { titel: "Stunden / Menge", anteil: 15, rechts: true },
          { titel: "Satz netto €", anteil: 16, rechts: true },
          { titel: "Betrag netto €", anteil: 17, rechts: true },
        ],
        zeilen: 6,
        pflicht: ["c", "e"],
        summen: [
          { label: "Honorar netto", platzhalter: "0,00 €", pflicht: ["e"] },
          { label: "zzgl. 20 % USt", platzhalter: "0,00 €", pflicht: ["f"] },
          { label: "Gesamtbetrag", platzhalter: "0,00 €" },
        ],
      },
      ZAHLUNG,
      { art: "text", text: "Ich danke für die gute Zusammenarbeit." },
    ]],
  },
  {
    baustein: "HONORARNOTE_KLEINUNTERNEHMER",
    datei: "honorarnote-kleinunternehmer",
    titel: "Honorarnote als Kleinunternehmer",
    beschreibung: "Honorarnote ohne Umsatzsteuer mit Befreiungshinweis",
    artikel: "honorarnote",
    produktHinweis: "Schneller direkt in Orange Octo: Der Kleinunternehmer-Hinweis kommt automatisch auf jede Honorarnote.",
    seiten: [[
      { art: "kopf", titel: "HONORARNOTE", absender: ABSENDER_KU },
      { art: "empfaenger", ueberschrift: "Honorarnote an", felder: EMPFAENGER, daneben: RECHNUNGSDATEN("Honorarnoten") },
      {
        art: "tabelle",
        spalten: [
          { titel: "Leistung (Art und Umfang)", anteil: 52 },
          { titel: "Stunden / Menge", anteil: 15, rechts: true },
          { titel: "Satz €", anteil: 16, rechts: true },
          { titel: "Betrag €", anteil: 17, rechts: true },
        ],
        zeilen: 6,
        pflicht: ["c", "e"],
        summen: [{ label: "Honorar gesamt", platzhalter: "0,00 €", pflicht: ["e"] }],
      },
      { art: "text", text: KU_HINWEIS, fett: true },
      ZAHLUNG,
      { art: "text", text: "Ich danke für die gute Zusammenarbeit." },
    ]],
  },
  {
    baustein: "STUNDENZETTEL",
    datei: "stundenzettel-vorlage",
    titel: "Stundenzettel / Arbeitszeitaufzeichnung",
    beschreibung: "Monatsliste mit Beginn, Ende, Pause und Tätigkeit",
    artikel: "stundenzettel-vorlage",
    querformat: true,
    produktHinweis: "Schneller direkt in Orange Octo: Zeiten erfassen und mit einem Klick als Honorarnote abrechnen.",
    seiten: [[
      { art: "kopf", titel: "STUNDENZETTEL", absender: [] },
      {
        art: "felder",
        felder: [
          { label: "Name", platzhalter: "Vor- und Nachname" },
          { label: "Monat / Jahr", platzhalter: "MM/JJJJ" },
          { label: "Auftraggeber / Projekt", platzhalter: "Firma oder Projekt" },
        ],
      },
      {
        art: "tabelle",
        spalten: [
          { titel: "Datum", anteil: 11 },
          { titel: "Beginn", anteil: 9 },
          { titel: "Ende", anteil: 9 },
          { titel: "Pause (Min.)", anteil: 10, rechts: true },
          { titel: "Stunden", anteil: 10, rechts: true },
          { titel: "Tätigkeit / Projekt", anteil: 51 },
        ],
        zeilen: 16,
        summen: [{ label: "Summe Stunden", platzhalter: "0,00" }],
      },
      { art: "unterschrift", felder: ["Datum, Unterschrift Mitarbeiter/in", "Datum, Unterschrift Auftraggeber/in"] },
      {
        art: "text",
        klein: true,
        text: "Arbeitgeber müssen die Arbeitszeiten ihrer Beschäftigten aufzeichnen (§ 26 Arbeitszeitgesetz). Für Selbstständige dient der Stundenzettel als Nachweis für die Abrechnung.",
      },
    ]],
  },
  {
    baustein: "STUNDENZETTEL_KUNDEN",
    datei: "stundenzettel-kunden-vorlage",
    titel: "Stundennachweis für Kunden",
    beschreibung: "Stunden mit Tätigkeit, Dauer und Stundensatz als Anlage zur Rechnung",
    artikel: "stundenzettel-vorlage",
    produktHinweis: "Schneller direkt in Orange Octo: erfasste Stunden mit einem Klick in die Rechnung übernehmen.",
    seiten: [[
      { art: "kopf", titel: "STUNDENNACHWEIS", absender: ABSENDER },
      {
        art: "felder",
        felder: [
          { label: "Kunde", platzhalter: "Firma des Kunden" },
          { label: "Projekt / Auftrag", platzhalter: "Projektname" },
          { label: "Zeitraum", platzhalter: "MM/JJJJ" },
        ],
      },
      {
        art: "tabelle",
        spalten: [
          { titel: "Datum", anteil: 13 },
          { titel: "Tätigkeit", anteil: 45 },
          { titel: "Stunden", anteil: 12, rechts: true },
          { titel: "Satz €", anteil: 13, rechts: true },
          { titel: "Betrag €", anteil: 17, rechts: true },
        ],
        zeilen: 14,
        summen: [
          { label: "Summe Stunden", platzhalter: "0,00" },
          { label: "Summe netto (für die Rechnung)", platzhalter: "0,00 €" },
        ],
      },
      { art: "unterschrift", felder: ["Datum, Unterschrift Auftragnehmer/in", "Datum, Bestätigung Kunde"] },
      { art: "text", klein: true, text: "Der Stundennachweis ist keine Rechnung. Er liegt der Rechnung bei, die alle Pflichtangaben nach § 11 UStG enthält." },
    ]],
  },
  {
    baustein: "FAHRTENBUCH",
    datei: "fahrtenbuch-vorlage",
    titel: "Fahrtenbuch",
    beschreibung: "Fahrten mit Datum, Strecke, Zweck und Kilometerstand",
    artikel: "fahrtenbuch-vorlage",
    querformat: true,
    produktHinweis: "Orange Octo: Rechnungen und Ausgaben an einem Ort, damit die Abrechnung nicht am Zettel hängt.",
    seiten: [[
      { art: "kopf", titel: "FAHRTENBUCH", absender: [] },
      {
        art: "felder",
        felder: [
          { label: "Fahrer/in", platzhalter: "Vor- und Nachname" },
          { label: "Kennzeichen / Fahrzeug", platzhalter: "W-12345A, Marke Modell" },
          { label: "Zeitraum", platzhalter: "MM/JJJJ" },
        ],
      },
      {
        art: "tabelle",
        spalten: [
          { titel: "Datum", anteil: 10 },
          { titel: "Abfahrt (Ort)", anteil: 14 },
          { titel: "Ziel (Ort)", anteil: 14 },
          { titel: "Zweck / Kunde", anteil: 24 },
          { titel: "km-Stand Beginn", anteil: 10, rechts: true },
          { titel: "km-Stand Ende", anteil: 10, rechts: true },
          { titel: "km betrieblich", anteil: 9, rechts: true },
          { titel: "km privat", anteil: 9, rechts: true },
        ],
        zeilen: 16,
        summen: [
          { label: "Summe km betrieblich", platzhalter: "0" },
          { label: "Summe km privat", platzhalter: "0" },
        ],
      },
      {
        art: "text",
        klein: true,
        text: "Das Fahrtenbuch laufend und zeitnah führen: Datum, Kilometerstand, Ausgangs- und Zielpunkt sowie Zweck jeder betrieblichen Fahrt. Nachträglich erstellte Aufzeichnungen erkennt das Finanzamt oft nicht an.",
      },
    ]],
  },
  {
    baustein: "LIEFERSCHEIN",
    datei: "lieferschein-vorlage",
    titel: "Lieferschein",
    beschreibung: "Lieferschein mit Positionen und Empfangsbestätigung",
    artikel: "lieferschein-vorlage",
    produktHinweis: "Schneller direkt in Orange Octo: aus dem Angebot wird mit einem Klick die Rechnung.",
    seiten: [[
      { art: "kopf", titel: "LIEFERSCHEIN", absender: ABSENDER },
      {
        art: "empfaenger",
        ueberschrift: "Lieferung an",
        felder: EMPFAENGER,
        daneben: [
          { label: "Lieferscheinnummer", platzhalter: "LS-2026-001" },
          { label: "Lieferdatum", platzhalter: "TT.MM.JJJJ" },
          { label: "Ihre Bestellung / Auftrag", platzhalter: "Nr. und Datum" },
        ],
      },
      {
        art: "tabelle",
        spalten: [
          { titel: "Pos.", anteil: 7 },
          { titel: "Artikel-Nr.", anteil: 15 },
          { titel: "Bezeichnung", anteil: 50 },
          { titel: "Menge", anteil: 14, rechts: true },
          { titel: "Einheit", anteil: 14 },
        ],
        zeilen: 12,
      },
      { art: "text", text: "Ware vollständig und unbeschädigt erhalten:" },
      { art: "unterschrift", felder: ["Datum", "Name in Blockbuchstaben, Unterschrift"] },
      { art: "text", klein: true, text: "Der Lieferschein ist keine Rechnung. Die Rechnung folgt gesondert." },
    ]],
  },
  {
    baustein: "ZAHLUNGSERINNERUNG",
    datei: "zahlungserinnerung-mahnung-vorlage",
    titel: "Zahlungserinnerung und Mahnung",
    beschreibung: "Seite 1 freundliche Zahlungserinnerung, Seite 2 Mahnung mit Verzugszinsen",
    artikel: "zahlungserinnerung-vorlage",
    produktHinweis: "Schneller direkt in Orange Octo: offene Rechnungen sehen und die Erinnerung mit einem Klick schicken.",
    seiten: [
      [
        { art: "kopf", titel: "ZAHLUNGSERINNERUNG", absender: ABSENDER },
        { art: "empfaenger", ueberschrift: "An", felder: EMPFAENGER, daneben: [{ label: "Datum", platzhalter: "TT.MM.JJJJ" }] },
        { art: "text", text: "Sehr geehrte Damen und Herren," },
        {
          art: "text",
          text: "sicher ist es Ihrer Aufmerksamkeit entgangen: Für die folgende Rechnung haben wir noch keine Zahlung erhalten. Bitte überweisen Sie den offenen Betrag bis zum unten genannten Datum. Falls Sie bereits bezahlt haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.",
        },
        {
          art: "tabelle",
          spalten: [
            { titel: "Rechnungsnummer", anteil: 25 },
            { titel: "Rechnungsdatum", anteil: 25 },
            { titel: "fällig am", anteil: 25 },
            { titel: "offener Betrag €", anteil: 25, rechts: true },
          ],
          zeilen: 3,
        },
        ZAHLUNG,
        { art: "text", text: "Mit freundlichen Grüßen" },
        { art: "unterschrift", felder: ["Name, Unterschrift"] },
      ],
      [
        { art: "kopf", titel: "MAHNUNG", absender: ABSENDER },
        { art: "empfaenger", ueberschrift: "An", felder: EMPFAENGER, daneben: [{ label: "Datum", platzhalter: "TT.MM.JJJJ" }] },
        { art: "text", text: "Sehr geehrte Damen und Herren," },
        {
          art: "text",
          text: "trotz unserer Zahlungserinnerung ist die folgende Rechnung noch offen. Wir ersuchen Sie, den Gesamtbetrag bis zum unten genannten Datum zu überweisen. Andernfalls müssen wir die Forderung ohne weitere Ankündigung gerichtlich oder über ein Inkassobüro geltend machen.",
        },
        {
          art: "tabelle",
          spalten: [
            { titel: "Posten", anteil: 70 },
            { titel: "Betrag €", anteil: 30, rechts: true },
          ],
          zeilen: 0,
          summen: [
            { label: "Offener Rechnungsbetrag (Rechnung Nr. …)", platzhalter: "0,00 €" },
            { label: "Verzugszinsen", platzhalter: "0,00 €" },
            { label: "Pauschale Betreibungskosten (40 €, nur zwischen Unternehmen)", platzhalter: "40,00 €" },
            { label: "Gesamtbetrag", platzhalter: "0,00 €" },
          ],
        },
        ZAHLUNG,
        {
          art: "text",
          klein: true,
          text: "Zwischen Unternehmen: Verzugszinsen 9,2 Prozentpunkte über dem Basiszinssatz (§ 456 UGB) und 40 € Pauschale (§ 458 UGB). Gegenüber Privatpersonen: 4 % Zinsen im Jahr (§ 1000 ABGB), keine Pauschale. Rechner: orange-octo.com/at/verzugszinsen-rechner",
        },
        { art: "text", text: "Mit freundlichen Grüßen" },
        { art: "unterschrift", felder: ["Name, Unterschrift"] },
      ],
    ],
  },
  {
    baustein: "KOSTENVORANSCHLAG",
    datei: "kostenvoranschlag-vorlage",
    titel: "Kostenvoranschlag",
    beschreibung: "Kostenvoranschlag mit Wahl verbindlich oder unverbindlich",
    artikel: "kostenvoranschlag-vorlage",
    produktHinweis: "Schneller direkt in Orange Octo: Angebot schreiben und nach Zusage mit einem Klick in die Rechnung übernehmen.",
    seiten: [[
      { art: "kopf", titel: "KOSTENVORANSCHLAG", absender: ABSENDER_MIT_UID },
      {
        art: "empfaenger",
        ueberschrift: "Für",
        felder: EMPFAENGER,
        daneben: [
          { label: "Nummer", platzhalter: "KV-2026-001" },
          { label: "Datum", platzhalter: "TT.MM.JJJJ" },
          { label: "Gültig bis", platzhalter: "TT.MM.JJJJ" },
        ],
      },
      { art: "felder", felder: [{ label: "Vorhaben", platzhalter: "Kurzbeschreibung der Arbeiten" }] },
      { art: "tabelle", spalten: POSITIONEN, zeilen: 8, summen: SUMMEN_UST.map((s) => ({ ...s, label: s.label.replace("Rechnungsbetrag", "Gesamtbetrag") })) },
      {
        art: "ankreuzen",
        optionen: [
          "Verbindlicher Kostenvoranschlag: Der Gesamtpreis gilt garantiert (§ 1170a Abs. 1 ABGB).",
          "Unverbindlicher Kostenvoranschlag: Steigen die Kosten beträchtlich, informieren wir Sie vorher (§ 1170a Abs. 2 ABGB).",
        ],
      },
      {
        art: "text",
        klein: true,
        text: "Gegenüber Privatpersonen gilt ein Kostenvoranschlag als verbindlich, wenn nicht ausdrücklich das Gegenteil erklärt wird. Für die Erstellung darf nur dann etwas verrechnet werden, wenn das vorher vereinbart war (§ 5 Konsumentenschutzgesetz).",
      },
      { art: "text", text: "Mit freundlichen Grüßen" },
      { art: "unterschrift", felder: ["Ort, Datum, Unterschrift"] },
    ]],
  },
];

export const DOWNLOAD_BAUSTEINE = VORLAGEN.map((v) => `DOWNLOAD_${v.baustein}`);

export function findeVorlageNachDatei(datei: string): Vorlage | undefined {
  return VORLAGEN.find((v) => v.datei === datei);
}

export function findeVorlageNachBaustein(baustein: string): Vorlage | undefined {
  return VORLAGEN.find((v) => `DOWNLOAD_${v.baustein}` === baustein);
}

/** Alle Pflichtangaben (§ 11 lit. a–j), die eine Vorlage abdeckt. */
export function abgedecktePflichtAngaben(v: Vorlage): Set<Pflichtangabe> {
  const s = new Set<Pflichtangabe>();
  const add = (p?: Pflichtangabe[]) => p?.forEach((x) => s.add(x));
  for (const seite of v.seiten)
    for (const b of seite) {
      if (b.art === "kopf") b.absender.forEach((f) => add(f.pflicht));
      if (b.art === "empfaenger") [...b.felder, ...b.daneben].forEach((f) => add(f.pflicht));
      if (b.art === "felder") b.felder.forEach((f) => add(f.pflicht));
      if (b.art === "tabelle") {
        add(b.pflicht);
        b.summen?.forEach((f) => add(f.pflicht));
      }
    }
  return s;
}
