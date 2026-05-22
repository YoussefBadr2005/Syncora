"use client";
import { useEffect, useRef, useState } from "react";

export default function DatePicker({ value, onChange, min }: {
  value: string; onChange: (v: string) => void; min?: string;
}) {
  const [open, setOpen]           = useState(false);
  const [viewYear, setViewYear]   = useState(() => value ? new Date(value + "T00:00:00").getFullYear()  : new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => value ? new Date(value + "T00:00:00").getMonth()     : new Date().getMonth());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const today    = new Date(); today.setHours(0,0,0,0);
  const minDate  = min ? new Date(min + "T00:00:00") : null;
  const selected = value ? new Date(value + "T00:00:00") : null;

  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

  const selectDay = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    if (minDate && d < minDate) return;
    onChange(`${viewYear}-${String(viewMonth + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`);
    setOpen(false);
  };

  const displayValue = selected
    ? selected.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm text-left transition-colors bg-surface-container border border-outline-variant focus:border-outline focus:outline-none"
        style={{ color: value ? "#e5e2e1" : "#8e9192" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: "#8e9192" }}>
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span className="flex-1">{displayValue || "Pick a date"}</span>
        {value && (
          <span role="button" tabIndex={0}
            onClick={e => { e.stopPropagation(); onChange(""); }}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); onChange(""); } }}
            className="w-4 h-4 rounded flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors flex-shrink-0 cursor-pointer">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 bg-surface-container-low border border-outline-variant rounded-xl z-50 p-4"
             style={{ boxShadow: "0 16px 40px rgba(0,0,0,0.5)", minWidth: 280 }}>

          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button type="button" onClick={prevMonth}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <span className="text-sm font-semibold text-on-surface">{MONTHS[viewMonth]} {viewYear}</span>
            <button type="button" onClick={nextMonth}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="flex items-center justify-center h-7 text-xs font-semibold text-on-surface-variant">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const thisDate = new Date(viewYear, viewMonth, day);
              const isToday  = thisDate.getTime() === today.getTime();
              const isSel    = selected && thisDate.getTime() === selected.getTime();
              const disabled = !!(minDate && thisDate < minDate);
              return (
                <button key={i} type="button" onClick={() => selectDay(day)} disabled={disabled}
                  className="flex items-center justify-center h-8 w-full rounded-lg text-sm transition-colors disabled:opacity-25 disabled:cursor-not-allowed hover:bg-surface-container-high"
                  style={{
                    background: isSel ? "#e5e2e1" : isToday ? "rgba(255,255,255,0.08)" : "transparent",
                    color: isSel ? "#141313" : "#e5e2e1",
                    fontWeight: isSel || isToday ? 700 : 400,
                  }}>
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-outline-variant">
            <button type="button" onClick={() => { onChange(""); setOpen(false); }}
              className="text-xs font-medium px-3 py-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
              Clear
            </button>
            <button type="button" onClick={() => { setViewYear(new Date().getFullYear()); setViewMonth(new Date().getMonth()); }}
              className="text-xs font-medium px-3 py-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
