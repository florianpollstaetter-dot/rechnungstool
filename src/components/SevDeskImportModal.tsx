"use client";

// SCH-526 — sevDesk import modal.
//
// Lifecycle: idle → parsing → preview → importing → done. CSV parsing runs
// client-side; PDF parsing posts to /api/sevdesk-import/parse-pdf which hands
// the file to Claude vision. Preview lets the user untick rows before the
// bulk insert runs; import diffs against existing external_ref so re-runs
// don't duplicate.

import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n-context";
import {
  SevDeskKind,
  ProductRow,
  CustomerRow,
  ImportIssue,
  parseProductsCsv,
  parseCustomersCsv,
  mapUnit,
} from "@/lib/sevdesk-import";
import { bulkCreateProducts, bulkCreateCustomers } from "@/lib/db";
import { formatCurrency } from "@/lib/format";

type Stage = "idle" | "parsing" | "preview" | "importing" | "done";

interface Props {
  kind: SevDeskKind;
  onClose: () => void;
  onImported: () => void;
}

export default function SevDeskImportModal({ kind, onClose, onImported }: Props) {
  const { t } = useI18n();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [productRows, setProductRows] = useState<ProductRow[]>([]);
  const [customerRows, setCustomerRows] = useState<CustomerRow[]>([]);
  const [selected, setSelected] = useState<boolean[]>([]);
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const [aiCost, setAiCost] = useState<number | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setIssues([]);
    setResult(null);
    setAiCost(null);
    setStage("parsing");
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith(".csv") || file.type === "text/csv") {
        const text = await file.text();
        if (kind === "products") {
          const { rows, issues } = parseProductsCsv(text);
          setProductRows(rows);
          setIssues(issues);
          setSelected(rows.map(() => true));
        } else {
          const { rows, issues } = parseCustomersCsv(text);
          setCustomerRows(rows);
          setIssues(issues);
          setSelected(rows.map(() => true));
        }
        setStage("preview");
        return;
      }
      if (name.endsWith(".pdf") || file.type === "application/pdf") {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("kind", kind);
        const res = await fetch("/api/sevdesk-import/parse-pdf", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "PDF-Analyse fehlgeschlagen");
        setAiCost(typeof data.cost_eur === "number" ? data.cost_eur : null);
        const rawRows = Array.isArray(data.rows) ? data.rows : [];
        if (kind === "products") {
          const mapped: ProductRow[] = rawRows.map((r: Record<string, unknown>) => ({
            name: String(r.name ?? "").trim(),
            description: String(r.description ?? "").trim(),
            name_en: "",
            description_en: "",
            unit: mapUnit(typeof r.unit === "string" ? r.unit : undefined),
            unit_price: Number(r.unit_price ?? 0) || 0,
            tax_rate: Number(r.tax_rate ?? 20) || 20,
            active: true,
            role_id: null,
            external_ref: String(r.external_ref ?? "").trim(),
          })).filter((r: ProductRow) => r.name);
          setProductRows(mapped);
          setSelected(mapped.map(() => true));
        } else {
          const mapped: CustomerRow[] = rawRows.map((r: Record<string, unknown>) => ({
            name: String(r.name ?? "").trim(),
            company: String(r.company ?? "").trim(),
            address: String(r.address ?? "").trim(),
            zip: String(r.zip ?? "").trim(),
            city: String(r.city ?? "").trim(),
            country: String(r.country ?? "Oesterreich").trim() || "Oesterreich",
            uid_number: String(r.uid_number ?? "").trim(),
            email: String(r.email ?? "").trim(),
            phone: String(r.phone ?? "").trim(),
            leitweg_id: "",
            external_ref: String(r.external_ref ?? "").trim(),
          })).filter((r: CustomerRow) => r.name || r.company);
          setCustomerRows(mapped);
          setSelected(mapped.map(() => true));
        }
        setStage("preview");
        return;
      }
      throw new Error("Nur CSV oder PDF werden unterstützt");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("idle");
    }
  }

  async function handleImport() {
    setError(null);
    setStage("importing");
    try {
      if (kind === "products") {
        const toImport = productRows.filter((_, i) => selected[i]);
        const res = await bulkCreateProducts(toImport);
        setResult(res);
      } else {
        const toImport = customerRows.filter((_, i) => selected[i]);
        const res = await bulkCreateCustomers(toImport);
        setResult(res);
      }
      setStage("done");
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("preview");
    }
  }

  const toggleAll = (value: boolean) => setSelected((s) => s.map(() => value));
  const totalCount = kind === "products" ? productRows.length : customerRows.length;
  const selectedCount = selected.filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-[var(--surface)] rounded-xl shadow-2xl border border-[var(--border)] w-[95vw] max-w-4xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            {kind === "products" ? t("sevdesk.titleProducts") : t("sevdesk.titleCustomers")}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-[var(--text-primary)] text-2xl leading-none transition">
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {stage === "idle" && (
            <IdleView kind={kind} onFile={handleFile} error={error} />
          )}
          {stage === "parsing" && (
            <div className="py-12 text-center text-[var(--text-secondary)]">{t("sevdesk.parsing")}</div>
          )}
          {stage === "preview" && (
            <PreviewView
              kind={kind}
              productRows={productRows}
              customerRows={customerRows}
              selected={selected}
              setSelected={setSelected}
              issues={issues}
              aiCost={aiCost}
            />
          )}
          {stage === "importing" && (
            <div className="py-12 text-center text-[var(--text-secondary)]">
              {t("sevdesk.importing", { count: selectedCount })}
            </div>
          )}
          {stage === "done" && result && (
            <div className="py-12 text-center space-y-2">
              <div className="text-emerald-400 text-lg font-semibold">
                {t("sevdesk.doneInserted", { count: result.inserted })}
              </div>
              {result.skipped > 0 && (
                <div className="text-amber-400 text-sm">
                  {t("sevdesk.doneSkipped", { count: result.skipped })}
                </div>
              )}
            </div>
          )}

          {error && stage !== "idle" && (
            <div className="mt-4 px-3 py-2 rounded-lg text-sm bg-rose-500/10 text-rose-400">{error}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[var(--border)] flex justify-between items-center gap-3">
          <div className="text-xs text-gray-500">
            {stage === "preview" && t("sevdesk.selectedCount", { selected: selectedCount, total: totalCount })}
          </div>
          <div className="flex gap-3">
            {stage === "preview" && (
              <>
                <button
                  onClick={() => toggleAll(selectedCount !== totalCount)}
                  className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  {selectedCount === totalCount ? t("sevdesk.deselectAll") : t("sevdesk.selectAll")}
                </button>
                <button
                  onClick={handleImport}
                  disabled={selectedCount === 0}
                  className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 transition disabled:opacity-50"
                >
                  {t("sevdesk.importBtn", { count: selectedCount })}
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition"
            >
              {stage === "done" ? t("common.close") : t("common.cancel")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IdleView({ kind, onFile, error }: { kind: SevDeskKind; onFile: (f: File) => void; error: string | null }) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const onDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div className="space-y-5">
      <div className="text-sm text-[var(--text-secondary)] space-y-2">
        <p>{t("sevdesk.introLine1")}</p>
        <p>
          {kind === "products" ? t("sevdesk.introProducts") : t("sevdesk.introCustomers")}
        </p>
        <p className="text-xs text-amber-400">{t("sevdesk.csvPreferred")}</p>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`w-full block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
          dragOver ? "border-[var(--accent)] bg-[var(--surface-hover)]" : "border-[var(--border)] hover:bg-[var(--surface-hover)]"
        }`}
      >
        <div className="text-[var(--text-primary)] font-medium">{t("sevdesk.dropHere")}</div>
        <div className="text-xs text-gray-500 mt-1">{t("sevdesk.supportedFormats")}</div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.pdf,text/csv,application/pdf"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />

      {error && <div className="px-3 py-2 rounded-lg text-sm bg-rose-500/10 text-rose-400">{error}</div>}
    </div>
  );
}

interface PreviewProps {
  kind: SevDeskKind;
  productRows: ProductRow[];
  customerRows: CustomerRow[];
  selected: boolean[];
  setSelected: (f: (prev: boolean[]) => boolean[]) => void;
  issues: ImportIssue[];
  aiCost: number | null;
}

function PreviewView({ kind, productRows, customerRows, selected, setSelected, issues, aiCost }: PreviewProps) {
  const { t } = useI18n();
  const toggle = (i: number) => setSelected((s: boolean[]) => s.map((v: boolean, j: number) => (j === i ? !v : v)));

  return (
    <div className="space-y-4">
      {aiCost !== null && (
        <div className="text-xs text-gray-500">
          {t("sevdesk.aiCost", { cost: aiCost.toFixed(4) })}
        </div>
      )}
      {issues.length > 0 && (
        <details className="text-xs text-amber-400">
          <summary className="cursor-pointer">{t("sevdesk.issuesHeading", { count: issues.length })}</summary>
          <ul className="mt-2 space-y-1 pl-4 list-disc">
            {issues.map((it, i) => (
              <li key={i}>{t("sevdesk.issueItem", { row: it.row, message: it.message })}</li>
            ))}
          </ul>
        </details>
      )}

      {kind === "products" && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-xs uppercase text-gray-500">
              <tr>
                <th className="px-2 py-2 w-8"></th>
                <th className="px-2 py-2 text-left">{t("sevdesk.colRef")}</th>
                <th className="px-2 py-2 text-left">{t("common.name")}</th>
                <th className="px-2 py-2 text-left">{t("products.unit")}</th>
                <th className="px-2 py-2 text-right">{t("products.pricePerUnit")}</th>
                <th className="px-2 py-2 text-right">{t("common.vat")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {productRows.map((p, i) => (
                <tr key={i} className="text-[var(--text-primary)]">
                  <td className="px-2 py-2">
                    <input type="checkbox" checked={selected[i] ?? false} onChange={() => toggle(i)} className="accent-[var(--accent)]" />
                  </td>
                  <td className="px-2 py-2 text-gray-400">{p.external_ref}</td>
                  <td className="px-2 py-2">{p.name}</td>
                  <td className="px-2 py-2 text-gray-400">{p.unit}</td>
                  <td className="px-2 py-2 text-right">{formatCurrency(p.unit_price)}</td>
                  <td className="px-2 py-2 text-right text-gray-400">{p.tax_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {kind === "customers" && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-xs uppercase text-gray-500">
              <tr>
                <th className="px-2 py-2 w-8"></th>
                <th className="px-2 py-2 text-left">{t("sevdesk.colRef")}</th>
                <th className="px-2 py-2 text-left">{t("customers.company")} / {t("common.name")}</th>
                <th className="px-2 py-2 text-left">{t("common.address")}</th>
                <th className="px-2 py-2 text-left">{t("customers.uidNumber")}</th>
                <th className="px-2 py-2 text-left">{t("common.email")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {customerRows.map((c, i) => (
                <tr key={i} className="text-[var(--text-primary)]">
                  <td className="px-2 py-2">
                    <input type="checkbox" checked={selected[i] ?? false} onChange={() => toggle(i)} className="accent-[var(--accent)]" />
                  </td>
                  <td className="px-2 py-2 text-gray-400">{c.external_ref}</td>
                  <td className="px-2 py-2">
                    <div>{c.company || c.name}</div>
                    {c.company && c.name && <div className="text-xs text-gray-500">{c.name}</div>}
                  </td>
                  <td className="px-2 py-2 text-gray-400">{[c.address, c.zip, c.city].filter(Boolean).join(", ")}</td>
                  <td className="px-2 py-2 text-gray-400">{c.uid_number}</td>
                  <td className="px-2 py-2 text-gray-400">{c.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
