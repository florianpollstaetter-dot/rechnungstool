"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { BankStatement, BankTransaction, Invoice } from "@/lib/types";
import { getBankStatements, getTransactions, createBankStatement, createTransaction, updateTransaction, deleteBankStatement, getInvoices } from "@/lib/db";
import { formatCurrency, formatDateLong } from "@/lib/format";
import { useI18n } from "@/lib/i18n-context";

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map((h) => h.replace(/"/g, "").trim());
  return lines.slice(1).map((line) => {
    const values = line.split(sep).map((v) => v.replace(/"/g, "").trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return row;
  });
}

function findField(row: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    const key = Object.keys(row).find((k) => k.toLowerCase().includes(c.toLowerCase()));
    if (key && row[key]) return row[key];
  }
  return "";
}

function parseAmount(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")) || 0;
}

function parseDate(s: string): string | null {
  if (!s) return null;
  const parts = s.split(/[./\-]/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if (a.length === 4) return `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`;
    return `${c.length === 2 ? "20" + c : c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
  }
  return null;
}

export default function BankPage() {
  const { t } = useI18n();
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedStatement, setSelectedStatement] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    const [stmts, txs, invs] = await Promise.all([getBankStatements(), getTransactions(), getInvoices()]);
    setStatements(stmts);
    setTransactions(txs);
    setInvoices(invs);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) { alert(t("bank.noTransactionsInFile")); return; }

      const stmt = await createBankStatement({
        file_name: file.name,
        upload_date: new Date().toISOString(),
        statement_date: null,
        bank_name: null,
        account_iban: findField(rows[0], "IBAN", "Konto") || null,
        currency: "EUR",
      });

      const openInvoices = invoices.filter((i) => ["offen", "ueberfaellig", "teilbezahlt"].includes(i.status));

      for (const row of rows) {
        const amount = parseAmount(findField(row, "Betrag", "Amount", "Umsatz"));
        if (amount === 0) continue;
        const desc = findField(row, "Verwendungszweck", "Zahlungsgrund", "Text", "Buchungstext", "Description", "Reference");
        const counterpart = findField(row, "Empfaenger", "Auftraggeber", "Name", "Zahlungspflichtiger");
        const bookingDate = parseDate(findField(row, "Buchungstag", "Buchungsdatum", "Datum", "Date"));
        const valueDate = parseDate(findField(row, "Valuta", "Wertstellung", "Value"));
        const ref = findField(row, "Referenz", "Ref", "BelegNr");

        // Auto-matching: find invoice by amount or reference
        let matchedId: string | null = null;
        let confidence: number | null = null;
        if (amount > 0) {
          const exactMatch = openInvoices.find((inv) => inv.total === amount);
          if (exactMatch) { matchedId = exactMatch.id; confidence = 95; }
          else {
            const refMatch = openInvoices.find((inv) =>
              desc.includes(inv.invoice_number) || ref.includes(inv.invoice_number)
            );
            if (refMatch) { matchedId = refMatch.id; confidence = 85; }
          }
        }

        await createTransaction({
          statement_id: stmt.id,
          booking_date: bookingDate,
          value_date: valueDate,
          description: desc || null,
          amount,
          balance_after: null,
          counterpart_name: counterpart || null,
          counterpart_iban: findField(row, "Empfaenger IBAN", "IBAN") || null,
          reference: ref || null,
          matched_invoice_id: matchedId,
          match_confidence: confidence,
          match_status: matchedId ? "auto_matched" : "unmatched",
        });
      }

      await loadData();
    } catch (err) {
      alert(t("bank.uploadFailed") + " " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleConfirmMatch(txId: string) {
    await updateTransaction(txId, { match_status: "confirmed" });
    await loadData();
  }

  async function handleRejectMatch(txId: string) {
    await updateTransaction(txId, { match_status: "rejected", matched_invoice_id: null, match_confidence: null });
    await loadData();
  }

  async function handleDeleteStatement(id: string) {
    if (confirm(t("bank.confirmDelete"))) {
      await deleteBankStatement(id);
      if (selectedStatement === id) setSelectedStatement(null);
      await loadData();
    }
  }

  function getInvoiceLabel(id: string | null): string {
    if (!id) return "";
    const inv = invoices.find((i) => i.id === id);
    return inv ? inv.invoice_number : "\u2014";
  }

  const filteredTxs = selectedStatement ? transactions.filter((t) => t.statement_id === selectedStatement) : transactions;
  const matchedCount = filteredTxs.filter((t) => t.match_status === "auto_matched" || t.match_status === "confirmed").length;
  const totalIncoming = filteredTxs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalOutgoing = filteredTxs.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);

  if (loading) return <div className="flex justify-center py-12"><div className="text-gray-500">{t("common.loading")}</div></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("bank.title")}</h1>
        <label className={`bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition cursor-pointer ${uploading ? "opacity-50" : ""}`}>
          {uploading ? t("bank.processing") : t("bank.uploadCsv")}
          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleUpload} disabled={uploading} className="hidden" />
        </label>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-[var(--surface)] rounded-xl border-l-4 border-emerald-500 border border-[var(--border)] p-4">
          <p className="text-sm text-gray-400">{t("bank.inflows")}</p>
          <p className="text-xl font-bold text-emerald-400">{formatCurrency(totalIncoming)}</p>
        </div>
        <div className="bg-[var(--surface)] rounded-xl border-l-4 border-rose-500 border border-[var(--border)] p-4">
          <p className="text-sm text-gray-400">{t("bank.outflows")}</p>
          <p className="text-xl font-bold text-rose-400">{formatCurrency(Math.abs(totalOutgoing))}</p>
        </div>
        <div className="bg-[var(--surface)] rounded-xl border-l-4 border-cyan-500 border border-[var(--border)] p-4">
          <p className="text-sm text-gray-400">{t("bank.matched")}</p>
          <p className="text-xl font-bold text-[var(--text-primary)]">{matchedCount} / {filteredTxs.length}</p>
        </div>
        <div className="bg-[var(--surface)] rounded-xl border-l-4 border-gray-500 border border-[var(--border)] p-4">
          <p className="text-sm text-gray-400">{t("bank.statements")}</p>
          <p className="text-xl font-bold text-[var(--text-primary)]">{statements.length}</p>
        </div>
      </div>

      {/* Statement filter */}
      {statements.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <button onClick={() => setSelectedStatement(null)} className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${!selectedStatement ? "bg-[var(--accent)] text-black" : "bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)]"}`}>{t("common.all")}</button>
          {statements.map((s) => (
            <div key={s.id} className="flex items-center gap-1">
              <button onClick={() => setSelectedStatement(s.id)} className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${selectedStatement === s.id ? "bg-[var(--accent)] text-black" : "bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)]"}`}>
                {s.file_name}
              </button>
              <button onClick={() => handleDeleteStatement(s.id)} className="text-rose-500/60 hover:text-rose-400 text-xs">x</button>
            </div>
          ))}
        </div>
      )}

      {/* Transactions */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--border)]">
          <thead className="bg-[var(--background)]">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("bank.date")}</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("bank.counterpart")}</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("bank.reference")}</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t("common.amount")}</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("bank.invoice")}</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">{t("bank.match")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {filteredTxs.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-500">{t("bank.noTransactions")}</td></tr>
            )}
            {filteredTxs.map((tx) => {
              const isIncoming = tx.amount > 0;
              const matchColor = tx.match_status === "confirmed" ? "bg-emerald-500/15 text-emerald-400"
                : tx.match_status === "auto_matched" ? "bg-amber-500/15 text-amber-400"
                : tx.match_status === "rejected" ? "bg-rose-500/15 text-rose-400"
                : "bg-gray-500/15 text-gray-400";
              const matchLabel = tx.match_status === "confirmed" ? t("bank.confirmed")
                : tx.match_status === "auto_matched" ? t("bank.autoMatch", { confidence: String(tx.match_confidence) })
                : tx.match_status === "rejected" ? t("bank.rejected")
                : t("bank.open");

              return (
                <tr key={tx.id} className="hover:bg-[var(--surface-hover)] transition">
                  <td className="px-3 py-3 text-sm text-gray-400">{tx.booking_date ? formatDateLong(tx.booking_date) : "\u2014"}</td>
                  <td className="px-3 py-3 text-sm text-[var(--text-primary)] max-w-[150px] truncate">{tx.counterpart_name || "\u2014"}</td>
                  <td className="px-3 py-3 text-sm text-gray-400 max-w-[200px] truncate" title={tx.description || ""}>{tx.description || "\u2014"}</td>
                  <td className={`px-3 py-3 text-sm text-right font-medium ${isIncoming ? "text-emerald-400" : "text-rose-400"}`}>
                    {isIncoming ? "+" : ""}{formatCurrency(tx.amount)}
                  </td>
                  <td className="px-3 py-3 text-sm text-[var(--accent)]">{getInvoiceLabel(tx.matched_invoice_id)}</td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${matchColor}`}>{matchLabel}</span>
                      {tx.match_status === "auto_matched" && (
                        <>
                          <button onClick={() => handleConfirmMatch(tx.id)} className="text-emerald-400 hover:text-emerald-300 text-xs" title={t("bank.confirm")}>{"\u2713"}</button>
                          <button onClick={() => handleRejectMatch(tx.id)} className="text-rose-400 hover:text-rose-300 text-xs" title={t("bank.reject")}>{"\u2717"}</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
