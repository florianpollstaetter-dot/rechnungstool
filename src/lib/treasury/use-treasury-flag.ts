"use client";

// ORA-2283 — Client-side hook reading `company_subscriptions.has_treasury`
// for the active company.
//
// The RLS policy `company_subscriptions_select` (see migration) only returns
// the row for the active company, so an unprivileged user cannot probe other
// tenants — a missing row implies `has_treasury = false`.
//
// Used by `AppSidebar` to gate the Treasury nav block. Server-side checks
// (middleware, API routes) use `companyHasTreasury()` in `feature-flag.ts`
// instead — both paths converge on the same DB column.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "@/lib/company-context";

export interface TreasuryFlagState {
  hasTreasury: boolean;
  loaded: boolean;
}

export function useTreasuryFlag(): TreasuryFlagState {
  const { company } = useCompany();
  const [state, setState] = useState<TreasuryFlagState>({ hasTreasury: false, loaded: false });

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("company_subscriptions")
      .select("has_treasury")
      .eq("company_id", company.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setState({ hasTreasury: Boolean((data as { has_treasury?: boolean } | null)?.has_treasury), loaded: true });
      });
    return () => {
      cancelled = true;
    };
  }, [company.id]);

  return state;
}
