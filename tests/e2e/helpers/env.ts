// SCH-976 — central env-var resolver for the e2e suite.
// Centralised so a missing secret fails loudly with a single message that
// names every variable instead of cascading into Supabase 401s.

export interface E2EEnv {
  baseUrl: string;
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
}

export function loadEnv(): E2EEnv {
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const missing: string[] = [];
  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length > 0) {
    throw new Error(
      `Missing required env vars for e2e suite: ${missing.join(", ")}. ` +
        `Source .env.local or set them in the GitHub Actions secrets.`,
    );
  }
  return { baseUrl, supabaseUrl, anonKey, serviceKey };
}
