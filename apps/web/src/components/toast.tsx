"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export interface ToastOptions {
  /** Optional action button, e.g. Undo. Clicking it dismisses the toast. */
  action?: { label: string; onClick: () => void };
  tone?: "default" | "danger";
  /** Auto-dismiss delay; defaults to 4s (6s when there is an action). */
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
}

const ToastContext = createContext<(message: string, opts?: ToastOptions) => void>(
  () => {}
);

/** `const toast = useToast(); toast("Task completed", { action: { label: "Undo", onClick } })` */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, opts: ToastOptions = {}) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-2), { id, message, ...opts }]);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    const ms = toast.durationMs ?? (toast.action ? 6000 : 4000);
    const timer = setTimeout(onDismiss, ms);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div
      role="status"
      className={clsx(
        "pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm shadow-lg",
        toast.tone === "danger"
          ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          : "border-line bg-surface text-ink"
      )}
    >
      <span className="flex-1">{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.onClick();
            onDismiss();
          }}
          className="shrink-0 font-semibold text-accent hover:underline cursor-pointer"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded p-0.5 text-ink-faint hover:text-ink cursor-pointer"
      >
        <X size={14} />
      </button>
    </div>
  );
}
