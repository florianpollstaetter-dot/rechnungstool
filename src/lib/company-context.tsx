"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Company {
  id: string;
  name: string;
  slug: string;
  logo_path: string;
}

export const COMPANIES: Company[] = [
  { id: "vrthefans", name: "VR the Fans GmbH", slug: "vrthefans", logo_path: "/logos/vrthefans.png" },
  { id: "lola", name: "LOLA x MEDIA GmbH", slug: "lola", logo_path: "/logos/lola.png" },
  { id: "55films", name: "55 Films GmbH", slug: "55films", logo_path: "/logos/55films.png" },
];

interface CompanyContextType {
  company: Company;
  accessibleCompanies: Company[];
  userRole: string;
  userName: string;
  setCompanyId: (id: string) => void;
}

const CompanyContext = createContext<CompanyContextType>({
  company: COMPANIES[0],
  accessibleCompanies: COMPANIES,
  userRole: "admin",
  userName: "",
  setCompanyId: () => {},
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companyId, setCompanyIdState] = useState<string>("vrthefans");
  const [accessibleCompanies, setAccessibleCompanies] = useState<Company[]>(COMPANIES);
  const [userRole, setUserRole] = useState("admin");
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("activeCompanyId");
    if (stored && COMPANIES.find((c) => c.id === stored)) {
      setCompanyIdState(stored);
    }

    // Load user profile to determine company access
    async function loadUserAccess() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("auth_user_id", user.id)
        .single();

      // Fallback: use auth email if no profile
      const fallbackName = user.email?.split("@")[0] || "User";
      if (profile) {
        const name = profile.display_name || profile.email || fallbackName;
        localStorage.setItem("currentUserName", name);
        setUserName(name);
        let access: string[] = [];
        try {
          access = typeof profile.company_access === "string"
            ? JSON.parse(profile.company_access)
            : profile.company_access || [];
        } catch { /* empty */ }

        if (access.length > 0) {
          const filtered = COMPANIES.filter((c) => access.includes(c.id));
          setAccessibleCompanies(filtered.length > 0 ? filtered : COMPANIES);
          // If current company not in access list, switch to first accessible
          if (access.length > 0 && !access.includes(companyId)) {
            setCompanyIdState(access[0]);
            localStorage.setItem("activeCompanyId", access[0]);
          }
        }
        setUserRole(profile.role || "user");
      } else {
        // No profile = admin (first user / legacy) — use email as name
        localStorage.setItem("currentUserName", fallbackName);
        setUserName(fallbackName);
      }
    }
    loadUserAccess();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function setCompanyId(id: string) {
    setCompanyIdState(id);
    localStorage.setItem("activeCompanyId", id);
  }

  const company = COMPANIES.find((c) => c.id === companyId) || COMPANIES[0];

  return (
    <CompanyContext.Provider value={{ company, accessibleCompanies, userRole, userName, setCompanyId }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}
