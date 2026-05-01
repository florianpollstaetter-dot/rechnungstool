// SCH-975 K2-H1 — List projects with task/time-entry counts for the merge UI.
//
// GET /api/projects?company_id=<id>
// Auth: requireMemberPermission(company_id, "projekte_erstellen") — same gate
// the merge route uses, so any member who could merge can also see the list.

import { NextResponse } from "next/server";

import { requireMemberPermission } from "@/lib/permissions-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("company_id");

  const guard = await requireMemberPermission(companyId, "projekte_erstellen");
  if (!guard.ok) {
    const code = guard.status === 401 ? "unauthenticated" : "forbidden";
    return NextResponse.json(
      { error: guard.error, code },
      { status: guard.status },
    );
  }
  const { service, membership } = guard;
  const tenant = membership.companyId;

  const { data: projects, error: pErr } = await service
    .from("projects")
    .select("id, name, color, status, quote_id, created_at")
    .eq("company_id", tenant)
    .order("name", { ascending: true });
  if (pErr) {
    return NextResponse.json(
      { error: pErr.message, code: "db_error" },
      { status: 400 },
    );
  }
  const list = projects ?? [];
  if (list.length === 0) {
    return NextResponse.json({ projects: [] });
  }

  const ids = list.map((p) => p.id);

  const [{ data: taskRows, error: tErr }, { data: teRows, error: teErr }] =
    await Promise.all([
      service
        .from("tasks")
        .select("project_id")
        .eq("company_id", tenant)
        .in("project_id", ids),
      service
        .from("time_entries")
        .select("project_id")
        .eq("company_id", tenant)
        .in("project_id", ids),
    ]);
  if (tErr) {
    return NextResponse.json(
      { error: tErr.message, code: "db_error" },
      { status: 400 },
    );
  }
  if (teErr) {
    return NextResponse.json(
      { error: teErr.message, code: "db_error" },
      { status: 400 },
    );
  }

  const taskCount = new Map<string, number>();
  for (const row of taskRows ?? []) {
    const pid = (row as { project_id: string | null }).project_id;
    if (!pid) continue;
    taskCount.set(pid, (taskCount.get(pid) ?? 0) + 1);
  }
  const teCount = new Map<string, number>();
  for (const row of teRows ?? []) {
    const pid = (row as { project_id: string | null }).project_id;
    if (!pid) continue;
    teCount.set(pid, (teCount.get(pid) ?? 0) + 1);
  }

  return NextResponse.json({
    projects: list.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      status: p.status,
      quote_id: p.quote_id,
      created_at: p.created_at,
      task_count: taskCount.get(p.id) ?? 0,
      time_entry_count: teCount.get(p.id) ?? 0,
    })),
  });
}
