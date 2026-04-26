"use client";

// SCH-825 M1 — Workspace create form. Auto-derives a slug from the name but
// lets the user override before submitting. Posts to /api/pm/workspaces and
// redirects into the new workspace on success.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const effectiveSlug = slugTouched ? slug : deriveSlug(name);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const res = await fetch("/api/pm/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), slug: effectiveSlug }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(json.error ?? "Anlegen fehlgeschlagen");
      return;
    }
    startTransition(() => {
      router.push(`/pm/${json.workspace.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
            Name
          </span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            placeholder="Marketing Team"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
            Slug
          </span>
          <input
            type="text"
            required
            value={effectiveSlug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            className="mt-1 w-full bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent)]"
            placeholder="marketing-team"
            pattern="^[a-z0-9][a-z0-9-]{1,62}$"
          />
        </label>
      </div>

      {error && (
        <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || !name.trim() || !effectiveSlug}
        className="bg-[var(--accent)] text-black font-medium rounded-md px-4 py-2 text-sm disabled:opacity-50"
      >
        {pending ? "Wird angelegt…" : "Workspace anlegen"}
      </button>
    </form>
  );
}
