// ORA-3316 — Unit tests for the ebInterface 6.1 generator (Austrian WKO/Bund
// e-invoice format for e-rechnung.gv.at).
//
// Run:
//   npx tsx tests/unit/ora3316-ebinterface.test.ts
//
// Self-contained — no test framework, just assert.strict. Exits non-zero on any
// failure. These are STRUCTURAL checks (element order, mandatory fields, VAT
// category mapping). The generated XML was additionally validated against the
// official ebInterface 6.1 XSD (schemas/ebInterface6p1/Invoice.xsd,
// austriapro/ebinterface-standards, schema date 2022-06-25) with libxml2 — all
// scenarios below passed schema validation; see ORA-3316 for the evidence.

import assert from "node:assert/strict";

import { generateEbInterfaceXml } from "../../src/lib/einvoice/ebinterface-xml";
import { EInvoiceData } from "../../src/lib/einvoice/types";
import { Invoice, Customer, CompanySettings, InvoiceItem } from "../../src/lib/types";

interface Case {
  name: string;
  run: () => void;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function makeItem(over: Partial<InvoiceItem> = {}): InvoiceItem {
  return {
    id: "i1",
    position: 1,
    description: "Immersive VR-Präsentation",
    unit: "Pauschale",
    product_id: null,
    quantity: 1,
    unit_price: 1000,
    discount_percent: 0,
    discount_amount: 0,
    total: 1000,
    ...over,
  };
}

function makeSettings(over: Partial<CompanySettings> = {}): CompanySettings {
  return {
    id: "s1",
    company_name: "VR the Fans GmbH",
    company_type: "gmbh",
    address: "Teststraße 1",
    city: "Wien",
    zip: "1010",
    country: "AT",
    uid: "ATU12345678",
    firmenbuchnummer: "FN 123456a",
    firmenbuchgericht: "HG Wien",
    firmenbuchnummer_komplementaer: "",
    firmenbuchgericht_komplementaer: "",
    is_kleinunternehmer: false,
    iban: "AT61 1904 3002 3457 3201",
    bic: "BKAUATWW",
    phone: "+43 1 1234567",
    email: "office@vrthefans.com",
    logo_url: "",
    default_tax_rate: 20,
    default_payment_terms_days: 14,
    next_invoice_number: 1,
    next_quote_number: 1,
    accompanying_text_de: "",
    accompanying_text_en: "",
    industry: "",
    website: "",
    description: "",
    ...over,
  };
}

function makeCustomer(over: Partial<Customer> = {}): Customer {
  return {
    id: "c1",
    name: "Max Mustermann",
    company: "Muster GmbH",
    address: "Kundengasse 5",
    city: "Salzburg",
    zip: "5020",
    country: "AT",
    uid_number: "",
    email: "kunde@example.com",
    phone: "",
    leitweg_id: "",
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function makeData(opts: {
  rate?: number;
  items?: InvoiceItem[];
  settings?: Partial<CompanySettings>;
  customer?: Partial<Customer>;
  supply?: "goods" | "services";
  status?: Invoice["status"];
  leitwegId?: string;
} = {}): EInvoiceData {
  const rate = opts.rate ?? 20;
  const items = opts.items ?? [makeItem({ tax_rate: rate })];
  const sub = items.reduce((s, it) => s + it.total, 0);
  const invoice: Invoice = {
    id: "inv1",
    invoice_number: "2026-0042",
    customer_id: "c1",
    project_description: "VR-Projekt",
    invoice_date: "2026-10-21",
    delivery_date: "2026-10-21",
    due_date: "2026-11-04",
    items,
    subtotal: sub,
    tax_rate: rate,
    tax_amount: round2(sub * (rate / 100)),
    total: round2(sub + sub * (rate / 100)),
    overall_discount_percent: 0,
    overall_discount_amount: 0,
    status: opts.status ?? "offen",
    paid_at: null,
    paid_amount: 0,
    notes: "",
    language: "de",
    accompanying_text: null,
    e_invoice_format: "ebinterface",
    created_by: null,
    created_at: "2026-10-21T00:00:00Z",
    source_quote_id: null,
    percent_of_quote: null,
  };
  return {
    invoice,
    items,
    customer: makeCustomer(opts.customer),
    settings: makeSettings(opts.settings),
    supply: opts.supply,
    leitwegId: opts.leitwegId,
  };
}

/** Assert that `needles` appear in `xml` in the given order (XSD is order-sensitive). */
function assertOrder(xml: string, needles: string[], label: string) {
  let pos = -1;
  for (const n of needles) {
    const at = xml.indexOf(n, pos + 1);
    assert.ok(at > pos, `${label}: '${n}' out of order`);
    pos = at;
  }
}

const cases: Case[] = [
  {
    name: "Root: ebInterface 6.1 namespace + required attributes",
    run: () => {
      const xml = generateEbInterfaceXml(makeData({ rate: 20 }));
      assert.ok(xml.includes('xmlns="http://www.ebinterface.at/schema/6p1/"'), "6p1 namespace");
      assert.ok(xml.includes('DocumentType="Invoice"'), "DocumentType=Invoice");
      assert.ok(xml.includes('InvoiceCurrency="EUR"'), "currency");
      assert.ok(xml.includes('GeneratingSystem="'), "GeneratingSystem present");
    },
  },
  {
    name: "Element order follows the XSD sequence",
    run: () => {
      const xml = generateEbInterfaceXml(makeData({ rate: 20 }));
      assertOrder(
        xml,
        [
          "<InvoiceNumber>",
          "<InvoiceDate>",
          "<Delivery>",
          "<Biller>",
          "<InvoiceRecipient>",
          "<Details>",
          "<Tax>",
          "<TotalGrossAmount>",
          "<PayableAmount>",
          "<PaymentMethod>",
          "<PaymentConditions>",
        ],
        "Invoice sequence",
      );
    },
  },
  {
    name: "Address order: Name → Street → Town → ZIP → Country (mandatory fields)",
    run: () => {
      const xml = generateEbInterfaceXml(makeData({ rate: 20 }));
      assertOrder(xml, ["<Name>VR the Fans GmbH", "<Town>Wien", "<ZIP>1010", "<Country"], "Biller address");
    },
  },
  {
    name: "Standard 20 %: TaxCategoryCode S on line and in Tax breakdown",
    run: () => {
      const xml = generateEbInterfaceXml(makeData({ rate: 20 }));
      assert.ok(xml.includes('<TaxPercent TaxCategoryCode="S">20.00</TaxPercent>'), "S at 20%");
      assert.ok(xml.includes("<TotalGrossAmount>1200.00</TotalGrossAmount>"), "gross 1200");
      assert.ok(xml.includes("<PayableAmount>1200.00</PayableAmount>"), "payable 1200");
    },
  },
  {
    name: "Kleinunternehmer AT: category E + reason as TaxItem Comment",
    run: () => {
      const xml = generateEbInterfaceXml(
        makeData({ rate: 0, settings: { is_kleinunternehmer: true, country: "AT" } }),
      );
      assert.ok(xml.includes('TaxCategoryCode="E"'), "category E");
      assert.ok(xml.includes("§ 6 Abs. 1 Z 27 UStG"), "AT exemption reason");
      // The reason lives in the document-level Tax breakdown as <Comment>.
      assert.ok(/<Comment>[^<]*§ 6 Abs\. 1 Z 27 UStG[^<]*<\/Comment>/.test(xml), "reason in Comment");
      assert.ok(xml.includes("<TotalGrossAmount>1000.00</TotalGrossAmount>"), "no VAT added");
    },
  },
  {
    name: "Reverse charge DE B2B: category AE + 'Übergang der Steuerschuld'",
    run: () => {
      const xml = generateEbInterfaceXml(
        makeData({ rate: 0, customer: { country: "DE", uid_number: "DE123456789" } }),
      );
      assert.ok(xml.includes('TaxCategoryCode="AE"'), "category AE");
      assert.ok(xml.includes("Übergang der Steuerschuld"), "reverse charge text");
      assert.ok(xml.includes("<VATIdentificationNumber>DE123456789</VATIdentificationNumber>"), "recipient UID");
    },
  },
  {
    name: "Intra-community goods: category K",
    run: () => {
      const xml = generateEbInterfaceXml(
        makeData({ rate: 0, supply: "goods", customer: { country: "DE", uid_number: "DE123456789" } }),
      );
      assert.ok(xml.includes('TaxCategoryCode="K"'), "category K");
      assert.ok(xml.includes("innergemeinschaftliche Lieferung"), "IC supply text");
    },
  },
  {
    name: "Credit note → DocumentType=CreditMemo",
    run: () => {
      const xml = generateEbInterfaceXml(makeData({ rate: 20, status: "storniert" }));
      assert.ok(xml.includes('DocumentType="CreditMemo"'), "CreditMemo");
    },
  },
  {
    name: "Multi-rate: one Tax/TaxItem per rate group, correct totals",
    run: () => {
      const xml = generateEbInterfaceXml(
        makeData({
          items: [
            makeItem({ tax_rate: 20, total: 1000, unit_price: 1000 }),
            makeItem({ id: "i2", description: "Handbuch", tax_rate: 10, total: 200, unit_price: 200 }),
          ],
        }),
      );
      // net 1200, tax 200 + 20 = 220, gross 1420
      assert.ok(xml.includes('<TaxPercent TaxCategoryCode="S">20.00</TaxPercent>'), "20% group");
      assert.ok(xml.includes('<TaxPercent TaxCategoryCode="S">10.00</TaxPercent>'), "10% group");
      assert.ok(xml.includes("<TotalGrossAmount>1420.00</TotalGrossAmount>"), "gross 1420");
    },
  },
  {
    name: "Auftragsreferenz: leitwegId → InvoiceRecipient OrderReference/OrderID",
    run: () => {
      const xml = generateEbInterfaceXml(makeData({ rate: 20, leitwegId: "AT:GOV:12345" }));
      assertOrder(xml, ["<InvoiceRecipient>", "<OrderReference>", "<OrderID>AT:GOV:12345</OrderID>", "<Address>"], "recipient order ref");
    },
  },
  {
    name: "XML special characters are escaped",
    run: () => {
      const xml = generateEbInterfaceXml(
        makeData({ rate: 20, customer: { company: "", name: "Müller & Söhne <GmbH>" } }),
      );
      assert.ok(xml.includes("Müller &amp; Söhne &lt;GmbH&gt;"), "escaped name");
      assert.ok(!xml.includes("<GmbH>"), "no raw angle brackets");
    },
  },
  {
    name: "Payment: UniversalBankTransaction with BIC before IBAN",
    run: () => {
      const xml = generateEbInterfaceXml(makeData({ rate: 20 }));
      assertOrder(
        xml,
        ["<UniversalBankTransaction>", "<BIC>BKAUATWW</BIC>", "<IBAN>AT611904300234573201</IBAN>", "<BankAccountOwner>"],
        "payment account",
      );
    },
  },
];

let failed = 0;
for (const c of cases) {
  try {
    c.run();
    process.stdout.write(`ok  ${c.name}\n`);
  } catch (err) {
    failed += 1;
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`FAIL  ${c.name}\n  ${msg}\n`);
  }
}
process.stdout.write(`\n${cases.length - failed}/${cases.length} passed\n`);
if (failed > 0) process.exit(1);
