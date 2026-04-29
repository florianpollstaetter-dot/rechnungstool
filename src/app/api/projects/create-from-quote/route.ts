// SCH-366 Modul 4 — Auto-Anlage Project + Tasks aus einem freigegebenen Angebot.
//
// Wird von der App (aktuell noch manuell, später on-status-change "accepted")
// aufgerufen. Läuft mit Service-Role-Key, damit der Upsert nicht an RLS
// scheitert sobald RLS in Phase 2 aktiviert wird — der Client muss nur die
// quote_id und die company_id mitgeben.
//
// Idempotent auf quote_id: liegt bereits ein Projekt mit diesem quote_id-FK,
// wird das bestehende Projekt zurückgegeben (kein doppeltes Tasks-Insert).

import { createClient } from "@supabase/supabase-js";

type QuoteRow = {
  id: string;
  company_id: string;
  quote_number: string | null;
  project_description: string | null;
};

type QuoteItemRow = {
  position: number | null;
  description: string | null;
  unit: string | null;
  quantity: number | null;
  item_type: string | null;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { quoteId?: string; companyId?: string }
    | null;

  const quoteId = body?.quoteId?.trim();
  const companyId = body?.companyId?.trim();
  if (!quoteId || !companyId) {
    return Response.json(
      { error: "quoteId und companyId sind erforderlich" },
      { status: 400 }
    );
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return Response.json(
      { error: "Server-Konfiguration fehlt (SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 }
    );
  }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  // 1. Existierendes Projekt für diesen Quote zurückgeben (Idempotenz).
  const existing = await sb
    .from("projects")
    .select("*")
    .eq("company_id", companyId)
    .eq("quote_id", quoteId)
    .maybeSingle();
  if (existing.error) {
    return Response.json({ error: existing.error.message }, { status: 500 });
  }
  if (existing.data) {
    return Response.json({ project: existing.data, created: false });
  }

  // 2. Quote laden (company_id gegenchecken, verhindert Cross-Company-Zugriff).
  const quoteRes = await sb
    .from("quotes")
    .select("id, company_id, quote_number, project_description")
    .eq("id", quoteId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (quoteRes.error) {
    return Response.json({ error: quoteRes.error.message }, { status: 500 });
  }
  const quote = quoteRes.data as QuoteRow | null;
  if (!quote) {
    return Response.json(
      { error: `Angebot ${quoteId} nicht gefunden` },
      { status: 404 }
    );
  }

  // 3. Projekt anlegen.
  const projectName =
    quote.project_description?.trim() ||
    (quote.quote_number ? `Angebot ${quote.quote_number}` : "Projekt");

  const projectIns = await sb
    .from("projects")
    .insert({
      company_id: companyId,
      name: projectName,
      status: "active",
      quote_id: quoteId,
    })
    .select()
    .single();
  if (projectIns.error || !projectIns.data) {
    return Response.json(
      { error: projectIns.error?.message ?? "Projekt-Anlage fehlgeschlagen" },
      { status: 500 }
    );
  }
  const project = projectIns.data as { id: string };

  // 4. Tasks aus Quote-Positionen anlegen.
  const itemsRes = await sb
    .from("quote_items")
    .select("position, description, unit, quantity, item_type")
    .eq("quote_id", quoteId)
    .order("position", { ascending: true });
  if (itemsRes.error) {
    return Response.json({ error: itemsRes.error.message }, { status: 500 });
  }
  // SCH-924 K2-θ — section rows are headings only, never become tasks.
  const items = (itemsRes.data ?? [])
    .filter((row) => (row as QuoteItemRow).item_type !== "section") as QuoteItemRow[];

  if (items.length > 0) {
    const tasksIns = await sb.from("tasks").insert(
      items.map((item, idx) => ({
        company_id: companyId,
        project_id: project.id,
        title: item.description?.trim() || `Position ${item.position ?? idx + 1}`,
        status: "open",
        estimated_hours:
          item.unit === "Stunden" && item.quantity != null && item.quantity > 0
            ? item.quantity
            : null,
        position: item.position ?? idx + 1,
      }))
    );
    if (tasksIns.error) {
      return Response.json({ error: tasksIns.error.message }, { status: 500 });
    }
  }

  return Response.json({ project: projectIns.data, created: true });
}
