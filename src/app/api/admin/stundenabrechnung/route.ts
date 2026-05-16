import { requireCompanyAdmin } from "@/lib/company-admin";
import { createServiceClient } from "@/lib/operator";

// ISO week number (Mon=start) for a local Date object.
function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// JS day (0=Sun, 1=Mon … 6=Sat) → DB weekday index (0=Mon … 6=Sun)
function jsWeekdayToModel(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

function formatHHMM(isoUtc: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("de-AT", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    }).format(new Date(isoUtc));
  } catch {
    return "";
  }
}

export async function GET(request: Request) {
  const auth = await requireCompanyAdmin();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id") || null;
  const monthParam = searchParams.get("month"); // "YYYY-MM"

  if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
    return Response.json({ error: "month parameter required (YYYY-MM)" }, { status: 400 });
  }

  const [year, month] = monthParam.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  const companyId = auth.adminCompanyIds[0];
  if (!companyId) {
    return Response.json({ error: "Keine Firma gefunden" }, { status: 400 });
  }

  const service = createServiceClient();
  const tz = "Europe/Vienna";

  // Resolve user profile (id + name)
  let targetUserId: string | null = userId;
  let targetUserName = "";
  let targetUserEmail = "";

  if (!targetUserId) {
    return Response.json({ error: "user_id required" }, { status: 400 });
  }

  const { data: profile } = await service
    .from("user_profiles")
    .select("id, display_name, email, work_time_model_id")
    .eq("auth_user_id", targetUserId)
    .maybeSingle();

  if (!profile) {
    return Response.json({ error: "User nicht gefunden" }, { status: 404 });
  }
  targetUserName = (profile.display_name as string) || (profile.email as string) || targetUserId;
  targetUserEmail = (profile.email as string) || "";

  // Load work_time_model_days for soll
  let modelDays: Record<number, number> = {}; // weekday(0=Mon) → daily_target_minutes
  if (profile.work_time_model_id) {
    const { data: days } = await service
      .from("work_time_model_days")
      .select("weekday, daily_target_minutes")
      .eq("model_id", profile.work_time_model_id as string);
    for (const d of days ?? []) {
      modelDays[d.weekday as number] = d.daily_target_minutes as number;
    }
  }

  // Fetch time entries for this user in this month
  // Use wide window (day before + day after) to catch entries spanning midnight
  const rangeStart = new Date(year, month - 1, 1, 0, 0, 0);
  const rangeEnd = new Date(year, month, 0, 23, 59, 59);
  const rangeStartISO = rangeStart.toISOString();
  const rangeEndISO = rangeEnd.toISOString();

  const { data: rawEntries } = await service
    .from("time_entries")
    .select(
      "id, start_time, end_time, entry_type, duration_minutes, base_minutes, ot_25_minutes, ot_50_minutes, ot_100_minutes, unpaid_break_minutes",
    )
    .eq("company_id", companyId)
    .eq("user_id", targetUserId)
    .gte("start_time", rangeStartISO)
    .lte("start_time", rangeEndISO)
    .order("start_time", { ascending: true });

  const entries = rawEntries ?? [];

  // Fetch absences for this user in this month
  const { data: rawAbsences } = await service
    .from("absences")
    .select("id, start_date, end_date, absence_type, approved")
    .eq("company_id", companyId)
    .eq("user_id", targetUserId)
    .lte("start_date", `${year}-${String(month).padStart(2, "0")}-31`)
    .gte("end_date", `${year}-${String(month).padStart(2, "0")}-01`);

  const absences = rawAbsences ?? [];

  // Build day-indexed maps from entries
  type DayKey = string; // "YYYY-MM-DD" in local tz
  const dayEntries: Record<DayKey, typeof entries> = {};
  for (const e of entries) {
    const localDate = new Intl.DateTimeFormat("de-AT", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: tz,
    })
      .format(new Date(e.start_time as string))
      .split(".")
      .reverse()
      .join("-");
    // localDate is now "YYYY-MM-DD"
    const key = localDate.replace(/(\d{4})-(\d{2})-(\d{2})/, "$1-$2-$3");
    if (!dayEntries[key]) dayEntries[key] = [];
    dayEntries[key].push(e);
  }

  // Build absence map
  const absenceByDay: Record<DayKey, string> = {};
  for (const a of absences) {
    const start = new Date(a.start_date as string);
    const end = new Date(a.end_date as string);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      absenceByDay[key] = a.absence_type as string;
    }
  }

  // Build per-day rows
  type DayRow = {
    date: string;
    weekday: number; // 0=Mon
    iso_week: number;
    soll_min: number;
    begin: string | null;
    end: string | null;
    pause_min: number;
    ist_min: number;
    ot_25: number;
    ot_50: number;
    ot_100: number;
    tagessaldo_min: number;
    absence: string | null;
  };

  const days: DayRow[] = [];
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const jsDay = d.getDay(); // 0=Sun
    const modelWeekday = jsWeekdayToModel(jsDay);
    const isoWeekNum = isoWeek(d);

    const soll = modelDays[modelWeekday] ?? 0;
    const dayEs = dayEntries[dateStr] ?? [];
    const workEntries = dayEs.filter(
      (e) => e.entry_type === "work" && e.end_time != null,
    );

    let begin: string | null = null;
    let end: string | null = null;
    let pause_min = 0;
    let ist_min = 0;
    let ot_25 = 0;
    let ot_50 = 0;
    let ot_100 = 0;

    if (workEntries.length > 0) {
      // Earliest start, latest end
      const starts = workEntries.map((e) => e.start_time as string).sort();
      const ends = workEntries.map((e) => e.end_time as string).sort();
      begin = formatHHMM(starts[0], tz);
      end = formatHHMM(ends[ends.length - 1], tz);

      // Sum surcharge minutes
      for (const e of workEntries) {
        ot_25 += (e.ot_25_minutes as number) || 0;
        ot_50 += (e.ot_50_minutes as number) || 0;
        ot_100 += (e.ot_100_minutes as number) || 0;
        ist_min +=
          ((e.base_minutes as number) || 0) +
          ((e.ot_25_minutes as number) || 0) +
          ((e.ot_50_minutes as number) || 0) +
          ((e.ot_100_minutes as number) || 0);
      }

      // Pause = sum of pause-type entries that day
      const pauseEntries = dayEs.filter((e) => e.entry_type === "pause" && e.end_time != null);
      for (const e of pauseEntries) {
        pause_min += (e.duration_minutes as number) || 0;
      }
    }

    const absence = absenceByDay[dateStr] ?? null;

    days.push({
      date: dateStr,
      weekday: modelWeekday,
      iso_week: isoWeekNum,
      soll_min: soll,
      begin,
      end,
      pause_min,
      ist_min,
      ot_25,
      ot_50,
      ot_100,
      tagessaldo_min: ist_min - soll,
      absence,
    });
  }

  // Build weekly saldos
  const weekMap: Record<number, number> = {};
  for (const day of days) {
    weekMap[day.iso_week] = (weekMap[day.iso_week] ?? 0) + day.tagessaldo_min;
  }
  const weeks = Object.entries(weekMap)
    .map(([w, s]) => ({ iso_week: Number(w), saldo_min: s }))
    .sort((a, b) => a.iso_week - b.iso_week);

  const month_saldo_min = days.reduce((sum, d) => sum + d.tagessaldo_min, 0);

  return Response.json({
    user: {
      id: targetUserId,
      display_name: targetUserName,
      email: targetUserEmail,
    },
    month: monthParam,
    days,
    weeks,
    month_saldo_min,
  });
}
