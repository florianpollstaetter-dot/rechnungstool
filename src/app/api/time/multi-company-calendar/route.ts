// SCH-918 K2-G7 / K2-G8 — Multi-Company time calendar API.
//
// G7: A member who works for multiple Admin-Unternehmen still sees ONE
//     calendar in the Zeiterfassung that holds time entries + projects
//     across all of those companies.
// G8: Members with the `rechnungen` or `angebote` permission additionally
//     see *every* project across their granted companies (so they can
//     bill against any of them), not just the ones they have time entries
//     against.
//
// Server-side:
//   1. Auth via SSR Supabase client.
//   2. listMemberships() → all companies the user is a member of.
//   3. Parallel-fetch (Promise.all) — for each company:
//        a. Time entries scoped to user_id + company_id (G7 calendar).
//        b. Projects in that company. We always fetch them so the
//           dropdown / filter UI knows the universe; G8's "see projects
//           of other companies for billing" is just a flag in the
//           response telling the UI "this company is reachable for
//           project-pickers even if no time entries exist there".
//   4. Aggregate into one payload keyed by company_id with a flat
//      `time_entries` array (already carrying company_id) so the
//      frontend can render one merged calendar without further merging.
//
// Defense-in-depth: we never accept a company_id from the client. The
// answer set is *always* derived from `company_members` for the auth
// user. RLS still enforces this independently — even if a future
// regression skipped the membership lookup, the SSR client cannot
// read time entries from a tenant the user isn't a member of.
//
// Optional query params:
//   ?from=ISO  — lower bound on start_time
//   ?to=ISO    — upper bound on start_time
//   ?include_projects=false — skip the projects fetch (lighter payload)

import { NextResponse } from "next/server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/operator";
import {
  effectivePermissions,
  type CompanyMemberRole,
  type MemberPermissions,
  type MembershipWithPermissions,
} from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CompanySlice {
  company_id: string;
  role: CompanyMemberRole;
  permissions: MemberPermissions;
  /** True when the user can see projects for billing across companies (G8). */
  can_bill_across: boolean;
  projects?: Array<{
    id: string;
    name: string;
    status: string | null;
    quote_id: string | null;
  }>;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const includeProjectsParam = url.searchParams.get("include_projects");
  const includeProjects = includeProjectsParam !== "false";

  // 1) Auth.
  const ssr = await createServerClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Nicht authentifiziert", code: "unauthenticated" },
      { status: 401 },
    );
  }

  if (fromParam && Number.isNaN(Date.parse(fromParam))) {
    return NextResponse.json(
      { error: "from must be an ISO date string", code: "invalid_payload" },
      { status: 400 },
    );
  }
  if (toParam && Number.isNaN(Date.parse(toParam))) {
    return NextResponse.json(
      { error: "to must be an ISO date string", code: "invalid_payload" },
      { status: 400 },
    );
  }

  // 2) All companies the user is a member of, with permissions resolved.
  const service = createServiceClient();
  const { data: rows, error: membershipsErr } = await service
    .from("company_members")
    .select("company_id, role, permissions")
    .eq("user_id", user.id);
  if (membershipsErr) {
    return NextResponse.json(
      { error: membershipsErr.message, code: "db_error" },
      { status: 400 },
    );
  }
  const memberships: MembershipWithPermissions[] = (rows ?? []).map((row) => {
    const role = (row.role as CompanyMemberRole) ?? "member";
    return {
      companyId: row.company_id as string,
      role,
      permissions: effectivePermissions(role, row.permissions),
    };
  });
  if (memberships.length === 0) {
    return NextResponse.json({
      user_id: user.id,
      companies: [],
      time_entries: [],
    });
  }

  // 3) Parallel-fetch per company: own time_entries + (optional) projects.
  // We deliberately pull time entries with the SSR client (RLS-gated) so a
  // future regression in service-role authorisation can't leak entries from
  // a company the user lost access to between login and request. Projects
  // come via service client because RLS on projects still goes through
  // company_members and matches what the user can already see anyway, and
  // we want consistent rows for the G8 cross-company project picker.
  const companyIds = memberships.map((m) => m.companyId);

  let timeQuery = ssr
    .from("time_entries")
    .select(
      "id, company_id, user_id, user_name, quote_id, project_label, project_id, task_id, description, start_time, end_time, duration_minutes, billable, hourly_rate, entry_type, created_at",
    )
    .eq("user_id", user.id)
    .in("company_id", companyIds);
  if (fromParam) timeQuery = timeQuery.gte("start_time", fromParam);
  if (toParam) timeQuery = timeQuery.lte("start_time", toParam);
  timeQuery = timeQuery.order("start_time", { ascending: false }).limit(1000);

  // Run time + projects fetches in parallel. The Supabase builder is
  // thenable so awaiting it inside Promise.all works at runtime, but we
  // wrap the projects branch in a tiny async lambda so TypeScript sees a
  // single Promise type for the conditional branch.
  const projectsRunner = async () => {
    if (!includeProjects) {
      return { data: [] as Array<Record<string, unknown>>, error: null as null };
    }
    const res = await service
      .from("projects")
      .select("id, company_id, name, status, quote_id")
      .in("company_id", companyIds)
      .order("created_at", { ascending: false });
    return res;
  };

  const [timeRes, projectsRes] = await Promise.all([timeQuery, projectsRunner()]);
  if (timeRes.error) {
    return NextResponse.json(
      { error: `time_entries fetch failed: ${timeRes.error.message}`, code: "db_error" },
      { status: 400 },
    );
  }
  if (projectsRes.error) {
    return NextResponse.json(
      { error: `projects fetch failed: ${projectsRes.error.message}`, code: "db_error" },
      { status: 400 },
    );
  }

  // 4) Aggregate.
  const projectsByCompany = new Map<string, CompanySlice["projects"]>();
  if (includeProjects) {
    for (const row of (projectsRes.data ?? []) as Array<Record<string, unknown>>) {
      const companyId = row.company_id as string;
      const list = projectsByCompany.get(companyId) ?? [];
      list.push({
        id: row.id as string,
        name: row.name as string,
        status: (row.status as string | null) ?? null,
        quote_id: (row.quote_id as string | null) ?? null,
      });
      projectsByCompany.set(companyId, list);
    }
  }

  const companies: CompanySlice[] = memberships.map((m) => ({
    company_id: m.companyId,
    role: m.role,
    permissions: m.permissions,
    can_bill_across:
      m.role === "owner" ||
      m.role === "admin" ||
      m.permissions.rechnungen ||
      m.permissions.angebote,
    projects: includeProjects
      ? projectsByCompany.get(m.companyId) ?? []
      : undefined,
  }));

  return NextResponse.json({
    user_id: user.id,
    companies,
    time_entries: timeRes.data ?? [],
    range: {
      from: fromParam ?? null,
      to: toParam ?? null,
    },
  });
}
