"use client";

// SCH-825 M2 — Project create form. Inline (not a modal) for the workspace
// page; posts to /api/pm/workspaces/:id/projects and refreshes the RSC list
// via router.refresh().

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function CreateProjectForm({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const res = await fetch(`/api/pm/workspaces/${workspaceId}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: description.trim() }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(json.error ?? "Anlegen fehlgeschlagen");
      return;
    }
    setName("");
    setDescription("");
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
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
          placeholder="Website-Relaunch"
        />
      </label>
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
          Beschreibung (optional)
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 w-full bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          placeholder="Kurzbeschreibung des Projekts…"
        />
      </label>

      {error && (
        <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="bg-[var(--accent)] text-black font-medium rounded-md px-4 py-2 text-sm disabled:opacity-50"
      >
        {pending ? "Wird angelegt…" : "Projekt anlegen"}
      </button>
    </form>
  );
}
