"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url: string;
  plan: string;
  status: string;
  /** SCH-480/486: payment status — paid|outstanding|overdue|free_trial */
  subscription_status?: string | null;
  /** SCH-480: free-tier exemption (skips payment enforcement) */
  is_free?: boolean | null;
  /** SCH-480: ISO timestamp of next payment due date */
  next_payment_due_at?: string | null;
  /** SCH-486: ISO timestamp when the 30-day free trial ends */
  trial_ends_at?: string | null;
}

/** Hardcoded fallback — used only while the DB query is in flight or if it fails. */
const FALLBACK_COMPANIES: Company[] = [
  { id: "vrthefans", name: "VR the Fans GmbH", slug: "vrthefans", logo_url: "/logos/vrthefans.png", plan: "pro", status: "active" },
  { id: "lola", name: "LOLA x MEDIA GmbH", slug: "lola", logo_url: "/logos/lola.png", plan: "pro", status: "active" },
  { id: "55films", name: "55 Films GmbH", slug: "55films", logo_url: "/logos/55films.png", plan: "pro", status: "active" },
];

/**
 * Read-only when:
 *  - SCH-481: subscription is overdue >60 days and not on free tier, OR
 *  - SCH-486: free trial has elapsed (trial_ends_at in the past).
 */
export function computeIsReadOnly(c: Company | null | undefined): boolean {
  if (!c) return false;
  if (c.is_free) return false;

  if (c.subscription_status === "free_trial") {
    if (!c.trial_ends_at) return false;
    const ends = new Date(c.trial_ends_at).getTime();
    if (Number.isNaN(ends)) return false;
    return ends < Date.now();
  }

  if (c.subscription_status !== "overdue") return false;
  if (!c.next_payment_due_at) return false;
  const due = new Date(c.next_payment_due_at).getTime();
  if (Number.isNaN(due)) return false;
  const ageDays = (Date.now() - due) / (1000 * 60 * 60 * 24);
  return ageDays > 60;
}

/** Whole days past `next_payment_due_at`, or 0 if not overdue. */
export function daysOverdue(c: Company | null | undefined): number {
  if (!c?.next_payment_due_at) return 0;
  const due = new Date(c.next_payment_due_at).getTime();
  if (Number.isNaN(due)) return 0;
  const diffMs = Date.now() - due;
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

import type { GreetingTone } from "@/lib/types";
import {
  DEFAULT_MEMBER_PERMISSIONS,
  FULL_MEMBER_PERMISSIONS,
  effectivePermissions,
  type CompanyMemberRole,
  type MemberPermissions,
} from "@/lib/permissions";

interface CompanyContextType {
  company: Company;
  accessibleCompanies: Company[];
  userRole: string;
  userName: string;
  /** SCH-518 — per-user greeting tone preference; "off" hides the navbar greeting. */
  greetingTone: GreetingTone;
  setGreetingTone: (tone: GreetingTone) => void;
  roleLoaded: boolean;
  /** SCH-568 — single source of truth for auth status; null = not yet checked. */
  authed: boolean | null;
  isSuperadmin: boolean;
  isReadOnly: boolean;
  /** SCH-962 — true when the user has memberships but every company they
   *  belong to is suspended or cancelled. Used by BlockedCompanyGate to
   *  prevent app access for users whose only company was locked by an
   *  operator. Superadmins are never blocked (they can always reach the
   *  operator console). */
  companyAccessBlocked: boolean;
  setCompanyId: (id: string) => void;
  // SCH-918 K2-γ — granular per-feature permissions for the active company.
  // For owner/admin/manager/accountant the role-based map still drives the
  // sidebar; for `employee` role this JSONB controls which sections appear.
  memberPermissions: MemberPermissions;
  /** Company-member role string ('owner' | 'admin' | 'member'); independent of user_profiles.role. */
  memberRole: CompanyMemberRole | null;
}

const CompanyContext = createContext<CompanyContextType>({
  company: FALLBACK_COMPANIES[0],
  accessibleCompanies: FALLBACK_COMPANIES,
  userRole: "",
  userName: "",
  greetingTone: "motivating",
  setGreetingTone: () => {},
  roleLoaded: false,
  authed: null,
  isSuperadmin: false,
  isReadOnly: false,
  companyAccessBlocked: false,
  setCompanyId: () => {},
  memberPermissions: DEFAULT_MEMBER_PERMISSIONS,
  memberRole: null,
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companyId, setCompanyIdStateRaw] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("activeCompanyId") || "vrthefans";
    }
    return "vrthefans";
  });
  // SCH-546: mirror companyId into a ref so the onAuthStateChange handler (whose
  // loadUserAccess closure captures the initial render's companyId forever) can
  // read the *current* selection. Without this, a TOKEN_REFRESHED that fires
  // right after a switch would call syncJwtCompanyId with the stale pre-switch
  // id and reset the JWT claim back to the old company.
  const companyIdRef = useRef(companyId);
  const setCompanyIdState = useCallback((id: string) => {
    companyIdRef.current = id;
    setCompanyIdStateRaw(id);
  }, []);
  const [accessibleCompanies, setAccessibleCompanies] = useState<Company[]>(FALLBACK_COMPANIES);
  // SCH-962 — set when the user has at least one company_members row but
  // none of those companies are status='active'. Superadmins ignore this.
  const [companyAccessBlocked, setCompanyAccessBlocked] = useState(false);
  const [userRole, setUserRole] = useState("");
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [userName, setUserName] = useState("");
  // SCH-918 — keyed by company_id; updated each time loadUserAccess runs.
  const [membershipByCompany, setMembershipByCompany] = useState<
    Record<string, { role: CompanyMemberRole; permissions: MemberPermissions }>
  >({});
  const [greetingTone, setGreetingToneState] = useState<GreetingTone>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("greetingTone");
      if (stored === "motivating" || stored === "challenging" || stored === "sarcastic" || stored === "off") {
        return stored;
      }
    }
    return "motivating";
  });

  const setGreetingTone = useCallback((tone: GreetingTone) => {
    setGreetingToneState(tone);
    if (typeof window !== "undefined") localStorage.setItem("greetingTone", tone);
  }, []);

  const setCompanyId = useCallback(async (id: string) => {
    setCompanyIdState(id);
    localStorage.setItem("activeCompanyId", id);

    // Update active company in Supabase (writes to auth.users.raw_app_meta_data)
    const supabase = createClient();
    try {
      await supabase.rpc("set_active_company", { p_company_id: id });
      // Refresh the session so the JWT picks up the new company_id claim
      await supabase.auth.refreshSession();
    } catch {
      // RPC may not exist yet (pre-migration) — silently continue
    }
  }, [setCompanyIdState]);

  // SCH-525: decode the current access token's app_metadata.company_id so we can
  // detect when the JWT claim is out of sync with the client-selected company
  // (stale session from before SCH-422, or a manual app_metadata change by
  // register-company that predates the current session).
  const syncingJwtRef = useRef(false);
  async function syncJwtCompanyId(
    supabase: ReturnType<typeof createClient>,
    targetCompanyId: string,
  ) {
    if (syncingJwtRef.current) return;
    syncingJwtRef.current = true;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;
      let jwtCompanyId: string | null = null;
      try {
        const payload = JSON.parse(
          atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
        );
        jwtCompanyId =
          (payload?.app_metadata?.company_id as string | undefined) ?? null;
      } catch {
        return;
      }
      if (jwtCompanyId === targetCompanyId) return;
      await supabase.rpc("set_active_company", { p_company_id: targetCompanyId });
      await supabase.auth.refreshSession();
    } catch {
      // RPC may not exist yet, or user is not a member — silently continue.
    } finally {
      syncingJwtRef.current = false;
    }
  }

  useEffect(() => {
    const supabase = createClient();

    async function loadUserAccess() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setUserRole("");
        setRoleLoaded(false);
        setAuthed(false);
        setIsSuperadmin(false);
        setUserName("");
        setAccessibleCompanies(FALLBACK_COMPANIES);
        return;
      }
      setAuthed(true);

      // Load user profile
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("auth_user_id", user.id)
        .single();

      const fallbackName = user.email?.split("@")[0] || "User";

      // Try to load companies from DB via company_members join
      let dbCompanies: Company[] = [];
      // SCH-962 — track raw membership count so we can distinguish
      // "user has no memberships at all" (legitimate fresh user) from
      // "user has memberships but they're all locked" (block access).
      let rawMembershipCount = 0;
      // SCH-918 — collect (role, permissions JSONB) per company so the sidebar
      // can gate sections without an extra query.
      const newMembershipByCompany: Record<
        string,
        { role: CompanyMemberRole; permissions: MemberPermissions }
      > = {};
      try {
        const { data: memberRows } = await supabase
          .from("company_members")
          .select("company_id, role, permissions, companies(id, name, slug, logo_url, plan, status, subscription_status, is_free, next_payment_due_at, trial_ends_at)")
          .eq("user_id", user.id);

        if (memberRows && memberRows.length > 0) {
          rawMembershipCount = memberRows.length;
          for (const row of memberRows as Array<Record<string, unknown>>) {
            const cid = row.company_id as string | undefined;
            if (!cid) continue;
            const role = ((row.role as string | null) ?? "member") as CompanyMemberRole;
            newMembershipByCompany[cid] = {
              role,
              permissions: effectivePermissions(role, row.permissions),
            };
          }
          dbCompanies = memberRows
            .map((row: Record<string, unknown>) => row.companies as Company | null)
            .filter((c: Company | null): c is Company => c !== null && c.status === "active");

          // SCH-581 — `companies.logo_url` is stale (register-company seeds it
          // to "" and never touches it again; the user edits the logo in
          // `company_settings.logo_url` only). Overlay the real logo from
          // company_settings so the header + switcher show the current asset.
          if (dbCompanies.length > 0) {
            const { data: settingsRows } = await supabase
              .from("company_settings")
              .select("company_id, logo_url")
              .in(
                "company_id",
                dbCompanies.map((c) => c.id),
              );
            const logoByCompany = new Map<string, string>();
            for (const row of settingsRows ?? []) {
              const cid = row.company_id as string;
              const url = (row.logo_url as string) || "";
              if (cid && url) logoByCompany.set(cid, url);
            }
            dbCompanies = dbCompanies.map((c) => {
              const overlay = logoByCompany.get(c.id);
              return overlay ? { ...c, logo_url: overlay } : c;
            });
          }
        }
      } catch {
        // company_members / company_settings may not exist yet (pre-migration)
        // — fall through to legacy company_access.
      }

      // SCH-546: read the *current* companyId via ref, not the stale closure.
      const currentCompanyId = companyIdRef.current;
      let activeCompanyId = currentCompanyId;
      if (profile) {
        const name = profile.display_name || profile.email || fallbackName;
        localStorage.setItem("currentUserName", name);
        setUserName(name);
        setIsSuperadmin(!!profile.is_superadmin);
        const tone = profile.greeting_tone;
        if (tone === "motivating" || tone === "challenging" || tone === "sarcastic" || tone === "off") {
          setGreetingToneState(tone);
          localStorage.setItem("greetingTone", tone);
        }

        if (dbCompanies.length > 0) {
          // DB-driven company access
          setAccessibleCompanies(dbCompanies);
          if (!dbCompanies.some((c) => c.id === currentCompanyId)) {
            const newId = dbCompanies[0].id;
            setCompanyIdState(newId);
            localStorage.setItem("activeCompanyId", newId);
            activeCompanyId = newId;
          }
        } else {
          // Fallback to legacy company_access JSON array
          let access: string[] = [];
          try {
            access = typeof profile.company_access === "string"
              ? JSON.parse(profile.company_access)
              : profile.company_access || [];
          } catch { /* empty */ }

          if (access.length > 0) {
            const filtered = FALLBACK_COMPANIES.filter((c) => access.includes(c.id));
            setAccessibleCompanies(filtered.length > 0 ? filtered : FALLBACK_COMPANIES);
            if (!access.includes(currentCompanyId)) {
              setCompanyIdState(access[0]);
              localStorage.setItem("activeCompanyId", access[0]);
              activeCompanyId = access[0];
            }
          }
        }
        setUserRole(profile.role || "employee");
      } else {
        // No profile = admin (first user / legacy)
        setUserRole("admin");
        localStorage.setItem("currentUserName", fallbackName);
        setUserName(fallbackName);
        if (dbCompanies.length > 0) {
          setAccessibleCompanies(dbCompanies);
        }
      }
      setRoleLoaded(true);
      setMembershipByCompany(newMembershipByCompany);
      // SCH-962 — block app access when memberships exist but none are active.
      // Superadmins bypass: they may manage suspended tenants from /operator.
      setCompanyAccessBlocked(
        !profile?.is_superadmin && rawMembershipCount > 0 && dbCompanies.length === 0,
      );

      // SCH-525: make sure the JWT claim matches the company we just committed
      // to client state. Without this, RLS INSERT checks (e.g. AiCompanySetup
      // creating company_roles) fail for users whose sessions predate SCH-422.
      void syncJwtCompanyId(supabase, activeCompanyId);
    }

    loadUserAccess();

    // SCH-568: do NOT flip `roleLoaded` back to `false` on SIGNED_IN/TOKEN_REFRESHED.
    // Supabase can fire both multiple times during a fresh login, and every toggle
    // unmounts gated UI (navbar contents, chat icon, company logo) for a frame,
    // producing the flicker reported for newly-created users. Reset state only on
    // actual sign-out; refresh in place for everything else.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setUserRole("");
        setRoleLoaded(false);
        setAuthed(false);
        setIsSuperadmin(false);
        setUserName("");
        setAccessibleCompanies(FALLBACK_COMPANIES);
        setCompanyAccessBlocked(false);
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        loadUserAccess();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const company = accessibleCompanies.find((c) => c.id === companyId)
    || accessibleCompanies[0]
    || FALLBACK_COMPANIES[0];
  const isReadOnly = computeIsReadOnly(company);
  // SCH-918 — derive active-company permissions/role from the membership map
  // we collected on the last loadUserAccess. Admin/owner short-circuits to
  // FULL inside effectivePermissions; employee role uses the JSONB content.
  // Users without an active company_members row (e.g. legacy company_access
  // path) get DEFAULT (all-false), which matches the safest fallback.
  const activeMembership = membershipByCompany[company.id] ?? null;
  const memberRole: CompanyMemberRole | null = activeMembership?.role ?? null;
  const memberPermissions: MemberPermissions =
    activeMembership?.permissions ??
    (userRole === "admin" || userRole === "manager" || userRole === "accountant"
      ? FULL_MEMBER_PERMISSIONS
      : DEFAULT_MEMBER_PERMISSIONS);

  return (
    <CompanyContext.Provider value={{ company, accessibleCompanies, userRole, userName, greetingTone, setGreetingTone, roleLoaded, authed, isSuperadmin, isReadOnly, companyAccessBlocked, setCompanyId, memberPermissions, memberRole }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}
