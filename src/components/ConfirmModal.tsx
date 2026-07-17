"use client";

interface Props {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  message,
  confirmLabel = "Löschen",
  cancelLabel = "Abbrechen",
  tone = "danger",
  onConfirm,
  onCancel,
}: Props) {
  const confirmClass =
    tone === "primary"
      ? "bg-[var(--accent)] hover:brightness-110 text-black"
      : "bg-rose-600 hover:bg-rose-500 text-white";
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-[var(--text-primary)] mb-6 whitespace-pre-line">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-lg font-medium ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
