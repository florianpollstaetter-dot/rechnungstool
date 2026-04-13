"use client";

import { useEffect, useState } from "react";

interface Props {
  blob: Blob | null;
  onClose: () => void;
}

export default function PDFPreviewModal({ blob, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  if (!blob || !url) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-[var(--surface)] rounded-xl shadow-2xl border border-[var(--border)] w-[90vw] h-[90vh] max-w-5xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">PDF-Vorschau</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-[var(--text-primary)] text-2xl leading-none transition">&times;</button>
        </div>
        <div className="flex-1 p-4">
          <iframe src={url} className="w-full h-full rounded-lg border border-[var(--border)]" title="PDF Vorschau" />
        </div>
      </div>
    </div>
  );
}
