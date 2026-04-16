"use client";

import { useMemo, useRef, useState } from "react";
import { TimeEntry, Quote } from "@/lib/types";
import { TimeCalendarCreateModal, ModalResult } from "./TimeCalendarCreateModal";

type ViewMode = "week" | "day";

interface Props {
  entries: TimeEntry[];
  activeElapsed: number;
  quotes: Quote[];
  projectFreq: Map<string, number>;
  allProjectLabels: string[];
  getProjectColor: (label: string, all: string[]) => string;
  onCreate: (result: ModalResult) => Promise<void>;
}

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 22;
const SLOT_MINUTES = 15;
const VISIBLE_HOURS = DAY_END_HOUR - DAY_START_HOUR;
const VISIBLE_MINUTES = VISIBLE_HOURS * 60;
const HOUR_HEIGHT_PX = 48;
const GRID_HEIGHT_PX = VISIBLE_HOURS * HOUR_HEIGHT_PX;
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
  onCreate,
}: Props) {
  const [mode, setMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const gridRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());

  const [dragState, setDragState] = useState<{
    dayIndex: number;
    startMin: number;
    currentMin: number;
  } | null>(null);

  const [modalInit, setModalInit] = useState<{ start: Date; end: Date } | null>(null);

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
      setModalInit({ start, end });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  async function handleModalSubmit(result: ModalResult) {
    await onCreate(result);
    setModalInit(null);
  }

  function goPrev() {
    if (mode === "day") setAnchor((d) => addDays(d, -1));
    else setAnchor((d) => addDays(d, -7));
  }
  function goNext() {
    if (mode === "day") setAnchor((d) => addDays(d, 1));
    else setAnchor((d) => addDays(d, 7));
  }
  function goToday() { setAnchor(startOfDay(new Date())); }

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

      {/* Calendar grid */}
      <div className="flex">
        {/* Hour rail */}
        <div className="w-12 shrink-0 border-r border-[var(--border)]">
          <div className="h-8" />
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
        <div className="flex-1 overflow-x-auto">
          <div className="flex min-w-full" style={{ minWidth: mode === "week" ? "700px" : "auto" }}>
            {days.map((day, dayIndex) => {
              const isToday = sameDay(day, new Date());
              const dayKey = startOfDay(day).toISOString();
              const dayEntries = entriesByDay.get(dayKey) || [];
              return (
                <div key={dayKey} className={`flex-1 min-w-[100px] border-r border-[var(--border)] last:border-r-0 ${isToday ? "bg-[var(--brand-orange-dim)]/30" : ""}`}>
                  <div className="h-8 flex flex-col items-center justify-center border-b border-[var(--border)]">
                    <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{WEEKDAY_LABELS[(day.getDay() + 6) % 7]}</span>
                    <span className={`text-xs font-semibold ${isToday ? "text-[var(--brand-orange)]" : "text-[var(--text-primary)]"}`}>{formatDayHeader(day)}</span>
                  </div>

                  <div
                    ref={(el) => { gridRefs.current.set(dayIndex, el); }}
                    onMouseDown={(e) => handleMouseDown(dayIndex, e)}
                    className="relative select-none cursor-crosshair"
                    style={{ height: GRID_HEIGHT_PX }}
                  >
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
                      const top = (clamped.topMin / VISIBLE_MINUTES) * GRID_HEIGHT_PX;
                      const height = Math.max(12, ((clamped.bottomMin - clamped.topMin) / VISIBLE_MINUTES) * GRID_HEIGHT_PX);
                      const isPause = e.entry_type === "pause";
                      const color = isPause ? "#f59e0b" : getProjectColor(e.project_label, allProjectLabels);
                      return (
                        <div
                          key={e.id}
                          className={`absolute left-1 right-1 rounded-md px-1.5 py-0.5 text-[10px] leading-tight overflow-hidden pointer-events-none ${isPause ? "italic opacity-70" : ""} ${isLive ? "ring-1 ring-emerald-400/60" : ""}`}
                          style={{
                            top,
                            height,
                            background: color + "22",
                            borderLeft: `3px solid ${color}`,
                          }}
                          title={`${formatTime(start)}–${e.end_time ? formatTime(new Date(e.end_time)) : "läuft"} · ${e.project_label}${e.description ? " · " + e.description : ""}`}
                        >
                          <div className="font-medium text-[var(--text-primary)] truncate">{isPause ? "Pause" : e.project_label}</div>
                          {height > 28 && (
                            <div className="text-[9px] text-[var(--text-muted)] truncate">
                              {formatTime(start)}{e.end_time ? ` – ${formatTime(new Date(e.end_time))}` : ""}
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

      {modalInit && (
        <TimeCalendarCreateModal
          initialStart={modalInit.start}
          initialEnd={modalInit.end}
          quotes={quotes}
          projectFreq={projectFreq}
          onCancel={() => setModalInit(null)}
          onSubmit={handleModalSubmit}
        />
      )}
    </div>
  );
}
