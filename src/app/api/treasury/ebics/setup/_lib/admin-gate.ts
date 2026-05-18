// ORA-2308 — Shared admin gate for `/api/treasury/ebics/setup/*` routes.
//
// Treasury EBICS-Setup is admin-only: anything that talks to a bank or
// mutates the subscriber-bootstrap state must be gated. This module wraps
// `requireCompanyAdmin()` + the active-company lookup so each step route is
// a thin POST handler.

import { NextResponse } from "next/server";
import { requireCompanyAdmin } from "@/lib/company-admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/operator";

export interface AdminContext {
  userId: string;
  companyId: string;
  service: ReturnType<typeof createServiceClient>;
}

export type AdminGateResult =
  | { ok: true; ctx: AdminContext }
  | { ok: false; response: NextResponse };

export async function adminGate(): Promise<AdminGateResult> {
  const auth = await requireCompanyAdmin();
  if (auth.error) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status },
      ),
    };
  }

  const ssr = await createServerClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Nicht authentifiziert" },
        { status: 401 },
      ),
    };
  }

  const appMeta = (user.app_metadata ?? {}) as {
    company_id?: string;
    active_company_id?: string;
  };
  let companyId = appMeta.company_id ?? appMeta.active_company_id ?? null;
  if (!companyId) {
    companyId = auth.adminCompanyIds[0] ?? null;
  }
  if (!companyId || !auth.adminCompanyIds.includes(companyId)) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Keine aktive Treasury-Company" },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    ctx: { userId: user.id, companyId, service: createServiceClient() },
  };
}
