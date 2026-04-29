// SCH-918 (K2-γ): Per-feature granular permissions for company members.
//
// Tenant isolation is handled by RLS on `company_id`. Permissions narrow
// further: which app sections a non-admin member can use within a tenant
// they already belong to. Owner/admin role short-circuits all checks.
//
// This module is client-safe (pure types + helpers, no server imports).
// Server-side `requireMemberPermission` lives in lib/permissions-server.ts.

import type { SupabaseClient } from "@supabase/supabase-js";

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

// Pure-data DB lookups — caller passes the SupabaseClient so these are usable
// from both server (service-role) and client paths.
export async function getMembership(
  client: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<MembershipWithPermissions | null> {
  const { data } = await client
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
  client: SupabaseClient,
  userId: string,
): Promise<MembershipWithPermissions[]> {
  const { data } = await client
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
