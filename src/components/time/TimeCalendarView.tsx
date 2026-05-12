"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TimeEntry, Quote, UserWorkSchedule, GeneralCategory, Project } from "@/lib/types";
import { TimeCalendarCreateModal, ModalResult, EditData } from "./TimeCalendarCreateModal";

type ViewMode = "week" | "day";

interface Props {
  entries: TimeEntry[];
  activeElapsed: number;
  quotes: Quote[];
  projectFreq: Map<string, number>;
  allProjectLabels: string[];
  getProjectColor: (label: string, all: string[]) => string;
  schedule: UserWorkSchedule[];
  /** SCH-921 K2-J1 — admin-managed Allgemein/Sonstiges labels passed
   *  through to the create modal. */
  generalCategories?: GeneralCategory[];
  /** SCH-921 K3-Q1 — known projects so the create modal can offer existing
   *  ones in addition to the inline-create flow. */
  projects?: Project[];
  /** Called when an inline new project is created — lets the parent merge
   *  the new project into its in-memory list without a full reload. */
  onProjectCreated?: (project: Project) => void;
  onCreate: (result: ModalResult) => Promise<void>;
  onEdit: (id: string, result: ModalResult) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

// SCH-920 K2-M1 — full 24h grid so entries before 6:00 / after 22:00 are
// visible. Default scroll position lands on 6:00 so the typical work day is
// in view without forcing the user to scroll up.
const DAY_START_HOUR = 0;
const DAY_END_HOUR = 24;
const DEFAULT_FOCUS_HOUR = 6;
const SLOT_MINUTES = 15;
const VISIBLE_HOURS = DAY_END_HOUR - DAY_START_HOUR;
const VISIBLE_MINUTES = VISIBLE_HOURS * 60;
const HOUR_HEIGHT_PX = 36;
const GRID_HEIGHT_PX = VISIBLE_HOURS * HOUR_HEIGHT_PX;
const SCROLL_VIEWPORT_PX = 560; // visible window inside the scrollable grid
const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - dow);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDayHeader(d: Date): string {
  return d.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit" });
}

function formatRange(a: Date, b: Date): string {
  const ao = { day: "2-digit", month: "2-digit" } as const;
  const bo = { day: "2-digit", month: "2-digit", year: "numeric" } as const;
  return `${a.toLocaleDateString("de-AT", ao)} – ${b.toLocaleDateString("de-AT", bo)}`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
}

function minutesSinceDayStart(d: Date): number {
  return (d.getHours() - DAY_START_HOUR) * 60 + d.getMinutes();
}

// Clamp a [start,end] pair to the visible window on a given day; return null if fully outside.
function clampToVisible(day: Date, start: Date, end: Date): { topMin: number; bottomMin: number } | null {
  const visStart = new Date(day);
  visStart.setHours(DAY_START_HOUR, 0, 0, 0);
  const visEnd = new Date(day);
  visEnd.setHours(DAY_END_HOUR, 0, 0, 0);
  const s = start < visStart ? visStart : start;
  const e = end > visEnd ? visEnd : end;
  if (e <= s) return null;
  return {
    topMin: minutesSinceDayStart(s),
    bottomMin: minutesSinceDayStart(e),
  };
}

function snapMinutesToSlot(min: number): number {
  return Math.round(min / SLOT_MINUTES) * SLOT_MINUTES;
}

export function TimeCalendarView({
  entries,
  activeElapsed,
  quotes,
  projectFreq,
  allProjectLabels,
  getProjectColor,
  schedule,
  generalCategories,
  projects,
  onProjectCreated,
  onCreate,
  onEdit,
  onDelete,
}: Props) {
  const [mode, setMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const gridRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [dragState, setDragState] = useState<{
    dayIndex: number;
    startMin: number;
    currentMin: number;
  } | null>(null);

  // SCH-899 Phase B — drag-resize at the top/bottom edge of an entry block
  // adjusts start_time / end_time in 15-min snaps. While the user holds the
  // mouse we keep the deltaMin in state so the rendered block can preview the
  // new height; on mouseup we apply it via onEdit (with overlap protection).
  const [resizeState, setResizeState] = useState<{
    entryId: string;
    edge: "top" | "bottom";
    deltaMin: number;
  } | null>(null);

  const [modalInit, setModalInit] = useState<{ start: Date; end: Date } | null>(null);
  const [editInit, setEditInit] = useState<EditData | null>(null);

  // SCH-920 K2-M2 — non-working days (no daily target) render with a muted
  // overlay so the user can tell at a glance that a day sits outside their
  // Arbeitszeitmodell. Weekday key matches user_work_schedules.weekday
  // (0 = Monday … 6 = Sunday).
  const workingWeekdays = useMemo(() => {
    const set = new Set<number>();
    schedule.forEach((s) => {
      if (s.daily_target_minutes > 0 || (s.start_time && s.end_time)) set.add(s.weekday);
    });
    return set;
  }, [schedule]);

  // Auto-scroll the grid so the typical work-day start lands at the top of
  // the viewport on first render and whenever the user clicks "Heute".
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = DEFAULT_FOCUS_HOUR * HOUR_HEIGHT_PX;
  }, []);

  // Check if a time range overlaps with any existing entry (optionally excluding one by id).
  function hasOverlap(start: Date, end: Date, excludeId?: string): boolean {
    return entries.some((e) => {
      if (excludeId && e.id === excludeId) return false;
      if (!e.end_time) return false; // running timer — don't block
      const eStart = new Date(e.start_time);
      const eEnd = new Date(e.end_time);
      return start < eEnd && end > eStart;
    });
  }

  // SCH-920 K2-M7 — overlap check for an arbitrary set of ranges (used by the
  // midnight-rollover split path so both halves are validated together).
  function hasOverlapAny(ranges: { start: Date; end: Date }[], excludeId?: string): boolean {
    return ranges.some((r) => hasOverlap(r.start, r.end, excludeId));
  }

  const days = useMemo<Date[]>(() => {
    if (mode === "day") return [startOfDay(anchor)];
    const ws = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  }, [mode, anchor]);

  const weekStart = days[0];
  const weekEnd = days[days.length - 1];

  // Bucket entries by day (visible-window only).
  const entriesByDay = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    entries.forEach((e) => {
      const d = startOfDay(new Date(e.start_time));
      const key = d.toISOString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return map;
  }, [entries]);

  // SCH-899 Phase B — start a resize from the top/bottom edge of an entry.
  // Live entries (no end_time) and read-only views are skipped by the caller.
  function handleEdgeMouseDown(
    entry: TimeEntry,
    edge: "top" | "bottom",
    dayIndex: number,
    ev: React.MouseEvent<HTMLDivElement>,
  ) {
    if (ev.button !== 0) return;
    if (modalInit || editInit) return;
    if (!entry.end_time) return;
    const target = gridRefs.current.get(dayIndex);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const minPerPx = VISIBLE_MINUTES / rect.height;
    const startY = ev.clientY;
    const origStart = new Date(entry.start_time);
    const origEnd = new Date(entry.end_time);
    ev.preventDefault();
    ev.stopPropagation();

    const buf = { deltaMin: 0 };
    setResizeState({ entryId: entry.id, edge, deltaMin: 0 });

    const onMove = (mv: MouseEvent) => {
      const dy = mv.clientY - startY;
      const snap = snapMinutesToSlot(dy * minPerPx);
      buf.deltaMin = snap;
      setResizeState((prev) => (prev ? { ...prev, deltaMin: snap } : prev));
    };

    const onUp = async () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setResizeState(null);

      if (buf.deltaMin === 0) return;

      let newStart = new Date(origStart);
      let newEnd = new Date(origEnd);
      const dayStart = new Date(origStart);
      dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
      const dayEnd = new Date(origStart);
      dayEnd.setHours(DAY_END_HOUR, 0, 0, 0);
      const minSpanMs = SLOT_MINUTES * 60_000;

      if (edge === "top") {
        newStart = new Date(origStart.getTime() + buf.deltaMin * 60_000);
        if (newStart.getTime() >= newEnd.getTime() - minSpanMs) {
          newStart = new Date(newEnd.getTime() - minSpanMs);
        }
        if (newStart < dayStart) newStart = dayStart;
      } else {
        newEnd = new Date(origEnd.getTime() + buf.deltaMin * 60_000);
        if (newEnd.getTime() <= newStart.getTime() + minSpanMs) {
          newEnd = new Date(newStart.getTime() + minSpanMs);
        }
        if (newEnd > dayEnd) newEnd = dayEnd;
      }

      if (
        newStart.getTime() === origStart.getTime() &&
        newEnd.getTime() === origEnd.getTime()
      ) {
        return;
      }

      if (hasOverlap(newStart, newEnd, entry.id)) {
        window.alert("Konflikt: ein Eintrag überschneidet sich mit einem bestehenden.");
        return;
      }

      await onEdit(entry.id, {
        start: newStart,
        end: newEnd,
        project_label: entry.project_label,
        quote_id: entry.quote_id,
        project_id: entry.project_id ?? null,
        description: entry.description,
      });
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleMouseDown(dayIndex: number, ev: React.MouseEvent<HTMLDivElement>) {
    if (ev.button !== 0) return;
    if (modalInit) return;
    const target = gridRefs.current.get(dayIndex);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const rawMin = ((ev.clientY - rect.top) / rect.height) * VISIBLE_MINUTES;
    const snapped = snapMinutesToSlot(Math.max(0, Math.min(VISIBLE_MINUTES, rawMin)));
    // Local drag buffer: holds latest values for the onUp closure.
    const buf = { startMin: snapped, currentMin: snapped };
    setDragState({ dayIndex, startMin: snapped, currentMin: snapped });
    ev.preventDefault();

    const onMove = (moveEv: MouseEvent) => {
      const rectNow = target.getBoundingClientRect();
      const rm = ((moveEv.clientY - rectNow.top) / rectNow.height) * VISIBLE_MINUTES;
      const sn = snapMinutesToSlot(Math.max(0, Math.min(VISIBLE_MINUTES, rm)));
      buf.currentMin = sn;
      setDragState((prev) => (prev ? { ...prev, currentMin: sn } : prev));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setDragState(null);
      const lo = Math.min(buf.startMin, buf.currentMin);
      const hi = Math.max(buf.startMin, buf.currentMin);
      // Require at least one slot.
      const span = Math.max(hi - lo, SLOT_MINUTES);
      const day = days[dayIndex];
      const start = new Date(day);
      start.setHours(DAY_START_HOUR, 0, 0, 0);
      start.setMinutes(start.getMinutes() + lo);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + span);
      // Overlap protection: don't open create modal if slot is occupied
      if (hasOverlap(start, end)) return;
      setModalInit({ start, end });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // SCH-920 K2-M4 — split a [start, end] range that crosses midnight into
  // one entry per calendar day so the calendar grid (which buckets by start
  // day) renders both halves correctly. Single-day ranges pass through.
  function splitAtMidnight(start: Date, end: Date): { start: Date; end: Date }[] {
    const parts: { start: Date; end: Date }[] = [];
    let cursor = new Date(start);
    while (cursor < end) {
      const dayEnd = new Date(cursor);
      dayEnd.setHours(24, 0, 0, 0); // start of next day
      const segEnd = dayEnd < end ? dayEnd : end;
      if (segEnd > cursor) parts.push({ start: cursor, end: segEnd });
      cursor = dayEnd;
    }
    return parts.length > 0 ? parts : [{ start, end }];
  }

  async function handleModalSubmit(result: ModalResult): Promise<{ ok: boolean; error?: string }> {
    const parts = splitAtMidnight(result.start, result.end);
    if (editInit) {
      // SCH-920 K2-M7 — overlap check for edits (exclude self) over all parts
      if (hasOverlapAny(parts, editInit.id)) {
        return { ok: false, error: "Konflikt: ein Eintrag überschneidet sich mit einem bestehenden." };
      }
      const [head, ...tail] = parts;
      await onEdit(editInit.id, { ...result, start: head.start, end: head.end });
      for (const p of tail) {
        await onCreate({ ...result, start: p.start, end: p.end });
      }
      setEditInit(null);
    } else {
      if (hasOverlapAny(parts)) {
        return { ok: false, error: "Konflikt: ein Eintrag überschneidet sich mit einem bestehenden." };
      }
      for (const p of parts) {
        await onCreate({ ...result, start: p.start, end: p.end });
      }
      setModalInit(null);
    }
    return { ok: true };
  }

  async function handleModalDelete(id: string) {
    await onDelete(id);
    setEditInit(null);
  }

  function handleModalCancel() {
    setModalInit(null);
    setEditInit(null);
  }

  function handleEntryClick(e: TimeEntry, ev: React.MouseEvent) {
    ev.stopPropagation();
    if (!e.end_time) return; // don't edit running entries
    setEditInit({
      id: e.id,
      start: new Date(e.start_time),
      end: new Date(e.end_time),
      project_label: e.project_label,
      quote_id: e.quote_id,
      project_id: e.project_id ?? null,
      description: e.description,
    });
  }

  function goPrev() {
    if (mode === "day") setAnchor((d) => addDays(d, -1));
    else setAnchor((d) => addDays(d, -7));
  }
  function goNext() {
    if (mode === "day") setAnchor((d) => addDays(d, 1));
    else setAnchor((d) => addDays(d, 7));
  }
  function goToday() {
    setAnchor(startOfDay(new Date()));
    if (scrollRef.current) scrollRef.current.scrollTop = DEFAULT_FOCUS_HOUR * HOUR_HEIGHT_PX;
  }

  const now = new Date();

  return (
    <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden">
      {/* Calendar header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <button onClick={goPrev} className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition" title="Zurück">‹</button>
          <button onClick={goToday} className="px-2.5 py-1 text-xs font-medium rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition">Heute</button>
          <button onClick={goNext} className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition" title="Vor">›</button>
          <span className="text-xs text-[var(--text-muted)] ml-2">
            {mode === "day" ? days[0].toLocaleDateString("de-AT", { weekday: "long", day: "2-digit", month: "long" }) : formatRange(weekStart, weekEnd)}
          </span>
        </div>
        <div className="flex gap-1 bg-[var(--background)] border border-[var(--border)] rounded-lg p-0.5">
          <button
            onClick={() => setMode("day")}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${mode === "day" ? "bg-[var(--surface-hover)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
          >Tag</button>
          <button
            onClick={() => setMode("week")}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${mode === "week" ? "bg-[var(--surface-hover)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
          >Woche</button>
        </div>
      </div>

      {/* Calendar grid — SCH-920 K2-M1: scrollable so the full 0–24h day is
          reachable. Default scroll lands on 6:00 so the work day is in view. */}
      <div
        ref={scrollRef}
        className="overflow-y-auto overflow-x-auto"
        style={{ maxHeight: SCROLL_VIEWPORT_PX }}
      >
        <div className="flex" style={{ minWidth: mode === "week" ? "700px" : "auto" }}>
          {/* Hour rail */}
          <div className="w-12 shrink-0 border-r border-[var(--border)] sticky left-0 z-10 bg-[var(--surface)]">
            <div className="h-8 sticky top-0 bg-[var(--surface)] z-10" />
            <div className="relative" style={{ height: GRID_HEIGHT_PX }}>
              {Array.from({ length: VISIBLE_HOURS + 1 }, (_, i) => (
                <div
                  key={i}
                  className="absolute -translate-y-1/2 text-right w-full pr-1 text-[10px] text-[var(--text-muted)]"
                  style={{ top: i * HOUR_HEIGHT_PX }}
                >
                  {String(DAY_START_HOUR + i).padStart(2, "0")}:00
                </div>
              ))}
            </div>
          </div>

          {/* Day columns */}
          <div className="flex flex-1">
            {days.map((day, dayIndex) => {
              const isToday = sameDay(day, new Date());
              const dayKey = startOfDay(day).toISOString();
              const dayEntries = entriesByDay.get(dayKey) || [];
              const weekdayIdx = (day.getDay() + 6) % 7;
              const isWorkingDay = workingWeekdays.size === 0 || workingWeekdays.has(weekdayIdx);
              return (
                <div key={dayKey} className={`flex-1 min-w-[100px] border-r border-[var(--border)] last:border-r-0 ${isToday ? "bg-[var(--brand-orange-dim)]/30" : ""}`}>
                  <div className={`h-8 flex flex-col items-center justify-center border-b border-[var(--border)] sticky top-0 z-10 ${isToday ? "bg-[var(--brand-orange-dim)]/40" : "bg-[var(--surface)]"} ${!isWorkingDay ? "opacity-60" : ""}`}>
                    <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{WEEKDAY_LABELS[weekdayIdx]}</span>
                    <span className={`text-xs font-semibold ${isToday ? "text-[var(--brand-orange)]" : "text-[var(--text-primary)]"}`}>{formatDayHeader(day)}</span>
                  </div>

                  <div
                    ref={(el) => { gridRefs.current.set(dayIndex, el); }}
                    onMouseDown={(e) => handleMouseDown(dayIndex, e)}
                    className={`relative select-none cursor-crosshair ${!isWorkingDay ? "bg-[var(--background)]/50" : ""}`}
                    style={{ height: GRID_HEIGHT_PX }}
                  >
                    {/* SCH-920 K2-M2 — diagonal hatch overlay marks days
                        outside the user's work-time model */}
                    {!isWorkingDay && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          backgroundImage: "repeating-linear-gradient(45deg, rgba(150,150,150,0.06) 0 6px, transparent 6px 12px)",
                        }}
                      />
                    )}
                    {/* Hour grid lines */}
                    {Array.from({ length: VISIBLE_HOURS }, (_, i) => (
                      <div
                        key={i}
                        className="absolute left-0 right-0 border-t border-[var(--border)]/60"
                        style={{ top: i * HOUR_HEIGHT_PX }}
                      />
                    ))}
                    {/* Half-hour grid lines (softer) */}
                    {Array.from({ length: VISIBLE_HOURS }, (_, i) => (
                      <div
                        key={`half-${i}`}
                        className="absolute left-0 right-0 border-t border-dashed border-[var(--border)]/30"
                        style={{ top: i * HOUR_HEIGHT_PX + HOUR_HEIGHT_PX / 2 }}
                      />
                    ))}

                    {/* Existing entries */}
                    {dayEntries.map((e) => {
                      const start = new Date(e.start_time);
                      const isLive = !e.end_time;
                      const end = e.end_time
                        ? new Date(e.end_time)
                        : new Date(start.getTime() + activeElapsed * 60000);
                      const clamped = clampToVisible(day, start, end);
                      if (!clamped) return null;
                      // SCH-899 Phase B — while this entry is being resized,
                      // shift the preview top/bottom by deltaMin so the user
                      // sees the future block before mouseup commits.
                      let topMin = clamped.topMin;
                      let bottomMin = clamped.bottomMin;
                      const isResizing = resizeState?.entryId === e.id;
                      if (isResizing && resizeState) {
                        const minSpan = SLOT_MINUTES;
                        if (resizeState.edge === "top") {
                          topMin = Math.max(
                            DAY_START_HOUR * 60,
                            Math.min(bottomMin - minSpan, topMin + resizeState.deltaMin),
                          );
                        } else {
                          bottomMin = Math.min(
                            DAY_END_HOUR * 60,
                            Math.max(topMin + minSpan, bottomMin + resizeState.deltaMin),
                          );
                        }
                      }
                      const top = (topMin / VISIBLE_MINUTES) * GRID_HEIGHT_PX;
                      const height = Math.max(12, ((bottomMin - topMin) / VISIBLE_MINUTES) * GRID_HEIGHT_PX);
                      const isPause = e.entry_type === "pause";
                      const color = isPause ? "#f59e0b" : getProjectColor(e.project_label, allProjectLabels);
                      // SCH-899 Phase B — preview times shown in the title and
                      // the secondary line so the user can read the snapped
                      // result while dragging.
                      const previewStart = isResizing && resizeState?.edge === "top"
                        ? new Date(start.getTime() + resizeState.deltaMin * 60_000)
                        : start;
                      const previewEnd = isResizing && resizeState?.edge === "bottom" && e.end_time
                        ? new Date(end.getTime() + resizeState.deltaMin * 60_000)
                        : end;
                      return (
                        <div
                          key={e.id}
                          onClick={(ev) => { if (isResizing) { ev.stopPropagation(); return; } handleEntryClick(e, ev); }}
                          onMouseDown={(ev) => { if (e.end_time) ev.stopPropagation(); }}
                          className={`absolute left-1 right-1 rounded-md px-1.5 py-0.5 text-[10px] leading-tight overflow-hidden ${e.end_time ? "cursor-pointer hover:brightness-125" : "pointer-events-none"} ${isPause ? "italic opacity-70" : ""} ${isLive ? "ring-1 ring-emerald-400/60" : ""} ${isResizing ? "ring-1 ring-[var(--brand-orange)]" : ""}`}
                          style={{
                            top,
                            height,
                            background: color + "22",
                            borderLeft: `3px solid ${color}`,
                          }}
                          title={`${formatTime(previewStart)}–${e.end_time ? formatTime(previewEnd) : "läuft"} · ${e.project_label}${e.description ? " · " + e.description : ""}`}
                        >
                          {/* SCH-899 Phase B — top/bottom drag handles. Only
                              shown for completed entries (live timer has no
                              end_time to resize against). */}
                          {e.end_time && (
                            <>
                              <div
                                onMouseDown={(ev) => handleEdgeMouseDown(e, "top", dayIndex, ev)}
                                onClick={(ev) => ev.stopPropagation()}
                                className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-white/30 z-10"
                                title="Startzeit ziehen"
                              />
                              <div
                                onMouseDown={(ev) => handleEdgeMouseDown(e, "bottom", dayIndex, ev)}
                                onClick={(ev) => ev.stopPropagation()}
                                className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-white/30 z-10"
                                title="Endzeit ziehen"
                              />
                            </>
                          )}
                          <div className="font-medium text-[var(--text-primary)] truncate">{isPause ? "Pause" : e.project_label}</div>
                          {height > 28 && (
                            <div className="text-[9px] text-[var(--text-muted)] truncate">
                              {formatTime(previewStart)}{e.end_time ? ` – ${formatTime(previewEnd)}` : ""}
                            </div>
                          )}
                          {height > 48 && e.description && (
                            <div className="text-[9px] text-[var(--text-secondary)] truncate">{e.description}</div>
                          )}
                        </div>
                      );
                    })}

                    {/* Drag preview */}
                    {dragState && dragState.dayIndex === dayIndex && (() => {
                      const lo = Math.min(dragState.startMin, dragState.currentMin);
                      const hi = Math.max(dragState.startMin, dragState.currentMin);
                      const span = Math.max(hi - lo, SLOT_MINUTES);
                      const top = (lo / VISIBLE_MINUTES) * GRID_HEIGHT_PX;
                      const height = (span / VISIBLE_MINUTES) * GRID_HEIGHT_PX;
                      const s = new Date(day);
                      s.setHours(DAY_START_HOUR, 0, 0, 0);
                      s.setMinutes(s.getMinutes() + lo);
                      const e = new Date(s);
                      e.setMinutes(e.getMinutes() + span);
                      return (
                        <div
                          className="absolute left-1 right-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium pointer-events-none"
                          style={{
                            top,
                            height,
                            background: "var(--brand-orange-hover)",
                            border: "1px dashed var(--brand-orange)",
                            color: "var(--brand-orange)",
                          }}
                        >
                          {formatTime(s)} – {formatTime(e)}
                        </div>
                      );
                    })()}

                    {/* Now indicator */}
                    {isToday && now.getHours() >= DAY_START_HOUR && now.getHours() < DAY_END_HOUR && (
                      <div
                        className="absolute left-0 right-0 pointer-events-none"
                        style={{ top: (minutesSinceDayStart(now) / VISIBLE_MINUTES) * GRID_HEIGHT_PX }}
                      >
                        <div className="h-px bg-emerald-500/80" />
                        <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-emerald-500" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {(modalInit || editInit) && (
        <TimeCalendarCreateModal
          initialStart={editInit?.start ?? modalInit!.start}
          initialEnd={editInit?.end ?? modalInit!.end}
          quotes={quotes}
          projectFreq={projectFreq}
          generalCategories={generalCategories}
          projects={projects}
          onProjectCreated={onProjectCreated}
          editData={editInit ?? undefined}
          onCancel={handleModalCancel}
          onSubmit={handleModalSubmit}
          onDelete={handleModalDelete}
        />
      )}
    </div>
  );
}
