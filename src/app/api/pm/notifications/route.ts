// SCH-825 M8 — Notification list endpoint.
//
//   GET   /api/pm/notifications?unread=1&limit=50
//   PATCH /api/pm/notifications  body { ids?: string[], all?: true }   (mark read)
//
// PATCH-without-id marks read in bulk: pass `ids` to mark a specific subset,
// or `all: true` to mark every unread notification (used by "mark all
// read"). RLS scopes everything to the caller automatically.

import { requirePmSession } from "@/lib/pm/auth";
import { NOTIFICATION_COLUMNS } from "@/lib/pm/notifications";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

// Enriches each notification with task.title + task.project_id so the UI can
// build a deep-link without a second roundtrip per row.
const ENRICHED_SELECT = `${NOTIFICATION_COLUMNS}, task:tasks(title, project_id)`;

export async function GET(request: Request) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "1";
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  let query = session.sb
    .schema("pm")
    .from("notifications")
    .select(ENRICHED_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.is("read_at", null);
  }

  const res = await query;
  if (res.error) {
    return Response.json({ error: res.error.message }, { status: 500 });
  }

  // Cheap unread total for the bell badge — separate query because RLS-safe
  // count() over the same select would add a second roundtrip anyway.
  const countRes = await session.sb
    .schema("pm")
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  return Response.json({
    notifications: res.data ?? [],
    unread_count: countRes.count ?? 0,
  });
}

export async function PATCH(request: Request) {
  const session = await requirePmSession();
  if (session instanceof Response) return session;

  const body = (await request.json().catch(() => null)) as
    | { ids?: string[]; all?: boolean }
    | null;

  if (!body || (!body.all && !Array.isArray(body.ids))) {
    return Response.json(
      { error: "Bitte ids oder all übergeben" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  let query = session.sb
    .schema("pm")
    .from("notifications")
    .update({ read_at: now })
    .is("read_at", null);

  if (body.all) {
    // All unread for this user — RLS already scopes to recipient_user_id.
  } else if (body.ids && body.ids.length > 0) {
    query = query.in("id", body.ids);
  } else {
    return Response.json({ updated: 0 });
  }

  const res = await query.select("id");
  if (res.error) {
    return Response.json({ error: res.error.message }, { status: 500 });
  }
  return Response.json({ updated: res.data?.length ?? 0 });
}
