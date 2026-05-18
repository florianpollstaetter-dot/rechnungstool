// ORA-2308 — EBICS Subscriber-Setup-Assistent.
//
// Server component:
//   - Re-enforces `requireCompanyAdmin()` (the route is also gated by the
//     `(app)` layout + `proxy.ts has_treasury` check, but admin-gating is
//     wizard-specific — non-admin operators should hit a 403-style block here).
//   - Resolves the active company and pre-loads the latest connection draft
//     so the wizard can resume at the right step.
//   - Hands everything to the client wizard.

import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/company-admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/operator";
import type { TreasuryBankConnection } from "@/lib/treasury/types";
import EbicsSetupWizard from "./_components/EbicsSetupWizard";
import EbicsSetupForbidden from "./_components/EbicsSetupForbidden";

export const dynamic = "force-dynamic";

export default async function EbicsSetupPage() {
  const auth = await requireCompanyAdmin();
  if (auth.error) {
    if (auth.status === 401) redirect("/login?redirect=/treasury/settings/ebics-setup");
    return <EbicsSetupForbidden />;
  }

  const ssr = await createServerClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) redirect("/login?redirect=/treasury/settings/ebics-setup");

  const appMeta = (user.app_metadata ?? {}) as {
    company_id?: string;
    active_company_id?: string;
  };
  let companyId = appMeta.company_id ?? appMeta.active_company_id ?? null;
  if (!companyId) companyId = auth.adminCompanyIds[0] ?? null;
  if (!companyId || !auth.adminCompanyIds.includes(companyId)) {
    return <EbicsSetupForbidden />;
  }

  const service = createServiceClient();
  const { data: connection } = await service
    .from("treasury_bank_connection")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<TreasuryBankConnection>();

  return <EbicsSetupWizard initialConnection={connection ?? null} />;
}
