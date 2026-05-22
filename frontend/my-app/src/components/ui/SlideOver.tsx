"use client";
import { useEffect } from "react";

export default function SlideOver({
  open, onClose, title, children, width = 460,
}: {
  open: boolean; onClose: () => void; title?: string;
  children: React.ReactNode; width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside
        className="absolute right-0 top-0 h-full bg-surface-container-low border-l border-outline-variant overflow-y-auto"
        style={{ width: `min(${width}px, 100vw)`, boxShadow: "-16px 0 40px rgba(0,0,0,0.5)" }}
      >
        {title && (
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-outline-variant bg-surface-container-low">
            <h2 className="text-sm font-semibold text-on-surface">{title}</h2>
            <button onClick={onClose} aria-label="Close"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </aside>
    </div>
  );
}
