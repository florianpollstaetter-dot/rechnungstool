// SCH-963 K3-AG1 — tenant self-service pause.
// Sets companies.status='suspended' so SCH-962 BlockedCompanyGate locks
// every member out on next reload. Reactivation only via operator console.
// Body must echo the exact company name as a server-side guard against
// accidental POSTs from misrouted clients.

import { requireCompanyAdmin, logCompanyAuditAction } from "@/lib/company-admin";
import { createServiceClient, logOperatorAction } from "@/lib/operator";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireCompanyAdmin();
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  if (!auth.adminCompanyIds.includes(id)) {
    return Response.json(
      { error: "Kein Admin-Zugriff auf diese Firma" },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    confirm_name?: unknown;
  };
  const confirmName = typeof body.confirm_name === "string" ? body.confirm_name : "";

  const service = createServiceClient();
  const { data: company, error: lookupError } = await service
    .from("companies")
    .select("id, name, status")
    .eq("id", id)
    .single();
  if (lookupError || !company) {
    return Response.json({ error: "Unternehmen nicht gefunden" }, { status: 404 });
  }
  if (confirmName !== company.name) {
    return Response.json(
      { error: "Bestätigung stimmt nicht — bitte den exakten Firmennamen eintippen." },
      { status: 400 },
    );
  }
  if (company.status === "suspended" || company.status === "cancelled") {
    return Response.json(
      { error: `Unternehmen ist bereits ${company.status}.` },
      { status: 409 },
    );
  }

  const { error: updateError } = await service
    .from("companies")
    .update({ status: "suspended", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  // Dual audit: company_audit_log for in-tenant visibility, operator_audit_log
  // so the lock survives if an operator later purges the company.
  await logCompanyAuditAction(
    auth.user!.id,
    id,
    "tenant_admin.company.pause",
    "company",
    id,
    { previous_status: company.status, name: company.name },
  );
  await logOperatorAction(auth.user!.id, "tenant_admin.company.pause", "company", id, {
    name: company.name,
    previous_status: company.status,
  });

  return Response.json({ ok: true });
}
