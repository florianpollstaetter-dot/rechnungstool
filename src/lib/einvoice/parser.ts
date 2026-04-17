/**
 * E-Rechnung parser: extracts structured data from incoming
 * ZUGFeRD (CII-XML embedded in PDF) and XRechnung (UBL-XML) files.
 */
import { PDFDocument, PDFName, PDFString, PDFHexString, PDFDict, PDFArray, PDFStream } from "pdf-lib";
import { ParsedEInvoice, ParsedLineItem } from "./types";

/**
 * Parse an e-invoice from raw XML string (CII or UBL).
 * Auto-detects the format based on root element.
 */
export function parseEInvoiceXml(xml: string): ParsedEInvoice {
  if (xml.includes("CrossIndustryInvoice")) {
    return parseCiiXml(xml);
  } else if (xml.includes("ubl:Invoice") || xml.includes("Invoice xmlns")) {
    return parseUblXml(xml);
  }
  throw new Error("Unbekanntes E-Rechnungsformat: weder CII noch UBL erkannt");
}

/** Simple XML tag value extractor — works for non-nested single-value tags. */
function tagValue(xml: string, tag: string): string {
  // Try with namespace prefix
  const patterns = [
    new RegExp(`<[^>]*:${tag}[^>]*>([^<]*)<`, "s"),
    new RegExp(`<${tag}[^>]*>([^<]*)<`, "s"),
  ];
  for (const re of patterns) {
    const m = xml.match(re);
    if (m) return m[1].trim();
  }
  return "";
}

/** Extract a block between opening and closing tags (handles namespaced tags). */
function tagBlock(xml: string, tag: string): string {
  const re = new RegExp(`<[^>]*:?${tag}[^>]*>([\\s\\S]*?)<\\/[^>]*:?${tag}>`, "s");
  const m = xml.match(re);
  return m ? m[0] : "";
}

/** Extract all occurrences of a block. */
function tagBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<[^>]*:?${tag}[^>]*>[\\s\\S]*?<\\/[^>]*:?${tag}>`, "gs");
  return Array.from(xml.matchAll(re)).map((m) => m[0]);
}

function parseCiiDate(dateStr: string): string {
  if (dateStr.length === 8) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }
  return dateStr;
}

function parseCiiXml(xml: string): ParsedEInvoice {
  const sellerBlock = tagBlock(xml, "SellerTradeParty");
  const buyerBlock = tagBlock(xml, "BuyerTradeParty");
  const settlementBlock = tagBlock(xml, "ApplicableHeaderTradeSettlement");
  const summaryBlock = tagBlock(xml, "SpecifiedTradeSettlementHeaderMonetarySummation");
  const taxBlock = tagBlock(settlementBlock, "ApplicableTradeTax");
  const deliveryBlock = tagBlock(xml, "ApplicableHeaderTradeDelivery");
  const paymentTermsBlock = tagBlock(xml, "SpecifiedTradePaymentTerms");

  const sellerAddr = tagBlock(sellerBlock, "PostalTradeAddress");
  const buyerAddr = tagBlock(buyerBlock, "PostalTradeAddress");

  const lineBlocks = tagBlocks(xml, "IncludedSupplyChainTradeLineItem");
  const lineItems: ParsedLineItem[] = lineBlocks.map((block) => {
    const qty = parseFloat(tagValue(block, "BilledQuantity")) || 0;
    const price = parseFloat(tagValue(block, "ChargeAmount")) || 0;
    const lineTotal = parseFloat(tagValue(block, "LineTotalAmount")) || qty * price;
    return {
      description: tagValue(block, "Name"),
      quantity: qty,
      unit: tagValue(block, "BilledQuantity").replace(/[0-9.]/g, "").trim() || "C62",
      unitPrice: price,
      total: lineTotal,
    };
  });

  const issueDateRaw = tagValue(tagBlock(xml, "IssueDateTime"), "DateTimeString");
  const dueDateRaw = tagValue(tagBlock(paymentTermsBlock, "DueDateDateTime"), "DateTimeString");
  const deliveryDateRaw = tagValue(tagBlock(deliveryBlock, "OccurrenceDateTime"), "DateTimeString");

  return {
    format: "zugferd",
    invoiceNumber: tagValue(xml, "ID"),
    issueDate: parseCiiDate(issueDateRaw),
    dueDate: parseCiiDate(dueDateRaw),
    sellerName: tagValue(sellerBlock, "Name"),
    sellerVatId: tagValue(sellerBlock, "ID"),
    sellerAddress: tagValue(sellerAddr, "LineOne"),
    sellerZip: tagValue(sellerAddr, "PostcodeCode"),
    sellerCity: tagValue(sellerAddr, "CityName"),
    sellerCountry: tagValue(sellerAddr, "CountryID"),
    buyerName: tagValue(buyerBlock, "Name"),
    buyerVatId: tagValue(buyerBlock, "ID"),
    currency: tagValue(settlementBlock, "InvoiceCurrencyCode"),
    lineItems,
    netTotal: parseFloat(tagValue(summaryBlock, "TaxBasisTotalAmount")) || 0,
    taxRate: parseFloat(tagValue(taxBlock, "RateApplicablePercent")) || 0,
    taxAmount: parseFloat(tagValue(summaryBlock, "TaxTotalAmount")) || 0,
    grossTotal: parseFloat(tagValue(summaryBlock, "GrandTotalAmount")) || 0,
    rawXml: xml,
  };
}

function parseUblXml(xml: string): ParsedEInvoice {
  const supplierBlock = tagBlock(xml, "AccountingSupplierParty");
  const customerBlock = tagBlock(xml, "AccountingCustomerParty");
  const taxTotalBlock = tagBlock(xml, "TaxTotal");
  const monetaryBlock = tagBlock(xml, "LegalMonetaryTotal");
  const taxSubBlock = tagBlock(taxTotalBlock, "TaxSubtotal");

  const supplierAddr = tagBlock(supplierBlock, "PostalAddress");
  const customerAddr = tagBlock(customerBlock, "PostalAddress");

  const lineBlocks = tagBlocks(xml, "InvoiceLine");
  const lineItems: ParsedLineItem[] = lineBlocks.map((block) => {
    const qty = parseFloat(tagValue(block, "InvoicedQuantity")) || 0;
    const price = parseFloat(tagValue(block, "PriceAmount")) || 0;
    const lineTotal = parseFloat(tagValue(block, "LineExtensionAmount")) || qty * price;
    return {
      description: tagValue(block, "Name"),
      quantity: qty,
      unit: "C62",
      unitPrice: price,
      total: lineTotal,
    };
  });

  const leitwegId = tagValue(xml, "BuyerReference");

  return {
    format: "xrechnung",
    invoiceNumber: tagValue(xml, "ID"),
    issueDate: tagValue(xml, "IssueDate"),
    dueDate: tagValue(xml, "DueDate"),
    sellerName: tagValue(supplierBlock, "RegistrationName"),
    sellerVatId: tagValue(supplierBlock, "CompanyID"),
    sellerAddress: tagValue(supplierAddr, "StreetName"),
    sellerZip: tagValue(supplierAddr, "PostalZone"),
    sellerCity: tagValue(supplierAddr, "CityName"),
    sellerCountry: tagValue(supplierAddr, "IdentificationCode"),
    buyerName: tagValue(customerBlock, "RegistrationName"),
    buyerVatId: tagValue(customerBlock, "CompanyID"),
    currency: tagValue(xml, "DocumentCurrencyCode"),
    lineItems,
    netTotal: parseFloat(tagValue(monetaryBlock, "TaxExclusiveAmount")) || 0,
    taxRate: parseFloat(tagValue(taxSubBlock, "Percent")) || 0,
    taxAmount: parseFloat(tagValue(taxTotalBlock, "TaxAmount")) || 0,
    grossTotal: parseFloat(tagValue(monetaryBlock, "TaxInclusiveAmount")) || 0,
    leitwegId: leitwegId || undefined,
    rawXml: xml,
  };
}

/**
 * Extract embedded XML from a ZUGFeRD PDF.
 * Looks for the factur-x.xml or zugferd-invoice.xml attachment.
 */
export async function extractXmlFromPdf(pdfBytes: Uint8Array): Promise<string | null> {
  const { PDFDocument } = await import("pdf-lib");
  const pdfDoc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const catalog = pdfDoc.catalog;
  const namesRef = catalog.get(PDFName.of("Names"));
  if (!namesRef) return null;

  // Walk Names > EmbeddedFiles > Names array
  const context = pdfDoc.context;
  const namesDict = context.lookup(namesRef);
  if (!namesDict || !(namesDict instanceof PDFDict)) return null;

  const embeddedFilesRef = namesDict.get(PDFName.of("EmbeddedFiles"));
  if (!embeddedFilesRef) return null;

  const embeddedFiles = context.lookup(embeddedFilesRef);
  if (!embeddedFiles || !(embeddedFiles instanceof PDFDict)) return null;

  const namesArray = embeddedFiles.get(PDFName.of("Names"));
  if (!namesArray) return null;

  const arr = context.lookup(namesArray);
  if (!arr || !(arr instanceof PDFArray)) return null;

  // Iterate name/value pairs
  for (let i = 0; i < arr.size(); i += 2) {
    const nameObj = arr.get(i);
    const name =
      nameObj instanceof PDFString
        ? nameObj.decodeText()
        : nameObj instanceof PDFHexString
        ? nameObj.decodeText()
        : "";

    if (
      name.toLowerCase().includes("factur-x") ||
      name.toLowerCase().includes("zugferd") ||
      name.toLowerCase().endsWith(".xml")
    ) {
      const fileSpecRef = arr.get(i + 1);
      const fileSpec = context.lookup(fileSpecRef);
      if (!fileSpec || !(fileSpec instanceof PDFDict)) continue;

      const efRef = fileSpec.get(PDFName.of("EF"));
      const ef = context.lookup(efRef);
      if (!ef || !(ef instanceof PDFDict)) continue;

      const streamRef = ef.get(PDFName.of("F")) || ef.get(PDFName.of("UF"));
      const stream = context.lookup(streamRef);
      if (!stream || !(stream instanceof PDFStream)) continue;

      const contents = stream.getContents();
      return new TextDecoder().decode(contents);
    }
  }

  return null;
}

