import { useGameStore } from "./store";
import "./toast.css";

export function ToastStack() {
  const toasts = useGameStore((s) => s.toasts);
  const dismiss = useGameStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="toastStack" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.variant}`} role="status">
          <span className="toast__msg">{t.message}</span>
          <button type="button" className="toast__dismiss" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
