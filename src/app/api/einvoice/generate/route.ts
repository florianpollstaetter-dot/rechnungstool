import { generateCiiXml } from "@/lib/einvoice/cii-xml";
import { generateUblXml } from "@/lib/einvoice/ubl-xml";
import { embedZugferdXml } from "@/lib/einvoice/zugferd-embed";
import { validateEInvoice } from "@/lib/einvoice/validator";
import { requireCompanyMembership } from "@/lib/api-auth";
import { logAndSanitize } from "@/lib/api-errors";

/**
 * POST /api/einvoice/generate
 * Body: { invoiceId: string, companyId: string, pdfBytes?: string (base64, required for zugferd) }
 * Returns: { xml: string, format: string } or { pdf: string (base64), xml: string } for ZUGFeRD
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { invoiceId, companyId, pdfBase64 } = body;

  if (!invoiceId) {
    return Response.json({ error: "invoiceId required" }, { status: 400 });
  }

  const auth = await requireCompanyMembership(companyId);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const supabase = auth.service;

  // Fetch invoice AND verify tenant ownership in one query
  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("company_id", companyId)
    .single();
  if (!invoice) {
    return Response.json({ error: "Invoice not found" }, { status: 404 });
  }

  // Fetch items
  const { data: items } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("position", { ascending: true });

  // Fetch customer (scope to same company as a defense-in-depth check)
  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", invoice.customer_id)
    .eq("company_id", companyId)
    .single();
  if (!customer) {
    return Response.json({ error: "Customer not found" }, { status: 404 });
  }

  // Fetch company settings
  const { data: settings } = await supabase
    .from("company_settings")
    .select("*")
    .eq("company_id", companyId)
    .single();
  if (!settings) {
    return Response.json({ error: "Company settings not found" }, { status: 404 });
  }

  const format = invoice.e_invoice_format || "zugferd";
  const eInvoiceData = {
    invoice: {
      ...invoice,
      items: items || [],
    },
    items: items || [],
    customer,
    settings,
    leitwegId: customer.leitweg_id || undefined,
  };

  // SCH-524 — EN 16931 pre-flight rule check. Block on hard errors,
  // surface warnings to the client.
  const validation = validateEInvoice(eInvoiceData);
  if (!validation.ok && !body.skipValidation) {
    return Response.json(
      {
        error: "E-Rechnung ist nicht EN-16931-konform",
        validation,
      },
      { status: 422 },
    );
  }

  try {
    if (format === "xrechnung") {
      const xml = generateUblXml(eInvoiceData);
      return Response.json({ xml, format: "xrechnung", validation });
    }

    // ZUGFeRD: generate CII XML
    const xml = generateCiiXml(eInvoiceData);

    if (pdfBase64) {
      // Embed XML into PDF
      const pdfBytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
      const zugferdPdf = await embedZugferdXml(pdfBytes, xml);
      const resultBase64 = Buffer.from(zugferdPdf).toString("base64");
      return Response.json({ pdf: resultBase64, xml, format: "zugferd", validation });
    }

    return Response.json({ xml, format: "zugferd", validation });
  } catch (err) {
    return Response.json(
      { error: logAndSanitize("einvoice/generate", err, "E-Rechnung-Generierung fehlgeschlagen.") },
      { status: 500 }
    );
  }
}
