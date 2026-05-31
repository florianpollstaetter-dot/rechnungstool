// ORA-2295 — service-role PATCH for Arbeitszeitmodell settings + per-day rows.
//
// The /admin/arbeitszeitmodelle UI previously called `updateWorkTimeModel` and
// `replaceWorkTimeModelDays` from `src/lib/db.ts` directly. Those used the
// anon-key Supabase client, so an RLS denial on `work_time_models` /
// `work_time_model_days` (or the unguarded second UPDATE in
// `replaceWorkTimeModelDays`) silently swallowed the failure and the UI looked
// like it saved — exactly the same anti-pattern fixed for the assignment path
// in SCH-2280 (commit c445dd3).
//
// This route runs the writes through the service-role client, returns
// explicit errors, and enforces that the caller is admin of the model's
// company.

import { requireCompanyAdmin, logCompanyAuditAction } from "@/lib/company-admin";
import { createServiceClient } from "@/lib/operator";

type DayRow = {
  weekday: number;
  start_time: string | null;
  end_time: string | null;
  daily_target_minutes: number;
};

function parseDayRows(value: unknown): DayRow[] | { error: string } {
  if (!Array.isArray(value)) return { error: "days muss ein Array sein" };
  const out: DayRow[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return { error: "Ungültiger Tageseintrag" };
    const r = raw as Record<string, unknown>;
    const weekday = Number(r.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return { error: `Ungültiger Wochentag: ${String(r.weekday)}` };
    }
    const dailyTarget = Number(r.daily_target_minutes);
    if (!Number.isFinite(dailyTarget) || dailyTarget < 0) {
      return { error: `Ungültiges Tagespensum für Wochentag ${weekday}` };
    }
    const start = typeof r.start_time === "string" && r.start_time ? r.start_time : null;
    const end = typeof r.end_time === "string" && r.end_time ? r.end_time : null;
    if ((start === null) !== (end === null)) {
      return { error: `Wochentag ${weekday}: Von und Bis müssen beide gesetzt sein` };
    }
    out.push({ weekday, start_time: start, end_time: end, daily_target_minutes: dailyTarget });
  }
  return out;
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCompanyAdmin();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { id: modelId } = await ctx.params;
  if (!modelId) {
    return Response.json({ error: "Modell-ID fehlt" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        action?: unknown;
        name?: unknown;
        weekly_target_minutes?: unknown;
        unpaid_break_minutes?: unknown;
        vacation_days_per_year?: unknown;
        days?: unknown;
      }
    | null;
  const action = typeof body?.action === "string" ? body.action : null;
  if (!action) {
    return Response.json({ error: "action erforderlich" }, { status: 400 });
  }

  const service = createServiceClient();

  // Confirm the model belongs to a company the caller administers. Service
  // role bypasses RLS, so we have to enforce tenancy ourselves.
  const { data: model, error: modelErr } = await service
    .from("work_time_models")
    .select("id, company_id")
    .eq("id", modelId)
    .maybeSingle();
  if (modelErr) return Response.json({ error: modelErr.message }, { status: 500 });
  if (!model) return Response.json({ error: "Modell nicht gefunden" }, { status: 404 });
  if (!auth.adminCompanyIds.includes(model.company_id as string)) {
    return Response.json({ error: "Kein Zugriff auf dieses Modell" }, { status: 403 });
  }
  const companyId = model.company_id as string;

  if (action === "update_settings") {
    const patch: Record<string, unknown> = {};
    if (typeof body?.name === "string") {
      const name = body.name.trim();
      if (!name) return Response.json({ error: "Name darf nicht leer sein" }, { status: 400 });
      patch.name = name;
    }
    if (body?.weekly_target_minutes !== undefined) {
      const v = Number(body.weekly_target_minutes);
      if (!Number.isFinite(v) || v < 0) {
        return Response.json({ error: "weekly_target_minutes ungültig" }, { status: 400 });
      }
      patch.weekly_target_minutes = v;
    }
    if (body?.unpaid_break_minutes !== undefined) {
      const v = Number(body.unpaid_break_minutes);
      if (!Number.isFinite(v) || v < 0) {
        return Response.json({ error: "unpaid_break_minutes ungültig" }, { status: 400 });
      }
      patch.unpaid_break_minutes = v;
    }
    if (body?.vacation_days_per_year !== undefined) {
      const v = Number(body.vacation_days_per_year);
      if (!Number.isFinite(v) || v < 0) {
        return Response.json({ error: "vacation_days_per_year ungültig" }, { status: 400 });
      }
      patch.vacation_days_per_year = v;
    }
    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "Keine Felder zum Aktualisieren" }, { status: 400 });
    }

    const { data: updated, error: updateErr } = await service
      .from("work_time_models")
      .update(patch)
      .eq("id", modelId)
      .select()
      .single();
    if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 });

    await logCompanyAuditAction(
      auth.user!.id,
      companyId,
      "work_time_model.update_settings",
      "work_time_model",
      modelId,
      { fields: Object.keys(patch) },
    );

    return Response.json({ updated: true, model: updated });
  }

  if (action === "replace_days") {
    const parsed = parseDayRows(body?.days);
    if (!Array.isArray(parsed)) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    // Match db.ts replaceWorkTimeModelDays semantics: empty rows (no times,
    // 0 target) get deleted; the rest is upserted; weekly_target_minutes on
    // the parent model is recomputed from kept rows.
    const kept: DayRow[] = [];
    const removedWeekdays: number[] = [];
    for (let i = 0; i < 7; i++) {
      const row = parsed.find((r) => r.weekday === i);
      const isEmpty =
        !row ||
        (row.daily_target_minutes === 0 && !row.start_time && !row.end_time);
      if (isEmpty) {
        removedWeekdays.push(i);
        continue;
      }
      // Validate time window if both ends are set.
      if (row.start_time && row.end_time) {
        const [sh, sm] = row.start_time.split(":").map(Number);
        const [eh, em] = row.end_time.split(":").map(Number);
        if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) {
          return Response.json(
            { error: `Wochentag ${i}: Ungültiges Zeitformat` },
            { status: 400 },
          );
        }
        if (eh * 60 + em <= sh * 60 + sm) {
          return Response.json(
            { error: `Wochentag ${i}: Bis muss nach Von liegen` },
            { status: 400 },
          );
        }
      }
      kept.push(row);
    }

    if (removedWeekdays.length > 0) {
      const { error: delErr } = await service
        .from("work_time_model_days")
        .delete()
        .eq("model_id", modelId)
        .in("weekday", removedWeekdays);
      if (delErr) return Response.json({ error: delErr.message }, { status: 500 });
    }

    let savedDays: DayRow[] = [];
    if (kept.length > 0) {
      const { data, error: upsertErr } = await service
        .from("work_time_model_days")
        .upsert(
          kept.map((r) => ({ ...r, model_id: modelId })),
          { onConflict: "model_id,weekday" },
        )
        .select();
      if (upsertErr) return Response.json({ error: upsertErr.message }, { status: 500 });
      savedDays = (data ?? []) as DayRow[];
    }

    const weeklyTotal = savedDays.reduce(
      (s, r) => s + (Number(r.daily_target_minutes) || 0),
      0,
    );
    const { error: weeklyErr } = await service
      .from("work_time_models")
      .update({ weekly_target_minutes: weeklyTotal })
      .eq("id", modelId);
    if (weeklyErr) return Response.json({ error: weeklyErr.message }, { status: 500 });

    await logCompanyAuditAction(
      auth.user!.id,
      companyId,
      "work_time_model.replace_days",
      "work_time_model",
      modelId,
      { kept_weekdays: kept.map((r) => r.weekday), weekly_total_minutes: weeklyTotal },
    );

    return Response.json({ replaced: true, weekly_target_minutes: weeklyTotal, days: savedDays });
  }

  return Response.json({ error: "Unbekannte Aktion" }, { status: 400 });
}
