// ORA-3314 — Unit tests for the BMD (NTCS) and RZL booking export.
//
// Run:
//   npx tsx tests/unit/ora3314-at-booking-export.test.ts
//
// Self-contained — no test framework, just assert.strict. Exits non-zero on any
// failure. Covers: column structure + header, Soll/Haben direction, date and
// amount formatting, the category → tax-code mapping (S/Z/E/AE/K → BMD Steuercode
// and RZL USt-Schlüssel), receipt (Vorsteuer) rows, the paid-invoice bank row,
// and the CP1252 encoder used for RZL downloads.

import assert from "node:assert/strict";

import {
  invoicesToBmdRows,
  receiptsToBmdRows,
  bmdRowsToCsv,
  invoicesToRzlRows,
  receiptsToRzlRows,
  rzlRowsToCsv,
  encodeCp1252,
  BookingExportSettings,
} from "../../src/lib/einvoice/at-booking-export";
import { Invoice, Customer, Receipt } from "../../src/lib/types";

// --- Fixtures -------------------------------------------------------------

function makeInvoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv1",
    invoice_number: "2026-0001",
    customer_id: "c1",
    project_description: "VR-Präsentation",
    invoice_date: "2026-03-15",
    delivery_date: "2026-03-15",
    due_date: "2026-04-14",
    items: [],
    subtotal: 1000,
    tax_rate: 20,
    tax_amount: 200,
    total: 1200,
    overall_discount_percent: 0,
    overall_discount_amount: 0,
    status: "offen",
    paid_at: null,
    paid_amount: 0,
    notes: "",
    language: "de",
    accompanying_text: null,
    e_invoice_format: "none",
    created_by: null,
    created_at: "2026-03-15T00:00:00Z",
    ...over,
  } as Invoice;
}

function makeCustomer(over: Partial<Customer> = {}): Customer {
  return {
    id: "c1",
    name: "Max Mustermann",
    company: "Muster GmbH",
    address: "Teststraße 1",
    city: "Wien",
    zip: "1010",
    country: "AT",
    uid_number: "",
    email: "",
    phone: "",
    leitweg_id: "",
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  } as Customer;
}

function makeReceipt(over: Partial<Receipt> = {}): Receipt {
  return {
    id: "r1",
    file_name: "beleg-amazon.pdf",
    file_path: "x",
    file_type: "pdf",
    file_size: 1,
    invoice_date: "2026-03-10",
    purpose: "Büromaterial",
    issuer: "Amazon",
    amount_net: 100,
    amount_gross: 120,
    amount_vat: 20,
    vat_rate: 20,
    account_debit: "7600",
    account_credit: null,
    account_label: null,
    currency: "EUR",
    payment_method: "bank" as Receipt["payment_method"],
    analysis_cost: null,
    notes: null,
    analysis_status: "done" as Receipt["analysis_status"],
    analysis_raw: null,
    created_at: "2026-03-10T00:00:00Z",
    updated_at: "2026-03-10T00:00:00Z",
    ...over,
  } as Receipt;
}

const SETTINGS_STD: BookingExportSettings = { country: "AT", is_kleinunternehmer: false };
const SETTINGS_KU: BookingExportSettings = { country: "AT", is_kleinunternehmer: true };

function custMap(...cs: Customer[]): Map<string, Customer> {
  return new Map(cs.map((c) => [c.id, c]));
}

// --- Cases ----------------------------------------------------------------

interface Case {
  name: string;
  run: () => void;
}

const cases: Case[] = [
  {
    name: "BMD: standard 20% invoice → Debitor/Soll, Erlöskonto, Steuercode 1",
    run: () => {
      const rows = invoicesToBmdRows([makeInvoice()], custMap(makeCustomer()), SETTINGS_STD);
      assert.equal(rows.length, 1);
      const r = rows[0];
      assert.equal(r.satzart, "0");
      assert.equal(r.konto, "2000"); // Debitor-Sammelkonto
      assert.equal(r.gkonto, "4000"); // steuerpflichtige Erlöse
      assert.equal(r.buchsymbol, "AR");
      assert.equal(r.buchcode, "1"); // Soll
      assert.equal(r.steuercode, "1"); // Umsatzsteuer
      assert.equal(r.betrag, "1200,00");
      assert.equal(r.prozent, "20");
      assert.equal(r.steuer, "200,00");
      assert.equal(r.buchdatum, "15.03.2026");
      assert.ok(r.text.startsWith("RE 2026-0001"));
    },
  },
  {
    name: "BMD: Kleinunternehmer (rate 0) → Kategorie E, kein Steuercode, Erlöse steuerfrei",
    run: () => {
      const inv = makeInvoice({ tax_rate: 0, tax_amount: 0, total: 1000 });
      const rows = invoicesToBmdRows([inv], custMap(makeCustomer()), SETTINGS_KU);
      const r = rows[0];
      assert.equal(r.gkonto, "4100"); // steuerfreie Erlöse
      assert.equal(r.steuercode, "");
      assert.equal(r.prozent, "");
      assert.equal(r.steuer, "");
      assert.equal(r.betrag, "1000,00");
    },
  },
  {
    name: "BMD: cross-border EU B2B at 0% (services) → Reverse Charge, Steuercode 77",
    run: () => {
      const inv = makeInvoice({ tax_rate: 0, tax_amount: 0, total: 1000 });
      const cust = makeCustomer({ country: "DE", uid_number: "DE123456789" });
      const rows = invoicesToBmdRows([inv], custMap(cust), SETTINGS_STD);
      assert.equal(rows[0].steuercode, "77");
      assert.equal(rows[0].gkonto, "4100");
    },
  },
  {
    name: "BMD: paid invoice emits a second bank booking row",
    run: () => {
      const inv = makeInvoice({ status: "bezahlt", paid_at: "2026-03-20T10:00:00Z" });
      const rows = invoicesToBmdRows([inv], custMap(makeCustomer()), SETTINGS_STD);
      assert.equal(rows.length, 2);
      const bank = rows[1];
      assert.equal(bank.konto, "2800"); // Bank
      assert.equal(bank.gkonto, "2000"); // gegen Debitor
      assert.equal(bank.buchsymbol, "BK");
      assert.equal(bank.steuercode, "");
      assert.equal(bank.buchdatum, "20.03.2026");
    },
  },
  {
    name: "BMD: entwurf invoices are skipped",
    run: () => {
      const rows = invoicesToBmdRows([makeInvoice({ status: "entwurf" })], custMap(makeCustomer()), SETTINGS_STD);
      assert.equal(rows.length, 0);
    },
  },
  {
    name: "BMD: receipt → Kreditor/Haben (Buchcode 2), Aufwandskonto, Vorsteuer (Steuercode 2)",
    run: () => {
      const rows = receiptsToBmdRows([makeReceipt()]);
      assert.equal(rows.length, 1);
      const r = rows[0];
      assert.equal(r.konto, "3300"); // Kreditor-Sammelkonto
      assert.equal(r.gkonto, "7600"); // Aufwand (account_debit)
      assert.equal(r.buchsymbol, "ER");
      assert.equal(r.buchcode, "2"); // Haben
      assert.equal(r.steuercode, "2"); // Vorsteuer
      assert.equal(r.betrag, "120,00");
      assert.equal(r.belegnr, "beleg-amazon"); // Endung entfernt
    },
  },
  {
    name: "BMD CSV: header line + semicolon + CRLF + BOM, text quoted",
    run: () => {
      const csv = bmdRowsToCsv(invoicesToBmdRows([makeInvoice()], custMap(makeCustomer()), SETTINGS_STD));
      assert.ok(csv.startsWith("﻿Satzart;Konto;Gkonto;Buchsymbol;Belegnr;Buchdatum;Belegdatum;Buchcode;Steuercode;Betrag;Prozent;Steuer;Text\r\n"));
      assert.ok(csv.includes('"RE 2026-0001 Muster GmbH"'));
      assert.ok(csv.endsWith("\r\n"));
    },
  },
  {
    name: "RZL: standard invoice → Sollkonto Debitor, Habenkonto Erlös, USt-Schlüssel 2",
    run: () => {
      const rows = invoicesToRzlRows([makeInvoice()], custMap(makeCustomer()), SETTINGS_STD);
      assert.equal(rows.length, 1);
      const r = rows[0];
      assert.equal(r.datum, "15.03.2026");
      assert.equal(r.sollkonto, "2000");
      assert.equal(r.habenkonto, "4000");
      assert.equal(r.betrag, "1200,00");
      assert.equal(r.ustSchluessel, "2"); // Umsatzsteuer
      assert.equal(r.kostenstelle, "");
    },
  },
  {
    name: "RZL: Kleinunternehmer → steuerfrei (USt-Schlüssel 0), Erlöse steuerfrei",
    run: () => {
      const inv = makeInvoice({ tax_rate: 0, tax_amount: 0, total: 1000 });
      const rows = invoicesToRzlRows([inv], custMap(makeCustomer()), SETTINGS_KU);
      assert.equal(rows[0].ustSchluessel, "0");
      assert.equal(rows[0].habenkonto, "4100");
    },
  },
  {
    name: "RZL: receipt → Aufwand/Soll an Verbindlichkeit/Haben, Vorsteuer (Schlüssel 1)",
    run: () => {
      const rows = receiptsToRzlRows([makeReceipt()]);
      const r = rows[0];
      assert.equal(r.sollkonto, "7600");
      assert.equal(r.habenkonto, "3300");
      assert.equal(r.ustSchluessel, "1");
    },
  },
  {
    name: "RZL CSV: header + CRLF, no BOM, text has no separator",
    run: () => {
      const csv = rzlRowsToCsv(invoicesToRzlRows([makeInvoice()], custMap(makeCustomer()), SETTINGS_STD));
      assert.ok(csv.startsWith("Datum;Belegnummer;Sollkonto;Habenkonto;Betrag;USt-Schluessel;Text;Kostenstelle\r\n"));
      assert.ok(!csv.startsWith("﻿"));
      // Every data line must have exactly 7 separators (8 columns).
      for (const line of csv.trimEnd().split("\r\n").slice(1)) {
        assert.equal(line.split(";").length, 8, `wrong column count: ${line}`);
      }
    },
  },
  {
    name: "CP1252 encoder: Umlaut + Euro map to the correct single bytes",
    run: () => {
      const bytes = encodeCp1252("ä€ßA");
      assert.deepEqual(Array.from(bytes), [0xe4, 0x80, 0xdf, 0x41]);
    },
  },
];

let failed = 0;
for (const c of cases) {
  try {
    c.run();
    console.log(`  ok  ${c.name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${c.name}`);
    console.error(`      ${(err as Error).message}`);
  }
}

console.log(`\n${cases.length - failed}/${cases.length} passed`);
if (failed > 0) process.exit(1);
