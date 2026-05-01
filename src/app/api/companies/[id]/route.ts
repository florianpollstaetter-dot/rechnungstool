// SCH-963 K3-AG1 — tenant self-service hard-delete.
// Reuses SCH-962's purge_company() RPC (drops every row in every public.*
// table with a `company_id` column, then deletes the company row itself).
// Tenant-side guards on top of the SuperAdmin variant:
//   - caller must be user_profiles.role='admin' AND member of `id`
//   - body must echo the exact company name
//   - body must include the literal word "LÖSCHEN" so the 5-step UI can't be
//     accidentally bypassed by a misrouted client
// Audit goes to operator_audit_log (it survives the purge cascade —
// company_audit_log is FK-cascaded with the company).

import { requireCompanyAdmin } from "@/lib/company-admin";
import { createServiceClient, logOperatorAction } from "@/lib/operator";

const REQUIRED_DELETE_WORD = "LÖSCHEN";

export async function DELETE(
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
    confirm_word?: unknown;
  };
  const confirmName = typeof body.confirm_name === "string" ? body.confirm_name : "";
  const confirmWord = typeof body.confirm_word === "string" ? body.confirm_word : "";

  const service = createServiceClient();
  const { data: company, error: lookupError } = await service
    .from("companies")
    .select("id, name")
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
  if (confirmWord !== REQUIRED_DELETE_WORD) {
    return Response.json(
      { error: `Bitte das Wort „${REQUIRED_DELETE_WORD}" exakt eintippen.` },
      { status: 400 },
    );
  }

  // Best-effort snapshot for the audit row before purge_company() drops it all.
  const [receipts, invoices, members] = await Promise.all([
    service.from("receipts").select("id", { count: "exact", head: true }).eq("company_id", id),
    service.from("invoices").select("id", { count: "exact", head: true }).eq("company_id", id),
    service.from("company_members").select("user_id", { count: "exact", head: true }).eq("company_id", id),
  ]);

  const { error: purgeError } = await service.rpc("purge_company", { p_company_id: id });
  if (purgeError) {
    return Response.json({ error: purgeError.message }, { status: 500 });
  }

  await logOperatorAction(auth.user!.id, "tenant_admin.company.delete", "company", id, {
    name: company.name,
    receipts: receipts.count ?? 0,
    invoices: invoices.count ?? 0,
    members: members.count ?? 0,
  });

  return Response.json({ ok: true });
}
