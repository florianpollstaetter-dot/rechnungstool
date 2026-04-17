import { createClient } from "@supabase/supabase-js";
import { invoicesToDatevRows, receiptsToDatevRows, datevRowsToCsv } from "@/lib/einvoice/datev-export";
import type { Invoice, Customer, Receipt } from "@/lib/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/einvoice/datev
 * Body: { companyId: string, month?: string (YYYY-MM), includeReceipts?: boolean }
 * Returns: CSV as text/csv download
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { companyId, month, includeReceipts } = body;

  if (!companyId) {
    return Response.json({ error: "companyId required" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch invoices
  let invoiceQuery = supabase
    .from("invoices")
    .select("*")
    .eq("company_id", companyId)
    .neq("status", "entwurf")
    .order("invoice_date", { ascending: true });

  if (month) {
    const start = `${month}-01`;
    const endDate = new Date(start);
    endDate.setMonth(endDate.getMonth() + 1);
    const end = endDate.toISOString().split("T")[0];
    invoiceQuery = invoiceQuery.gte("invoice_date", start).lt("invoice_date", end);
  }

  const { data: invoices } = await invoiceQuery;

  // Fetch customers for invoice mapping
  const { data: customers } = await supabase
    .from("customers")
    .select("*")
    .eq("company_id", companyId);

  const customerMap = new Map<string, Customer>();
  (customers || []).forEach((c: Customer) => customerMap.set(c.id, c));

  const invoiceRows = invoicesToDatevRows(invoices || [], customerMap);

  let receiptRows: ReturnType<typeof receiptsToDatevRows> = [];
  if (includeReceipts) {
    let receiptQuery = supabase
      .from("receipts")
      .select("*")
      .eq("company_id", companyId)
      .order("invoice_date", { ascending: true });

    if (month) {
      const start = `${month}-01`;
      const endDate = new Date(start);
      endDate.setMonth(endDate.getMonth() + 1);
      const end = endDate.toISOString().split("T")[0];
      receiptQuery = receiptQuery.gte("invoice_date", start).lt("invoice_date", end);
    }

    const { data: receipts } = await receiptQuery;
    receiptRows = receiptsToDatevRows((receipts || []) as Receipt[]);
  }

  const allRows = [...invoiceRows, ...receiptRows];
  const csv = datevRowsToCsv(allRows);

  const filename = month
    ? `DATEV_Export_${month}.csv`
    : `DATEV_Export_${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
