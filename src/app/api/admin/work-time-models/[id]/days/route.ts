// ORA-2320 — service-role GET for Arbeitszeitmodell day rows.
//
// The /admin/arbeitszeitmodelle UI's `openEdit` previously called
// `getWorkTimeModelDays` from `src/lib/db.ts` directly. That used the anon-key
// browser client and silently dropped the error result, so an RLS denial
// returned `[]` and the form fell back to `emptyDays(...)` — the same
// Mo-Fr 09:00-17:30 default every time. Diagnosis: ORA-2301.
//
// The write-path equivalents (PATCH on ../route.ts, POST on
// ../../route.ts) already run via service-role + manual tenancy enforcement;
// this route closes the read-path half of the gap so the edit form actually
// shows the saved values.

import { requireCompanyAdmin } from "@/lib/company-admin";
import { createServiceClient } from "@/lib/operator";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCompanyAdmin();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { id: modelId } = await ctx.params;
  if (!modelId) {
    return Response.json({ error: "Modell-ID fehlt" }, { status: 400 });
  }

  const service = createServiceClient();

  // Tenancy: service-role bypasses RLS, so confirm the model belongs to a
  // company the caller administers before returning its day rows.
  const { data: model, error: modelErr } = await service
    .from("work_time_models")
    .select("id, company_id")
    .eq("id", modelId)
    .maybeSingle();
  if (modelErr) return Response.json({ error: modelErr.message }, { status: 500 });
  if (!model) return Response.json({ error: "Modell nicht gefunden" }, { status: 404 });
  if (!auth.adminCompanyIds.includes(model.company_id as string)) {
    return Response.json({ error: "Kein Zugriff auf dieses Modell" }, { status: 403 });
  }

  const { data: days, error: daysErr } = await service
    .from("work_time_model_days")
    .select("*")
    .eq("model_id", modelId)
    .order("weekday", { ascending: true });
  if (daysErr) return Response.json({ error: daysErr.message }, { status: 500 });

  return Response.json({ days: days ?? [] });
}
