"use client";
import { useEffect, useRef, useState } from "react";

export default function Dropdown({ value, onChange, placeholder, options, disabled = false }: {
  value: string; onChange: (v: string) => void; placeholder: string;
  options: { value: string; label: string; sub?: string; dot?: string }[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm text-left transition-colors bg-surface-container border border-outline-variant focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ color: selected ? "#e5e2e1" : "#8e9192" }}>
        {selected?.dot && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: selected.dot }} />}
        <span className="flex-1 truncate">{selected?.label ?? placeholder}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8e9192" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
             className={`flex-shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-surface-container-low border border-outline-variant rounded-lg z-[100] overflow-y-auto"
             style={{ boxShadow: "0 12px 32px rgba(0,0,0,0.5)", maxHeight: 220 }}>
          {options.map(opt => (
            <button key={opt.value} type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-surface-container-high transition-colors"
              style={{ color: opt.value === value ? "#e5e2e1" : "#8e9192" }}>
              {opt.dot && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: opt.dot }} />}
              <span className="flex-1 min-w-0">
                <span className="font-medium block truncate">{opt.label}</span>
                {opt.sub && <span className="text-xs text-on-surface-variant truncate block mt-0.5">{opt.sub}</span>}
              </span>
              {opt.value === value && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e5e2e1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
