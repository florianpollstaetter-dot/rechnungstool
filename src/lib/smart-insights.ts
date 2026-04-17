// SCH-366 Modul 1 — Smart-Insights-Engine.
//
// Regelbasiert (ML-frei; vgl. Feasibility-Report SCH-375 Modul 1). Nimmt ein
// bereits geladenes TimeEntry-Set (aus `getTimeReportEntries`) und eine
// Liste von Rules entgegen und liefert dedupliziert SmartInsight-Cards.
//
// Die Engine ist bewusst schmal: rein datenbasiert, kein DB-Zugriff, keine
// UI-Kopplung. Dashboard/UI lädt Entries per Reports-Lib, reicht sie hier
// rein, rendert das Ergebnis. Neue Regeln werden einfach als weiteres
// `SmartInsightRule` hinzugefügt; Reihenfolge im Array = Reihenfolge in
// der Ausgabe.
//
// Alle Schwellwerte konfigurierbar über SmartInsightsConfig (Admin-Settings).
// `buildSmartInsightRules(config)` baut das Rule-Set aus gespeicherten Werten;
// `DEFAULT_SMART_INSIGHT_RULES` nutzt die Defaultwerte.
//
// Regeln:
//   - billable-rate       — Anteil abrechenbarer Stunden
//   - period-growth       — Stundenanstieg ggü. Vorperiode
//   - top-project-share   — Konzentrations-Hinweis
//   - budget-overshoot    — Projekt-Stundenbudget vs. gebuchte Stunden
//   - overtime-vs-schedule — Ist-Stunden vs. Soll-Stunden (Work-Schedule)

import type { TimeEntry } from "./types";
import type { SmartInsightsConfig } from "./types";
import { DEFAULT_SMART_INSIGHTS_CONFIG } from "./types";

export type InsightSeverity = "info" | "warning" | "critical";

export interface SmartInsight {
  /** Stable id for dedup / persisted dismiss state. */
  id: string;
  severity: InsightSeverity;
  title: string;
  /** Markdown body; UI entscheidet Rendering. */
  body: string;
  /** Optionale Kennzahl für Card-Badge. */
  metric?: { label: string; value: string };
  relatedProjectId?: string;
  relatedUserId?: string;
}

export interface SmartInsightContext {
  /** Haupt-Periode, über die Insights berechnet werden. */
  currentEntries: TimeEntry[];
  /** Optionale Vorperiode gleicher Länge für Trend-Regeln. */
  priorEntries?: TimeEntry[];
  /** Klartext-Label der aktuellen Periode (z.B. "Diese Woche"). */
  periodLabel?: string;
  /** Projekt-Budgets: Map projectId → { budgetHours, projectName }. */
  projectBudgets?: Map<string, { budgetHours: number; name: string }>;
  /** Soll-Stunden pro User im Zeitraum (aus user_work_schedules berechnet). */
  expectedHoursPerUser?: Map<string, { expectedHours: number; userName: string }>;
}

export interface SmartInsightRule {
  /** Stable id — nutzbar für Rule-Konfiguration / Deaktivierung. */
  id: string;
  evaluate(ctx: SmartInsightContext): SmartInsight[];
}

/** Führt alle Rules aus, schluckt Einzel-Rule-Fehler, dedupt per insight.id. */
export function evaluateSmartInsights(
  ctx: SmartInsightContext,
  rules: SmartInsightRule[]
): SmartInsight[] {
  const seen = new Set<string>();
  const out: SmartInsight[] = [];
  for (const rule of rules) {
    let produced: SmartInsight[] = [];
    try {
      produced = rule.evaluate(ctx);
    } catch {
      produced = [];
    }
    for (const insight of produced) {
      if (seen.has(insight.id)) continue;
      seen.add(insight.id);
      out.push(insight);
    }
  }
  return out;
}

// --- Helpers -----------------------------------------------------------------

function sumMinutes(entries: TimeEntry[]): number {
  let total = 0;
  for (const e of entries) total += Number(e.duration_minutes) || 0;
  return total;
}

function sumBillableMinutes(entries: TimeEntry[]): number {
  let total = 0;
  for (const e of entries) if (e.billable) total += Number(e.duration_minutes) || 0;
  return total;
}

function formatHours(minutes: number): string {
  return `${(minutes / 60).toFixed(1)}h`;
}

function formatPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

// --- Built-in rules ---------------------------------------------------------

export function billableRateRule(
  opts: { minRatio?: number } = {}
): SmartInsightRule {
  const minRatio = opts.minRatio ?? DEFAULT_SMART_INSIGHTS_CONFIG.billable_rate_min;
  return {
    id: "billable-rate",
    evaluate({ currentEntries, periodLabel }) {
      const total = sumMinutes(currentEntries);
      if (total === 0) return [];
      const billable = sumBillableMinutes(currentEntries);
      const ratio = billable / total;
      if (ratio >= minRatio) return [];
      const scope = periodLabel ? `im Zeitraum "${periodLabel}"` : "";
      return [
        {
          id: `billable-rate:${periodLabel ?? "current"}`,
          severity: "warning",
          title: "Niedrige Billable-Rate",
          body:
            `Nur **${formatPct(ratio)}** der gebuchten Zeit ${scope} ist als ` +
            `abrechenbar markiert (Ziel ≥ ${formatPct(minRatio)}).`,
          metric: { label: "Billable-Rate", value: formatPct(ratio) },
        },
      ];
    },
  };
}

export function periodGrowthRule(
  opts: { threshold?: number } = {}
): SmartInsightRule {
  const threshold = opts.threshold ?? DEFAULT_SMART_INSIGHTS_CONFIG.period_growth_threshold;
  return {
    id: "period-growth",
    evaluate({ currentEntries, priorEntries, periodLabel }) {
      if (!priorEntries || priorEntries.length === 0) return [];
      const cur = sumMinutes(currentEntries);
      const prior = sumMinutes(priorEntries);
      if (prior === 0) return [];
      const growth = (cur - prior) / prior;
      if (growth < threshold) return [];
      return [
        {
          id: `period-growth:${periodLabel ?? "current"}`,
          severity: "info",
          title: "Stundenanstieg",
          body:
            `Gebuchte Stunden **+${formatPct(growth)}** gegenüber Vorperiode ` +
            `(${formatHours(prior)} → ${formatHours(cur)}).`,
          metric: { label: "Wachstum", value: `+${formatPct(growth)}` },
        },
      ];
    },
  };
}

export function topProjectShareRule(
  opts: { maxShare?: number } = {}
): SmartInsightRule {
  const maxShare = opts.maxShare ?? DEFAULT_SMART_INSIGHTS_CONFIG.top_project_share_max;
  return {
    id: "top-project-share",
    evaluate({ currentEntries, periodLabel }) {
      const total = sumMinutes(currentEntries);
      if (total === 0) return [];

      const byProject = new Map<
        string,
        { label: string; minutes: number; projectId: string | null }
      >();
      for (const e of currentEntries) {
        const key = e.project_id ?? `label:${e.project_label || ""}`;
        const label = e.project_label || "(ohne Projekt)";
        const bucket = byProject.get(key) ?? {
          label,
          minutes: 0,
          projectId: e.project_id ?? null,
        };
        bucket.minutes += Number(e.duration_minutes) || 0;
        byProject.set(key, bucket);
      }

      let top: { label: string; minutes: number; projectId: string | null } | null = null;
      for (const bucket of byProject.values()) {
        if (!top || bucket.minutes > top.minutes) top = bucket;
      }
      if (!top) return [];

      const share = top.minutes / total;
      if (share < maxShare) return [];
      const scope = periodLabel ? `im Zeitraum "${periodLabel}"` : "";
      return [
        {
          id: `top-project-share:${top.projectId ?? top.label}`,
          severity: "info",
          title: "Top-Projekt",
          body:
            `**${top.label}** macht **${formatPct(share)}** der gebuchten ` +
            `Stunden ${scope} aus (${formatHours(top.minutes)} von ${formatHours(total)}).`,
          metric: { label: "Anteil", value: formatPct(share) },
          relatedProjectId: top.projectId ?? undefined,
        },
      ];
    },
  };
}

/**
 * Budget-Überschreitungs-Rule. Braucht `projectBudgets` im Context.
 * Warnt bei warnPct (Default 80%), critical bei criticalPct (Default 95%).
 * Emittiert eine Insight-Card pro überschrittenem Projekt.
 */
export function budgetOvershootRule(
  opts: { warnPct?: number; criticalPct?: number } = {}
): SmartInsightRule {
  const warnPct = opts.warnPct ?? DEFAULT_SMART_INSIGHTS_CONFIG.budget_overshoot_warn_pct;
  const criticalPct = opts.criticalPct ?? DEFAULT_SMART_INSIGHTS_CONFIG.budget_overshoot_critical_pct;
  return {
    id: "budget-overshoot",
    evaluate({ currentEntries, projectBudgets }) {
      if (!projectBudgets || projectBudgets.size === 0) return [];

      const byProject = new Map<string, number>();
      for (const e of currentEntries) {
        if (!e.project_id) continue;
        byProject.set(e.project_id, (byProject.get(e.project_id) ?? 0) + (Number(e.duration_minutes) || 0));
      }

      const insights: SmartInsight[] = [];
      for (const [projectId, budget] of projectBudgets) {
        const loggedMinutes = byProject.get(projectId) ?? 0;
        const loggedHours = loggedMinutes / 60;
        const ratio = loggedHours / budget.budgetHours;
        if (ratio < warnPct) continue;

        const severity: InsightSeverity = ratio >= criticalPct ? "critical" : "warning";
        insights.push({
          id: `budget-overshoot:${projectId}`,
          severity,
          title: severity === "critical" ? "Budget fast aufgebraucht" : "Budget-Warnung",
          body:
            `**${budget.name}**: ${formatHours(loggedMinutes)} von ` +
            `${budget.budgetHours.toFixed(1)}h Budget verbraucht (**${formatPct(ratio)}**).`,
          metric: { label: "Budget", value: formatPct(ratio) },
          relatedProjectId: projectId,
        });
      }
      return insights;
    },
  };
}

/**
 * Überstunden vs. Soll-Stunden. Braucht `expectedHoursPerUser` im Context
 * (berechnet aus user_work_schedules × Arbeitstage im Zeitraum).
 * Info-Hinweis wenn Ist > Soll × (1 + threshold).
 */
export function overtimeVsScheduleRule(
  opts: { threshold?: number } = {}
): SmartInsightRule {
  const threshold = opts.threshold ?? DEFAULT_SMART_INSIGHTS_CONFIG.overtime_threshold_pct;
  return {
    id: "overtime-vs-schedule",
    evaluate({ currentEntries, expectedHoursPerUser }) {
      if (!expectedHoursPerUser || expectedHoursPerUser.size === 0) return [];

      const byUser = new Map<string, number>();
      for (const e of currentEntries) {
        byUser.set(e.user_id, (byUser.get(e.user_id) ?? 0) + (Number(e.duration_minutes) || 0));
      }

      const insights: SmartInsight[] = [];
      for (const [userId, expected] of expectedHoursPerUser) {
        const actualMinutes = byUser.get(userId) ?? 0;
        const actualHours = actualMinutes / 60;
        if (expected.expectedHours <= 0) continue;
        const overshoot = (actualHours - expected.expectedHours) / expected.expectedHours;
        if (overshoot < threshold) continue;

        insights.push({
          id: `overtime-vs-schedule:${userId}`,
          severity: "warning",
          title: "Überstunden",
          body:
            `**${expected.userName}**: ${actualHours.toFixed(1)}h gebucht vs. ` +
            `${expected.expectedHours.toFixed(1)}h Soll (**+${formatPct(overshoot)}**).`,
          metric: { label: "Überstunden", value: `+${formatPct(overshoot)}` },
          relatedUserId: userId,
        });
      }
      return insights;
    },
  };
}

// --- Config-driven rule builder ----------------------------------------------

/** Baut das Rule-Set aus Admin-konfigurierbaren Schwellwerten. */
export function buildSmartInsightRules(
  config: Pick<
    SmartInsightsConfig,
    | "billable_rate_min"
    | "period_growth_threshold"
    | "top_project_share_max"
    | "budget_overshoot_warn_pct"
    | "budget_overshoot_critical_pct"
    | "overtime_threshold_pct"
  >
): SmartInsightRule[] {
  return [
    billableRateRule({ minRatio: config.billable_rate_min }),
    periodGrowthRule({ threshold: config.period_growth_threshold }),
    topProjectShareRule({ maxShare: config.top_project_share_max }),
    budgetOvershootRule({
      warnPct: config.budget_overshoot_warn_pct,
      criticalPct: config.budget_overshoot_critical_pct,
    }),
    overtimeVsScheduleRule({ threshold: config.overtime_threshold_pct }),
  ];
}

/** Default-Set mit Standard-Schwellwerten. */
export const DEFAULT_SMART_INSIGHT_RULES: SmartInsightRule[] =
  buildSmartInsightRules(DEFAULT_SMART_INSIGHTS_CONFIG);
