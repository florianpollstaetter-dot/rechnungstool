"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { TimeEntry, Quote } from "@/lib/types";
import { getTimeEntries, getActiveTimer, createTimeEntry, updateTimeEntry, deleteTimeEntry, getQuotes, getCurrentUserName } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { useCompany } from "@/lib/company-context";
import { createClient } from "@/lib/supabase/client";
import { TabButton } from "@/components/TabButton";
import { TimeCalendarView } from "@/components/time/TimeCalendarView";
import type { ModalResult } from "@/components/time/TimeCalendarCreateModal";

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function formatTime(iso: string): string { return new Date(iso).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" }); }
function formatDate(iso: string): string { return new Date(iso).toLocaleDateString("de-AT", { weekday: "short", day: "2-digit", month: "2-digit" }); }
function dateKey(iso: string): string { return iso.split("T")[0]; }

const GENERAL_ITEMS = ["Daily", "Weekly", "Meeting Team", "Meeting Agentur", "Neues Projekt", "Briefing", "Administration", "E-Mails"];
const OTHER_ITEMS = ["Weiterbildung", "Reise", "Krankheit", "Urlaub", "Sonstiges"];

const COLOR_PALETTE = [
  "#10b981", "#f59e0b", "#3b82f6", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899",
  "#14b8a6", "#f97316", "#6366f1", "#a855f7", "#e11d48", "#0891b2", "#d946ef",
  "#059669", "#d97706", "#2563eb", "#7c3aed", "#dc2626", "#0e7490", "#c026d3",
];

function getProjectColor(project: string, allProjects: string[]): string {
  const idx = allProjects.indexOf(project);
  return COLOR_PALETTE[idx >= 0 ? idx % COLOR_PALETTE.length : 0];
}

type PickerTab = "allgemein" | "projekte" | "other";

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
  const [pickerTab, setPickerTab] = useState<PickerTab>("projekte");
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set([new Date().toISOString().split("T")[0]]));
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ project_label: "", description: "", duration_minutes: 0 });
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const [e, q, timer] = await Promise.all([getTimeEntries(user.id), getQuotes(), getActiveTimer(user.id)]);
    setEntries(e);
    setQuotes(q.filter((qt) => qt.status === "accepted" || qt.status === "sent"));
    setActiveTimerState(timer);
    if (timer) { setSelectedProject(timer.project_label); setSavedDescription(timer.description || ""); }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Resolve userId reliably — fallback to Supabase auth if state not yet set.
  async function resolveUserId(): Promise<string> {
    if (userId) return userId;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) { setUserId(user.id); return user.id; }
    return "";
  }

  useEffect(() => {
    if (activeTimer) {
      const update = () => { setElapsed(Math.floor((Date.now() - new Date(activeTimer.start_time).getTime()) / 60000)); };
      update();
      timerRef.current = setInterval(update, 10000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
    setElapsed(0);
  }, [activeTimer]);

  // Project frequency for sorting + color assignment
  const projectFreq = new Map<string, number>();
  entries.forEach((e) => { projectFreq.set(e.project_label, (projectFreq.get(e.project_label) || 0) + 1); });
  const allProjectLabels = Array.from(new Set(entries.map((e) => e.project_label))).sort((a, b) => (projectFreq.get(b) || 0) - (projectFreq.get(a) || 0));

  async function handleStart(label: string) {
    if (!label) return;
    const uid = await resolveUserId();
    if (!uid) return;
    setSelectedProject(label);
    const q = quotes.find((qt) => (qt.project_description || qt.quote_number) === label);
    const now = new Date();
    // If currently paused, close out the pause entry first so start_time of the new work entry lines up with the pause end.
    if (activeTimer && activeTimer.entry_type === "pause") {
      const duration = Math.round((now.getTime() - new Date(activeTimer.start_time).getTime()) / 60000);
      await updateTimeEntry(activeTimer.id, { end_time: now.toISOString(), duration_minutes: duration });
    }
    await createTimeEntry({
      company_id: "", user_id: uid, user_name: userName || getCurrentUserName(),
      quote_id: q?.id || null, project_label: label, description: "",
      start_time: now.toISOString(), end_time: null, duration_minutes: 0, billable: true, hourly_rate: 0,
      entry_type: "work",
    });
    await loadData();
  }

  async function handlePause() {
    if (!activeTimer || activeTimer.entry_type !== "work") return;
    const uid = await resolveUserId();
    if (!uid) return;
    const now = new Date();
    const duration = Math.round((now.getTime() - new Date(activeTimer.start_time).getTime()) / 60000);
    await updateTimeEntry(activeTimer.id, { end_time: now.toISOString(), duration_minutes: duration, description: description || savedDescription });
    await createTimeEntry({
      company_id: "", user_id: uid, user_name: userName || getCurrentUserName(),
      quote_id: null, project_label: "Pause", description: "",
      start_time: now.toISOString(), end_time: null, duration_minutes: 0, billable: false, hourly_rate: 0,
      entry_type: "pause",
    });
    setDescription(""); setSavedDescription("");
    await loadData();
  }

  async function handleEndPause() {
    if (!activeTimer || activeTimer.entry_type !== "pause") return;
    const now = new Date();
    const duration = Math.round((now.getTime() - new Date(activeTimer.start_time).getTime()) / 60000);
    await updateTimeEntry(activeTimer.id, { end_time: now.toISOString(), duration_minutes: duration });
    setActiveTimerState(null);
    await loadData();
  }

  // Debounced auto-save for description
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleDescriptionChange(val: string) {
    setDescription(val);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (!activeTimer) return;
    saveTimerRef.current = setTimeout(async () => {
      const newDesc = savedDescription ? `${savedDescription}, ${val.trim()}` : val.trim();
      if (val.trim()) {
        await updateTimeEntry(activeTimer.id, { description: newDesc });
        setSavedDescription(newDesc);
        setDescription("");
        setDescAnimation(true);
        setTimeout(() => setDescAnimation(false), 300);
      }
    }, 2000);
  }

  async function handleDescriptionSubmit() {
    if (!activeTimer || !description.trim()) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const newDesc = savedDescription ? `${savedDescription}, ${description.trim()}` : description.trim();
    await updateTimeEntry(activeTimer.id, { description: newDesc });
    setDescription("");
    setSavedDescription(newDesc);
    setDescAnimation(true);
    setTimeout(() => setDescAnimation(false), 300);
  }

  async function handleStop() {
    if (!activeTimer) return;
    const end = new Date();
    const duration = Math.round((end.getTime() - new Date(activeTimer.start_time).getTime()) / 60000);
    await updateTimeEntry(activeTimer.id, { end_time: end.toISOString(), duration_minutes: duration, description: description || savedDescription });
    setActiveTimerState(null); setDescription(""); setSavedDescription("");
    await loadData();
  }

  async function handleDelete(id: string) { if (confirm("Löschen?")) { await deleteTimeEntry(id); await loadData(); } }

  async function handleCalendarCreate(r: ModalResult) {
    const uid = await resolveUserId();
    if (!uid) return;
    const duration = Math.max(0, Math.round((r.end.getTime() - r.start.getTime()) / 60000));
    await createTimeEntry({
      company_id: "", user_id: uid, user_name: userName || getCurrentUserName(),
      quote_id: r.quote_id, project_label: r.project_label, description: r.description,
      start_time: r.start.toISOString(), end_time: r.end.toISOString(), duration_minutes: duration,
      billable: true, hourly_rate: 0, entry_type: "work",
    });
    await loadData();
  }

  async function handleSaveEdit(id: string) {
    await updateTimeEntry(id, { project_label: editForm.project_label, description: editForm.description, duration_minutes: editForm.duration_minutes });
    setEditingEntry(null); await loadData();
  }

  function toggleDay(day: string) {
    setExpandedDays((prev) => { const next = new Set(prev); if (next.has(day)) next.delete(day); else next.add(day); return next; });
  }

  // Pauses don't count toward work aggregates (SCH-368)
  const isWork = (e: TimeEntry) => e.entry_type !== "pause";
  const activeTimerCountsAsWork = activeTimer && activeTimer.entry_type !== "pause";

  // Group entries by date
  const todayStr = new Date().toISOString().split("T")[0];
  const todayMinutes = entries.filter((e) => dateKey(e.start_time) === todayStr && isWork(e)).reduce((s, e) => s + e.duration_minutes, 0) + (activeTimerCountsAsWork ? elapsed : 0);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); weekStart.setHours(0, 0, 0, 0);
  const weekMinutes = entries.filter((e) => new Date(e.start_time) >= weekStart && isWork(e)).reduce((s, e) => s + e.duration_minutes, 0) + (activeTimerCountsAsWork ? elapsed : 0);

  const dayGroups = new Map<string, TimeEntry[]>();
  entries.forEach((e) => { const d = dateKey(e.start_time); dayGroups.set(d, [...(dayGroups.get(d) || []), e]); });
  const sortedDays = Array.from(dayGroups.keys()).sort((a, b) => b.localeCompare(a));

  // Today's project breakdown for mini chart (work only)
  const todayByProject = new Map<string, number>();
  entries.filter((e) => dateKey(e.start_time) === todayStr && isWork(e)).forEach((e) => {
    todayByProject.set(e.project_label, (todayByProject.get(e.project_label) || 0) + e.duration_minutes);
  });
  if (activeTimerCountsAsWork) todayByProject.set(activeTimer!.project_label, (todayByProject.get(activeTimer!.project_label) || 0) + elapsed);

  // chartColors replaced by getProjectColor()

  if (loading) return <div className="flex justify-center py-12"><div className="text-gray-500">Laden...</div></div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Zeiterfassung</h1>
          <div className="flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-0.5" role="tablist" aria-label="Ansicht">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "list"}
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition ${viewMode === "list" ? "bg-[var(--surface-hover)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
              title="Listenansicht"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              Liste
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "calendar"}
              onClick={() => setViewMode("calendar")}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition ${viewMode === "calendar" ? "bg-[var(--surface-hover)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
              title="Kalenderansicht"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Kalender
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Mini pie chart — clickable to analytics */}
          {todayByProject.size > 0 && todayMinutes > 0 && (
            <a href="/time/analytics" className="flex items-center gap-2 hover:opacity-80 transition cursor-pointer" title="Auswertungen öffnen">
              <svg width="40" height="40" viewBox="0 0 40 40">
                {(() => {
                  let offset = 0;
                  const total = todayMinutes;
                  return Array.from(todayByProject.entries()).map(([, mins], i) => {
                    const pct = mins / total;
                    const dashArray = `${pct * 125.66} ${125.66 * (1 - pct)}`;
                    const dashOffset = -offset * 125.66;
                    offset += pct;
                    return <circle key={i} cx="20" cy="20" r="16" fill="none" stroke={getProjectColor(Array.from(todayByProject.keys())[i], allProjectLabels)} strokeWidth="6" strokeDasharray={dashArray} strokeDashoffset={dashOffset} transform="rotate(-90 20 20)" />;
                  });
                })()}
              </svg>
              <div className="text-right">
                <p className="text-xs text-[var(--text-muted)]">Heute</p>
                <p className="font-bold text-[var(--text-primary)] text-sm">{formatDuration(todayMinutes)}</p>
              </div>
            </a>
          )}
          <div className="text-center">
            <p className="text-[var(--text-muted)] text-xs">Woche</p>
            <p className="font-bold text-[var(--text-primary)]">{formatDuration(weekMinutes)}</p>
          </div>
        </div>
      </div>

      {/* Timer widget */}
      <div className={`bg-[var(--surface)] rounded-xl border-2 ${activeTimer ? (activeTimer.entry_type === "pause" ? "border-amber-500" : "border-emerald-500") : "border-[var(--border)]"} p-5 mb-6 transition`}>
        {activeTimer && activeTimer.entry_type === "pause" ? (
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-amber-400">Pausiert — seit {formatTime(activeTimer.start_time)}</span>
              <span className="text-2xl font-bold text-[var(--text-primary)] ml-auto">{formatDuration(elapsed)}</span>
            </div>
            <div className="flex gap-2 items-center">
              <p className="flex-1 text-xs text-[var(--text-muted)]">Wähle unten ein Projekt um die Pause zu beenden und weiter zu tracken.</p>
              <button onClick={handleEndPause} className="bg-amber-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-amber-500 transition">Pause beenden</button>
            </div>
            {/* Project picker stays visible so user can resume directly into a project */}
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <div className="flex gap-0.5 mb-0 px-0.5 pb-1 border-b border-[var(--border)]">
                {([["allgemein", "Allgemein"], ["projekte", "Projekte"], ["other", "Other"]] as [PickerTab, string][]).map(([key, label]) => (
                  <TabButton key={key} active={pickerTab === key} onClick={() => setPickerTab(key)}>
                    {label}
                  </TabButton>
                ))}
              </div>
              <div key={pickerTab} className="tab-content-enter flex flex-wrap gap-2 pt-3 pb-1">
                {pickerTab === "allgemein" && GENERAL_ITEMS.map((item) => (
                  <button key={item} onClick={() => handleStart(item)}
                    className="px-3 py-2 text-xs font-medium rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--brand-orange-dim)] hover:text-[var(--brand-orange)] transition"
                  >{item}</button>
                ))}
                {pickerTab === "projekte" && (
                  quotes.length > 0 ? quotes
                    .sort((a, b) => (projectFreq.get(b.project_description || b.quote_number) || 0) - (projectFreq.get(a.project_description || a.quote_number) || 0))
                    .map((q) => {
                      const label = q.project_description || q.quote_number;
                      return (
                        <button key={q.id} onClick={() => handleStart(label)}
                          className="px-3 py-2 text-xs font-medium rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--brand-orange-dim)] hover:text-[var(--brand-orange)] transition"
                        >{label}</button>
                      );
                    })
                  : <p className="text-xs text-[var(--text-muted)]">Keine freigegebenen Angebote. Erstelle zuerst ein Angebot.</p>
                )}
                {pickerTab === "other" && OTHER_ITEMS.map((item) => (
                  <button key={item} onClick={() => handleStart(item)}
                    className="px-3 py-2 text-xs font-medium rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--brand-orange-dim)] hover:text-[var(--brand-orange)] transition"
                  >{item}</button>
                ))}
              </div>
            </div>
          </div>
        ) : activeTimer ? (
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
              <input type="text" value={description} onChange={(e) => handleDescriptionChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleDescriptionSubmit(); }}
                placeholder={savedDescription ? "Weitere Notiz..." : "Was machst du gerade?"}
                className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button onClick={handlePause} className="bg-amber-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-amber-500 transition">Pause</button>
              <button onClick={handleStop} className="bg-rose-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-rose-500 transition">Stop</button>
            </div>
          </div>
        ) : (
          <div>
            {/* Unified tab picker */}
            <div className="flex gap-0.5 mb-0 px-0.5 pb-1 border-b border-[var(--border)]">
              {([["allgemein", "Allgemein"], ["projekte", "Projekte"], ["other", "Other"]] as [PickerTab, string][]).map(([key, label]) => (
                <TabButton key={key} active={pickerTab === key} onClick={() => setPickerTab(key)}>
                  {label}
                </TabButton>
              ))}
            </div>
            <div key={pickerTab} className="tab-content-enter flex flex-wrap gap-2 pt-3 pb-1">
              {pickerTab === "allgemein" && GENERAL_ITEMS.map((item) => (
                <button key={item} onClick={() => handleStart(item)}
                  className="px-3 py-2 text-xs font-medium rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--brand-orange-dim)] hover:text-[var(--brand-orange)] transition"
                >{item}</button>
              ))}
              {pickerTab === "projekte" && (
                quotes.length > 0 ? quotes
                  .sort((a, b) => (projectFreq.get(b.project_description || b.quote_number) || 0) - (projectFreq.get(a.project_description || a.quote_number) || 0))
                  .map((q) => {
                    const label = q.project_description || q.quote_number;
                    return (
                      <button key={q.id} onClick={() => handleStart(label)}
                        className="px-3 py-2 text-xs font-medium rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--brand-orange-dim)] hover:text-[var(--brand-orange)] transition"
                      >{label}</button>
                    );
                  })
                : <p className="text-xs text-[var(--text-muted)]">Keine freigegebenen Angebote. Erstelle zuerst ein Angebot.</p>
              )}
              {pickerTab === "other" && OTHER_ITEMS.map((item) => (
                <button key={item} onClick={() => handleStart(item)}
                  className="px-3 py-2 text-xs font-medium rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--brand-orange-dim)] hover:text-[var(--brand-orange)] transition"
                >{item}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Calendar view */}
      {viewMode === "calendar" && (
        <TimeCalendarView
          entries={entries}
          activeElapsed={elapsed}
          quotes={quotes}
          projectFreq={projectFreq}
          allProjectLabels={allProjectLabels}
          getProjectColor={getProjectColor}
          onCreate={handleCalendarCreate}
        />
      )}

      {/* Day-grouped entries */}
      {viewMode === "list" && <div className="space-y-3">
        {sortedDays.map((day) => {
          const dayEntries = dayGroups.get(day) || [];
          const workEntries = dayEntries.filter(isWork);
          const pauseEntries = dayEntries.filter((e) => !isWork(e));
          const dayTotal = workEntries.reduce((s, e) => s + e.duration_minutes, 0) + (activeTimerCountsAsWork && dateKey(activeTimer!.start_time) === day ? elapsed : 0);
          const pauseTotal = pauseEntries.reduce((s, e) => s + e.duration_minutes, 0) + (activeTimer && activeTimer.entry_type === "pause" && dateKey(activeTimer.start_time) === day ? elapsed : 0);
          const isExpanded = expandedDays.has(day);
          const isToday = day === todayStr;

          // Day project breakdown (work only)
          const dayByProject = new Map<string, number>();
          workEntries.forEach((e) => { dayByProject.set(e.project_label, (dayByProject.get(e.project_label) || 0) + e.duration_minutes); });

          return (
            <div key={day} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden">
              <button onClick={() => toggleDay(day)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--surface-hover)] transition">
                <div className="flex items-center gap-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-[var(--text-muted)] transition-transform ${isExpanded ? "rotate-90" : ""}`}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span className={`text-sm font-semibold ${isToday ? "text-[var(--accent)]" : "text-[var(--text-primary)]"}`}>
                    {isToday ? "Heute" : formatDate(day + "T00:00:00")}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">{dayEntries.length} Einträge</span>
                  {!isExpanded && (
                    <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
                      {Array.from(dayByProject.entries()).map(([p, m]) => `${p} ${formatDuration(m)}`).join(" · ")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Mini chart for collapsed day */}
                  {!isExpanded && dayByProject.size > 0 && (
                    <svg width="24" height="24" viewBox="0 0 24 24">
                      {(() => {
                        let off = 0;
                        return Array.from(dayByProject.entries()).map(([proj, mins], i) => {
                          const pct = mins / dayTotal;
                          const da = `${pct * 75.4} ${75.4 * (1 - pct)}`;
                          const doff = -off * 75.4;
                          off += pct;
                          return <circle key={i} cx="12" cy="12" r="9" fill="none" stroke={getProjectColor(proj, allProjectLabels)} strokeWidth="4" strokeDasharray={da} strokeDashoffset={doff} transform="rotate(-90 12 12)" />;
                        });
                      })()}
                    </svg>
                  )}
                  <span className="text-sm font-bold text-[var(--text-primary)]">{formatDuration(dayTotal)}</span>
                  {pauseTotal > 0 && (
                    <span className="text-[10px] text-amber-400/80" title="Pause, nicht in Arbeitszeit gezählt">+ {formatDuration(pauseTotal)} Pause</span>
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-[var(--border)]">
                  <table className="min-w-full">
                    <tbody className="divide-y divide-[var(--border)]">
                      {dayEntries.sort((a, b) => b.start_time.localeCompare(a.start_time)).map((e) => {
                        const isEditing = editingEntry === e.id;
                        const isPause = e.entry_type === "pause";
                        return (
                          <tr key={e.id} className={`hover:bg-[var(--surface-hover)] transition ${isPause ? "opacity-60" : ""}`} onDoubleClick={() => { setEditingEntry(e.id); setEditForm({ project_label: e.project_label, description: e.description, duration_minutes: e.duration_minutes }); }}>
                            <td className="px-4 py-2.5 text-xs w-24">
                              {isEditing ? (
                                <input type="text" value={editForm.project_label} onChange={(ev) => setEditForm({ ...editForm, project_label: ev.target.value })} className="bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] w-full" />
                              ) : (
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isPause ? "#f59e0b" : getProjectColor(e.project_label, allProjectLabels) }} />
                                  <span className={`font-medium ${isPause ? "text-amber-400 italic" : "text-[var(--text-primary)]"}`}>{isPause ? "Pause" : e.project_label}</span>
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-[var(--text-muted)] max-w-[200px]">
                              {isEditing ? (
                                <input type="text" value={editForm.description} onChange={(ev) => setEditForm({ ...editForm, description: ev.target.value })} className="bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] w-full" />
                              ) : (
                                <span className="truncate block">{e.description || "—"}</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)] w-28">
                              {formatTime(e.start_time)} — {e.end_time ? formatTime(e.end_time) : "läuft"}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-right font-medium text-[var(--text-primary)] w-16">
                              {isEditing ? (
                                <input type="number" value={editForm.duration_minutes} onChange={(ev) => setEditForm({ ...editForm, duration_minutes: Number(ev.target.value) })} className="bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] w-16 text-right" />
                              ) : formatDuration(e.duration_minutes)}
                            </td>
                            <td className="px-4 py-2.5 text-right w-20">
                              {isEditing ? (
                                <button onClick={() => handleSaveEdit(e.id)} className="text-emerald-400 text-xs mr-1">✓</button>
                              ) : null}
                              <button onClick={() => handleDelete(e.id)} className="text-rose-400/50 hover:text-rose-400 text-xs">×</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {/* Expanded day chart */}
                  {dayByProject.size > 1 && (
                    <div className="px-4 py-3 border-t border-[var(--border)] flex flex-wrap gap-3">
                      {Array.from(dayByProject.entries()).map(([project, mins]) => (
                        <div key={project} className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getProjectColor(project, allProjectLabels) }} />
                          <span className="text-[10px] text-[var(--text-secondary)]">{project}</span>
                          <span className="text-[10px] font-medium text-[var(--text-primary)]">{formatDuration(mins)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {sortedDays.length === 0 && !activeTimer && (
          <div className="text-center text-[var(--text-muted)] py-8 text-sm">Noch keine Zeiteinträge. Wähle ein Projekt oben und starte.</div>
        )}
      </div>}
    </div>
  );
}
