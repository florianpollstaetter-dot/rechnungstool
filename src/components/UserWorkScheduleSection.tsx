"use client";

// SCH-819 Phase 4 — Arbeitszeitmodelle section in /settings.
// Lets the signed-in user view + edit their own per-weekday work schedule.
// Backend (table user_work_schedules + CRUD in db.ts) already exists; the
// admin page has the same editor in a modal — this is the same UI lifted
// into a settings card so users can self-manage without an admin handoff.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getUserProfile, getUserWorkSchedules, replaceUserWorkSchedules } from "@/lib/db";
import { useI18n } from "@/lib/i18n-context";
import type { TranslationKey } from "@/lib/translations/de";

interface ScheduleDraftRow {
  weekday: number;
  start_time: string;
  end_time: string;
  daily_target_minutes: number;
  target_override: boolean;
  enabled: boolean;
  // SCH-918 K2-G10 — unpaid break per day (minutes).
  unpaid_break_minutes: number;
}

function minutesFromTimes(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : 0;
}

// SCH-918 K2-G10 — paid daily target = window − unpaid break. Same helper as
// the admin modal so both editors derive the auto-target identically.
function derivedTarget(start: string, end: string, unpaidBreakMinutes: number): number {
  const window = minutesFromTimes(start, end);
  if (window <= 0) return 0;
  const paid = window - Math.max(0, unpaidBreakMinutes);
  return paid > 0 ? paid : 0;
}

function emptyDraft(): ScheduleDraftRow[] {
  return Array.from({ length: 7 }, (_, i) => {
    const isWeekday = i < 5;
    const start = isWeekday ? "09:00" : "";
    const end = isWeekday ? "17:30" : "";
    const breakMin = isWeekday ? 60 : 0;
    return {
      weekday: i,
      start_time: start,
      end_time: end,
      daily_target_minutes: derivedTarget(start, end, breakMin),
      target_override: false,
      enabled: isWeekday,
      unpaid_break_minutes: breakMin,
    };
  });
}

function formatMinutesAsHours(mins: number): string {
  if (!mins) return "0h";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function UserWorkScheduleSection() {
  const { t } = useI18n();
  const [userId, setUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScheduleDraftRow[]>(emptyDraft());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) {
          setLoading(false);
          return;
        }
        // SCH-914 — user_work_schedules.user_id references user_profiles.id,
        // NOT auth.users.id. The RLS policy joins through user_profiles too,
        // so passing the raw auth uid silently produced an empty load and a
        // rejected save.
        const profile = await getUserProfile(user.id);
        if (!profile || cancelled) {
          setLoading(false);
          return;
        }
        setUserId(profile.id);
        const existing = await getUserWorkSchedules(profile.id);
        if (cancelled) return;
        const next = emptyDraft();
        existing.forEach((row) => {
          const idx = row.weekday;
          if (idx < 0 || idx > 6) return;
          const start = row.start_time || "";
          const end = row.end_time || "";
          const breakMin = row.unpaid_break_minutes ?? 0;
          next[idx] = {
            weekday: idx,
            start_time: start,
            end_time: end,
            daily_target_minutes: row.daily_target_minutes,
            target_override: start && end
              ? derivedTarget(start, end, breakMin) !== row.daily_target_minutes
              : row.daily_target_minutes > 0,
            enabled: row.daily_target_minutes > 0 || !!(start && end),
            unpaid_break_minutes: breakMin,
          };
        });
        setDraft(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function updateRow(weekday: number, patch: Partial<ScheduleDraftRow>) {
    setDraft((rows) =>
      rows.map((r) => {
        if (r.weekday !== weekday) return r;
        const next: ScheduleDraftRow = { ...r, ...patch };
        // SCH-918 K2-G10 — re-derive when window OR break changes so paid
        // time = window − break tracks both inputs.
        const inputAffectsDerivation =
          "start_time" in patch || "end_time" in patch || "unpaid_break_minutes" in patch;
        if (inputAffectsDerivation && !next.target_override) {
          next.daily_target_minutes = derivedTarget(
            next.start_time,
            next.end_time,
            next.unpaid_break_minutes,
          );
        }
        if ("daily_target_minutes" in patch) {
          next.target_override = true;
        }
        return next;
      }),
    );
  }

  function toggleDay(weekday: number) {
    setDraft((rows) =>
      rows.map((r) => {
        if (r.weekday !== weekday) return r;
        const enabled = !r.enabled;
        return {
          ...r,
          enabled,
          daily_target_minutes: enabled
            ? (r.daily_target_minutes || derivedTarget(r.start_time, r.end_time, r.unpaid_break_minutes))
            : 0,
          target_override: enabled ? r.target_override : false,
        };
      }),
    );
  }

  async function save() {
    if (!userId) return;
    setSaving(true);
    setError(null);
    try {
      const payload = draft.map((row) => ({
        weekday: row.weekday,
        start_time: row.enabled ? (row.start_time || null) : null,
        end_time: row.enabled ? (row.end_time || null) : null,
        daily_target_minutes: row.enabled ? row.daily_target_minutes : 0,
        unpaid_break_minutes: row.enabled ? row.unpaid_break_minutes : 0,
      }));
      await replaceUserWorkSchedules(userId, payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const weekTotal = draft.filter((r) => r.enabled).reduce((s, r) => s + r.daily_target_minutes, 0);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("settings.workScheduleTitle")}</h2>
        <p className="text-xs text-[var(--text-secondary)] mt-1">{t("settings.workScheduleHint")}</p>
      </div>

      {loading ? (
        <div className="py-8 text-center text-[var(--text-muted)] text-sm">{t("common.loading")}</div>
      ) : !userId ? (
        <div className="py-8 text-center text-[var(--text-muted)] text-sm">{t("common.notSignedIn")}</div>
      ) : (
        <>
          {/* SCH-919 K2-O3 — mobile: short weekday + tighter padding/widths so
              the row fits a 320px viewport without horizontal scroll.
              SCH-918 K2-G10 — overflow-x-auto as a safety net if the unbez.
              Pause column (added later) pushes the row past the viewport. */}
          <div className="bg-[var(--background)] rounded-lg border border-[var(--border)] overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--surface-hover)] text-[10px] uppercase text-[var(--text-muted)]">
                  <th className="px-1.5 sm:px-3 py-2 text-left font-medium">{t("admin.scheduleDay")}</th>
                  <th className="px-1 sm:px-3 py-2 text-left font-medium">{t("admin.scheduleActive")}</th>
                  <th className="px-1.5 sm:px-3 py-2 text-left font-medium">{t("admin.scheduleFrom")}</th>
                  <th className="px-1.5 sm:px-3 py-2 text-left font-medium">{t("admin.scheduleTo")}</th>
                  <th className="px-1.5 sm:px-3 py-2 text-right font-medium">unbez. Pause</th>
                  <th className="px-1.5 sm:px-3 py-2 text-right font-medium">{t("admin.scheduleDailyTarget")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {draft.map((row) => {
                  // SCH-918 K2-G10 — derived = paid (window − break), so the
                  // "Auto" link restores the pause-aware value, not the raw span.
                  const derived = derivedTarget(row.start_time, row.end_time, row.unpaid_break_minutes);
                  const mismatch = row.enabled && row.target_override && derived > 0 && derived !== row.daily_target_minutes;
                  return (
                    <tr key={row.weekday} className={row.enabled ? "" : "opacity-40"}>
                      <td className="px-1.5 sm:px-3 py-2 font-medium text-[var(--text-primary)] whitespace-nowrap">
                        <span className="sm:hidden">{t(`weekday.short.${row.weekday}` as TranslationKey)}</span>
                        <span className="hidden sm:inline">{t(`weekday.long.${row.weekday}` as TranslationKey)}</span>
                      </td>
                      <td className="px-1 sm:px-3 py-2 w-8 sm:w-16">
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          onChange={() => toggleDay(row.weekday)}
                          className="accent-[var(--brand-orange)] w-4 h-4"
                          aria-label={t("admin.scheduleActive")}
                        />
                      </td>
                      <td className="px-1.5 sm:px-3 py-2">
                        <input
                          type="time"
                          value={row.start_time}
                          disabled={!row.enabled}
                          onChange={(e) => updateRow(row.weekday, { start_time: e.target.value })}
                          className="bg-[var(--surface)] border border-[var(--border)] rounded px-1 sm:px-2 py-1 text-xs text-[var(--text-primary)] w-[5.25rem] sm:w-28 disabled:opacity-50"
                        />
                      </td>
                      <td className="px-1.5 sm:px-3 py-2">
                        <input
                          type="time"
                          value={row.end_time}
                          disabled={!row.enabled}
                          onChange={(e) => updateRow(row.weekday, { end_time: e.target.value })}
                          className="bg-[var(--surface)] border border-[var(--border)] rounded px-1 sm:px-2 py-1 text-xs text-[var(--text-primary)] w-[5.25rem] sm:w-28 disabled:opacity-50"
                        />
                      </td>
                      <td className="px-1.5 sm:px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            value={row.unpaid_break_minutes}
                            disabled={!row.enabled}
                            onChange={(e) =>
                              updateRow(row.weekday, {
                                unpaid_break_minutes: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="bg-[var(--surface)] border border-[var(--border)] rounded px-1 sm:px-2 py-1 text-xs text-[var(--text-primary)] w-12 sm:w-16 text-right disabled:opacity-50"
                          />
                          <span className="hidden sm:inline text-[10px] text-[var(--text-muted)] w-8">min</span>
                        </div>
                      </td>
                      <td className="px-1.5 sm:px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            value={row.daily_target_minutes}
                            disabled={!row.enabled}
                            onChange={(e) =>
                              updateRow(row.weekday, {
                                daily_target_minutes: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="bg-[var(--surface)] border border-[var(--border)] rounded px-1 sm:px-2 py-1 text-xs text-[var(--text-primary)] w-14 sm:w-20 text-right disabled:opacity-50"
                          />
                          <span className="hidden sm:inline text-[10px] text-[var(--text-muted)] w-8">min</span>
                        </div>
                        {row.enabled && (
                          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                            {row.target_override ? (
                              <button
                                type="button"
                                onClick={() =>
                                  updateRow(row.weekday, { target_override: false, daily_target_minutes: derived })
                                }
                                className="text-[var(--brand-orange)] hover:underline"
                              >
                                {mismatch
                                  ? t("admin.scheduleResetToSpan", { hours: formatMinutesAsHours(derived) })
                                  : t("admin.scheduleAuto")}
                              </button>
                            ) : (
                              <span>= {formatMinutesAsHours(row.daily_target_minutes)}</span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[var(--surface-hover)] text-xs">
                  <td className="px-1.5 sm:px-3 py-2 font-semibold text-[var(--text-secondary)]" colSpan={5}>
                    {t("admin.scheduleWeeklyTotal")}
                  </td>
                  <td className="px-1.5 sm:px-3 py-2 text-right font-bold text-[var(--text-primary)]">
                    {formatMinutesAsHours(weekTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
            <p className="text-xs text-[var(--text-muted)]">{t("admin.scheduleAutoHint")}</p>
            <div className="flex items-center gap-3">
              {error && <span className="text-xs text-rose-400 font-medium">{error}</span>}
              {saved && !error && <span className="text-xs text-emerald-400 font-medium">{t("common.saved")}</span>}
              <button
                onClick={save}
                disabled={saving}
                className="bg-[var(--brand-orange)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition"
              >
                {saving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
