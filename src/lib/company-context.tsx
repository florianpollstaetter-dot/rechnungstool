"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

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
  setCompanyId: (id: string) => void;
}

const CompanyContext = createContext<CompanyContextType>({
  company: COMPANIES[0],
  setCompanyId: () => {},
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companyId, setCompanyIdState] = useState<string>("vrthefans");

  useEffect(() => {
    const stored = localStorage.getItem("activeCompanyId");
    if (stored && COMPANIES.find((c) => c.id === stored)) {
      setCompanyIdState(stored);
    }
  }, []);

  function setCompanyId(id: string) {
    setCompanyIdState(id);
    localStorage.setItem("activeCompanyId", id);
  }

  const company = COMPANIES.find((c) => c.id === companyId) || COMPANIES[0];

  return (
    <CompanyContext.Provider value={{ company, setCompanyId }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}
