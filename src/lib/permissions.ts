// SCH-918 (K2-γ): Per-feature granular permissions for company members.
//
// Tenant isolation is handled by RLS on `company_id`. Permissions narrow
// further: which app sections a non-admin member can use within a tenant
// they already belong to. Owner/admin role short-circuits all checks.

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/operator";

export const MEMBER_PERMISSION_KEYS = [
  "angebote",
  "rechnungen",
  "kunden",
  "produkte",
  "fixkosten",
  "belege",
  "konto",
  "export",
  "projekte_erstellen",
] as const;

export type MemberPermissionKey = (typeof MEMBER_PERMISSION_KEYS)[number];

export type MemberPermissions = Record<MemberPermissionKey, boolean>;

// Sections that are ALWAYS visible to every employee (G3).
// Not represented in the JSONB; cannot be revoked.
export const ALWAYS_ON_SECTIONS = ["dashboard", "expenses", "time"] as const;

export const DEFAULT_MEMBER_PERMISSIONS: MemberPermissions = {
  angebote: false,
  rechnungen: false,
  kunden: false,
  produkte: false,
  fixkosten: false,
  belege: false,
  konto: false,
  export: false,
  projekte_erstellen: false,
};

export const FULL_MEMBER_PERMISSIONS: MemberPermissions = {
  angebote: true,
  rechnungen: true,
  kunden: true,
  produkte: true,
  fixkosten: true,
  belege: true,
  konto: true,
  export: true,
  projekte_erstellen: true,
};

export function normalizeMemberPermissions(raw: unknown): MemberPermissions {
  const out: MemberPermissions = { ...DEFAULT_MEMBER_PERMISSIONS };
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  for (const key of MEMBER_PERMISSION_KEYS) {
    if (obj[key] === true) out[key] = true;
  }
  return out;
}

export type CompanyMemberRole = "owner" | "admin" | "member";

export interface MembershipWithPermissions {
  companyId: string;
  role: CompanyMemberRole;
  permissions: MemberPermissions;
}

// Owner/admin role bypasses the JSONB and gets every feature. This matches
// the migration backfill so behaviour is identical regardless of whether
// the JSONB was already updated for that row.
export function effectivePermissions(
  role: CompanyMemberRole,
  raw: unknown,
): MemberPermissions {
  if (role === "owner" || role === "admin") return { ...FULL_MEMBER_PERMISSIONS };
  return normalizeMemberPermissions(raw);
}

export function hasMemberPermission(
  membership: MembershipWithPermissions | null | undefined,
  key: MemberPermissionKey,
): boolean {
  if (!membership) return false;
  if (membership.role === "owner" || membership.role === "admin") return true;
  return membership.permissions[key] === true;
}

export async function getMembership(
  service: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<MembershipWithPermissions | null> {
  const { data } = await service
    .from("company_members")
    .select("company_id, role, permissions")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) return null;
  const role = (data.role as CompanyMemberRole) ?? "member";
  return {
    companyId: data.company_id as string,
    role,
    permissions: effectivePermissions(role, data.permissions),
  };
}

export async function listMemberships(
  service: SupabaseClient,
  userId: string,
): Promise<MembershipWithPermissions[]> {
  const { data } = await service
    .from("company_members")
    .select("company_id, role, permissions")
    .eq("user_id", userId);
  if (!data) return [];
  return data.map((row) => {
    const role = (row.role as CompanyMemberRole) ?? "member";
    return {
      companyId: row.company_id as string,
      role,
      permissions: effectivePermissions(role, row.permissions),
    };
  });
}

export type RequirePermissionResult =
  | { ok: false; error: string; status: number }
  | { ok: true; user: User; service: SupabaseClient; membership: MembershipWithPermissions };

// API helper: 401 if unauthenticated, 403 if not a member or missing the
// permission. The `companyId` is the tenant the API call targets.
export async function requireMemberPermission(
  companyId: unknown,
  key: MemberPermissionKey,
): Promise<RequirePermissionResult> {
  if (typeof companyId !== "string" || companyId.trim() === "") {
    return { ok: false, error: "companyId required", status: 400 };
  }
  const ssr = await createServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return { ok: false, error: "Nicht authentifiziert", status: 401 };

  const service = createServiceClient();
  const membership = await getMembership(service, user.id, companyId);
  if (!membership) {
    return { ok: false, error: "Kein Zugriff auf diese Firma", status: 403 };
  }
  if (!hasMemberPermission(membership, key)) {
    return { ok: false, error: "Fehlende Berechtigung", status: 403 };
  }
  return { ok: true, user, service, membership };
}
