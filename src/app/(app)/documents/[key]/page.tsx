"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { marked } from "marked";
import DocxExportButton from "@/components/DocxExportButton";
import { useCompany } from "@/lib/company-context";

interface DocumentData {
  id: string;
  key: string;
  title: string;
  body: string;
  updatedAt: string;
}

const DOC_LABEL: Record<string, string> = {
  lastenheft: "Lastenheft",
  plan: "Projektplan",
  competitors: "Wettbewerbs­analyse",
  "feature-audit": "Feature-Audit",
  piercing: "Piercing-Lastenheft",
  tattoo: "Tattoo-Lastenheft",
  "pet-groomer": "Pet-Groomer-Lastenheft",
};

export default function DocumentViewerPage() {
  const params = useParams();
  const key = params.key as string;
  const { company } = useCompany();
  const companyId = company.id;

  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [htmlBody, setHtmlBody] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/documents/${key}?companyId=${encodeURIComponent(companyId)}`);
        if (res.status === 404) { setNotFound(true); return; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: DocumentData = await res.json();
        setDoc(data);
        const html = await marked.parse(data.body, { async: false });
        setHtmlBody(html as string);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [key, companyId]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="text-[var(--text-muted)]">Dokument wird geladen…</div>
      </div>
    );
  }

  if (notFound || !doc) {
    return (
      <div className="text-center py-16">
        <p className="text-[var(--text-muted)] mb-4">Dokument nicht gefunden.</p>
        <Link href="/dashboard" className="text-sm text-[var(--brand-orange)] hover:underline">
          &larr; Zum Dashboard
        </Link>
      </div>
    );
  }

  const label = DOC_LABEL[key] ?? doc.title;
  const updatedDate = new Date(doc.updatedAt).toLocaleDateString("de-AT", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-start mb-6 gap-4">
        <div>
          <Link
            href="/dashboard"
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition"
          >
            &larr; Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-1">{label}</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Stand: {updatedDate}
          </p>
        </div>
        <div className="shrink-0">
          <DocxExportButton documentId={doc.id} documentTitle={label} companyId={companyId} />
        </div>
      </div>

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-8">
        <div
          className="prose-legal text-[var(--text-secondary)] text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: htmlBody }}
        />
      </div>
    </div>
  );
}
