// SCH-366 Modul 1 — Server-Route für User-Dashboard-Layouts.
//
// Die db.ts-Helper (getUserDashboardLayout / upsertUserDashboardLayout) arbeiten
// mit dem Browser-Client. Diese Route spiegelt dieselbe Funktion über den
// Service-Role-Key, damit SSR-Pfade und zukünftige RLS-Konfigurationen
// denselben Endpunkt benutzen können.
//
// Konventionen (abgestimmt mit /api/projects/create-from-quote):
//   - companyId + userId kommen explizit in der Anfrage — keine Session-Ableitung,
//     bis Phase 2 Auth einführt.
//   - dashboardKey ist optional, Default "main".
//   - layout_json bleibt opak (siehe Feasibility-Report SCH-375 Modul 1):
//     die UI besitzt das react-grid-layout-Objekt, kein Server-Schema-Check.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_DASHBOARD_KEY = "main";

function serviceClient(): SupabaseClient | Response {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return Response.json(
      { error: "Server-Konfiguration fehlt (SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 }
    );
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
}

function missingIds(companyId?: string | null, userId?: string | null) {
  if (!companyId || !userId) {
    return Response.json(
      { error: "companyId und userId sind erforderlich" },
      { status: 400 }
    );
  }
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId")?.trim() || null;
  const userId = url.searchParams.get("userId")?.trim() || null;
  const dashboardKey =
    url.searchParams.get("dashboardKey")?.trim() || DEFAULT_DASHBOARD_KEY;

  const bad = missingIds(companyId, userId);
  if (bad) return bad;

  const sb = serviceClient();
  if (sb instanceof Response) return sb;

  const res = await sb
    .from("user_dashboard_layouts")
    .select("*")
    .eq("company_id", companyId!)
    .eq("user_id", userId!)
    .eq("dashboard_key", dashboardKey)
    .maybeSingle();

  if (res.error) {
    return Response.json({ error: res.error.message }, { status: 500 });
  }
  return Response.json({ layout: res.data ?? null });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        companyId?: string;
        userId?: string;
        dashboardKey?: string;
        layoutJson?: unknown;
      }
    | null;

  const companyId = body?.companyId?.trim() || null;
  const userId = body?.userId?.trim() || null;
  const dashboardKey = body?.dashboardKey?.trim() || DEFAULT_DASHBOARD_KEY;

  const bad = missingIds(companyId, userId);
  if (bad) return bad;

  if (body?.layoutJson === undefined) {
    return Response.json(
      { error: "layoutJson ist erforderlich" },
      { status: 400 }
    );
  }

  const sb = serviceClient();
  if (sb instanceof Response) return sb;

  const res = await sb
    .from("user_dashboard_layouts")
    .upsert(
      {
        company_id: companyId!,
        user_id: userId!,
        dashboard_key: dashboardKey,
        layout_json: body.layoutJson,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,user_id,dashboard_key" }
    )
    .select()
    .single();

  if (res.error || !res.data) {
    return Response.json(
      { error: res.error?.message ?? "Upsert fehlgeschlagen" },
      { status: 500 }
    );
  }
  return Response.json({ layout: res.data });
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { companyId?: string; userId?: string; dashboardKey?: string }
    | null;

  const companyId = body?.companyId?.trim() || null;
  const userId = body?.userId?.trim() || null;
  const dashboardKey = body?.dashboardKey?.trim() || DEFAULT_DASHBOARD_KEY;

  const bad = missingIds(companyId, userId);
  if (bad) return bad;

  const sb = serviceClient();
  if (sb instanceof Response) return sb;

  const res = await sb
    .from("user_dashboard_layouts")
    .delete()
    .eq("company_id", companyId!)
    .eq("user_id", userId!)
    .eq("dashboard_key", dashboardKey);

  if (res.error) {
    return Response.json({ error: res.error.message }, { status: 500 });
  }
  return Response.json({ deleted: true });
}
