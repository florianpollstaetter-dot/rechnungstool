"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { TimeEntry, Quote } from "@/lib/types";
import { getTimeEntries, getActiveTimer, createTimeEntry, updateTimeEntry, deleteTimeEntry, getQuotes, getCurrentUserName } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { useCompany } from "@/lib/company-context";
import { createClient } from "@/lib/supabase/client";

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-AT", { weekday: "short", day: "2-digit", month: "2-digit" });
}

export default function TimePage() {
  const { userName } = useCompany();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [activeTimer, setActiveTimerState] = useState<TimeEntry | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [selectedProject, setSelectedProject] = useState("");
  const [description, setDescription] = useState("");
  const [savedDescription, setSavedDescription] = useState("");
  const [descAnimation, setDescAnimation] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const [e, q, timer] = await Promise.all([
      getTimeEntries(user.id),
      getQuotes(),
      getActiveTimer(user.id),
    ]);
    setEntries(e);
    setQuotes(q.filter((qt) => qt.status === "accepted" || qt.status === "sent"));
    setActiveTimerState(timer);
    if (timer) {
      setSelectedProject(timer.project_label);
      setSavedDescription(timer.description || "");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Live elapsed counter
  useEffect(() => {
    if (activeTimer) {
      const update = () => {
        const start = new Date(activeTimer.start_time).getTime();
        setElapsed(Math.floor((Date.now() - start) / 60000));
      };
      update();
      timerRef.current = setInterval(update, 10000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    } else {
      setElapsed(0);
    }
  }, [activeTimer]);

  async function handleStart() {
    if (!selectedProject) { alert("Bitte ein Projekt wählen."); return; }
    const q = quotes.find((qt) => qt.project_description === selectedProject || qt.quote_number === selectedProject);
    await createTimeEntry({
      company_id: "",
      user_id: userId,
      user_name: userName || getCurrentUserName(),
      quote_id: q?.id || null,
      project_label: selectedProject,
      description,
      start_time: new Date().toISOString(),
      end_time: null,
      duration_minutes: 0,
      billable: true,
      hourly_rate: 0,
    });
    await loadData();
  }

  async function handleDescriptionSubmit() {
    if (!activeTimer || !description.trim()) return;
    const newDesc = savedDescription
      ? `${savedDescription}, ${description.trim()}`
      : description.trim();
    await updateTimeEntry(activeTimer.id, { description: newDesc });
    setDescription("");
    setDescAnimation(true);
    setTimeout(() => {
      setSavedDescription(newDesc);
      setDescAnimation(false);
    }, 300);
  }

  async function handleStop() {
    if (!activeTimer) return;
    const end = new Date();
    const start = new Date(activeTimer.start_time);
    const duration = Math.round((end.getTime() - start.getTime()) / 60000);
    await updateTimeEntry(activeTimer.id, {
      end_time: end.toISOString(),
      duration_minutes: duration,
      description: description || savedDescription,
    });
    setActiveTimerState(null);
    setDescription("");
    setSavedDescription("");
    await loadData();
  }

  async function handleDelete(id: string) {
    if (confirm("Zeiteintrag löschen?")) {
      await deleteTimeEntry(id);
      await loadData();
    }
  }

  // Group entries by date
  const todayStr = new Date().toISOString().split("T")[0];
  const todayEntries = entries.filter((e) => e.start_time.startsWith(todayStr));
  const todayMinutes = todayEntries.reduce((s, e) => s + e.duration_minutes, 0) + (activeTimer ? elapsed : 0);
  const weekEntries = entries.filter((e) => {
    const d = new Date(e.start_time);
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);
    return d >= weekStart;
  });
  const weekMinutes = weekEntries.reduce((s, e) => s + e.duration_minutes, 0) + (activeTimer ? elapsed : 0);

  // Project summary
  const projectSummary = new Map<string, number>();
  entries.forEach((e) => {
    const current = projectSummary.get(e.project_label) || 0;
    projectSummary.set(e.project_label, current + e.duration_minutes);
  });

  if (loading) return <div className="flex justify-center py-12"><div className="text-gray-500">Laden...</div></div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Zeiterfassung</h1>
        <div className="flex gap-3 text-sm">
          <div className="text-center">
            <p className="text-[var(--text-muted)] text-xs">Heute</p>
            <p className="font-bold text-[var(--text-primary)]">{formatDuration(todayMinutes)}</p>
          </div>
          <div className="text-center">
            <p className="text-[var(--text-muted)] text-xs">Woche</p>
            <p className="font-bold text-[var(--text-primary)]">{formatDuration(weekMinutes)}</p>
          </div>
        </div>
      </div>

      {/* Timer widget */}
      <div className={`bg-[var(--surface)] rounded-xl border-2 ${activeTimer ? "border-emerald-500" : "border-[var(--border)]"} p-5 mb-6 transition`}>
        {activeTimer ? (
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-emerald-400">Läuft — {activeTimer.project_label}</span>
              {savedDescription && (
                <span className={`text-xs text-[var(--text-muted)] italic transition-all duration-300 ${descAnimation ? "opacity-0 translate-x-4" : "opacity-100"}`}>
                  {savedDescription}
                </span>
              )}
              <span className="text-2xl font-bold text-[var(--text-primary)] ml-auto">{formatDuration(elapsed)}</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleDescriptionSubmit(); }}
                placeholder={savedDescription ? "Weitere Notiz..." : "Was machst du gerade?"}
                className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button onClick={handleStop} className="bg-rose-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-rose-500 transition">
                Stop
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div className="sm:col-span-1">
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                >
                  <option value="">Projekt wählen...</option>
                  {quotes.map((q) => (
                    <option key={q.id} value={q.project_description || q.quote_number}>
                      {q.project_description || q.quote_number}
                    </option>
                  ))}
                  <option value="__custom">+ Eigenes Projekt</option>
                </select>
              </div>
              {selectedProject === "__custom" && (
                <input
                  type="text"
                  value=""
                  onChange={(e) => setSelectedProject(e.target.value)}
                  placeholder="Projektname eingeben"
                  className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              )}
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Beschreibung (optional)"
                className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <button onClick={handleStart} disabled={!selectedProject || selectedProject === "__custom"} className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-emerald-500 transition disabled:opacity-50">
                Start
              </button>
            </div>
            {quotes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {quotes.slice(0, 4).map((q) => (
                  <button
                    key={q.id}
                    onClick={() => { setSelectedProject(q.project_description || q.quote_number); }}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                      selectedProject === (q.project_description || q.quote_number)
                        ? "bg-[var(--accent)] text-black"
                        : "bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                    }`}
                  >
                    {q.project_description || q.quote_number}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Project summary cards */}
      {projectSummary.size > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {Array.from(projectSummary.entries()).slice(0, 4).map(([project, minutes]) => {
            const q = quotes.find((qt) => qt.project_description === project || qt.quote_number === project);
            const quotedHours = q ? q.items.filter((i) => i.unit === "Stueck" || i.unit === "Stunden").reduce((s, i) => s + i.quantity, 0) : 0;
            const usedHours = minutes / 60;
            const percent = quotedHours > 0 ? Math.min(100, Math.round(usedHours / quotedHours * 100)) : 0;
            return (
              <div key={project} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-3">
                <p className="text-xs font-medium text-[var(--text-primary)] truncate">{project}</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">{formatDuration(minutes)}</p>
                {quotedHours > 0 && (
                  <>
                    <div className="w-full h-1.5 bg-[var(--border)] rounded-full mt-1.5">
                      <div className={`h-full rounded-full transition-all ${percent > 90 ? "bg-rose-500" : percent > 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${percent}%` }} />
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{usedHours.toFixed(1)}h / {quotedHours}h ({percent}%)</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Recent entries */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--border)]">
          <thead className="bg-[var(--background)]">
            <tr>
              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-[var(--text-muted)] uppercase">Tag</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-[var(--text-muted)] uppercase">Projekt</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-[var(--text-muted)] uppercase">Beschreibung</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-[var(--text-muted)] uppercase">Zeit</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-medium text-[var(--text-muted)] uppercase">Dauer</th>
              <th className="px-3 py-2.5 text-right text-[10px] font-medium text-[var(--text-muted)] uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {entries.length === 0 && !activeTimer && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-[var(--text-muted)] text-sm">Noch keine Zeiteinträge. Wähle ein Projekt und klicke Start.</td></tr>
            )}
            {entries.slice(0, 20).map((e) => (
              <tr key={e.id} className="hover:bg-[var(--surface-hover)] transition">
                <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">{formatDate(e.start_time)}</td>
                <td className="px-3 py-2.5 text-xs font-medium text-[var(--text-primary)]">{e.project_label}</td>
                <td className="px-3 py-2.5 text-xs text-[var(--text-muted)] max-w-[150px] truncate">{e.description || "—"}</td>
                <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">
                  {formatTime(e.start_time)} — {e.end_time ? formatTime(e.end_time) : "läuft"}
                </td>
                <td className="px-3 py-2.5 text-xs text-right font-medium text-[var(--text-primary)]">{formatDuration(e.duration_minutes)}</td>
                <td className="px-3 py-2.5 text-right">
                  <button onClick={() => handleDelete(e.id)} className="text-rose-400/60 hover:text-rose-400 text-xs">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
