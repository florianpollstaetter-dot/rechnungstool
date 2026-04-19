// SCH-526 — sevDesk PDF import fallback.
//
// When a user only has the PDF export (`Artikeluebersicht.pdf` /
// `Alle Kontakte.pdf`) we hand it to Claude vision and ask it to extract the
// table rows as JSON. CSV is strongly preferred — PDF exports drop columns
// sevDesk only writes to CSV (description, UID, IBAN, tax rate). The UI
// warns the user about this before they get here.

import { callClaude, calculateCostEUR } from "@/lib/ai-client";

const PRODUCTS_PROMPT = `Du erhältst den PDF-Export "Artikelübersicht" aus sevDesk.
Er enthält eine Tabelle mit den Spalten:
Nr | Artikelbezeichnung | Bestand | Einheit | Einkaufspreis (VK) | Bestandswert (EK)

AUFGABE: Extrahiere ALLE Produktzeilen. Für jede Zeile:
- external_ref: die Nummer (Nr)
- name: die Artikelbezeichnung
- unit: die Einheit (z.B. "Stk", "Tag(e)", "pauschal")
- unit_price: der Verkaufspreis (VK) als Zahl (DE-Format 30,00 → 30.00)

Ignoriere Kopf-, Summen- und Filterzeilen. Wenn ein Feld fehlt, setze "" oder 0.

Antworte NUR mit JSON, keinem anderen Text:
{
  "rows": [
    { "external_ref": "1086", "name": "…", "unit": "Stk", "unit_price": 30.00 }
  ]
}`;

const CUSTOMERS_PROMPT = `Du erhältst den PDF-Export "Alle Kontakte" aus sevDesk.
Er enthält eine Tabelle mit den Spalten:
KdNr | Name | Straße | PLZ | Ort | Telefon | E-Mail

AUFGABE: Extrahiere ALLE Kontaktzeilen. Für jede Zeile:
- external_ref: die Kundennummer (KdNr)
- company: der Name (wenn er nach Firma aussieht, sonst leer)
- name: der Name (wenn er nach Personenname aussieht, sonst leer)
- address: Straße + Hausnummer
- zip: PLZ
- city: Ort
- phone: Telefon
- email: E-Mail

Wenn unklar ob Firma oder Person: wenn Rechtsformkürzel (GmbH, AG, OG, KG, e.U., GesbR) enthalten → company, sonst → name.

Antworte NUR mit JSON, keinem anderen Text:
{
  "rows": [
    { "external_ref": "10001", "company": "", "name": "Max Mustermann", "address": "…", "zip": "1010", "city": "Wien", "phone": "", "email": "" }
  ]
}`;

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const kind = form.get("kind");
  if (!(file instanceof File)) {
    return Response.json({ error: "file fehlt" }, { status: 400 });
  }
  if (kind !== "products" && kind !== "customers") {
    return Response.json({ error: "kind muss 'products' oder 'customers' sein" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return Response.json({ error: "Nur PDF-Dateien werden unterstützt" }, { status: 400 });
  }
  const maxBytes = 20 * 1024 * 1024;
  if (file.size > maxBytes) {
    return Response.json({ error: "PDF zu groß (max. 20 MB)" }, { status: 413 });
  }

  const prompt = kind === "products" ? PRODUCTS_PROMPT : CUSTOMERS_PROMPT;
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  try {
    const { text, inputTokens, outputTokens } = await callClaude(
      [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
        { type: "text", text: prompt },
      ],
      4096,
    );
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : { rows: [] };
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    const costEUR = calculateCostEUR(inputTokens, outputTokens);
    return Response.json({ success: true, rows, cost_eur: costEUR });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
