"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url: string;
  plan: string;
  status: string;
}

/** Hardcoded fallback — used only while the DB query is in flight or if it fails. */
const FALLBACK_COMPANIES: Company[] = [
  { id: "vrthefans", name: "VR the Fans GmbH", slug: "vrthefans", logo_url: "/logos/vrthefans.png", plan: "pro", status: "active" },
  { id: "lola", name: "LOLA x MEDIA GmbH", slug: "lola", logo_url: "/logos/lola.png", plan: "pro", status: "active" },
  { id: "55films", name: "55 Films GmbH", slug: "55films", logo_url: "/logos/55films.png", plan: "pro", status: "active" },
];

interface CompanyContextType {
  company: Company;
  accessibleCompanies: Company[];
  userRole: string;
  userName: string;
  roleLoaded: boolean;
  setCompanyId: (id: string) => void;
}

const CompanyContext = createContext<CompanyContextType>({
  company: FALLBACK_COMPANIES[0],
  accessibleCompanies: FALLBACK_COMPANIES,
  userRole: "",
  userName: "",
  roleLoaded: false,
  setCompanyId: () => {},
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companyId, setCompanyIdState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("activeCompanyId") || "vrthefans";
    }
    return "vrthefans";
  });
  const [accessibleCompanies, setAccessibleCompanies] = useState<Company[]>(FALLBACK_COMPANIES);
  const [userRole, setUserRole] = useState("");
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [userName, setUserName] = useState("");

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
  }, []);

  useEffect(() => {
    const supabase = createClient();

    async function loadUserAccess() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setUserRole("");
        setRoleLoaded(false);
        setUserName("");
        setAccessibleCompanies(FALLBACK_COMPANIES);
        return;
      }

      // Load user profile
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("auth_user_id", user.id)
        .single();

      const fallbackName = user.email?.split("@")[0] || "User";

      // Try to load companies from DB via company_members join
      let dbCompanies: Company[] = [];
      try {
        const { data: memberRows } = await supabase
          .from("company_members")
          .select("company_id, companies(id, name, slug, logo_url, plan, status)")
          .eq("user_id", user.id);

        if (memberRows && memberRows.length > 0) {
          dbCompanies = memberRows
            .map((row: Record<string, unknown>) => row.companies as Company | null)
            .filter((c: Company | null): c is Company => c !== null && c.status === "active");
        }
      } catch {
        // company_members table may not exist yet (pre-migration) — fall through
      }

      if (profile) {
        const name = profile.display_name || profile.email || fallbackName;
        localStorage.setItem("currentUserName", name);
        setUserName(name);

        if (dbCompanies.length > 0) {
          // DB-driven company access
          setAccessibleCompanies(dbCompanies);
          if (!dbCompanies.some((c) => c.id === companyId)) {
            const newId = dbCompanies[0].id;
            setCompanyIdState(newId);
            localStorage.setItem("activeCompanyId", newId);
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
            if (!access.includes(companyId)) {
              setCompanyIdState(access[0]);
              localStorage.setItem("activeCompanyId", access[0]);
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
    }

    loadUserAccess();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        setRoleLoaded(false);
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

  return (
    <CompanyContext.Provider value={{ company, accessibleCompanies, userRole, userName, roleLoaded, setCompanyId }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}
