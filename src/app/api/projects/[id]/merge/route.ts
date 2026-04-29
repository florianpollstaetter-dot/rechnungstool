// SCH-918 K2-H1 — Merge two duplicate projects.
//
// Body shape: { target_project_id: string, company_id: string }
// where `id` (route param) is the SOURCE that gets re-pointed and deleted.
//
// Steps (logically transactional via service-role; we mitigate partial-failure
// rollback by deleting the source ONLY after every dependent UPDATE succeeded
// and we have not yet touched destructive state):
//   1. Auth: requireMemberPermission(company_id, "projekte_erstellen").
//   2. Verify source + target both exist, belong to the same company, and
//      target_project_id !== id.
//   3. Refuse if both projects have a non-null quote_id and they differ —
//      that's a business decision the user must resolve in the UI before
//      calling merge (we do not auto-pick a quote_id winner).
//   4. UPDATE tasks SET project_id = target  WHERE project_id = source
//   5. UPDATE time_entries SET project_id = target WHERE project_id = source
//   6. DELETE projects WHERE id = source  (returns the DELETE row count)
//
// On any UPDATE error we abort BEFORE the delete; the DB ends in a state
// where the source project still exists and the caller can retry safely.

import { NextResponse } from "next/server";

import { requireMemberPermission } from "@/lib/permissions-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface MergeBody {
  target_project_id?: unknown;
  company_id?: unknown;
}

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sourceId } = await params;
  if (!UUID_RE.test(sourceId)) {
    return NextResponse.json(
      { error: "id must be a UUID", code: "invalid_payload" },
      { status: 400 },
    );
  }

  let body: MergeBody;
  try {
    body = (await req.json()) as MergeBody;
  } catch {
    return NextResponse.json(
      { error: "request body must be JSON", code: "invalid_payload" },
      { status: 400 },
    );
  }

  if (typeof body?.target_project_id !== "string" || !UUID_RE.test(body.target_project_id)) {
    return NextResponse.json(
      { error: "target_project_id must be a UUID", code: "invalid_payload" },
      { status: 400 },
    );
  }
  const targetId = body.target_project_id;
  if (targetId === sourceId) {
    return NextResponse.json(
      { error: "source and target must differ", code: "invalid_payload" },
      { status: 400 },
    );
  }

  const guard = await requireMemberPermission(body.company_id, "projekte_erstellen");
  if (!guard.ok) {
    const code = guard.status === 401 ? "unauthenticated" : "forbidden";
    return NextResponse.json(
      { error: guard.error, code },
      { status: guard.status },
    );
  }
  const { service, membership, user } = guard;
  const companyId = membership.companyId;

  // 2) Both projects must exist + same company.
  const { data: rows, error: fetchErr } = await service
    .from("projects")
    .select("id, company_id, name, quote_id, status")
    .in("id", [sourceId, targetId])
    .eq("company_id", companyId);
  if (fetchErr) {
    return NextResponse.json(
      { error: fetchErr.message, code: "db_error" },
      { status: 400 },
    );
  }
  const source = rows?.find((r) => r.id === sourceId);
  const target = rows?.find((r) => r.id === targetId);
  if (!source) {
    return NextResponse.json(
      { error: "source project not found in this company", code: "not_found" },
      { status: 404 },
    );
  }
  if (!target) {
    return NextResponse.json(
      { error: "target project not found in this company", code: "not_found" },
      { status: 404 },
    );
  }

  // 3) Refuse silent quote_id reassignment.
  if (
    typeof source.quote_id === "string" &&
    typeof target.quote_id === "string" &&
    source.quote_id !== target.quote_id
  ) {
    return NextResponse.json(
      {
        error:
          "both projects link to different quotes; resolve quote_id manually before merging",
        code: "conflict",
        details: {
          source_quote_id: source.quote_id,
          target_quote_id: target.quote_id,
        },
      },
      { status: 409 },
    );
  }

  // 4) Re-point tasks. We .select("id") so the response carries the moved
  // ids; .length gives us the count for the response payload.
  const { data: movedTasks, error: taskErr } = await service
    .from("tasks")
    .update({ project_id: targetId })
    .eq("company_id", companyId)
    .eq("project_id", sourceId)
    .select("id");
  if (taskErr) {
    return NextResponse.json(
      { error: `tasks update failed: ${taskErr.message}`, code: "db_error" },
      { status: 400 },
    );
  }
  const taskCount = movedTasks?.length ?? 0;

  // 5) Re-point time_entries.
  const { data: movedTes, error: teErr } = await service
    .from("time_entries")
    .update({ project_id: targetId })
    .eq("company_id", companyId)
    .eq("project_id", sourceId)
    .select("id");
  if (teErr) {
    return NextResponse.json(
      { error: `time_entries update failed: ${teErr.message}`, code: "db_error" },
      { status: 400 },
    );
  }
  const teCount = movedTes?.length ?? 0;

  // 5b) If source has a quote_id and target does not, copy it forward so the
  // merged project keeps the link. Skipped when both already match (no-op).
  let quoteIdCopied = false;
  if (typeof source.quote_id === "string" && !target.quote_id) {
    const { error: qErr } = await service
      .from("projects")
      .update({ quote_id: source.quote_id })
      .eq("id", targetId)
      .eq("company_id", companyId);
    if (qErr) {
      return NextResponse.json(
        { error: `target quote_id copy failed: ${qErr.message}`, code: "db_error" },
        { status: 400 },
      );
    }
    quoteIdCopied = true;
    // Source's quote_id needs to clear before the source delete because
    // projects.quote_id has a unique constraint somewhere down the line and
    // we don't want a transient duplicate quote_id row.
    const { error: clearErr } = await service
      .from("projects")
      .update({ quote_id: null })
      .eq("id", sourceId)
      .eq("company_id", companyId);
    if (clearErr) {
      return NextResponse.json(
        { error: `source quote_id clear failed: ${clearErr.message}`, code: "db_error" },
        { status: 400 },
      );
    }
  }

  // 6) Delete source.
  const { error: delErr } = await service
    .from("projects")
    .delete()
    .eq("id", sourceId)
    .eq("company_id", companyId);
  if (delErr) {
    return NextResponse.json(
      { error: `source delete failed: ${delErr.message}`, code: "db_error" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    merged: true,
    source: { id: sourceId, name: source.name },
    target: { id: targetId, name: target.name },
    tasks_moved: taskCount,
    time_entries_moved: teCount,
    quote_id_copied: quoteIdCopied,
    actor_user_id: user.id,
  });
}
