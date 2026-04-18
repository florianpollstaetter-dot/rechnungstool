import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { companyName, companySlug, displayName } = await request.json();

  if (!companyName || !companySlug) {
    return Response.json({ error: "Firmenname und Kürzel sind erforderlich" }, { status: 400 });
  }

  // Verify the caller is authenticated
  const serverSupabase = await createServerClient();
  const { data: { user } } = await serverSupabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  // Use service role to bypass RLS for company creation
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return Response.json({ error: "Server-Konfiguration fehlt" }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  );

  try {
    // 1. Create the company — SCH-486: 30-day free trial.
    const trialStartedAt = new Date();
    const trialEndsAt = new Date(trialStartedAt);
    trialEndsAt.setDate(trialEndsAt.getDate() + 30);

    const { error: companyError } = await supabase
      .from("companies")
      .insert({
        id: companySlug,
        name: companyName,
        slug: companySlug,
        plan: "trial",
        status: "active",
        subscription_status: "free_trial",
        trial_started_at: trialStartedAt.toISOString(),
        trial_ends_at: trialEndsAt.toISOString(),
      });

    if (companyError) {
      if (companyError.code === "23505") {
        return Response.json({ error: "Dieses Firmen-Kürzel ist bereits vergeben" }, { status: 409 });
      }
      throw companyError;
    }

    // 2. Add the user as company owner
    const { error: memberError } = await supabase
      .from("company_members")
      .insert({
        company_id: companySlug,
        user_id: user.id,
        role: "owner",
      });

    if (memberError) throw memberError;

    // 3. Create default company_settings
    const { error: settingsError } = await supabase
      .from("company_settings")
      .insert({
        id: companySlug,
        company_name: companyName,
        company_type: "gmbh",
        address: "",
        city: "",
        zip: "",
        uid: "",
        iban: "",
        bic: "",
        phone: "",
        email: user.email || "",
        logo_url: "",
        default_tax_rate: 20,
        default_payment_terms_days: 14,
        next_invoice_number: 1,
        next_quote_number: 1,
        accompanying_text_de: "Vielen Dank für Ihren Auftrag!",
        accompanying_text_en: "Thank you for your order!",
      });

    if (settingsError) throw settingsError;

    // 4. Create user profile if not exists
    const { data: existingProfile } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();

    if (!existingProfile) {
      await supabase.from("user_profiles").insert({
        auth_user_id: user.id,
        display_name: displayName || user.email?.split("@")[0] || "User",
        email: user.email || "",
        role: "admin",
        company_access: JSON.stringify([companySlug]),
      });
    }

    // 5. Set active company in user's app_metadata
    await supabase.auth.admin.updateUserById(user.id, {
      app_metadata: { company_id: companySlug },
    });

    return Response.json({ companyId: companySlug });
  } catch (err) {
    console.error("register-company error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Firmen-Erstellung fehlgeschlagen" },
      { status: 500 }
    );
  }
}
