// ORA-3315 — Server-Route: UID gegen EU-VIES prüfen.
//
// Nimmt eine UID, prüft sie über das VIES-REST-Checkmodul und gibt
// gültig/ungültig + ggf. Name/Adresse zurück. VIES-Ausfälle kommen als
// status:"unavailable" zurück (kein harter Fehler) — der Dienst ist regelmäßig
// offline und darf das Kunden-Anlegen nicht blockieren.
//
// Hinter einer authentifizierten Session, damit anonyme Aufrufer den
// VIES-Proxy nicht missbrauchen (analog zu customers/ai-complete).

import { createClient as createServerClient } from "@/lib/supabase/server";
import { logAndSanitize } from "@/lib/api-errors";
import { verifyUid } from "@/lib/einvoice/vies";

export async function POST(request: Request) {
  const ssr = await createServerClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) {
    return Response.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { uid?: string } | null;
  const uid = body?.uid?.trim();
  if (!uid) {
    return Response.json({ error: "UID ist erforderlich" }, { status: 400 });
  }

  try {
    const result = await verifyUid(uid);
    return Response.json(result);
  } catch (err) {
    // verifyUid fängt Netz-/Dienstfehler selbst ab; hier landen nur
    // unerwartete Programmfehler.
    return Response.json(
      { error: logAndSanitize("customers/verify-uid", err, "UID-Prüfung fehlgeschlagen.") },
      { status: 500 },
    );
  }
}
