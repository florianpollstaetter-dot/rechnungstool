// Single-source request gate for Next.js 16 (proxy.ts replaces middleware.ts).
//
// Two responsibilities:
//   1. App-wide auth gate (Supabase SSR) — preserved from the pre-Treasury
//      proxy. Unauthenticated visitors hitting a non-public path are
//      redirected to /login; `/api/*` routes are passed through and handle
//      their own auth.
//   2. Treasury feature-flag gate (ORA-2283) — scoped to `/treasury` and
//      `/api/treasury` paths only. Reads `company_subscriptions.has_treasury`
//      for the active company. If false, the module must behave as if it
//      doesn't exist (404 pages, 404 APIs — no upsell, no leak).
//
// The Treasury branch overrides the generic `/api/*` bypass so Treasury APIs
// are also gated. All other API routes continue to handle their own auth.

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const TREASURY_PATH_PREFIXES = ["/treasury", "/api/treasury"];
// ORA-2679 — /blog and /blog/<slug> are public marketing/SEO pages; without
// this whitelist they return 307 → /login and can't be crawled or indexed.
const PUBLIC_PATHS = ["/impressum", "/agb", "/datenschutz", "/widerruf", "/blog"];
// SCH-910 — SEO/indexing files MUST resolve without auth-redirect.
// Without this whitelist /robots.txt and /sitemap.xml return 307 → /login,
// which blocks Google/Bing crawling.
const SEO_PATHS = ["/robots.txt", "/sitemap.xml", "/marketing-briefing.html"];
const NOT_FOUND_HTML =
  "<!doctype html><html><head><title>404</title></head><body><h1>404 — Not found</h1></body></html>";

function isTreasuryPath(pathname: string): boolean {
  return TREASURY_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
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

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (isTreasuryPath(path)) {
    if (!user) {
      if (isApiPath(path)) {
        return new NextResponse(JSON.stringify({ error: "Nicht authentifiziert" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("redirect", path);
      return NextResponse.redirect(loginUrl);
    }

    const appMeta = (user.app_metadata ?? {}) as {
      company_id?: string;
      active_company_id?: string;
    };
    let companyId = appMeta.company_id ?? appMeta.active_company_id ?? null;

    // Feature-flag check uses service-role: proxy never trusts the user.
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      // Fail closed: if the key isn't configured, Treasury must not leak.
      return treasuryNotFound(isApiPath(path));
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

    if (!companyId) return treasuryNotFound(isApiPath(path));

    const { data: sub } = await service
      .from("company_subscriptions")
      .select("has_treasury")
      .eq("company_id", companyId)
      .maybeSingle<{ has_treasury: boolean }>();

    if (!sub || sub.has_treasury !== true) {
      return treasuryNotFound(isApiPath(path));
    }

    return response;
  }

  const isPublic =
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/register") ||
    path.startsWith("/api/") ||
    path.startsWith("/.well-known/") ||
    SEO_PATHS.includes(path) ||
    PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && (path.startsWith("/login") || path.startsWith("/register"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
