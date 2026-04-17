"use client";

import { useState, useEffect, useCallback } from "react";
import { Invoice, Customer, Receipt, CompanySettings } from "@/lib/types";
import { getInvoices, getCustomers, getReceipts, getSettings } from "@/lib/db";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateLong } from "@/lib/format";
import type { ReceiptImageData } from "@/components/SteuerblattPDF";

export default function ExportPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingDatev, setExportingDatev] = useState(false);

  const loadData = useCallback(async () => {
    const [inv, cust, rec, s] = await Promise.all([getInvoices(), getCustomers(), getReceipts(), getSettings()]);
    setInvoices(inv);
    setCustomers(cust);
    setReceipts(rec);
    setSettings(s);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function getCustomerName(id: string): string {
    const c = customers.find((c) => c.id === id);
    return c ? c.company || c.name : "Unbekannt";
  }

  const [year, month] = selectedMonth.split("-").map(Number);
  const monthInvoices = invoices.filter((i) => {
    const d = new Date(i.invoice_date);
    return d.getFullYear() === year && d.getMonth() + 1 === month && i.status !== "entwurf";
  });
  const monthReceipts = receipts.filter((r) => {
    if (!r.invoice_date) return false;
    const d = new Date(r.invoice_date);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });

  const totalRevenue = monthInvoices.filter((i) => i.status !== "storniert").reduce((s, i) => s + i.total, 0);
  const totalVAT = monthInvoices.filter((i) => i.status !== "storniert").reduce((s, i) => s + i.tax_amount, 0);
  const totalExpenses = monthReceipts.reduce((s, r) => s + (r.amount_gross || 0), 0);
  const totalExpenseVAT = monthReceipts.reduce((s, r) => s + (r.amount_vat || 0), 0);

  async function handleExportCSV() {
    setExporting(true);
    try {
      // Austrian legal requirements for invoices (§ 11 UStG)
      const headers = [
        "Typ", "Rechnungsnummer", "Rechnungsdatum", "Lieferdatum", "Fälligkeitsdatum",
        "Bezahlt am", "Kunde/Aussteller", "UID des Kunden", "Adresse",
        "Projekt", "Netto", "USt-Satz %", "USt-Betrag", "Brutto",
        "Bezahlter Betrag", "Zahlungsmethode", "Konto Soll", "Konto Haben",
        "Kontobeschreibung", "Währung", "Status"
      ];
      const rows: string[][] = [];

      monthInvoices.forEach((inv) => {
        const cust = customers.find((c) => c.id === inv.customer_id);
        rows.push([
          "Ausgangsrechnung",
          inv.invoice_number,
          inv.invoice_date,
          inv.delivery_date,
          inv.due_date,
          inv.paid_at ? inv.paid_at.split("T")[0] : "",
          cust ? (cust.company || cust.name) : "",
          cust?.uid_number || "",
          cust ? `${cust.address}, ${cust.zip} ${cust.city}` : "",
          inv.project_description || "",
          String(inv.subtotal),
          String(inv.tax_rate),
          String(inv.tax_amount),
          String(inv.total),
          String(inv.paid_amount || 0),
          "",
          "", "",
          "",
          "EUR",
          inv.status,
        ]);
      });

      monthReceipts.forEach((r) => {
        rows.push([
          "Eingangsbeleg",
          r.file_name,
          r.invoice_date || "",
          "", "",
          "",
          r.issuer || "",
          "", "",
          r.purpose || "",
          String(r.amount_net || 0),
          String(r.vat_rate || ""),
          String(r.amount_vat || 0),
          String(r.amount_gross || 0),
          "",
          r.payment_method || "",
          r.account_debit || "",
          r.account_credit || "",
          r.account_label || "",
          r.currency || "EUR",
          r.analysis_status,
        ]);
      });

      const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Export_${selectedMonth}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function handleExportPDF() {
    if (!settings) return;
    setExportingPdf(true);
    try {
      // Resolve absolute logo URL
      let logoUrl = settings.logo_url;
      if (logoUrl && !logoUrl.startsWith("http")) {
        logoUrl = `${window.location.origin}${logoUrl}`;
      }
      const absSettings = { ...settings, logo_url: logoUrl || "" };

      // Fetch receipt images as data URLs
      const receiptImages: ReceiptImageData[] = [];
      const supabase = createClient();

      for (const r of monthReceipts) {
        if (!r.file_path) continue;
        const ext = (r.file_type || "").toLowerCase();
        if (ext === "pdf") continue;

        const { data } = await supabase.storage
          .from("receipts")
          .createSignedUrl(r.file_path, 300);

        if (!data?.signedUrl) continue;

        try {
          const resp = await fetch(data.signedUrl);
          const blob = await resp.blob();
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });

          receiptImages.push({
            receiptId: r.id,
            dataUrl,
            label: [r.issuer, r.purpose, r.invoice_date].filter(Boolean).join(" — "),
          });
        } catch {
          // Skip receipts that fail to load
        }
      }

      // Generate PDF
      const { pdf } = await import("@react-pdf/renderer");
      const { default: SteuerblattPDF } = await import("@/components/SteuerblattPDF");
      const blob = await pdf(
        <SteuerblattPDF
          invoices={monthInvoices}
          receipts={monthReceipts}
          customers={customers}
          settings={absSettings}
          selectedMonth={selectedMonth}
          receiptImages={receiptImages}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Steuerblatt_${selectedMonth}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleExportDatev() {
    setExportingDatev(true);
    try {
      const { invoicesToDatevRows, receiptsToDatevRows, datevRowsToCsv } = await import("@/lib/einvoice/datev-export");
      const customerMap = new Map(customers.map((c) => [c.id, c]));
      const invoiceRows = invoicesToDatevRows(monthInvoices, customerMap);
      const receiptRows = receiptsToDatevRows(monthReceipts);
      const csv = datevRowsToCsv([...invoiceRows, ...receiptRows]);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DATEV_Export_${selectedMonth}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExportingDatev(false);
    }
  }

  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  if (loading) return <div className="flex justify-center py-12"><div className="text-gray-500">Laden...</div></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Steuerberater-Export</h1>
        <div className="flex gap-2">
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]">
            {months.map((m) => <option key={m} value={m}>{m.split("-")[1]}/{m.split("-")[0]}</option>)}
          </select>
          <button onClick={handleExportPDF} disabled={exportingPdf} className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition disabled:opacity-50">
            {exportingPdf ? "Exportiere PDF..." : "PDF Export"}
          </button>
          <button onClick={handleExportCSV} disabled={exporting} className="bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition disabled:opacity-50">
            {exporting ? "Exportiere..." : "CSV Export"}
          </button>
          <button onClick={handleExportDatev} disabled={exportingDatev} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-500 transition disabled:opacity-50">
            {exportingDatev ? "Exportiere..." : "DATEV Export"}
          </button>
        </div>
      </div>

      {/* Monthly summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-[var(--surface)] rounded-xl border-l-4 border-emerald-500 border border-[var(--border)] p-4">
          <p className="text-sm text-gray-400">Einnahmen brutto</p>
          <p className="text-xl font-bold text-emerald-400">{formatCurrency(totalRevenue)}</p>
          <p className="text-xs text-gray-500">{monthInvoices.length} Rechnungen</p>
        </div>
        <div className="bg-[var(--surface)] rounded-xl border-l-4 border-orange-500 border border-[var(--border)] p-4">
          <p className="text-sm text-gray-400">USt Einnahmen</p>
          <p className="text-xl font-bold text-orange-400">{formatCurrency(totalVAT)}</p>
        </div>
        <div className="bg-[var(--surface)] rounded-xl border-l-4 border-rose-500 border border-[var(--border)] p-4">
          <p className="text-sm text-gray-400">Ausgaben brutto</p>
          <p className="text-xl font-bold text-rose-400">{formatCurrency(totalExpenses)}</p>
          <p className="text-xs text-gray-500">{monthReceipts.length} Belege</p>
        </div>
        <div className="bg-[var(--surface)] rounded-xl border-l-4 border-cyan-500 border border-[var(--border)] p-4">
          <p className="text-sm text-gray-400">Vorsteuer</p>
          <p className="text-xl font-bold text-cyan-400">{formatCurrency(totalExpenseVAT)}</p>
          <p className="text-xs text-gray-500">USt-Zahllast: {formatCurrency(totalVAT - totalExpenseVAT)}</p>
        </div>
      </div>

      {/* Invoices for month */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] mb-6 overflow-x-auto">
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Ausgangsrechnungen ({selectedMonth.split("-")[1]}/{selectedMonth.split("-")[0]})</h2>
        </div>
        {monthInvoices.length === 0 ? (
          <div className="px-6 py-6 text-center text-gray-500">Keine Rechnungen in diesem Monat.</div>
        ) : (
          <table className="min-w-full divide-y divide-[var(--border)]">
            <thead className="bg-[var(--background)]">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nr.</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Kunde</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Netto</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">USt</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Brutto</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {monthInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-[var(--surface-hover)] transition">
                  <td className="px-4 py-3 text-sm font-medium text-[var(--text-primary)]">{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{getCustomerName(inv.customer_id)}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{formatDateLong(inv.invoice_date)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-400">{formatCurrency(inv.subtotal)}</td>
                  <td className="px-4 py-3 text-sm text-right text-orange-400">{formatCurrency(inv.tax_amount)}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-[var(--text-primary)]">{formatCurrency(inv.total)}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{inv.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Receipts for month */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-x-auto">
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Eingangsbelege ({selectedMonth.split("-")[1]}/{selectedMonth.split("-")[0]})</h2>
        </div>
        {monthReceipts.length === 0 ? (
          <div className="px-6 py-6 text-center text-gray-500">Keine Belege in diesem Monat.</div>
        ) : (
          <table className="min-w-full divide-y divide-[var(--border)]">
            <thead className="bg-[var(--background)]">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Datei</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Aussteller</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Netto</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">USt</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Brutto</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Konto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {monthReceipts.map((r) => (
                <tr key={r.id} className="hover:bg-[var(--surface-hover)] transition">
                  <td className="px-4 py-3 text-sm text-[var(--text-primary)]">{r.file_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{r.issuer || "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{r.invoice_date ? formatDateLong(r.invoice_date) : "—"}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-400">{r.amount_net != null ? formatCurrency(r.amount_net) : "—"}</td>
                  <td className="px-4 py-3 text-sm text-right text-orange-400">{r.amount_vat != null ? formatCurrency(r.amount_vat) : "—"}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-[var(--text-primary)]">{r.amount_gross != null ? formatCurrency(r.amount_gross) : "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{r.account_debit || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
