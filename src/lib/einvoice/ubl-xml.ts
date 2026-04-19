/**
 * UBL-XML generator for XRechnung (EN 16931 via UBL 2.1).
 * Produces XML conforming to CIUS XRechnung 3.0.
 */
import { EInvoiceData } from "./types";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtAmount(n: number): string {
  return n.toFixed(2);
}

function unitCode(unit: string): string {
  const map: Record<string, string> = {
    Stueck: "C62",
    Stunden: "HUR",
    Tage: "DAY",
    Monate: "MON",
    Pauschale: "C62",
    km: "KMT",
  };
  return map[unit] || "C62";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function generateUblXml(data: EInvoiceData): string {
  const { invoice, items, customer, settings, leitwegId } = data;
  const lines = items.length > 0 ? items : invoice.items;
  const currency = "EUR";
  const isCredit = invoice.status === "storniert";
  const typeCode = isCredit ? "381" : "380";

  // SCH-524 — group per-line rates (BG-23 TaxSubtotal per rate).
  const byRate = new Map<number, { basis: number; tax: number }>();
  for (const item of lines) {
    const rate = item.tax_rate ?? invoice.tax_rate;
    const entry = byRate.get(rate) ?? { basis: 0, tax: 0 };
    entry.basis += item.total;
    byRate.set(rate, entry);
  }
  for (const [rate, entry] of byRate) {
    entry.basis = round2(entry.basis);
    entry.tax = round2(entry.basis * (rate / 100));
    byRate.set(rate, entry);
  }
  const orderedRates = [...byRate.keys()].sort((a, b) => a - b);
  const totalBasis = round2(orderedRates.reduce((s, r) => s + byRate.get(r)!.basis, 0));
  const totalTax = round2(orderedRates.reduce((s, r) => s + byRate.get(r)!.tax, 0));
  const grand = round2(totalBasis + totalTax);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<ubl:Invoice xmlns:ubl="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">

  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(invoice.invoice_number)}</cbc:ID>
  <cbc:IssueDate>${invoice.invoice_date}</cbc:IssueDate>
  <cbc:DueDate>${invoice.due_date}</cbc:DueDate>
  <cbc:InvoiceTypeCode>${typeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
${leitwegId ? `  <cbc:BuyerReference>${esc(leitwegId)}</cbc:BuyerReference>` : `  <cbc:BuyerReference>${esc(invoice.invoice_number)}</cbc:BuyerReference>`}

  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(settings.address)}</cbc:StreetName>
        <cbc:CityName>${esc(settings.city)}</cbc:CityName>
        <cbc:PostalZone>${esc(settings.zip)}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>${esc(settings.country)}</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(settings.uid)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(settings.company_name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:Telephone>${esc(settings.phone)}</cbc:Telephone>
        <cbc:ElectronicMail>${esc(settings.email)}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(customer.address)}</cbc:StreetName>
        <cbc:CityName>${esc(customer.city)}</cbc:CityName>
        <cbc:PostalZone>${esc(customer.zip)}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>${esc(customer.country || "AT")}</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
${customer.uid_number ? `      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(customer.uid_number)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>` : ""}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(customer.company || customer.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <cac:Delivery>
    <cbc:ActualDeliveryDate>${invoice.delivery_date}</cbc:ActualDeliveryDate>
  </cac:Delivery>

  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${esc(settings.iban.replace(/\s/g, ""))}</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>

  <cac:PaymentTerms>
    <cbc:Note>Zahlbar bis ${invoice.due_date}</cbc:Note>
  </cac:PaymentTerms>

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${fmtAmount(totalTax)}</cbc:TaxAmount>
`;
  for (const rate of orderedRates) {
    const entry = byRate.get(rate)!;
    xml += `    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${fmtAmount(entry.basis)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${fmtAmount(entry.tax)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${rate === 0 ? "Z" : "S"}</cbc:ID>
        <cbc:Percent>${fmtAmount(rate)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
`;
  }
  xml += `  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${fmtAmount(totalBasis)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${fmtAmount(totalBasis)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${fmtAmount(grand)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currency}">${fmtAmount(grand)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

`;

  lines.forEach((item, idx) => {
    const lineRate = item.tax_rate ?? invoice.tax_rate;
    xml += `  <cac:InvoiceLine>
    <cbc:ID>${idx + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${unitCode(item.unit)}">${fmtAmount(item.quantity)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${currency}">${fmtAmount(item.total)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${esc(item.description)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${lineRate === 0 ? "Z" : "S"}</cbc:ID>
        <cbc:Percent>${fmtAmount(lineRate)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${currency}">${fmtAmount(item.unit_price)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
`;
  });

  xml += `</ubl:Invoice>`;
  return xml;
}
