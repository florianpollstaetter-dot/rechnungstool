// ORA-2295 (5th regression) — service-role POST for Arbeitszeitmodell creation.
//
// The /admin/arbeitszeitmodelle UI's `handleCreate` previously called
// `createWorkTimeModel` + `replaceWorkTimeModelDays` from `src/lib/db.ts`
// directly. Both go through the anon-key Supabase client, so the same silent-
// RLS-denial failure mode that motivated the PATCH endpoint (commit 351d6c0)
// also applied to creation — and that is exactly the path Florian reported as
// still broken on 2026-05-18 11:23 ("kann nichts neues speichern, das Modell
// bleibt immer auf Montag-Freitag"): the model row may have been inserted,
// but the per-weekday rows + the recomputed weekly_target_minutes update were
// dropped without surfacing an error.
//
// This route mirrors the [id] PATCH route: service-role client, manual
// tenancy enforcement against the caller's adminCompanyIds, explicit errors,
// audit log entries.
//
// Pairs with the same-flow PATCH at ./[id]/route.ts.

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

export async function POST(request: Request) {
  const auth = await requireCompanyAdmin();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => null)) as
    | {
        company_id?: unknown;
        name?: unknown;
        weekly_target_minutes?: unknown;
        unpaid_break_minutes?: unknown;
        vacation_days_per_year?: unknown;
        days?: unknown;
      }
    | null;
  if (!body) {
    return Response.json({ error: "Body fehlt" }, { status: 400 });
  }

  const companyId = typeof body.company_id === "string" ? body.company_id : null;
  if (!companyId) {
    return Response.json({ error: "company_id erforderlich" }, { status: 400 });
  }
  if (!auth.adminCompanyIds.includes(companyId)) {
    return Response.json({ error: "Kein Admin-Zugriff auf diese Company" }, { status: 403 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return Response.json({ error: "Name darf nicht leer sein" }, { status: 400 });
  }

  const weeklyTargetMinutes = Number(body.weekly_target_minutes);
  if (!Number.isFinite(weeklyTargetMinutes) || weeklyTargetMinutes < 0) {
    return Response.json({ error: "weekly_target_minutes ungültig" }, { status: 400 });
  }
  const unpaidBreakMinutes = Number(body.unpaid_break_minutes);
  if (!Number.isFinite(unpaidBreakMinutes) || unpaidBreakMinutes < 0) {
    return Response.json({ error: "unpaid_break_minutes ungültig" }, { status: 400 });
  }
  const vacationDaysPerYear = Number(body.vacation_days_per_year);
  if (!Number.isFinite(vacationDaysPerYear) || vacationDaysPerYear < 0) {
    return Response.json({ error: "vacation_days_per_year ungültig" }, { status: 400 });
  }

  const parsedDays = parseDayRows(body.days);
  if (!Array.isArray(parsedDays)) {
    return Response.json({ error: parsedDays.error }, { status: 400 });
  }

  // Drop empty rows (matches replaceWorkTimeModelDays semantics) and validate
  // time windows for the kept rows.
  const kept: DayRow[] = [];
  for (let i = 0; i < 7; i++) {
    const row = parsedDays.find((r) => r.weekday === i);
    const isEmpty =
      !row ||
      (row.daily_target_minutes === 0 && !row.start_time && !row.end_time);
    if (isEmpty) continue;
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

  const service = createServiceClient();

  // Insert the model. The kept-day-sum overrides any client-passed
  // weekly_target_minutes so the parent stays in sync with the day rows
  // (db.ts had the same invariant via the recompute UPDATE).
  const weeklyTotal = kept.reduce(
    (s, r) => s + (Number(r.daily_target_minutes) || 0),
    0,
  );

  const { data: created, error: insertErr } = await service
    .from("work_time_models")
    .insert({
      company_id: companyId,
      name,
      weekly_target_minutes: weeklyTotal,
      unpaid_break_minutes: unpaidBreakMinutes,
      vacation_days_per_year: vacationDaysPerYear,
    })
    .select()
    .single();
  if (insertErr || !created) {
    return Response.json(
      { error: insertErr?.message || "Modell konnte nicht angelegt werden" },
      { status: 500 },
    );
  }
  const modelId = created.id as string;

  let savedDays: DayRow[] = [];
  if (kept.length > 0) {
    const { data: dayData, error: dayErr } = await service
      .from("work_time_model_days")
      .insert(kept.map((r) => ({ ...r, model_id: modelId })))
      .select();
    if (dayErr) {
      // Roll back the parent so we don't leave a half-created model behind.
      await service.from("work_time_models").delete().eq("id", modelId);
      return Response.json({ error: dayErr.message }, { status: 500 });
    }
    savedDays = (dayData ?? []) as DayRow[];
  }

  await logCompanyAuditAction(
    auth.user!.id,
    companyId,
    "work_time_model.create",
    "work_time_model",
    modelId,
    {
      name,
      weekly_target_minutes: weeklyTotal,
      kept_weekdays: kept.map((r) => r.weekday),
    },
  );

  return Response.json({
    created: true,
    model: created,
    days: savedDays,
    weekly_target_minutes: weeklyTotal,
  });
}
