import { requireSuperadmin, createServiceClient, logOperatorAction } from "@/lib/operator";

export async function GET() {
  const auth = await requireSuperadmin();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const service = createServiceClient();

  // Get all companies with member counts and stats
  const { data: companies, error } = await service
    .from("companies")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Get member counts per company
  const { data: memberCounts } = await service
    .from("company_members")
    .select("company_id");

  const countMap = new Map<string, number>();
  (memberCounts ?? []).forEach((row: { company_id: string }) => {
    countMap.set(row.company_id, (countMap.get(row.company_id) || 0) + 1);
  });

  // Get receipt counts per company
  const { data: receiptCounts } = await service
    .from("receipts")
    .select("company_id");

  const receiptMap = new Map<string, number>();
  (receiptCounts ?? []).forEach((row: { company_id: string }) => {
    receiptMap.set(row.company_id, (receiptMap.get(row.company_id) || 0) + 1);
  });

  // Get invoice counts per company
  const { data: invoiceCounts } = await service
    .from("invoices")
    .select("company_id");

  const invoiceMap = new Map<string, number>();
  (invoiceCounts ?? []).forEach((row: { company_id: string }) => {
    invoiceMap.set(row.company_id, (invoiceMap.get(row.company_id) || 0) + 1);
  });

  const enriched = (companies ?? []).map((c: Record<string, unknown>) => ({
    ...c,
    user_count: countMap.get(c.id as string) || 0,
    receipt_count: receiptMap.get(c.id as string) || 0,
    invoice_count: invoiceMap.get(c.id as string) || 0,
  }));

  return Response.json(enriched);
}

export async function POST(request: Request) {
  const auth = await requireSuperadmin();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { name, slug, plan } = await request.json();
  if (!name || !slug) {
    return Response.json({ error: "Name und Kürzel sind erforderlich" }, { status: 400 });
  }

  const service = createServiceClient();

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);

  const { data, error } = await service.from("companies").insert({
    id: slug,
    name,
    slug,
    plan: plan || "trial",
    status: "active",
    trial_ends_at: trialEndsAt.toISOString(),
  }).select().single();

  if (error) {
    if (error.code === "23505") {
      return Response.json({ error: "Kürzel bereits vergeben" }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Create default company_settings
  await service.from("company_settings").insert({
    id: slug,
    company_name: name,
    company_type: "gmbh",
    address: "", city: "", zip: "", uid: "", iban: "", bic: "",
    phone: "", email: "", logo_url: "",
    default_tax_rate: 20,
    default_payment_terms_days: 14,
    next_invoice_number: 1,
    next_quote_number: 1,
    accompanying_text_de: "Vielen Dank für Ihren Auftrag!",
    accompanying_text_en: "Thank you for your order!",
  });

  await logOperatorAction(auth.user!.id, "company.create", "company", slug, { name, plan: plan || "trial" });

  return Response.json(data);
}

export async function PATCH(request: Request) {
  const auth = await requireSuperadmin();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { id, status, plan, trial_ends_at } = await request.json();
  if (!id) return Response.json({ error: "Company ID erforderlich" }, { status: 400 });

  const service = createServiceClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status) updates.status = status;
  if (plan) updates.plan = plan;
  if (trial_ends_at) updates.trial_ends_at = trial_ends_at;

  const { data, error } = await service
    .from("companies")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const action = status ? `company.${status}` : plan ? "company.plan_change" : "company.update";
  await logOperatorAction(auth.user!.id, action, "company", id, updates);

  return Response.json(data);
}
