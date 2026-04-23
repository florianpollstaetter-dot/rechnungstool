import { parseEInvoiceXml, extractXmlFromPdf } from "@/lib/einvoice/parser";
import { logAndSanitize } from "@/lib/api-errors";

/**
 * POST /api/einvoice/parse
 * Body: { xml?: string, pdfBase64?: string }
 * Returns: ParsedEInvoice
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { xml, pdfBase64 } = body;

  try {
    let xmlContent = xml;

    // If PDF provided, try to extract embedded XML first
    if (pdfBase64 && !xmlContent) {
      const pdfBytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
      xmlContent = await extractXmlFromPdf(pdfBytes);
      if (!xmlContent) {
        return Response.json(
          { error: "Keine eingebettete E-Rechnung (XML) in der PDF gefunden" },
          { status: 400 }
        );
      }
    }

    if (!xmlContent) {
      return Response.json(
        { error: "xml oder pdfBase64 erforderlich" },
        { status: 400 }
      );
    }

    const parsed = parseEInvoiceXml(xmlContent);
    return Response.json(parsed);
  } catch (err) {
    return Response.json(
      { error: logAndSanitize("einvoice/parse", err, "E-Rechnung-Parsing fehlgeschlagen.") },
      { status: 500 }
    );
  }
}
