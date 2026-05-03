"use client";

// SCH-825 M2 — Project edit + status workflow. Inline form on the detail
// page; PATCHes name/description/status. Delete is admin-only and rendered
// next to the form when applicable.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PROJECT_STATUSES,
  STATUS_LABEL,
  type PmProject,
  type ProjectStatus,
} from "@/lib/pm/projects";

export function EditProjectForm({
  project,
  isAdmin,
}: {
  project: PmProject;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty =
    name !== project.name ||
    description !== project.description ||
    status !== project.status;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const res = await fetch(
      `/api/pm/workspaces/${project.workspace_id}/projects/${project.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description, status }),
      },
    );
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(json.error ?? "Speichern fehlgeschlagen");
      return;
    }
    setSavedAt(Date.now());
    startTransition(() => router.refresh());
  }

  async function handleDelete() {
    if (!confirm(`Projekt „${project.name}" wirklich löschen?`)) return;
    setError(null);

    const res = await fetch(
      `/api/pm/workspaces/${project.workspace_id}/projects/${project.id}`,
      { method: "DELETE" },
    );
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(json.error ?? "Löschen fehlgeschlagen");
      return;
    }
    startTransition(() => {
      router.push(`/pm/${project.workspace_id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
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
        />
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
          Beschreibung
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="mt-1 w-full bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
          Status
        </span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ProjectStatus)}
          className="mt-1 w-full bg-[var(--background)] border border-[var(--border)] rounded-md px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        >
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="submit"
          disabled={pending || !dirty || !name.trim()}
          className="bg-[var(--accent)] text-black font-medium rounded-md px-4 py-2 text-sm disabled:opacity-50"
        >
          {pending ? "Wird gespeichert…" : "Speichern"}
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="text-sm text-red-300 hover:text-red-200 disabled:opacity-50"
          >
            Projekt löschen
          </button>
        )}
      </div>

      {savedAt && !dirty && (
        <p className="text-xs text-[var(--text-muted)]">Gespeichert.</p>
      )}
    </form>
  );
}
