/**
 * ORA-3316 — ebInterface 6.1 generator (Austrian WKO/AustriaPro e-invoice).
 *
 * ebInterface is the native Austrian e-invoice standard and one of the two
 * formats the federal government portal e-rechnung.gv.at accepts for upload
 * (the other being Peppol-UBL). Our existing UBL export (ubl-xml.ts) declares
 * the *XRechnung 3.0* CustomizationID — a German national CIUS that the Austrian
 * Bund does NOT accept — so Austrian B2G invoicing needs this native format.
 *
 * Schema: http://www.ebinterface.at/schema/6p1/ (Invoice.xsd, 2022-06-25).
 * Element order below follows the XSD sequences exactly (XSD is order-sensitive):
 *   Invoice: InvoiceNumber, InvoiceDate, [Delivery], Biller, InvoiceRecipient,
 *            Details, Tax, TotalGrossAmount, PayableAmount, [PaymentMethod],
 *            [PaymentConditions].
 *
 * The EN 16931 VAT category (UNCL5305) comes from the shared tax-category.ts, so
 * ebInterface stays in lockstep with UBL/CII. In ebInterface the category code
 * is the required `TaxCategoryCode` attribute on <TaxPercent>, and the exemption
 * reason (BT-120) is carried as the <Comment> of the <TaxItem>.
 */
import { EInvoiceData } from "./types";
import { deriveTaxCategory, taxCategoryContext } from "./tax-category";

const GENERATING_SYSTEM = "Orange Octo Rechnungstool";

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

/** ebInterface <Quantity Unit="…"> uses UN/ECE Rec 20 codes, same as UBL. */
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

export function generateEbInterfaceXml(data: EInvoiceData): string {
  const { invoice, items, customer, settings, leitwegId } = data;
  const lines = items.length > 0 ? items : invoice.items;
  const currency = "EUR";
  const isCredit = invoice.status === "storniert";
  const documentType = isCredit ? "CreditMemo" : "Invoice";
  const lang = invoice.language === "en" ? "en" : "de";

  // Group per-line nets by rate → one document-level <TaxItem> per rate group,
  // identical bucketing to ubl-xml.ts so both formats report the same breakdown.
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

  const taxCtx = taxCategoryContext(data);

  const recipientName = customer.company || customer.name;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="http://www.ebinterface.at/schema/6p1/" GeneratingSystem="${esc(GENERATING_SYSTEM)}" DocumentType="${documentType}" InvoiceCurrency="${currency}" Language="${lang}">
  <InvoiceNumber>${esc(invoice.invoice_number)}</InvoiceNumber>
  <InvoiceDate>${invoice.invoice_date}</InvoiceDate>
  <Delivery>
    <Date>${invoice.delivery_date}</Date>
  </Delivery>
  <Biller>
    <VATIdentificationNumber>${esc(settings.uid)}</VATIdentificationNumber>
    <Address>
      <Name>${esc(settings.company_name)}</Name>
      <Street>${esc(settings.address)}</Street>
      <Town>${esc(settings.city)}</Town>
      <ZIP>${esc(settings.zip)}</ZIP>
      <Country CountryCode="${esc(settings.country || "AT")}">${esc(settings.country || "AT")}</Country>
${settings.phone ? `      <Phone>${esc(settings.phone)}</Phone>\n` : ""}${settings.email ? `      <Email>${esc(settings.email)}</Email>\n` : ""}    </Address>
  </Biller>
  <InvoiceRecipient>
    <VATIdentificationNumber>${esc(customer.uid_number || "")}</VATIdentificationNumber>
${leitwegId ? `    <OrderReference>
      <OrderID>${esc(leitwegId)}</OrderID>
    </OrderReference>
` : ""}    <Address>
      <Name>${esc(recipientName)}</Name>
      <Street>${esc(customer.address)}</Street>
      <Town>${esc(customer.city)}</Town>
      <ZIP>${esc(customer.zip)}</ZIP>
      <Country CountryCode="${esc(customer.country || "AT")}">${esc(customer.country || "AT")}</Country>
    </Address>
  </InvoiceRecipient>
  <Details>
    <ItemList>
`;

  lines.forEach((item, idx) => {
    const lineRate = item.tax_rate ?? invoice.tax_rate;
    const cat = deriveTaxCategory(lineRate, taxCtx);
    const lineTax = round2(item.total * (lineRate / 100));
    xml += `      <ListLineItem>
        <PositionNumber>${idx + 1}</PositionNumber>
        <Description>${esc(item.description)}</Description>
        <Quantity Unit="${unitCode(item.unit)}">${fmtAmount(item.quantity)}</Quantity>
        <UnitPrice>${fmtAmount(item.unit_price)}</UnitPrice>
        <TaxItem>
          <TaxableAmount>${fmtAmount(round2(item.total))}</TaxableAmount>
          <TaxPercent TaxCategoryCode="${cat.code}">${fmtAmount(lineRate)}</TaxPercent>
          <TaxAmount>${fmtAmount(lineTax)}</TaxAmount>
        </TaxItem>
        <LineItemAmount>${fmtAmount(round2(item.total))}</LineItemAmount>
      </ListLineItem>
`;
  });

  xml += `    </ItemList>
  </Details>
  <Tax>
`;
  for (const rate of orderedRates) {
    const entry = byRate.get(rate)!;
    const cat = deriveTaxCategory(rate, taxCtx);
    xml += `    <TaxItem>
      <TaxableAmount>${fmtAmount(entry.basis)}</TaxableAmount>
      <TaxPercent TaxCategoryCode="${cat.code}">${fmtAmount(rate)}</TaxPercent>
      <TaxAmount>${fmtAmount(entry.tax)}</TaxAmount>
${cat.exemptionReason ? `      <Comment>${esc(cat.exemptionReason)}</Comment>\n` : ""}    </TaxItem>
`;
  }
  xml += `  </Tax>
  <TotalGrossAmount>${fmtAmount(grand)}</TotalGrossAmount>
  <PayableAmount>${fmtAmount(grand)}</PayableAmount>
`;

  const iban = (settings.iban || "").replace(/\s/g, "");
  if (iban) {
    xml += `  <PaymentMethod>
    <UniversalBankTransaction>
      <BeneficiaryAccount>
${settings.bic ? `        <BIC>${esc(settings.bic)}</BIC>\n` : ""}        <IBAN>${esc(iban)}</IBAN>
        <BankAccountOwner>${esc(settings.company_name)}</BankAccountOwner>
      </BeneficiaryAccount>
    </UniversalBankTransaction>
  </PaymentMethod>
`;
  }

  xml += `  <PaymentConditions>
    <DueDate>${invoice.due_date}</DueDate>
  </PaymentConditions>
</Invoice>`;

  return xml;
}
