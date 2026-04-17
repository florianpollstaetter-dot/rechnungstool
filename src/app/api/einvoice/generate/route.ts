import { createClient } from "@supabase/supabase-js";
import { generateCiiXml } from "@/lib/einvoice/cii-xml";
import { generateUblXml } from "@/lib/einvoice/ubl-xml";
import { embedZugferdXml } from "@/lib/einvoice/zugferd-embed";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/einvoice/generate
 * Body: { invoiceId: string, pdfBytes?: string (base64, required for zugferd) }
 * Returns: { xml: string, format: string } or { pdf: string (base64), xml: string } for ZUGFeRD
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { invoiceId, pdfBase64 } = body;

  if (!invoiceId) {
    return Response.json({ error: "invoiceId required" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch invoice
  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
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

  // Fetch customer
  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", invoice.customer_id)
    .single();
  if (!customer) {
    return Response.json({ error: "Customer not found" }, { status: 404 });
  }

  // Fetch company settings
  const { data: settings } = await supabase
    .from("company_settings")
    .select("*")
    .eq("company_id", invoice.company_id)
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

  try {
    if (format === "xrechnung") {
      const xml = generateUblXml(eInvoiceData);
      return Response.json({ xml, format: "xrechnung" });
    }

    // ZUGFeRD: generate CII XML
    const xml = generateCiiXml(eInvoiceData);

    if (pdfBase64) {
      // Embed XML into PDF
      const pdfBytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
      const zugferdPdf = await embedZugferdXml(pdfBytes, xml);
      const resultBase64 = Buffer.from(zugferdPdf).toString("base64");
      return Response.json({ pdf: resultBase64, xml, format: "zugferd" });
    }

    return Response.json({ xml, format: "zugferd" });
  } catch (err) {
    console.error("E-Rechnung generation failed:", err);
    return Response.json(
      { error: `Generation failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
