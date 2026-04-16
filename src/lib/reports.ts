// SCH-366 Modul 2 — Reporting backend.
//
// Reusable Aggregation für die Auswertung-Seite (Multi-Filter +
// Group-By). Holt time_entries aus Supabase mit den konfigurierten
// Filtern, aggregiert in-memory pro Gruppen-Key.
//
// Datenmenge: bis ~10k Einträge pro Company (vgl. Feasibility-Report
// SCH-375). Die Indexes aus supabase_migration_projects_and_tasks.sql
// (company_id+start_time, company_id+user_id+start_time) decken die
// hier verwendeten Where-Klauseln ab. SQL-View / RPC erst wenn die
// Datenmenge oder die Aggregations-Komplexitaet wächst.

import { createClient } from "./supabase/client";
import type { TimeEntry, TimeEntryType } from "./types";

export interface TimeReportFilter {
  /** Inclusive ISO start (YYYY-MM-DD or full ISO timestamp). */
  startDate: string;
  /** Exclusive ISO end (YYYY-MM-DD or full ISO timestamp). */
  endDate: string;
  /** Restrict to specific user_ids (user_profiles.id). */
  userIds?: string[];
  /** Restrict to specific project_ids (post-Modul-4). */
  projectIds?: string[];
  /** Restrict to specific task_ids (post-Modul-4). */
  taskIds?: string[];
  /** Backward-compat: legacy project_label string match. */
  projectLabels?: string[];
  /** Restrict to billable / non-billable. */
  billable?: boolean;
  /** Restrict to entry_type ("work" / "pause"). Default: "work". */
  entryType?: TimeEntryType | "all";
}

export type TimeReportGrouping =
  | "project"
  | "task"
  | "user"
  | "day"
  | "week"
  | "month";

export interface TimeReportRow {
  /** Stable grouping key (project_id, user_id, ISO date, …). */
  key: string;
  /** Human-readable label for UI rendering. */
  label: string;
  /** Sum of duration_minutes across the group. */
  total_minutes: number;
  /** Subtotal where billable = true. */
  billable_minutes: number;
  /** total_minutes - billable_minutes. */
  non_billable_minutes: number;
  /** Number of TimeEntry rows in the group. */
  entry_count: number;
}

export interface TimeReportTotals {
  total_minutes: number;
  billable_minutes: number;
  non_billable_minutes: number;
  entry_count: number;
}

export interface TimeReportResult {
  rows: TimeReportRow[];
  totals: TimeReportTotals;
  /** Raw entries used for the aggregation (for drill-down UI). */
  entries: TimeEntry[];
}

// --- Helpers ----------------------------------------------------------------

function getActiveCompanyId(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("activeCompanyId") || "vrthefans";
  }
  return "vrthefans";
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ISO 8601 week + year — robust ueber Jahresgrenzen (Mo-So Wochen).
function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// --- Public API -------------------------------------------------------------

/**
 * Lädt die Roh-TimeEntries für einen Reporting-Filter (ohne Aggregation).
 * Gibt die rohen Zeilen aus Supabase zurück — nützlich für Drill-Down,
 * CSV-Export oder Custom-Aggregationen.
 */
export async function getTimeReportEntries(
  filter: TimeReportFilter
): Promise<TimeEntry[]> {
  const sb = createClient();
  let q = sb
    .from("time_entries")
    .select("*")
    .eq("company_id", getActiveCompanyId())
    .gte("start_time", filter.startDate)
    .lt("start_time", filter.endDate)
    .order("start_time", { ascending: true });

  const entryType = filter.entryType ?? "work";
  if (entryType !== "all") q = q.eq("entry_type", entryType);
  if (filter.userIds && filter.userIds.length > 0) q = q.in("user_id", filter.userIds);
  if (filter.projectIds && filter.projectIds.length > 0) q = q.in("project_id", filter.projectIds);
  if (filter.taskIds && filter.taskIds.length > 0) q = q.in("task_id", filter.taskIds);
  if (filter.projectLabels && filter.projectLabels.length > 0) {
    q = q.in("project_label", filter.projectLabels);
  }
  if (typeof filter.billable === "boolean") q = q.eq("billable", filter.billable);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as TimeEntry[];
}

/**
 * Aggregiert TimeEntries nach Gruppen-Key und liefert sortierte Rows
 * (absteigend nach total_minutes) plus Gesamt-Summen.
 *
 * Gruppen-Logik:
 *  - "project": project_id wenn vorhanden, sonst project_label (backward-compat)
 *  - "task":    task_id; entries ohne task_id werden unter "_no_task" gruppiert
 *  - "user":    user_id (Label = user_name aus dem ersten Entry der Gruppe)
 *  - "day"/"week"/"month": start_time im lokalen Browser-TZ
 */
export async function getTimeReport(
  filter: TimeReportFilter,
  grouping: TimeReportGrouping
): Promise<TimeReportResult> {
  const entries = await getTimeReportEntries(filter);
  return aggregateTimeReport(entries, grouping);
}

/**
 * Aggregiert ein bereits geladenes Entry-Set — getrennt von getTimeReport
 * exportiert, damit die UI multiple Group-Bys ueber dieselbe Datenladung
 * fahren kann (Filter aendert sich -> neu laden; Gruppierung aendert sich
 * -> nur re-aggregieren).
 */
export function aggregateTimeReport(
  entries: TimeEntry[],
  grouping: TimeReportGrouping
): TimeReportResult {
  const groups = new Map<string, { label: string; row: TimeReportRow }>();
  const totals: TimeReportTotals = {
    total_minutes: 0,
    billable_minutes: 0,
    non_billable_minutes: 0,
    entry_count: 0,
  };

  for (const e of entries) {
    const minutes = Number(e.duration_minutes) || 0;
    const billable = e.billable ? minutes : 0;

    const { key, label } = groupKeyFor(e, grouping);
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = {
        label,
        row: {
          key,
          label,
          total_minutes: 0,
          billable_minutes: 0,
          non_billable_minutes: 0,
          entry_count: 0,
        },
      };
      groups.set(key, bucket);
    }
    bucket.row.total_minutes += minutes;
    bucket.row.billable_minutes += billable;
    bucket.row.non_billable_minutes += minutes - billable;
    bucket.row.entry_count += 1;

    totals.total_minutes += minutes;
    totals.billable_minutes += billable;
    totals.non_billable_minutes += minutes - billable;
    totals.entry_count += 1;
  }

  const rows = Array.from(groups.values())
    .map((g) => g.row)
    .sort((a, b) => b.total_minutes - a.total_minutes);

  return { rows, totals, entries };
}

function groupKeyFor(
  e: TimeEntry,
  grouping: TimeReportGrouping
): { key: string; label: string } {
  switch (grouping) {
    case "project": {
      // project_id bevorzugt (Modul 4); Fallback auf project_label.
      const id = e.project_id ?? null;
      if (id) return { key: id, label: e.project_label || id };
      return {
        key: `label:${e.project_label || ""}`,
        label: e.project_label || "(ohne Projekt)",
      };
    }
    case "task": {
      const id = e.task_id ?? null;
      if (id) return { key: id, label: id };
      return { key: "_no_task", label: "(ohne Aufgabe)" };
    }
    case "user":
      return { key: e.user_id, label: e.user_name || e.user_id };
    case "day": {
      const d = new Date(e.start_time);
      const k = isoDate(d);
      return { key: k, label: k };
    }
    case "week": {
      const d = new Date(e.start_time);
      const k = isoWeekKey(d);
      return { key: k, label: k };
    }
    case "month": {
      const d = new Date(e.start_time);
      const k = monthKey(d);
      return { key: k, label: k };
    }
  }
}

// --- Period presets ---------------------------------------------------------

export interface DateRange {
  startDate: string; // inclusive
  endDate: string;   // exclusive
  label: string;
}

/**
 * Häufig benötigte Zeitraum-Presets. Inklusiv-Start / exklusiv-Ende, damit
 * die Supabase-Filter (gte / lt) ohne Tag-Grenzen-Bugs arbeiten.
 */
export function periodPreset(
  preset: "today" | "this_week" | "last_week" | "this_month" | "last_month" | "this_year",
  now: Date = new Date()
): DateRange {
  const start = new Date(now);
  const end = new Date(now);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  switch (preset) {
    case "today": {
      end.setDate(end.getDate() + 1);
      return { startDate: isoDate(start), endDate: isoDate(end), label: "Heute" };
    }
    case "this_week": {
      const offset = (start.getDay() + 6) % 7; // Mon=0, Sun=6
      start.setDate(start.getDate() - offset);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 7);
      return { startDate: isoDate(start), endDate: isoDate(end), label: "Diese Woche" };
    }
    case "last_week": {
      const offset = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - offset - 7);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 7);
      return { startDate: isoDate(start), endDate: isoDate(end), label: "Letzte Woche" };
    }
    case "this_month": {
      start.setDate(1);
      end.setTime(start.getTime());
      end.setMonth(end.getMonth() + 1);
      return { startDate: isoDate(start), endDate: isoDate(end), label: "Dieser Monat" };
    }
    case "last_month": {
      start.setDate(1);
      start.setMonth(start.getMonth() - 1);
      end.setTime(start.getTime());
      end.setMonth(end.getMonth() + 1);
      return { startDate: isoDate(start), endDate: isoDate(end), label: "Letzter Monat" };
    }
    case "this_year": {
      start.setMonth(0, 1);
      end.setTime(start.getTime());
      end.setFullYear(end.getFullYear() + 1);
      return { startDate: isoDate(start), endDate: isoDate(end), label: "Dieses Jahr" };
    }
  }
}
