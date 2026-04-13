import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return Response.json({ error: "E-Mail und Passwort sind erforderlich" }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return Response.json({ error: "Server-Konfiguration fehlt (SUPABASE_SERVICE_ROLE_KEY)" }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  );

  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    if (!data?.user?.id) {
      return Response.json({ error: "Benutzer wurde erstellt, aber keine ID zurückgegeben. Bitte prüfe die Supabase Auth Konfiguration." }, { status: 500 });
    }

    return Response.json({ userId: data.user.id });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Unbekannter Fehler beim Erstellen des Benutzers" }, { status: 500 });
  }
}
