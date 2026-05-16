// ORA-2283 — Treasury route gate.
//
// Two responsibilities, scoped to `/treasury` + `/api/treasury` paths only:
//
//  1. Auth: refresh the Supabase SSR session so downstream RSC/route handlers
//     see a fresh access token (mirrors @supabase/ssr's canonical middleware
//     recipe). Unauthenticated → redirect to /login (pages) or 401 (APIs).
//
//  2. Feature-flag: read `company_subscriptions.has_treasury` for the active
//     company. If false, Treasury must behave as if it doesn't exist:
//        - Pages: 404 (notFound) — no upsell, no leak.
//        - APIs: 404.
//     This matches the Decoupling promise: a customer without the Treasury
//     SKU sees zero hint of the module.
//
// The middleware deliberately does NOT touch non-treasury routes — the rest of
// Orange Octo (Invoices, Bank, Time, etc.) has been working without middleware
// since before this module. Keeping the matcher tight avoids regressions.

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

const TREASURY_PATH_PREFIXES = ["/treasury", "/api/treasury"];
const NOT_FOUND_HTML = "<!doctype html><html><head><title>404</title></head><body><h1>404 — Not found</h1></body></html>";

function isTreasuryPath(pathname: string): boolean {
  return TREASURY_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isTreasuryPath(pathname)) return NextResponse.next();

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (isApiPath(pathname)) {
      return new NextResponse(JSON.stringify({ error: "Nicht authentifiziert" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Resolve active company from the JWT app_metadata (canonical) with a
  // company_members fallback for newly-issued sessions where the custom-claims
  // hook hasn't fired yet.
  const appMeta = (user.app_metadata ?? {}) as { company_id?: string; active_company_id?: string };
  let companyId = appMeta.company_id ?? appMeta.active_company_id ?? null;

  // Feature-flag check uses service-role: middleware never trusts the user.
  // The service key is server-only, exposed via env to the Edge/Node runtime.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    // Fail closed: if the key isn't configured, Treasury must not leak.
    return treasuryNotFound(isApiPath(pathname));
  }
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (!companyId) {
    const { data: member } = await service
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle<{ company_id: string }>();
    companyId = member?.company_id ?? null;
  }

  if (!companyId) return treasuryNotFound(isApiPath(pathname));

  const { data: sub } = await service
    .from("company_subscriptions")
    .select("has_treasury")
    .eq("company_id", companyId)
    .maybeSingle<{ has_treasury: boolean }>();

  if (!sub || sub.has_treasury !== true) {
    return treasuryNotFound(isApiPath(pathname));
  }

  return supabaseResponse;
}

function treasuryNotFound(api: boolean): NextResponse {
  if (api) {
    return new NextResponse(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
  return new NextResponse(NOT_FOUND_HTML, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export const config = {
  matcher: ["/treasury/:path*", "/api/treasury/:path*"],
};
