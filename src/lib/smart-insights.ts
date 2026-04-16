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
// MVP-Regeln (aus dem Feasibility-Report):
//   - billable-rate           — abgedeckt durch `billableRateRule`
//   - period-growth           — abgedeckt durch `periodGrowthRule`
//                               (generischer Überstunden-Trend-Ersatz,
//                               braucht keine Work-Schedule-Daten)
//   - top-project-share       — abgedeckt durch `topProjectShareRule`
//                               (Konzentrations-Hinweis fürs Dashboard)
//
// Offen bis das Schema erweitert ist:
//   - budget-overshoot        — braucht `projects.budget_hours` oder eine
//                               Ableitung aus quote.total → todo, wenn Board
//                               das Budget-Feld freigibt.
//   - overtime-vs-schedule    — braucht `user_work_schedules` Expected-Hours;
//                               die Daten-Pipeline liegt bereits (v2-Migration),
//                               kann nachgezogen werden wenn Produkt die
//                               exakte Regel festzurrt.

import type { TimeEntry } from "./types";

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

// --- Built-in rules ---------------------------------------------------------

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

/**
 * Warnung, wenn der Anteil abrechenbarer Stunden unter `minRatio` fällt.
 * Default: 60% — konsistent mit dem Feasibility-Report-Vorschlag.
 */
export function billableRateRule(
  opts: { minRatio?: number } = {}
): SmartInsightRule {
  const minRatio = opts.minRatio ?? 0.6;
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

/**
 * Info-Hinweis bei starkem Stundenanstieg gegenüber der Vorperiode.
 * `threshold`: Wachstum (z.B. 0.3 = +30%). Benötigt `priorEntries`
 * im Context — fehlt der, macht die Regel nichts.
 */
export function periodGrowthRule(
  opts: { threshold?: number } = {}
): SmartInsightRule {
  const threshold = opts.threshold ?? 0.3;
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

/**
 * Hinweis, wenn ein Projekt mehr als `maxShare` der gesamten Stunden
 * ausmacht — Konzentrations-Risiko / Klumpen-Signal fürs Dashboard.
 * Gruppiert bevorzugt nach project_id (Modul 4), fällt auf project_label
 * zurück — funktioniert vor und nach der Data-Migration.
 */
export function topProjectShareRule(
  opts: { maxShare?: number } = {}
): SmartInsightRule {
  const maxShare = opts.maxShare ?? 0.4;
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

/** Default-Set für die erste Dashboard-Version. */
export const DEFAULT_SMART_INSIGHT_RULES: SmartInsightRule[] = [
  billableRateRule(),
  periodGrowthRule(),
  topProjectShareRule(),
];
