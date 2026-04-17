"use client";

import { useState, useEffect, useCallback } from "react";
import { Quote, QuoteItem, CompanyRole, UserProfile } from "@/lib/types";
import {
  getUsersWithRole,
  getUserProfiles,
  createProjectFromQuote,
  updateQuote,
  updateTask,
  getTasks,
} from "@/lib/db";

interface TaskAssignment {
  /** Index into quote.items */
  itemIndex: number;
  item: QuoteItem;
  role: CompanyRole | null;
  suggestedUsers: { userId: string; displayName: string }[];
  selectedUserId: string | null;
}

interface Props {
  quote: Quote;
  roles: CompanyRole[];
  onClose: () => void;
  onComplete: () => void;
}

type Step = "confirm" | "assign";

export default function QuoteApprovalPopup({
  quote,
  roles,
  onClose,
  onComplete,
}: Props) {
  const [step, setStep] = useState<Step>("confirm");
  const [assignments, setAssignments] = useState<TaskAssignment[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const totalHours = quote.items.reduce((sum, item) => {
    if (item.unit === "Stunden" && item.quantity > 0) return sum + item.quantity;
    return sum;
  }, 0);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const [profiles, ...roleSuggestions] = await Promise.all([
        getUserProfiles(),
        ...quote.items.map((item) =>
          item.role_id
            ? getUsersWithRole(item.role_id)
            : Promise.resolve([])
        ),
      ]);
      setAllUsers(profiles);
      setAssignments(
        quote.items.map((item, idx) => {
          const role = item.role_id
            ? roles.find((r) => r.id === item.role_id) ?? null
            : null;
          const suggested = roleSuggestions[idx] ?? [];
          return {
            itemIndex: idx,
            item,
            role,
            suggestedUsers: suggested,
            selectedUserId: suggested.length === 1 ? suggested[0].userId : null,
          };
        })
      );
    } finally {
      setLoading(false);
    }
  }, [quote.items, roles]);

  useEffect(() => {
    if (step === "assign") {
      loadAssignments();
    }
  }, [step, loadAssignments]);

  function handleSelectUser(itemIndex: number, userId: string | null) {
    setAssignments((prev) =>
      prev.map((a) =>
        a.itemIndex === itemIndex ? { ...a, selectedUserId: userId } : a
      )
    );
  }

  async function handleApproveOnly() {
    setCreating(true);
    try {
      await updateQuote(quote.id, { status: "accepted" });
      onComplete();
    } catch (err) {
      alert("Fehler beim Freigeben: " + (err instanceof Error ? err.message : err));
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateProject() {
    setCreating(true);
    try {
      // 1. Accept the quote
      await updateQuote(quote.id, { status: "accepted" });

      // 2. Create project + tasks from quote
      const project = await createProjectFromQuote(quote.id);

      // 3. Assign users to tasks. Fetch the newly created tasks by project
      //    and match by position to apply user assignments.
      const tasks = await getTasks(project.id);

      const assignPromises: Promise<unknown>[] = [];
      for (const assignment of assignments) {
        if (!assignment.selectedUserId) continue;
        const task = tasks.find(
          (t) => t.position === assignment.item.position
        );
        if (task) {
          assignPromises.push(
            updateTask(task.id, {
              assignee_user_id: assignment.selectedUserId,
            })
          );
        }
      }
      await Promise.all(assignPromises);

      onComplete();
    } catch (err) {
      alert(
        "Fehler beim Erstellen: " +
          (err instanceof Error ? err.message : err)
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
          Angebot freigeben
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          {quote.quote_number}
          {quote.project_description && ` — ${quote.project_description}`}
        </p>

        {step === "confirm" && (
          <>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              Möchten Sie ein Projekt aus diesem Angebot erstellen?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setStep("assign")}
                disabled={creating}
                className="bg-emerald-600 text-[var(--text-primary)] px-5 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-500 transition disabled:opacity-50"
              >
                Ja, Projekt erstellen
              </button>
              <button
                onClick={handleApproveOnly}
                disabled={creating}
                className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-5 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition disabled:opacity-50"
              >
                {creating ? "Wird freigegeben…" : "Nein, nur freigeben"}
              </button>
              <button
                onClick={onClose}
                disabled={creating}
                className="ml-auto text-sm text-gray-500 hover:text-[var(--text-secondary)] transition"
              >
                Abbrechen
              </button>
            </div>
          </>
        )}

        {step === "assign" && (
          <>
            {loading ? (
              <div className="py-8 text-center text-gray-500">
                Lade Mitarbeiter…
              </div>
            ) : (
              <>
                {/* Workload table */}
                <div className="border border-[var(--border)] rounded-lg overflow-hidden mb-4">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-[var(--background)]">
                        <th className="text-left text-xs font-medium text-gray-500 uppercase px-3 py-2">
                          Aufgabe
                        </th>
                        <th className="text-right text-xs font-medium text-gray-500 uppercase px-3 py-2 w-20">
                          Stunden
                        </th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase px-3 py-2 w-28">
                          Rolle
                        </th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase px-3 py-2 w-52">
                          Mitarbeiter
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((a) => (
                        <tr
                          key={a.itemIndex}
                          className="border-t border-[var(--border)]"
                        >
                          <td className="px-3 py-2 text-[var(--text-primary)]">
                            {a.item.description || `Position ${a.item.position}`}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-400">
                            {a.item.unit === "Stunden" && a.item.quantity > 0
                              ? `${a.item.quantity} h`
                              : "—"}
                          </td>
                          <td className="px-3 py-2">
                            {a.role ? (
                              <span
                                className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full"
                                style={{
                                  backgroundColor:
                                    (a.role.color || "#6b7280") + "20",
                                  color: a.role.color || "#6b7280",
                                }}
                              >
                                {a.role.name}
                              </span>
                            ) : (
                              <span className="text-gray-500">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={a.selectedUserId ?? ""}
                              onChange={(e) =>
                                handleSelectUser(
                                  a.itemIndex,
                                  e.target.value || null
                                )
                              }
                              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                            >
                              <option value="">— Nicht zuweisen —</option>
                              {a.suggestedUsers.length > 0 && (
                                <optgroup label="Vorgeschlagen">
                                  {a.suggestedUsers.map((u) => (
                                    <option key={u.userId} value={u.userId}>
                                      {u.displayName}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              <optgroup label={a.suggestedUsers.length > 0 ? "Alle Mitarbeiter" : "Mitarbeiter"}>
                                {allUsers
                                  .filter(
                                    (u) =>
                                      !a.suggestedUsers.some(
                                        (s) => s.userId === u.id
                                      )
                                  )
                                  .map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.display_name}
                                    </option>
                                  ))}
                              </optgroup>
                            </select>
                            {a.role && a.suggestedUsers.length === 0 && (
                              <p className="text-xs text-amber-400 mt-1">
                                Keine Vorschläge — bitte manuell wählen
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Budget summary */}
                <div className="flex items-center justify-between px-3 py-2 bg-[var(--background)] rounded-lg mb-4 text-sm">
                  <span className="text-gray-400">Budget gesamt</span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {totalHours > 0 ? `${totalHours} Stunden` : "Keine Stunden-Positionen"}
                  </span>
                </div>

                {totalHours === 0 && (
                  <p className="text-xs text-amber-400 mb-4">
                    Dieses Angebot enthält keine Stunden-Positionen — das Projekt wird ohne Budget erstellt.
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={handleCreateProject}
                    disabled={creating}
                    className="bg-emerald-600 text-[var(--text-primary)] px-5 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-500 transition disabled:opacity-50"
                  >
                    {creating ? "Wird erstellt…" : "Projekt erstellen"}
                  </button>
                  <button
                    onClick={() => setStep("confirm")}
                    disabled={creating}
                    className="bg-[var(--surface-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--border)] transition"
                  >
                    Zurück
                  </button>
                  <button
                    onClick={onClose}
                    disabled={creating}
                    className="ml-auto text-sm text-gray-500 hover:text-[var(--text-secondary)] transition"
                  >
                    Abbrechen
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
