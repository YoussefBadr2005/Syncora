"use client";
import { createContext, useCallback, useContext, useState } from "react";
type Toast = { id: number; msg: string; kind: "error" | "success" };
const Ctx = createContext<(msg: string, kind?: Toast["kind"]) => void>(() => {});
export const useToast = () => useContext(Ctx);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: Toast["kind"] = "error") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-[300] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id}
            className="px-4 py-3 rounded-lg text-sm border bg-surface-container-high text-on-surface"
            style={{ borderColor: t.kind === "error" ? "rgba(255,180,171,0.3)" : "#444748" }}>
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
