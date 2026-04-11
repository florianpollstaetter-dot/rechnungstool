"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Quote, Customer, CompanySettings, QuoteStatus, UNIT_OPTIONS } from "@/lib/types";
import { getQuote, getCustomer, getSettings, updateQuote, convertQuoteToInvoice } from "@/lib/db";
import { formatCurrency, formatDateLong } from "@/lib/format";
import PDFDownloadButton from "@/components/PDFDownloadButton";
import PDFPreviewModal from "@/components/PDFPreviewModal";

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: "Entwurf", color: "bg-gray-500/15 text-gray-400" },
  sent: { label: "Gesendet", color: "bg-blue-500/15 text-blue-400" },
  accepted: { label: "Angenommen", color: "bg-emerald-500/15 text-emerald-400" },
  rejected: { label: "Abgelehnt", color: "bg-rose-500/15 text-rose-400" },
  expired: { label: "Abgelaufen", color: "bg-amber-500/15 text-amber-400" },
};

export default function QuoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);

  const loadData = useCallback(async () => {
    const q = await getQuote(params.id as string);
    if (q) {
      setQuote(q);
      const [cust, s] = await Promise.all([getCustomer(q.customer_id), getSettings()]);
      if (cust) setCustomer(cust);
      setSettings(s);
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div className="flex justify-center py-12"><div className="text-gray-500">Laden...</div></div>;
  if (!quote || !customer || !settings) return <div className="text-center py-12 text-gray-500">Angebot nicht gefunden.</div>;

  const st = statusLabels[quote.status] || statusLabels.draft;

  async function handleStatusChange(status: QuoteStatus) {
    await updateQuote(quote!.id, { status });
    const updated = await getQuote(quote!.id);
    if (updated) setQuote(updated);
  }

  async function handleConvert() {
    if (confirm("Angebot zu Rechnung konvertieren?")) {
      const invoice = await convertQuoteToInvoice(quote!.id);
      router.push(`/invoices/${invoice.id}`);
    }
  }

  function getUnitLabel(unit: string) {
    return UNIT_OPTIONS.find((u) => u.value === unit)?.label || unit;
  }

  const hasDiscounts = quote.items.some((i) => i.discount_percent > 0 || i.discount_amount > 0) ||
    quote.overall_discount_percent > 0 || quote.overall_discount_amount > 0;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link href="/quotes" className="text-sm text-gray-500 hover:text-gray-300 transition">&larr; Zurueck zu Angeboten</Link>
          <h1 className="text-2xl font-bold text-white mt-1">Angebot {quote.quote_number}</h1>
        </div>
        <div className="flex items-center gap-3">
          <select value={quote.status} onChange={(e) => handleStatusChange(e.target.value as QuoteStatus)} className={`text-sm font-medium px-3 py-1.5 rounded-full border-0 bg-transparent ${st.color}`}>
            <option value="draft">Entwurf</option>
            <option value="sent">Gesendet</option>
            <option value="accepted">Angenommen</option>
            <option value="rejected">Abgelehnt</option>
            <option value="expired">Abgelaufen</option>
          </select>
          {!quote.converted_invoice_id && quote.status !== "rejected" && (
            <button onClick={handleConvert} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-500 transition">→ Rechnung erstellen</button>
          )}
          <PDFDownloadButton quote={quote} customer={customer} settings={settings} onPreview={setPreviewBlob} />
        </div>
      </div>

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Kunde</h3>
            <p className="font-medium text-white">{customer.company || customer.name}</p>
            {customer.company && <p className="text-sm text-gray-400">{customer.name}</p>}
            <p className="text-sm text-gray-400">{customer.address}</p>
            <p className="text-sm text-gray-400">{customer.zip} {customer.city}</p>
            {customer.uid_number && <p className="text-sm text-gray-400">{customer.uid_number}</p>}
          </div>
          <div className="text-right">
            <div className="mb-2"><span className="text-sm text-gray-500">Angebotsdatum: </span><span className="font-medium text-white">{formatDateLong(quote.quote_date)}</span></div>
            <div className="mb-2"><span className="text-sm text-gray-500">Gueltig bis: </span><span className="font-medium text-white">{formatDateLong(quote.valid_until)}</span></div>
            {quote.project_description && <div className="mt-4"><span className="text-sm text-gray-500">Projekt: </span><span className="font-medium text-white">{quote.project_description}</span></div>}
            {quote.converted_invoice_id && (
              <div className="mt-2">
                <Link href={`/invoices/${quote.converted_invoice_id}`} className="text-sm text-[var(--accent)] hover:brightness-110">→ Zur Rechnung</Link>
              </div>
            )}
          </div>
        </div>

        <table className="min-w-full mb-6">
          <thead>
            <tr className="border-b-2 border-[var(--border)]">
              <th className="text-left text-xs font-medium text-gray-500 uppercase py-2 w-12">Pos</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase py-2">Leistung</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase py-2 w-24">Einheit</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase py-2 w-20">Menge</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase py-2 w-28">Einzelpreis</th>
              {hasDiscounts && <th className="text-right text-xs font-medium text-gray-500 uppercase py-2 w-20">Rabatt</th>}
              <th className="text-right text-xs font-medium text-gray-500 uppercase py-2 w-28">Betrag</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item, idx) => (
              <tr key={idx} className="border-b border-[var(--border)]">
                <td className="py-3 text-sm text-gray-400">{item.position}</td>
                <td className="py-3 text-sm font-medium text-white">{item.description}</td>
                <td className="py-3 text-sm text-center text-gray-400">{getUnitLabel(item.unit)}</td>
                <td className="py-3 text-sm text-right text-gray-400">{item.quantity}</td>
                <td className="py-3 text-sm text-right text-gray-400">{formatCurrency(item.unit_price)}</td>
                {hasDiscounts && (
                  <td className="py-3 text-sm text-right text-amber-400">
                    {item.discount_percent > 0 ? `${item.discount_percent}%` : item.discount_amount > 0 ? formatCurrency(item.discount_amount) : ""}
                  </td>
                )}
                <td className="py-3 text-sm text-right font-medium text-white">{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex flex-col items-end space-y-1 text-sm">
          <div className="flex justify-between w-72">
            <span className="text-gray-400">Summe netto</span>
            <span className="font-medium text-white">{formatCurrency(quote.subtotal)}</span>
          </div>
          {(quote.overall_discount_percent > 0 || quote.overall_discount_amount > 0) && (
            <div className="flex justify-between w-72 text-amber-400">
              <span>Gesamtrabatt</span>
              <span>{quote.overall_discount_percent > 0 && `${quote.overall_discount_percent}%`}{quote.overall_discount_amount > 0 && ` ${formatCurrency(-quote.overall_discount_amount)}`}</span>
            </div>
          )}
          <div className="flex justify-between w-72">
            <span className="text-gray-400">Umsatzsteuer {quote.tax_rate}%</span>
            <span className="font-medium text-white">{formatCurrency(quote.tax_amount)}</span>
          </div>
          <div className="flex justify-between w-72 text-base font-bold border-t border-[var(--border)] pt-2 mt-1">
            <span className="text-white">BRUTTO</span>
            <span className="text-[var(--accent)]">{formatCurrency(quote.total)}</span>
          </div>
        </div>

        {quote.notes && (
          <div className="mt-6 pt-4 border-t border-[var(--border)]">
            <h3 className="text-sm font-medium text-gray-500 mb-1">Anmerkungen</h3>
            <p className="text-sm text-gray-400">{quote.notes}</p>
          </div>
        )}
      </div>

      <PDFPreviewModal blob={previewBlob} onClose={() => setPreviewBlob(null)} />
    </div>
  );
}
