import { createClient } from "@supabase/supabase-js";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { logAndSanitize } from "@/lib/api-errors";

export async function POST(request: Request) {
  const { email: rawEmail, password, displayName, companyName, companySlug } = await request.json();

  if (!rawEmail || !password || !companyName || !companySlug) {
    return Response.json(
      { error: "missing_fields", message: "E-Mail, Passwort, Unternehmensname und Kürzel sind erforderlich." },
      { status: 400 },
    );
  }

  if (typeof password !== "string" || password.length < 8) {
    return Response.json(
      { error: "weak_password", message: "Passwort muss mindestens 8 Zeichen lang sein." },
      { status: 400 },
    );
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return Response.json(
      { error: "server_misconfigured", message: "Server-Konfiguration fehlt." },
      { status: 500 },
    );
  }

  // SCH-928: normalize email — Supabase stores it lowercase, so all
  // collision checks (and the `auth.admin.createUser` call below) must
  // compare on the same canonical form.
  const email = String(rawEmail).trim().toLowerCase();

  const supabase = createClient(supabaseUrl, serviceKey);
  const resolvedDisplayName = (displayName && String(displayName).trim()) || email.split("@")[0];

  // 1. Pre-check slug collision to avoid creating an orphan auth user.
  const { data: existingCompany } = await supabase
    .from("companies")
    .select("id")
    .eq("slug", companySlug)
    .maybeSingle();

  if (existingCompany) {
    return Response.json(
      { error: "slug_taken", message: "Dieses Unternehmens-Kürzel ist bereits vergeben." },
      { status: 409 },
    );
  }

  // SCH-928: email-collision pre-check. The fast happy-path: if a
  // user_profile already exists for this email the email is taken and
  // we can reject without round-tripping through auth.admin.createUser.
  // The createUser call below is the authoritative second guard for the
  // rarer orphan case (auth.users row without a user_profile).
  const { data: existingProfile } = await supabase
    .from("user_profiles")
    .select("auth_user_id")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    return Response.json(
      { error: "email_exists", message: "Diese Email-Adresse ist bereits vergeben." },
      { status: 409 },
    );
  }

  // 2. Create the auth user with email already confirmed — no email verification step
  //    needed because the account is bound to a trial company created in the same request.
  const { data: created, error: createUserError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: resolvedDisplayName,
      company_id: companySlug,
    },
  });

  if (createUserError || !created?.user) {
    const code = createUserError?.code;
    const msg = createUserError?.message || "";
    // SCH-928: prefer the structured gotrue error code; fall back to
    // message regex for older auth-js builds. Both `email_exists` and
    // `user_already_exists` map to a duplicate-email collision.
    const isCollision =
      code === "email_exists" ||
      code === "user_already_exists" ||
      /already|registered|exists/i.test(msg);
    if (isCollision) {
      return Response.json(
        { error: "email_exists", message: "Diese Email-Adresse ist bereits vergeben." },
        { status: 409 },
      );
    }
    return Response.json(
      { error: "signup_failed", message: msg || "Registrierung fehlgeschlagen." },
      { status: 400 },
    );
  }

  const userId = created.user.id;

  const rollback = async () => {
    try {
      await supabase.auth.admin.deleteUser(userId);
    } catch {
      // best-effort rollback; orphan user will surface on next registration attempt
    }
  };

  try {
    // 3. Create the company — SCH-486: 30-day free trial.
    //    SCH-569: also create a Stripe Customer up-front so checkout/portal/webhook
    //    can reference it without a just-in-time lookup. If Stripe is unavailable
    //    or the request fails we still proceed — the customer can be created on
    //    first checkout. A broken Stripe config should not block onboarding.
    const trialStartedAt = new Date();
    const trialEndsAt = new Date(trialStartedAt);
    trialEndsAt.setDate(trialEndsAt.getDate() + 30);

    let stripeCustomerId: string | null = null;
    if (isStripeConfigured()) {
      try {
        const customer = await getStripe().customers.create({
          email,
          name: companyName,
          metadata: { company_id: companySlug },
        });
        stripeCustomerId = customer.id;
      } catch (stripeErr) {
        console.error("register-company: stripe customer create failed", stripeErr);
      }
    }

    const { error: companyError } = await supabase.from("companies").insert({
      id: companySlug,
      name: companyName,
      slug: companySlug,
      plan: "trial",
      status: "active",
      subscription_status: "free_trial",
      trial_started_at: trialStartedAt.toISOString(),
      trial_ends_at: trialEndsAt.toISOString(),
      stripe_customer_id: stripeCustomerId,
    });

    if (companyError) {
      if (companyError.code === "23505") {
        await rollback();
        return Response.json(
          { error: "slug_taken", message: "Dieses Unternehmens-Kürzel ist bereits vergeben." },
          { status: 409 },
        );
      }
      throw companyError;
    }

    // 4. Add the user as company owner
    const { error: memberError } = await supabase.from("company_members").insert({
      company_id: companySlug,
      user_id: userId,
      role: "owner",
    });
    if (memberError) throw memberError;

    // 5. Create default company_settings
    const { error: settingsError } = await supabase.from("company_settings").insert({
      id: companySlug,
      company_id: companySlug,
      company_name: companyName,
      company_type: "gmbh",
      address: "",
      city: "",
      zip: "",
      uid: "",
      iban: "",
      bic: "",
      phone: "",
      email,
      logo_url: "",
      default_tax_rate: 20,
      default_payment_terms_days: 14,
      next_invoice_number: 1,
      next_quote_number: 1,
      accompanying_text_de: "Vielen Dank für Ihren Auftrag!",
      accompanying_text_en: "Thank you for your order!",
    });
    if (settingsError) throw settingsError;

    // 6. Create user profile
    const { error: profileError } = await supabase.from("user_profiles").insert({
      auth_user_id: userId,
      display_name: resolvedDisplayName,
      email,
      role: "admin",
      company_access: JSON.stringify([companySlug]),
    });
    if (profileError) throw profileError;

    // 7. Set active company in user's app_metadata so JWT claims land on first sign-in
    await supabase.auth.admin.updateUserById(userId, {
      app_metadata: { company_id: companySlug },
    });

    return Response.json({ userId, companyId: companySlug });
  } catch (err) {
    await rollback();
    return Response.json(
      {
        error: "company_setup_failed",
        message: logAndSanitize("register-company", err, "Unternehmens-Erstellung fehlgeschlagen."),
      },
      { status: 500 },
    );
  }
}
