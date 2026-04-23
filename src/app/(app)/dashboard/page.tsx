"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Invoice, Customer, Quote, CompanySettings, FixedCost, Receipt, Project } from "@/lib/types";
import { getInvoices, getCustomers, getQuotes, getSettings, getActiveFixedCosts, getReceipts, getSmartInsightsConfig, getProjects } from "@/lib/db";
import { formatCurrency, formatDateLong } from "@/lib/format";
import { SmartInsight, SmartInsightContext, buildSmartInsightRules, evaluateSmartInsights } from "@/lib/smart-insights";
import { getTipOfTheDay } from "@/lib/tips";
import { getTimeReportEntries, periodPreset } from "@/lib/reports";
import { useI18n } from "@/lib/i18n-context";
import { sanitizeHtml } from "@/lib/sanitize-markdown";

function getChuckNorrisFact(): string {
  const facts = [
    "Chuck Norris konnte eine Steuererklärung prüfen, bevor sie eingereicht wurde.",
    "Chuck Norris brauchte keinen Steuerberater. Der Steuerberater brauchte Chuck Norris.",
    "Wenn Chuck Norris eine Rechnung schrieb, bezahlte sich der Kunde selbst.",
    "Chuck Norris konnte Rechnungen mit einem Blick stornieren.",
    "Die USt-Voranmeldung reichte sich selbst ein, wenn Chuck Norris in der Nähe war.",
    "Chuck Norris' IBAN hatte nur 4 Stellen. Die Bank hatte Angst, mehr zu verlangen.",
    "Chuck Norris debuggte Code, indem er den Monitor anstarrte, bis der Bug gestand.",
    "Wenn Chuck Norris Enter drückte, kompilierte das gesamte Internet neu.",
    "Chuck Norris konnte mit einem Roundhouse-Kick eine Excel-Tabelle in eine Datenbank verwandeln.",
    "Chuck Norris brauchte kein Backup. Seine Daten hatten Angst zu verschwinden.",
    "Chuck Norris schickte einmal eine Rechnung an sich selbst. Er bezahlte sofort — aus Respekt.",
    "Chuck Norris konnte PDFs mit bloßen Händen unterschreiben.",
    "Wenn Chuck Norris eine Mahnung schickte, kam das Geld zurück, bevor die Post zugestellt wurde.",
    "Chuck Norris' Buchhaltung war immer auf den Cent genau. Die Cents rundeten sich selbst.",
    "Chuck Norris' Geschäftsjahr hatte 13 Monate. Der 13. hieß 'Chucktober'.",
  ];
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return facts[dayOfYear % facts.length];
}

export default function DashboardPage() {
  const { t } = useI18n();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [insights, setInsights] = useState<SmartInsight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showChuckNorris, setShowChuckNorris] = useState(false);
  const [showTips, setShowTips] = useState(true);
  const [cardVisibility, setCardVisibility] = useState<Record<string, boolean>>({
    monatsumsatz: true,
    offene_rechnungen: true,
    ueberfaellig: true,
    umsatzsteuer: true,
    belege: true,
    fixkosten: true,
    smart_insights: true,
    letzte_rechnungen: true,
    letzte_angebote: true,
  });

  const loadData = useCallback(async () => {
    const [inv, cust, q, s, fc, rec] = await Promise.all([getInvoices(), getCustomers(), getQuotes(), getSettings(), getActiveFixedCosts(), getReceipts()]);
    setInvoices(inv);
    setCustomers(cust);
    setQuotes(q);
    setSettings(s);
    setFixedCosts(fc);
    setReceipts(rec);
    setLoading(false);
  }, []);

  const loadInsights = useCallback(async () => {
    try {
      const [config, projects] = await Promise.all([getSmartInsightsConfig(), getProjects()]);
      const rules = buildSmartInsightRules(config);

      const thisWeek = periodPreset("this_week");
      const lastWeek = periodPreset("last_week");
      const [currentEntries, priorEntries] = await Promise.all([
        getTimeReportEntries({ startDate: thisWeek.startDate, endDate: thisWeek.endDate }),
        getTimeReportEntries({ startDate: lastWeek.startDate, endDate: lastWeek.endDate }),
      ]);

      const projectBudgets = new Map<string, { budgetHours: number; name: string }>();
      for (const p of projects) {
        if (p.budget_hours && p.budget_hours > 0) {
          projectBudgets.set(p.id, { budgetHours: p.budget_hours, name: p.name });
        }
      }

      const ctx: SmartInsightContext = {
        currentEntries,
        priorEntries,
        periodLabel: thisWeek.label,
        projectBudgets: projectBudgets.size > 0 ? projectBudgets : undefined,
      };

      setInsights(evaluateSmartInsights(ctx, rules));
    } catch {
      setInsights([]);
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadInsights();
    const cn = localStorage.getItem("show_chuck_norris");
    const tp = localStorage.getItem("show_tips");
    setShowChuckNorris(cn === "true");
    setShowTips(tp === null ? true : tp === "true");

    const cardKeys = ["monatsumsatz", "offene_rechnungen", "ueberfaellig", "umsatzsteuer", "belege", "fixkosten", "smart_insights", "letzte_rechnungen", "letzte_angebote"];
    const vis: Record<string, boolean> = {};
    for (const key of cardKeys) {
      const stored = localStorage.getItem(`show_card_${key}`);
      vis[key] = stored === null ? true : stored === "true";
    }
    setCardVisibility(vis);
  }, [loadData, loadInsights]);

  const activeInvoices = invoices.filter((i) => i.status !== "storniert");
  const openInvoices = activeInvoices.filter((i) => i.status === "offen");
  const overdueInvoices = activeInvoices.filter((i) => i.status === "ueberfaellig");
  const paidInvoices = activeInvoices.filter((i) => i.status === "bezahlt");
  const partialInvoices = activeInvoices.filter((i) => i.status === "teilbezahlt");

  const totalRevenueGross = paidInvoices.reduce((sum, i) => sum + i.total, 0);
  const totalOpenGross = openInvoices.reduce((sum, i) => sum + i.total, 0) + partialInvoices.reduce((sum, i) => sum + (i.total - i.paid_amount), 0);
  const totalOverdueGross = overdueInvoices.reduce((sum, i) => sum + i.total, 0);

  const totalVAT = activeInvoices.filter((i) => i.status !== "entwurf").reduce((sum, i) => sum + i.tax_amount, 0);

  // Monthly revenue (current month)
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthlyPaid = paidInvoices.filter((i) => {
    const d = new Date(i.paid_at || i.invoice_date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  const monthlyRevenueGross = monthlyPaid.reduce((sum, i) => sum + i.total, 0);

  const openQuotes = quotes.filter((q) => q.status === "draft" || q.status === "sent");

  // Receipts summary
  const monthlyReceipts = receipts.filter((r) => {
    if (!r.invoice_date) return false;
    const d = new Date(r.invoice_date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthlyReceiptsGross = monthlyReceipts.reduce((s, r) => s + (r.amount_gross || 0), 0);
  const totalReceiptsGross = receipts.reduce((s, r) => s + (r.amount_gross || 0), 0);

  const monthlyFixedCosts = fixedCosts.reduce((sum, c) => {
    if (c.interval === "monthly") return sum + c.amount;
    if (c.interval === "quarterly") return sum + c.amount / 3;
    return sum + c.amount / 12;
  }, 0);

  function getCustomerName(id: string): string {
    const c = customers.find((c) => c.id === id);
    return c ? c.company || c.name : "Unbekannt";
  }

  const recentInvoices = [...invoices].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  const recentQuotes = [...quotes].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);

  const cards = [
    {
      key: "monatsumsatz", title: t("dashboard.monthlyRevenue"), href: "/invoices?filter=bezahlt",
      value: formatCurrency(monthlyRevenueGross),
      subtitle: `${t("dashboard.annualRevenue")}: ${formatCurrency(totalRevenueGross)}`,
      borderColor: "border-emerald-500", iconBg: "bg-emerald-500/10", iconColor: "text-emerald-400",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
    },
    {
      key: "offene_rechnungen", title: t("dashboard.openInvoices"), href: "/invoices?filter=offen",
      value: formatCurrency(totalOpenGross),
      subtitle: `${openInvoices.length + partialInvoices.length} ${t("dashboard.openPartial")}`,
      borderColor: "border-amber-500", iconBg: "bg-amber-500/10", iconColor: "text-amber-400",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
    },
    {
      key: "ueberfaellig", title: t("dashboard.overdue"), href: "/invoices?filter=ueberfaellig",
      value: formatCurrency(totalOverdueGross),
      subtitle: `${overdueInvoices.length} ${t("dashboard.overdue").toLowerCase()}`,
      borderColor: "border-rose-500", iconBg: "bg-rose-500/10", iconColor: "text-rose-400",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>,
    },
    {
      key: "umsatzsteuer", title: t("dashboard.vatLabel"), href: "/invoices",
      value: formatCurrency(totalVAT),
      subtitle: `${settings?.company_type === "gmbh" ? t("dashboard.accrualBasis") : t("dashboard.cashBasis")}`,
      borderColor: "border-orange-500", iconBg: "bg-orange-500/10", iconColor: "text-orange-400",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /><path d="m9 12 2 2 4-4" /></svg>,
    },
    {
      key: "belege", title: t("dashboard.receiptsLabel"), href: "/receipts",
      value: formatCurrency(monthlyReceiptsGross),
      subtitle: `${receipts.length} ${t("dashboard.receiptsLabel")} | ${t("common.total")}: ${formatCurrency(totalReceiptsGross)}`,
      borderColor: "border-violet-500", iconBg: "bg-violet-500/10", iconColor: "text-violet-400",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M14 8H8" /><path d="M16 12H8" /><path d="M13 16H8" /></svg>,
    },
    {
      key: "fixkosten", title: t("dashboard.fixedCostsLabel"), href: "/fixed-costs",
      value: formatCurrency(monthlyFixedCosts),
      subtitle: `${fixedCosts.length} ${t("common.active").toLowerCase()} / ${formatCurrency(monthlyFixedCosts * 12)} p.a.`,
      borderColor: "border-cyan-500", iconBg: "bg-cyan-500/10", iconColor: "text-cyan-400",
      icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>,
    },
  ];

  const visibleCards = cards.filter((card) => cardVisibility[card.key] !== false);

  if (loading) return <div className="flex justify-center py-12"><div className="text-gray-500">{t("common.loading")}</div></div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("nav.dashboard")}</h1>
        <div className="flex gap-2">
          <Link href="/quotes/new" className="bg-[var(--border)] text-[var(--text-secondary)] px-3 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-[var(--surface-hover)] transition">{t("dashboard.newQuote")}</Link>
          <Link href="/invoices/new" className="bg-[var(--accent)] text-black px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold hover:brightness-110 transition">{t("dashboard.newInvoice")}</Link>
        </div>
      </div>

      {/* KPI cards */}
      {visibleCards.length > 0 && (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {visibleCards.map((card) => (
          <Link key={card.title} href={card.href} className={`bg-[var(--surface)] rounded-xl border-l-4 ${card.borderColor} border border-[var(--border)] p-5 hover:bg-[var(--surface-hover)] transition cursor-pointer`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 rounded-lg ${card.iconBg} flex items-center justify-center ${card.iconColor}`}>{card.icon}</div>
              <p className="text-sm font-medium text-gray-400">{card.title}</p>
            </div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{card.value}</p>
            <p className="text-xs text-gray-600 mt-1">{card.subtitle}</p>
          </Link>
        ))}
      </div>
      )}

      {/* Smart Insight Cards */}
      {!insightsLoading && cardVisibility.smart_insights !== false && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("dashboard.smartInsights")}</h2>
          {insights.length === 0 ? (
            <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 text-center">
              <p className="text-sm text-gray-500">{t("dashboard.noAnomalies")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {insights.map((insight) => {
                const severityStyles = {
                  info: { border: "border-blue-500", bg: "bg-blue-500/10", text: "text-blue-400", badgeBg: "bg-blue-500/15", badgeText: "text-blue-300" },
                  warning: { border: "border-amber-500", bg: "bg-amber-500/10", text: "text-amber-400", badgeBg: "bg-amber-500/15", badgeText: "text-amber-300" },
                  critical: { border: "border-rose-500", bg: "bg-rose-500/10", text: "text-rose-400", badgeBg: "bg-rose-500/15", badgeText: "text-rose-300" },
                }[insight.severity];

                const severityIcon = {
                  info: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>,
                  warning: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>,
                  critical: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>,
                }[insight.severity];

                return (
                  <div key={insight.id} className={`bg-[var(--surface)] rounded-xl border-l-4 ${severityStyles.border} border border-[var(--border)] p-4`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-7 h-7 rounded-lg ${severityStyles.bg} flex items-center justify-center ${severityStyles.text}`}>{severityIcon}</div>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{insight.title}</span>
                      {insight.metric && (
                        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${severityStyles.badgeBg} ${severityStyles.badgeText}`}>
                          {insight.metric.value}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed"
                       dangerouslySetInnerHTML={{ __html: sanitizeHtml(insight.body.replace(/\*\*(.+?)\*\*/g, '<strong class="text-[var(--text-primary)]">$1</strong>')) }} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {(cardVisibility.letzte_rechnungen !== false || cardVisibility.letzte_angebote !== false) && (
      <div className={`grid grid-cols-1 ${cardVisibility.letzte_rechnungen !== false && cardVisibility.letzte_angebote !== false ? "lg:grid-cols-2" : ""} gap-4 mb-6`}>
        {/* Recent Invoices */}
        {cardVisibility.letzte_rechnungen !== false && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] flex justify-between items-center">
            <h2 className="text-sm sm:text-lg font-semibold text-[var(--text-primary)]">{t("dashboard.recentInvoices")}</h2>
            <Link href="/invoices" className="text-[10px] text-[var(--accent)] hover:brightness-110">{t("common.all")}</Link>
          </div>
          {recentInvoices.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-500 text-sm">{t("dashboard.noInvoicesYet")}</div>
          ) : (
            <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--border)]">
              <thead className="bg-[var(--background)]">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">{t("invoices.numberShort")}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">{t("invoices.customer")}</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">{t("common.gross")}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">{t("common.status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {recentInvoices.map((inv) => {
                  const statusStyle = inv.status === "bezahlt" ? "bg-emerald-500/15 text-emerald-400"
                    : inv.status === "teilbezahlt" ? "bg-cyan-500/15 text-cyan-400"
                    : inv.status === "ueberfaellig" ? "bg-rose-500/15 text-rose-400"
                    : inv.status === "storniert" ? "bg-purple-500/15 text-purple-400"
                    : "bg-amber-500/15 text-amber-400";
                  const statusText = inv.status === "bezahlt" ? t("invoiceStatus.bezahlt") : inv.status === "teilbezahlt" ? t("invoiceStatus.teilbezahlt") : inv.status === "ueberfaellig" ? t("invoiceStatus.ueberfaellig") : inv.status === "storniert" ? t("invoiceStatus.storniert") : t("invoiceStatus.offen");
                  return (
                    <tr key={inv.id} className="hover:bg-[var(--surface-hover)] transition">
                      <td className="px-3 py-2.5 text-xs"><Link href={`/invoices/${inv.id}`} className="font-medium text-[var(--accent)] hover:brightness-110">{inv.invoice_number}</Link></td>
                      <td className="px-3 py-2.5 text-xs text-gray-400 max-w-[100px] truncate">{getCustomerName(inv.customer_id)}</td>
                      <td className="px-3 py-2.5 text-xs text-right font-medium text-[var(--text-primary)]">{formatCurrency(inv.total)}</td>
                      <td className="px-3 py-2.5"><span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${statusStyle}`}>{statusText}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
        )}

        {/* Recent Quotes */}
        {cardVisibility.letzte_angebote !== false && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] flex justify-between items-center">
            <h2 className="text-sm sm:text-lg font-semibold text-[var(--text-primary)]">{t("dashboard.recentQuotes")}</h2>
            <Link href="/quotes" className="text-[10px] text-[var(--accent)] hover:brightness-110">{t("common.all")}</Link>
          </div>
          {recentQuotes.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-500 text-sm">{t("dashboard.noQuotesYet")}</div>
          ) : (
            <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--border)]">
              <thead className="bg-[var(--background)]">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">{t("invoices.numberShort")}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">{t("invoices.customer")}</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">{t("common.gross")}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">{t("common.status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {recentQuotes.map((q) => {
                  const statusStyle = q.status === "accepted" ? "bg-emerald-500/15 text-emerald-400"
                    : q.status === "rejected" ? "bg-rose-500/15 text-rose-400"
                    : q.status === "sent" ? "bg-blue-500/15 text-blue-400"
                    : "bg-gray-500/15 text-gray-400";
                  const statusText = q.status === "accepted" ? t("quoteStatus.accepted") : q.status === "rejected" ? t("quoteStatus.rejected") : q.status === "sent" ? t("quoteStatus.sent") : t("quoteStatus.draft");
                  return (
                    <tr key={q.id} className="hover:bg-[var(--surface-hover)] transition">
                      <td className="px-3 py-2.5 text-xs"><Link href={`/quotes/${q.id}`} className="font-medium text-[var(--accent)] hover:brightness-110">{q.quote_number}</Link></td>
                      <td className="px-3 py-2.5 text-xs text-gray-400 max-w-[100px] truncate">{getCustomerName(q.customer_id)}</td>
                      <td className="px-3 py-2.5 text-xs text-right font-medium text-[var(--text-primary)]">{formatCurrency(q.total)}</td>
                      <td className="px-3 py-2.5"><span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${statusStyle}`}>{statusText}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
        )}
      </div>
      )}

      {/* Tip of the Day + Chuck Norris */}
      {(showTips || showChuckNorris) && (
        <div className={`grid grid-cols-1 ${showTips && showChuckNorris ? "lg:grid-cols-2" : ""} gap-4`}>
          {showTips && (
            <div className="bg-[var(--surface)] rounded-xl border-l-4 border-cyan-500 border border-[var(--border)] p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-cyan-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
                </span>
                <span className="text-cyan-400 text-sm font-semibold">{t("dashboard.tipOfTheDay")}</span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">{getTipOfTheDay()}</p>
            </div>
          )}
          {showChuckNorris && (
            <div className="bg-[var(--surface)] rounded-xl border-l-4 border-orange-500 border border-[var(--border)] p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-orange-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M3 21v-2a7 7 0 0 1 7-7h4a7 7 0 0 1 7 7v2"/><path d="M8 8h8"/><path d="M9 11c0 0 1 1 3 1s3-1 3-1"/></svg>
                </span>
                <span className="text-orange-400 text-sm font-semibold">{t("dashboard.chuckNorrisFact")}</span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">{getChuckNorrisFact()}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
