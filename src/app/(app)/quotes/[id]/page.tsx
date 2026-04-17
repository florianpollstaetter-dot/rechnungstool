"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Quote, Customer, CompanySettings, QuoteStatus, UNIT_OPTIONS, Language, DisplayMode, TemplateItem, CompanyRole } from "@/lib/types";
import { getQuote, getCustomer, getSettings, updateQuote, convertQuoteToInvoice, createInvoice, createTemplate, getCompanyRoles } from "@/lib/db";
import { formatCurrency, formatDateLong } from "@/lib/format";
import PDFDownloadButton from "@/components/PDFDownloadButton";
import PDFPreviewModal from "@/components/PDFPreviewModal";
import QuoteApprovalPopup from "@/components/QuoteApprovalPopup";

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
  const [roles, setRoles] = useState<CompanyRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [showPartialModal, setShowPartialModal] = useState(false);
  const [showApprovalPopup, setShowApprovalPopup] = useState(false);
  const [partialMode, setPartialMode] = useState<"percent" | "amount">("percent");
  const [partialValue, setPartialValue] = useState("30");

  const loadData = useCallback(async () => {
    const q = await getQuote(params.id as string);
    if (q) {
      setQuote(q);
      const [cust, s, rolesData] = await Promise.all([getCustomer(q.customer_id), getSettings(), getCompanyRoles()]);
      if (cust) setCustomer(cust);
      setSettings(s);
      setRoles(rolesData);
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

  async function handleLanguageToggle() {
    const newLang: Language = quote!.language === "de" ? "en" : "de";
    try {
      await updateQuote(quote!.id, { language: newLang });
      const updated = await getQuote(quote!.id);
      if (updated) setQuote(updated);
    } catch {
      alert("Sprachumschaltung fehlgeschlagen.");
    }
  }

  async function handleDisplayModeToggle() {
    const newMode: DisplayMode = quote!.display_mode === "detailed" ? "simple" : "detailed";
    await updateQuote(quote!.id, { display_mode: newMode });
    const updated = await getQuote(quote!.id);
    if (updated) setQuote(updated);
  }

  async function handleSaveAsTemplate() {
    const name = prompt("Vorlagenname:", quote!.project_description || quote!.quote_number);
    if (!name) return;
    const items: TemplateItem[] = quote!.items.map((i) => ({
      position: i.position, description: i.description, unit: i.unit,
      product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price,
      discount_percent: i.discount_percent, discount_amount: i.discount_amount,
    }));
    await createTemplate({
      name, template_type: "quote", customer_id: quote!.customer_id,
      project_description: quote!.project_description, items,
      tax_rate: quote!.tax_rate, overall_discount_percent: quote!.overall_discount_percent,
      overall_discount_amount: quote!.overall_discount_amount,
      notes: quote!.notes, language: quote!.language || "de",
    });
    alert("Vorlage gespeichert: " + name);
  }

  async function handleConvert() {
    if (confirm("Angebot vollstaendig zu Rechnung konvertieren?")) {
      const invoice = await convertQuoteToInvoice(quote!.id);
      router.push(`/invoices/${invoice.id}`);
    }
  }

  async function handlePartialInvoice() {
    if (!quote) return;
    const val = Number(partialValue) || 0;
    if (val <= 0) return;

    const factor = partialMode === "percent" ? val / 100 : val / quote.total;
    const clampedFactor = Math.min(factor, 1);

    const partialItems = quote.items.map((item) => ({
      id: crypto.randomUUID(),
      position: item.position,
      description: item.description + (partialMode === "percent" ? ` (${val}%)` : ""),
      unit: item.unit,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: Math.round(item.unit_price * clampedFactor * 100) / 100,
      discount_percent: item.discount_percent,
      discount_amount: Math.round(item.discount_amount * clampedFactor * 100) / 100,
      total: Math.round(item.total * clampedFactor * 100) / 100,
    }));

    const partialSubtotal = Math.round(quote.subtotal * clampedFactor * 100) / 100;
    const partialTaxAmount = Math.round(quote.tax_amount * clampedFactor * 100) / 100;
    const partialTotal = Math.round(quote.total * clampedFactor * 100) / 100;

    const label = partialMode === "percent" ? `${val}%` : formatCurrency(val);
    const invoice = await createInvoice({
      customer_id: quote.customer_id,
      project_description: `${quote.project_description || quote.quote_number} — Teilrechnung ${label}`,
      invoice_date: new Date().toISOString().split("T")[0],
      delivery_date: new Date().toISOString().split("T")[0],
      due_date: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      items: partialItems,
      subtotal: partialSubtotal,
      tax_rate: quote.tax_rate,
      tax_amount: partialTaxAmount,
      total: partialTotal,
      overall_discount_percent: quote.overall_discount_percent,
      overall_discount_amount: Math.round(quote.overall_discount_amount * clampedFactor * 100) / 100,
      status: "offen",
      paid_at: null,
      paid_amount: 0,
      notes: `Teilrechnung zu Angebot ${quote.quote_number} (${label})`,
      language: quote.language || "de",
      accompanying_text: null,
        created_by: null,
    });

    setShowPartialModal(false);
    router.push(`/invoices/${invoice.id}`);
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
          <Link href="/quotes" className="text-sm text-gray-500 hover:text-[var(--text-secondary)] transition">&larr; Zurück zu Angeboten</Link>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-1">Angebot {quote.quote_number}</h1>
        </div>
        <div className="flex items-center gap-3">
          <select value={quote.status} onChange={(e) => handleStatusChange(e.target.value as QuoteStatus)} className={`text-sm font-medium px-3 py-1.5 rounded-full border-0 bg-transparent ${st.color}`}>
            <option value="draft">Entwurf</option>
            <option value="sent">Gesendet</option>
            <option value="accepted">Angenommen</option>
            <option value="rejected">Abgelehnt</option>
            <option value="expired">Abgelaufen</option>
          </select>
          <button
            onClick={handleLanguageToggle}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--background)] ${
              quote.language === "en" ? "bg-[var(--accent)]" : "bg-gray-600"
            }`}
            title={quote.language === "en" ? "English — click for Deutsch" : "Deutsch — click for English"}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${quote.language === "en" ? "translate-x-6" : "translate-x-1"}`} />
            <span className={`absolute text-[9px] font-bold ${quote.language === "en" ? "left-1.5" : "right-1.5"} text-[var(--text-primary)]`}>{quote.language === "en" ? "EN" : "DE"}</span>
          </button>
          <button
            onClick={handleDisplayModeToggle}
            className={`relative inline-flex h-7 items-center rounded-full px-3 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${
              quote.display_mode === "simple" ? "bg-[var(--accent)] text-black" : "bg-gray-600 text-[var(--text-primary)]"
            }`}
            title={quote.display_mode === "simple" ? "Einfach — click for Detail" : "Detail — click for Einfach"}
          >
            {quote.display_mode === "simple" ? "Einfach" : "Detail"}
          </button>
          {quote.status !== "rejected" && (
            <>
              <button onClick={() => setShowApprovalPopup(true)} className="bg-amber-600 text-[var(--text-primary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-500 transition">Freigeben</button>
              <button onClick={() => setShowPartialModal(true)} className="bg-cyan-600 text-[var(--text-primary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-cyan-500 transition">Teilrechnung</button>
              {!quote.converted_invoice_id && (
                <button onClick={handleConvert} className="bg-emerald-600 text-[var(--text-primary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-500 transition">Vollrechnung</button>
              )}
            </>
          )}
          <button onClick={handleSaveAsTemplate} className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-3 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition" title="Als Vorlage speichern">
            Vorlage
          </button>
          <PDFDownloadButton quote={quote} customer={customer} settings={settings} onPreview={setPreviewBlob} />
        </div>
      </div>

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6">
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Kunde</h3>
            <p className="font-medium text-[var(--text-primary)]">{customer.company || customer.name}</p>
            {customer.company && <p className="text-sm text-gray-400">{customer.name}</p>}
            <p className="text-sm text-gray-400">{customer.address}</p>
            <p className="text-sm text-gray-400">{customer.zip} {customer.city}</p>
            {customer.uid_number && <p className="text-sm text-gray-400">{customer.uid_number}</p>}
          </div>
          <div className="text-right">
            <div className="mb-2"><span className="text-sm text-gray-500">Angebotsdatum: </span><span className="font-medium text-[var(--text-primary)]">{formatDateLong(quote.quote_date)}</span></div>
            <div className="mb-2"><span className="text-sm text-gray-500">Gültig bis: </span><span className="font-medium text-[var(--text-primary)]">{formatDateLong(quote.valid_until)}</span></div>
            {quote.project_description && <div className="mt-4"><span className="text-sm text-gray-500">Projekt: </span><span className="font-medium text-[var(--text-primary)]">{quote.project_description}</span></div>}
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
              <th className="text-left text-xs font-medium text-gray-500 uppercase py-2 w-32">Rolle</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase py-2 w-28">Betrag</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item, idx) => (
              <tr key={idx} className="border-b border-[var(--border)]">
                <td className="py-3 text-sm text-gray-400">{item.position}</td>
                <td className="py-3 text-sm font-medium text-[var(--text-primary)]">{item.description}</td>
                <td className="py-3 text-sm text-center text-gray-400">{getUnitLabel(item.unit)}</td>
                <td className="py-3 text-sm text-right text-gray-400">{item.quantity}</td>
                <td className="py-3 text-sm text-right text-gray-400">{formatCurrency(item.unit_price)}</td>
                {hasDiscounts && (
                  <td className="py-3 text-sm text-right text-amber-400">
                    {item.discount_percent > 0 ? `${item.discount_percent}%` : item.discount_amount > 0 ? formatCurrency(item.discount_amount) : ""}
                  </td>
                )}
                <td className="py-3 text-sm text-gray-400">
                  {item.role_id ? (() => { const role = roles.find((r) => r.id === item.role_id); return role ? (<span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: (role.color || "#6b7280") + "20", color: role.color || "#6b7280" }}>{role.name}</span>) : "—"; })() : "—"}
                </td>
                <td className="py-3 text-sm text-right font-medium text-[var(--text-primary)]">{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex flex-col items-end space-y-1 text-sm">
          <div className="flex justify-between w-72">
            <span className="text-gray-400">Summe netto</span>
            <span className="font-medium text-[var(--text-primary)]">{formatCurrency(quote.subtotal)}</span>
          </div>
          {(quote.overall_discount_percent > 0 || quote.overall_discount_amount > 0) && (
            <div className="flex justify-between w-72 text-amber-400">
              <span>Gesamtrabatt</span>
              <span>{quote.overall_discount_percent > 0 && `${quote.overall_discount_percent}%`}{quote.overall_discount_amount > 0 && ` ${formatCurrency(-quote.overall_discount_amount)}`}</span>
            </div>
          )}
          <div className="flex justify-between w-72">
            <span className="text-gray-400">Umsatzsteuer {quote.tax_rate}%</span>
            <span className="font-medium text-[var(--text-primary)]">{formatCurrency(quote.tax_amount)}</span>
          </div>
          <div className="flex justify-between w-72 text-base font-bold border-t border-[var(--border)] pt-2 mt-1">
            <span className="text-[var(--text-primary)]">BRUTTO</span>
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

      {showApprovalPopup && (
        <QuoteApprovalPopup
          quote={quote}
          roles={roles}
          onClose={() => setShowApprovalPopup(false)}
          onComplete={() => {
            setShowApprovalPopup(false);
            loadData();
          }}
        />
      )}

      {/* Partial Invoice Modal */}
      {showPartialModal && quote && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowPartialModal(false)}>
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Teilrechnung erstellen</h2>
            <p className="text-sm text-gray-400 mb-1">Angebot: <span className="text-[var(--text-primary)] font-medium">{quote.quote_number}</span></p>
            <p className="text-sm text-gray-400 mb-4">Gesamtbetrag brutto: <span className="text-[var(--text-primary)] font-medium">{formatCurrency(quote.total)}</span></p>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => { setPartialMode("percent"); setPartialValue("30"); }}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition ${partialMode === "percent" ? "bg-[var(--accent)] text-black" : "bg-[var(--surface-hover)] text-[var(--text-secondary)]"}`}
              >
                Prozent
              </button>
              <button
                onClick={() => { setPartialMode("amount"); setPartialValue(String(Math.round(quote.total / 3 * 100) / 100)); }}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition ${partialMode === "amount" ? "bg-[var(--accent)] text-black" : "bg-[var(--surface-hover)] text-[var(--text-secondary)]"}`}
              >
                Betrag
              </button>
            </div>

            <label className="block text-sm font-medium text-gray-400 mb-1">
              {partialMode === "percent" ? "Prozentsatz (%)" : "Betrag (brutto)"}
            </label>
            <input
              type="number"
              value={partialValue}
              onChange={(e) => setPartialValue(e.target.value)}
              step={partialMode === "percent" ? "1" : "0.01"}
              min={0}
              max={partialMode === "percent" ? 100 : undefined}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] mb-2 no-spinners"
              autoFocus
            />

            {Number(partialValue) > 0 && (
              <p className="text-xs text-cyan-400 mb-2">
                Rechnungsbetrag: {formatCurrency(
                  partialMode === "percent"
                    ? quote.total * Math.min(Number(partialValue), 100) / 100
                    : Math.min(Number(partialValue), quote.total)
                )}
              </p>
            )}

            <div className="flex gap-2 mt-4">
              <button
                onClick={handlePartialInvoice}
                disabled={!partialValue || Number(partialValue) <= 0}
                className="bg-cyan-600 text-[var(--text-primary)] px-6 py-2 rounded-lg text-sm font-semibold hover:bg-cyan-500 transition disabled:opacity-50"
              >
                Teilrechnung erstellen
              </button>
              <button
                onClick={() => setShowPartialModal(false)}
                className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
