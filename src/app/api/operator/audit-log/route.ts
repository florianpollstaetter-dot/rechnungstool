import { requireSuperadmin, createServiceClient } from "@/lib/operator";

export async function GET(request: Request) {
  const auth = await requireSuperadmin();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");

  const service = createServiceClient();

  const { data, error, count } = await service
    .from("operator_audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Enrich with operator names
  const operatorIds = [...new Set((data ?? []).map((r: Record<string, unknown>) => r.operator_id as string))];
  const { data: profiles } = await service
    .from("user_profiles")
    .select("auth_user_id, display_name, email")
    .in("auth_user_id", operatorIds);

  const nameMap = new Map<string, string>();
  (profiles ?? []).forEach((p: Record<string, unknown>) => {
    nameMap.set(p.auth_user_id as string, (p.display_name as string) || (p.email as string) || "Unknown");
  });

  const enriched = (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    operator_name: nameMap.get(r.operator_id as string) || "Unknown",
  }));

  return Response.json({ data: enriched, total: count || 0 });
}
