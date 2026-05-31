"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  toast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastApi>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[80] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const DOT: Record<ToastKind, string> = {
  success: "#4a7c59",
  error: "#b5654a",
  info: "#8a8a82",
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={`pointer-events-auto flex items-center gap-3 min-w-[260px] max-w-sm bg-surface-elevated/95 backdrop-blur-md border border-foreground/12 rounded-lg pl-4 pr-3 py-3 shadow-2xl shadow-black/50 transition-all duration-300 ${
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      }`}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: DOT[toast.kind] }} />
      <p className="flex-1 text-foreground/75 text-sm leading-snug">{toast.message}</p>
      <button
        onClick={onClose}
        className="text-foreground/25 hover:text-foreground/60 transition-colors text-sm leading-none shrink-0"
        aria-label="Fechar"
      >
        ×
      </button>
    </div>
  );
}
