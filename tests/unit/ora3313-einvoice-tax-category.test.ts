// ORA-3313 — Unit tests for EN 16931 VAT category derivation (E/AE/K/S/Z) and
// its wiring into the UBL (XRechnung) and CII (ZUGFeRD) generators.
//
// Run:
//   npx tsx tests/unit/ora3313-einvoice-tax-category.test.ts
//
// Self-contained — no test framework, just assert.strict. Exits non-zero on any
// failure. Covers the central derivation (deriveTaxCategory) plus a per-category
// check that the right <cbc:ID>/<ram:CategoryCode> and exemption reason land in
// the generated XML — and that the exemption reason appears only in the
// document-level VAT breakdown, never on the invoice line.

import assert from "node:assert/strict";

import { deriveTaxCategory, taxCategoryContext } from "../../src/lib/einvoice/tax-category";
import { generateUblXml } from "../../src/lib/einvoice/ubl-xml";
import { generateCiiXml } from "../../src/lib/einvoice/cii-xml";
import { EInvoiceData } from "../../src/lib/einvoice/types";
import { Invoice, Customer, CompanySettings, InvoiceItem } from "../../src/lib/types";

interface Case {
  name: string;
  run: () => void;
}

// --- Fixtures -------------------------------------------------------------

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
    iban: "AT611904300234573201",
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
  settings?: Partial<CompanySettings>;
  customer?: Partial<Customer>;
  supply?: "goods" | "services";
  format?: "xrechnung" | "zugferd";
} = {}): EInvoiceData {
  const rate = opts.rate ?? 20;
  const item = makeItem({ tax_rate: rate });
  const invoice: Invoice = {
    id: "inv1",
    invoice_number: "2026-0001",
    customer_id: "c1",
    project_description: "VR-Projekt",
    invoice_date: "2026-10-21",
    delivery_date: "2026-10-21",
    due_date: "2026-11-04",
    items: [item],
    subtotal: 1000,
    tax_rate: rate,
    tax_amount: round2(1000 * (rate / 100)),
    total: round2(1000 + 1000 * (rate / 100)),
    overall_discount_percent: 0,
    overall_discount_amount: 0,
    status: "offen",
    paid_at: null,
    paid_amount: 0,
    notes: "",
    language: "de",
    accompanying_text: null,
    e_invoice_format: opts.format ?? "xrechnung",
    created_by: null,
    created_at: "2026-10-21T00:00:00Z",
    source_quote_id: null,
    percent_of_quote: null,
  };
  return {
    invoice,
    items: [item],
    customer: makeCustomer(opts.customer),
    settings: makeSettings(opts.settings),
    supply: opts.supply,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- Cases ----------------------------------------------------------------

const cases: Case[] = [
  {
    name: "S — standard positive rate (domestic 20 %)",
    run: () => {
      const ctx = taxCategoryContext(makeData({ rate: 20 }));
      const cat = deriveTaxCategory(20, ctx);
      assert.equal(cat.code, "S");
      assert.equal(cat.exemptionReason, "");
    },
  },
  {
    name: "Z — plain zero-rated, no special regime",
    run: () => {
      const ctx = taxCategoryContext(makeData({ rate: 0 }));
      const cat = deriveTaxCategory(0, ctx);
      assert.equal(cat.code, "Z");
      assert.equal(cat.exemptionReason, "");
    },
  },
  {
    name: "E — Kleinunternehmer AT → § 6 Abs. 1 Z 27 UStG reason",
    run: () => {
      const ctx = taxCategoryContext(
        makeData({ rate: 0, settings: { is_kleinunternehmer: true, country: "AT" } }),
      );
      const cat = deriveTaxCategory(0, ctx);
      assert.equal(cat.code, "E");
      assert.ok(cat.exemptionReason.includes("§ 6 Abs. 1 Z 27 UStG"), cat.exemptionReason);
    },
  },
  {
    name: "E — Kleinunternehmer DE → § 19 UStG reason",
    run: () => {
      const ctx = taxCategoryContext(
        makeData({ rate: 0, settings: { is_kleinunternehmer: true, country: "DE" } }),
      );
      const cat = deriveTaxCategory(0, ctx);
      assert.equal(cat.code, "E");
      assert.ok(cat.exemptionReason.includes("§ 19 UStG"), cat.exemptionReason);
    },
  },
  {
    name: "AE — cross-border EU B2B service (DE customer with UID) → reverse charge",
    run: () => {
      const ctx = taxCategoryContext(
        makeData({ rate: 0, customer: { country: "DE", uid_number: "DE123456789" } }),
      );
      const cat = deriveTaxCategory(0, ctx);
      assert.equal(cat.code, "AE");
      assert.ok(cat.exemptionReason.includes("Übergang der Steuerschuld"), cat.exemptionReason);
    },
  },
  {
    name: "K — intra-community supply of goods (explicit supply=goods)",
    run: () => {
      const ctx = taxCategoryContext(
        makeData({ rate: 0, customer: { country: "DE", uid_number: "DE123456789" }, supply: "goods" }),
      );
      const cat = deriveTaxCategory(0, ctx);
      assert.equal(cat.code, "K");
      assert.ok(
        cat.exemptionReason.includes("innergemeinschaftliche Lieferung"),
        cat.exemptionReason,
      );
    },
  },
  {
    name: "No category switch for a POSITIVE rate even cross-border (S wins)",
    run: () => {
      const ctx = taxCategoryContext(
        makeData({ rate: 20, customer: { country: "DE", uid_number: "DE123456789" } }),
      );
      assert.equal(deriveTaxCategory(20, ctx).code, "S");
    },
  },
  {
    name: "Non-EU customer with UID at 0 % stays Z (export, out of scope here)",
    run: () => {
      const ctx = taxCategoryContext(
        makeData({ rate: 0, customer: { country: "CH", uid_number: "CHE123456789" } }),
      );
      assert.equal(deriveTaxCategory(0, ctx).code, "Z");
    },
  },
  {
    name: "Same-country UID at 0 % stays Z (domestic, not intra-EU)",
    run: () => {
      const ctx = taxCategoryContext(
        makeData({ rate: 0, customer: { country: "AT", uid_number: "ATU99999999" } }),
      );
      assert.equal(deriveTaxCategory(0, ctx).code, "Z");
    },
  },
  {
    name: "Kleinunternehmer wins over cross-border EU (E before AE)",
    run: () => {
      const ctx = taxCategoryContext(
        makeData({
          rate: 0,
          settings: { is_kleinunternehmer: true, country: "AT" },
          customer: { country: "DE", uid_number: "DE123456789" },
        }),
      );
      assert.equal(deriveTaxCategory(0, ctx).code, "E");
    },
  },

  // --- Generator integration ---------------------------------------------
  {
    name: "UBL: Kleinunternehmer → category E + TaxExemptionReason in breakdown only",
    run: () => {
      const xml = generateUblXml(
        makeData({ rate: 0, settings: { is_kleinunternehmer: true, country: "AT" } }),
      );
      assert.ok(/<cac:TaxCategory>\s*<cbc:ID>E<\/cbc:ID>/.test(xml), "breakdown ID=E");
      assert.ok(xml.includes("<cbc:TaxExemptionReason>"), "has exemption reason");
      assert.ok(xml.includes("§ 6 Abs. 1 Z 27 UStG"), "AT reason text");
      // Line-level ClassifiedTaxCategory carries the code but NOT the reason.
      assert.ok(/<cac:ClassifiedTaxCategory>\s*<cbc:ID>E<\/cbc:ID>/.test(xml), "line ID=E");
      const lineBlock = xml.slice(xml.indexOf("<cac:ClassifiedTaxCategory>"));
      assert.ok(!lineBlock.includes("TaxExemptionReason"), "no reason on the line");
    },
  },
  {
    name: "UBL: reverse charge → category AE + 'Übergang der Steuerschuld'",
    run: () => {
      const xml = generateUblXml(
        makeData({ rate: 0, customer: { country: "DE", uid_number: "DE123456789" } }),
      );
      assert.ok(/<cac:TaxCategory>\s*<cbc:ID>AE<\/cbc:ID>/.test(xml), "ID=AE");
      assert.ok(xml.includes("Übergang der Steuerschuld"), "reverse charge text");
    },
  },
  {
    name: "CII: intra-community goods → CategoryCode K + ExemptionReason, correct element order",
    run: () => {
      const xml = generateCiiXml(
        makeData({
          rate: 0,
          format: "zugferd",
          customer: { country: "DE", uid_number: "DE123456789" },
          supply: "goods",
        }),
      );
      assert.ok(xml.includes("<ram:CategoryCode>K</ram:CategoryCode>"), "CategoryCode K");
      assert.ok(xml.includes("innergemeinschaftliche Lieferung"), "IC reason text");
      // TypeCode → ExemptionReason → BasisAmount order in the header TradeTax.
      const order = /<ram:TypeCode>VAT<\/ram:TypeCode>\s*<ram:ExemptionReason>[^<]+<\/ram:ExemptionReason>\s*<ram:BasisAmount>/;
      assert.ok(order.test(xml), "ExemptionReason sits between TypeCode and BasisAmount");
    },
  },
  {
    name: "CII: domestic standard rate → CategoryCode S, no ExemptionReason",
    run: () => {
      const xml = generateCiiXml(makeData({ rate: 20, format: "zugferd" }));
      assert.ok(xml.includes("<ram:CategoryCode>S</ram:CategoryCode>"), "CategoryCode S");
      assert.ok(!xml.includes("<ram:ExemptionReason>"), "no exemption reason for S");
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
