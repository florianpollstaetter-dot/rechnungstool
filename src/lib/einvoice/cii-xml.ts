/**
 * CII-XML generator for ZUGFeRD / Factur-X (COMFORT profile).
 * Produces Cross Industry Invoice XML conforming to EN 16931.
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

function fmtDate(iso: string): string {
  return iso.replace(/-/g, "").slice(0, 8);
}

function fmtAmount(n: number): string {
  return n.toFixed(2);
}

/** Map internal unit codes to UN/ECE Recommendation 20 codes. */
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

/** Document type code per UNTDID 1001 — 380 = Commercial Invoice, 381 = Credit Note. */
function typeCode(status: string): string {
  return status === "storniert" ? "381" : "380";
}

export function generateCiiXml(data: EInvoiceData): string {
  const { invoice, items, customer, settings } = data;
  const lines = items.length > 0 ? items : invoice.items;
  const currency = "EUR";

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">

  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:comfort</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>

  <rsm:ExchangedDocument>
    <ram:ID>${esc(invoice.invoice_number)}</ram:ID>
    <ram:TypeCode>${typeCode(invoice.status)}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${fmtDate(invoice.invoice_date)}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>

  <rsm:SupplyChainTradeTransaction>
`;

  // Line items
  lines.forEach((item, idx) => {
    const lineNet = item.total;
    xml += `    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${idx + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${esc(item.description)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${fmtAmount(item.unit_price)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${unitCode(item.unit)}">${fmtAmount(item.quantity)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>S</ram:CategoryCode>
          <ram:RateApplicablePercent>${fmtAmount(invoice.tax_rate)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${fmtAmount(lineNet)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>
`;
  });

  // Header trade agreement (seller + buyer)
  xml += `    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${esc(settings.company_name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:LineOne>${esc(settings.address)}</ram:LineOne>
          <ram:PostcodeCode>${esc(settings.zip)}</ram:PostcodeCode>
          <ram:CityName>${esc(settings.city)}</ram:CityName>
          <ram:CountryID>${esc(settings.country || "AT")}</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${esc(settings.uid)}</ram:ID>
        </ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(customer.company || customer.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:LineOne>${esc(customer.address)}</ram:LineOne>
          <ram:PostcodeCode>${esc(customer.zip)}</ram:PostcodeCode>
          <ram:CityName>${esc(customer.city)}</ram:CityName>
          <ram:CountryID>${esc(customer.country || "AT")}</ram:CountryID>
        </ram:PostalTradeAddress>
${customer.uid_number ? `        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${esc(customer.uid_number)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ""}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>

    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime>
          <udt:DateTimeString format="102">${fmtDate(invoice.delivery_date)}</udt:DateTimeString>
        </ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>

    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${currency}</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${esc(settings.iban.replace(/\s/g, ""))}</ram:IBANID>
        </ram:PayeePartyCreditorFinancialAccount>
        <ram:PayeeSpecifiedCreditorFinancialInstitution>
          <ram:BICID>${esc(settings.bic)}</ram:BICID>
        </ram:PayeeSpecifiedCreditorFinancialInstitution>
      </ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${fmtAmount(invoice.tax_amount)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${fmtAmount(invoice.subtotal)}</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>${fmtAmount(invoice.tax_rate)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${fmtDate(invoice.due_date)}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${fmtAmount(invoice.subtotal)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${fmtAmount(invoice.subtotal)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${currency}">${fmtAmount(invoice.tax_amount)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${fmtAmount(invoice.total)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${fmtAmount(invoice.total)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

  return xml;
}
